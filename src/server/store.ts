import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { gameSchema } from '../protocol/messages.ts';
import { COLORS } from '../game/types.ts';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.ts';
import { SESSION_MS, WAITING_MS } from './clock.ts';

const seatSchema = z.strictObject({ sessionId: z.string(), nickname: z.string(), ready: z.boolean(), connected: z.boolean() });
const timePair = z.strictObject({ black: z.number().nonnegative(), white: z.number().nonnegative() });
export const storedRoomSchema = z.strictObject({
  version: z.literal(1), code: z.string(), revision: z.number().int().nonnegative(),
  status: z.enum(['waiting', 'active', 'paused', 'finished', 'aborted']),
  players: z.strictObject({ black: seatSchema, white: seatSchema.nullable() }),
  game: gameSchema.nullable(), deadlineMonoMs: z.number().nullable(),
  turnRemainingMs: z.number().nonnegative(), disconnectRemainingMs: timePair,
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
  save(room: StoredRoom, expectedRevision: number, receipt?: CommandReceipt): void;
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
    else if (version !== SCHEMA_VERSION) throw new Error(`Unsupported database schema version: ${String(version)}`);
  } catch (error) { db.close(); throw error; }

  const getRoom = db.prepare<[string], { snapshot: string }>('SELECT snapshot FROM rooms WHERE code = ?');
  const allRooms = db.prepare<[], { snapshot: string }>('SELECT snapshot FROM rooms');
  const insertRoom = db.prepare('INSERT INTO rooms(code,black_session,white_session,status,revision,snapshot,created_at,ended_at) VALUES(?,?,?,?,?,?,?,?)');
  const updateRoom = db.prepare('UPDATE rooms SET black_session=?,white_session=?,status=?,revision=?,snapshot=?,ended_at=? WHERE code=? AND revision=?');
  const getReceipt = db.prepare<[string, string, string], { request: string; applied_revision: number }>('SELECT request,applied_revision FROM command_receipts WHERE room_code=? AND session_id=? AND command_id=?');
  const insertReceipt = db.prepare('INSERT INTO command_receipts(room_code,session_id,command_id,request,applied_revision) VALUES(?,?,?,?,?)');
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
  function save(next: StoredRoom, expectedRevision: number, receipt?: CommandReceipt) {
    db.transaction(() => {
      const data = storedRoomSchema.parse(next);
      if (data.revision !== expectedRevision && data.revision !== expectedRevision + 1) throw new Error('Invalid revision transition');
      const result = updateRoom.run(data.players.black.sessionId, data.players.white?.sessionId ?? null, data.status, data.revision, JSON.stringify(data), data.endedAt, data.code, expectedRevision);
      if (result.changes !== 1) throw new ServiceError('STALE_REVISION');
      if (receipt) insertReceipt.run(data.code, receipt.sessionId, receipt.commandId, receipt.request, receipt.appliedRevision);
    })();
  }
  return {
    room,
    rooms: () => allRooms.all().map(row => storedRoomSchema.parse(JSON.parse(row.snapshot))),
    save,
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
