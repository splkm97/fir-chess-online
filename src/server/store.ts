import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { clockPairSchema, gameSchema, lastMoveSchema, timeControlSchema } from '../protocol/messages.ts';
import { analysisNodeSchema, moveRecordSchema } from '../protocol/records.ts';
import type { AnalysisNode, MoveRecord } from '../protocol/records.ts';
import { migrateV1 } from './migrations.ts';
import { COLORS } from '../game/types.ts';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.ts';
import { SESSION_MS, WAITING_MS } from './clock.ts';

const seatSchema = z.strictObject({ sessionId: z.string(), nickname: z.string(), ready: z.boolean(), connected: z.boolean() });
const timePair = z.strictObject({ black: z.number().nonnegative(), white: z.number().nonnegative() });
export const storedRoomSchema = z.strictObject({
  version: z.literal(2), code: z.string(), revision: z.number().int().nonnegative(),
  status: z.enum(['waiting', 'active', 'paused', 'finished', 'aborted']),
  players: z.strictObject({ black: seatSchema, white: seatSchema.nullable() }),
  game: gameSchema.nullable(), deadlineMonoMs: z.number().nullable(),
  timeControl: timeControlSchema, clockRemainingMs: clockPairSchema.nullable(),
  turnElapsedMs: z.number().nonnegative(), moveCount: z.number().int().nonnegative(), lastMove: lastMoveSchema.nullable(),
  historyStatus: z.enum(['native', 'reconstructed', 'unavailable']), historyError: z.string().nullable(),
  clockAccuracy: z.enum(['exact', 'checkpoint', 'unknown']), disconnectRemainingMs: timePair,
  disconnectedSince: z.strictObject({ black: z.number().nullable(), white: z.number().nullable() }),
  abortReason: z.enum(['server-interrupted', 'both-disconnected']).nullable(),
  createdAt: z.number(), endedAt: z.number().nullable(),
});
export type StoredRoom = z.infer<typeof storedRoomSchema>;
export interface Session { id: string; nickname: string; expiresAt: number }
export interface Receipt { request: string; appliedRevision: number }
export interface CommandReceipt extends Receipt { sessionId: string; commandId: string }
export class ServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(code: string, statusCode = 409) { super(code); this.code = code; this.statusCode = statusCode; }
}

export interface Store {
  room(code: string): StoredRoom | undefined;
  rooms(): StoredRoom[];
  save(room: StoredRoom, expectedRevision: number, receipt?: CommandReceipt, move?: MoveRecord): void;
  recordRooms(owner: string, now: number, before: { endedAt: number; code: string } | null, limit: number): StoredRoom[];
  moves(code: string, afterPly: number, limit: number): MoveRecord[];
  analysis(code: string, owner: string, after: number, limit: number): AnalysisNode[];
  analysisNode(code: string, owner: string, id: string): AnalysisNode | undefined;
  nextAnalysisSequence(code: string, owner: string): number;
  appendAnalysis(code: string, owner: string, node: AnalysisNode): void;
  transaction<T>(operation: () => T): T;
  insert(room: StoredRoom): void;
  receipt(code: string, sessionId: string, commandId: string): Receipt | undefined;
  addSession(id: string, hash: string, nickname: string, now: number): void;
  authenticate(hash: string, now: number): Session | undefined;
  touchSession(id: string, now: number): void;
  currentRoom(id: string, now: number): string | undefined;
  latestRoom(id: string, now: number): string | undefined;
  cleanup(now: number): string[];
  recover(now: number): void;
  close(): void;
}

export function openStore(path: string): Store {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const version = db.pragma('user_version', { simple: true });
    if (version === 0) db.transaction(() => { db.exec(SCHEMA_SQL); db.pragma(`user_version = ${SCHEMA_VERSION}`); })();
    else if (version === 1) migrateV1(db, Date.now());
    else if (version !== SCHEMA_VERSION) throw new Error(`Unsupported database schema version: ${String(version)}`);
  } catch (error) { db.close(); throw error; }

  const getRoom = db.prepare<[string], { snapshot: string }>('SELECT snapshot FROM rooms WHERE code = ?');
  const allRooms = db.prepare<[], { snapshot: string }>('SELECT snapshot FROM rooms');
  const insertRoom = db.prepare('INSERT INTO rooms(code,black_session,white_session,status,revision,snapshot,created_at,ended_at) VALUES(?,?,?,?,?,?,?,?)');
  const updateRoom = db.prepare('UPDATE rooms SET black_session=?,white_session=?,status=?,revision=?,snapshot=?,ended_at=? WHERE code=? AND revision=?');
  const getReceipt = db.prepare<[string, string, string], { request: string; applied_revision: number }>('SELECT request,applied_revision FROM command_receipts WHERE room_code=? AND session_id=? AND command_id=?');
  const insertReceipt = db.prepare('INSERT INTO command_receipts(room_code,session_id,command_id,request,applied_revision) VALUES(?,?,?,?,?)');
  const insertMove = db.prepare('INSERT INTO match_moves(room_code,ply,applied_revision,payload) VALUES(?,?,?,?)');
  const lastPly = db.prepare<[string], { ply: number }>('SELECT COALESCE(MAX(ply),0) AS ply FROM match_moves WHERE room_code=?');
  const readMoves = db.prepare<[string, number, number], { payload: string }>('SELECT payload FROM match_moves WHERE room_code=? AND ply>? ORDER BY ply LIMIT ?');
  const readAnalysis = db.prepare<[string, string, number, number], { payload: string }>('SELECT payload FROM analysis_nodes WHERE room_code=? AND owner_session=? AND sequence>? ORDER BY sequence LIMIT ?');
  const readNode = db.prepare<[string, string, string], { payload: string }>('SELECT payload FROM analysis_nodes WHERE room_code=? AND owner_session=? AND node_id=?');
  const analysisSequence = db.prepare<[string, string], { next: number }>('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM analysis_nodes WHERE room_code=? AND owner_session=?');
  const insertNode = db.prepare('INSERT INTO analysis_nodes(room_code,owner_session,node_id,sequence,parent_node,parent_ply,payload) VALUES(?,?,?,?,?,?,?)');
  const recordRooms = db.prepare<[string, string, number, number | null, number | null, number | null, string | null, number], { snapshot: string }>(`SELECT snapshot FROM rooms WHERE (black_session=? OR white_session=?) AND status IN ('finished','aborted') AND ended_at>? AND (? IS NULL OR ended_at<? OR (ended_at=? AND code<?)) ORDER BY ended_at DESC, code DESC LIMIT ?`);
  const getSession = db.prepare<[string], { id: string; nickname: string; expires_at: number }>('SELECT id,nickname,expires_at FROM sessions WHERE token_hash=?');
  const addSession = db.prepare('INSERT INTO sessions(id,token_hash,nickname,expires_at) VALUES(?,?,?,?)');
  const touchSession = db.prepare('UPDATE sessions SET expires_at=? WHERE id=?');
  const membership = db.prepare<[string, string, number], { code: string }>("SELECT code FROM rooms WHERE (black_session=? OR white_session=?) AND (status IN ('active','paused') OR (status='waiting' AND created_at>?)) ORDER BY created_at DESC LIMIT 1");
  const latestMembership = db.prepare<[string, string, number, number], { code: string }>("SELECT code FROM rooms WHERE (black_session=? OR white_session=?) AND (status IN ('active','paused') OR (status='waiting' AND created_at>?) OR ended_at>?) ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const ongoing = db.prepare<[string, string], { code: string }>("SELECT code FROM rooms WHERE (black_session=? OR white_session=?) AND status IN ('active','paused') LIMIT 1");
  const removeRooms = db.prepare<[number, number], { code: string }>("DELETE FROM rooms WHERE (status='waiting' AND created_at<=?) OR (status IN ('finished','aborted') AND ended_at<=?) RETURNING code");
  const removeSessions = db.prepare('DELETE FROM sessions WHERE expires_at<=? AND NOT EXISTS(SELECT 1 FROM rooms WHERE black_session=sessions.id OR white_session=sessions.id)');
  function room(code: string): StoredRoom | undefined {
    const row = getRoom.get(code);
    return row ? storedRoomSchema.parse(JSON.parse(row.snapshot)) : undefined;
  }
  function save(next: StoredRoom, expectedRevision: number, receipt?: CommandReceipt, move?: MoveRecord) {
    db.transaction(() => {
      const data = storedRoomSchema.parse(next);
      if (data.revision !== expectedRevision && data.revision !== expectedRevision + 1) throw new Error('Invalid revision transition');
      const result = updateRoom.run(data.players.black.sessionId, data.players.white?.sessionId ?? null, data.status, data.revision, JSON.stringify(data), data.endedAt, data.code, expectedRevision);
      if (result.changes !== 1) throw new ServiceError('STALE_REVISION');
      if (move) {
        const parsed = moveRecordSchema.parse(move);
        if (!receipt || parsed.ply !== data.moveCount || JSON.stringify(data.lastMove) !== JSON.stringify({ ply: parsed.ply, actor: parsed.actor, action: parsed.action })) throw new Error('Move journal does not match room checkpoint');
        const previous = lastPly.get(data.code)!.ply;
        if (parsed.ply !== previous + 1) throw new Error('Noncontiguous move journal');
        insertMove.run(data.code, parsed.ply, data.revision, JSON.stringify(parsed));
      }
      if (receipt) insertReceipt.run(data.code, receipt.sessionId, receipt.commandId, receipt.request, receipt.appliedRevision);
    })();
  }
  return {
    room,
    rooms: () => allRooms.all().map(row => storedRoomSchema.parse(JSON.parse(row.snapshot))),
    save,
    recordRooms(owner, now, before, limit) { return recordRooms.all(owner, owner, now - SESSION_MS, before?.endedAt ?? null, before?.endedAt ?? null, before?.endedAt ?? null, before?.code ?? null, limit).map(row => storedRoomSchema.parse(JSON.parse(row.snapshot))); },
    moves(code, afterPly, limit) { return readMoves.all(code, afterPly, limit).map(row => moveRecordSchema.parse(JSON.parse(row.payload))); },
    analysis(code, owner, after, limit) { return readAnalysis.all(code, owner, after, limit).map(row => analysisNodeSchema.parse(JSON.parse(row.payload))); },
    analysisNode(code, owner, id) { const row = readNode.get(code, owner, id); return row ? analysisNodeSchema.parse(JSON.parse(row.payload)) : undefined; },
    nextAnalysisSequence(code, owner) { return analysisSequence.get(code, owner)!.next; },
    appendAnalysis(code, owner, node) {
      const data = analysisNodeSchema.parse(node);
      insertNode.run(code, owner, data.id, data.sequence, data.parent.type === 'variation' ? data.parent.nodeId : null, data.parent.type === 'mainline' ? data.parent.ply : null, JSON.stringify(data));
    },
    transaction<T>(operation: () => T): T { return db.transaction(operation)(); },
    insert(room: StoredRoom) {
      const data = storedRoomSchema.parse(room);
      insertRoom.run(data.code, data.players.black.sessionId, data.players.white?.sessionId ?? null, data.status, data.revision, JSON.stringify(data), data.createdAt, data.endedAt);
    },
    receipt(code: string, sessionId: string, commandId: string): Receipt | undefined {
      const row = getReceipt.get(code, sessionId, commandId);
      return row ? { request: row.request, appliedRevision: row.applied_revision } : undefined;
    },
    addSession(id: string, hash: string, nickname: string, now: number) { addSession.run(id, hash, nickname, now + SESSION_MS); },
    authenticate(hash: string, now: number): Session | undefined {
      const row = getSession.get(hash);
      if (!row || (row.expires_at <= now && !ongoing.get(row.id, row.id))) return undefined;
      touchSession.run(now + SESSION_MS, row.id);
      return { id: row.id, nickname: row.nickname, expiresAt: now + SESSION_MS };
    },
    touchSession(id: string, now: number) { touchSession.run(now + SESSION_MS, id); },
    currentRoom(id: string, now: number): string | undefined { return membership.get(id, id, now - WAITING_MS)?.code; },
    latestRoom(id: string, now: number): string | undefined { return latestMembership.get(id, id, now - WAITING_MS, now - SESSION_MS)?.code; },
    cleanup(now: number): string[] {
      return db.transaction(() => {
        const removed = removeRooms.all(now - WAITING_MS, now - SESSION_MS);
        removeSessions.run(now);
        return removed.map(row => row.code);
      })();
    },
    recover(now: number) {
      db.transaction(() => {
        for (const row of allRooms.all()) {
          const state = storedRoomSchema.parse(JSON.parse(row.snapshot));
          const revision = state.revision;
          if (state.status === 'active' || state.status === 'paused') {
            state.status = 'aborted'; state.abortReason = 'server-interrupted'; state.endedAt = now;
            state.deadlineMonoMs = null; state.disconnectedSince = { black: null, white: null };
            state.clockAccuracy = state.timeControl.kind === 'fischer' ? 'checkpoint' : 'unknown';
          } else if (state.status !== 'waiting' || !COLORS.some(color => state.players[color]?.connected || state.players[color]?.ready)) continue;
          for (const color of COLORS) {
            const seat = state.players[color];
            if (seat) { seat.connected = false; seat.ready = false; }
          }
          state.revision++;
          save(state, revision);
        }
      })();
    },
    close() { if (db.open) db.close(); },
  };
}
