import type Database from 'better-sqlite3';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { replayMoves } from '../game/replay.ts';
import { applyAction } from '../game/engine.ts';
import type { ReplayMove } from '../game/replay.ts';
import { COLORS } from '../game/types.ts';
import { gameSchema, recordActionSchema, recordLineSchema } from '../protocol/messages.ts';
import type { MoveRecord } from '../protocol/records.ts';
import { DEFAULT_TIME_CONTROL, DISCONNECT_MS } from './clock.ts';
import { RECORDS_SQL, SCHEMA_VERSION } from './schema.ts';
import { storedRoomSchema } from './store.ts';
import type { StoredRoom } from './store.ts';

const legacySeat = z.strictObject({ sessionId: z.string(), nickname: z.string(), ready: z.boolean(), connected: z.boolean() });
const pair = z.strictObject({ black: z.number().nonnegative(), white: z.number().nonnegative() });
const legacyRoomSchema = z.strictObject({
  version: z.literal(1), code: z.string(), revision: z.number().int().nonnegative(),
  status: z.enum(['waiting', 'active', 'paused', 'finished', 'aborted']),
  players: z.strictObject({ black: legacySeat, white: legacySeat.nullable() }),
  game: z.unknown(), deadlineMonoMs: z.number().nullable(), turnRemainingMs: z.number().nonnegative(),
  disconnectRemainingMs: pair, disconnectedSince: z.strictObject({ black: z.number().nullable(), white: z.number().nullable() }),
  abortReason: z.enum(['server-interrupted', 'both-disconnected']).nullable(), createdAt: z.number(), endedAt: z.number().nullable(),
});
const envelope = { protocolVersion: z.literal(1), commandId: z.uuid(), expectedRevision: z.number().int().nonnegative() };
const legacyCommand = z.discriminatedUnion('type', [z.strictObject({ ...envelope, type: z.literal('ready') }), z.strictObject({ ...envelope, type: z.literal('action'), action: recordActionSchema, claimedLines: z.array(recordLineSchema).max(2) })]);

export function migrateV1(db: Database.Database, now: number): void {
  db.transaction(() => {
    const version = db.pragma('user_version', { simple: true });
    if (version === SCHEMA_VERSION) return;
    if (version !== 1) throw new Error(`Cannot migrate database schema version: ${String(version)}`);
    db.exec(RECORDS_SQL);
    const receipts = db.prepare<[string], { session_id: string; command_id: string; request: string; applied_revision: number }>('SELECT session_id,command_id,request,applied_revision FROM command_receipts WHERE room_code=? ORDER BY applied_revision,command_id');
    const insertMove = db.prepare('INSERT INTO match_moves(room_code,ply,applied_revision,payload) VALUES(?,?,?,?)');
    const update = db.prepare('UPDATE rooms SET status=?,revision=?,snapshot=?,ended_at=? WHERE code=?');
    for (const row of db.prepare<[], { snapshot: string }>('SELECT snapshot FROM rooms').all()) {
      const old = legacyRoomSchema.parse(JSON.parse(row.snapshot));
      const { turnRemainingMs: _turnRemainingMs, game: rawGame, ...retained } = old;
      if (rawGame !== null && (typeof rawGame !== 'object' || Array.isArray(rawGame))) throw new Error(`Invalid legacy game in ${old.code}`);
      const game = rawGame === null ? null : gameSchema.parse({ ...rawGame, boardSize: 20 });
      const room: StoredRoom = {
        ...retained, version: 2, game, timeControl: { kind: 'legacy-turn', turnMs: 60_000 }, clockRemainingMs: null,
        turnElapsedMs: 0, moveCount: 0, lastMove: null, historyStatus: 'unavailable', historyError: null, clockAccuracy: 'unknown',
      };
      const journal: { revision: number; move: MoveRecord }[] = [];
      if (old.status === 'waiting') {
        room.game = null;
        room.timeControl = { kind: 'fischer', ...DEFAULT_TIME_CONTROL };
        room.clockRemainingMs = { black: DEFAULT_TIME_CONTROL.baseMs, white: DEFAULT_TIME_CONTROL.baseMs };
        room.disconnectRemainingMs = { black: DISCONNECT_MS, white: DISCONNECT_MS };
        room.historyStatus = 'native'; room.clockAccuracy = 'exact'; room.revision++;
      } else {
        try {
          if (!game) throw new Error('Legacy final state is missing');
          const moves: ReplayMove[] = [];
          let previousRevision = -1;
          let before = replayMoves(20, moves);
          for (const receipt of receipts.all(old.code)) {
            const command = legacyCommand.parse(JSON.parse(receipt.request));
            if (command.commandId !== receipt.command_id) throw new Error('Receipt identity mismatch');
            const actor = COLORS.find(color => old.players[color]?.sessionId === receipt.session_id);
            if (!actor) throw new Error('Receipt actor is not a member');
            if (command.type === 'ready') continue;
            if (receipt.applied_revision <= previousRevision || receipt.applied_revision > old.revision || receipt.applied_revision !== command.expectedRevision + 1) throw new Error('Invalid action revision');
            previousRevision = receipt.applied_revision;
            const move = { actor, action: command.action, claimedLines: command.claimedLines };
            const captured = command.action.type === 'moveChess' ? before.board[command.action.to] ?? null : null;
            moves.push(move);
            const applied = applyAction(before, actor, command.action, command.claimedLines);
            if (!applied.ok) throw new Error(`Legacy action rejected: ${applied.code}`);
            before = applied.state;
            journal.push({ revision: receipt.applied_revision, move: { ...move, ply: moves.length, recordedAt: null, elapsedMs: null, clockAfterMs: null, captured } });
          }
          before = replayMoves(20, moves);
          if (!isDeepStrictEqual(before.board, game.board) || !isDeepStrictEqual(before.players, game.players) || !isDeepStrictEqual(before.completedLines, game.completedLines)) throw new Error('Reconstructed board or resources differ from final state');
          if (game.status === 'playing' && (before.status !== 'playing' || before.turn !== game.turn)) throw new Error('Reconstructed turn differs from final state');
          if (game.status === 'finished') {
            if (game.reason === 'two-lines' || game.reason === 'no-legal-action') {
              if (before.status !== 'finished' || before.winner !== game.winner || before.reason !== game.reason) throw new Error('Reconstructed rule result differs');
            } else if (before.status !== 'playing') throw new Error('External result follows a rule-terminal position');
          }
          room.historyStatus = 'reconstructed';
          room.moveCount = journal.length;
          const last = journal.at(-1)?.move;
          room.lastMove = last ? { ply: last.ply, actor: last.actor, action: last.action } : null;
        } catch (error) {
          journal.length = 0;
          room.historyError = error instanceof Error ? error.message : 'Legacy reconstruction failed';
        }
        if (old.status === 'active' || old.status === 'paused') {
          room.status = 'aborted'; room.abortReason = 'server-interrupted'; room.endedAt = now; room.revision++;
        }
      }
      room.deadlineMonoMs = null; room.disconnectedSince = { black: null, white: null };
      for (const color of COLORS) {
        const seat = room.players[color];
        if (seat) { seat.connected = false; seat.ready = false; }
      }
      const parsed = storedRoomSchema.parse(room);
      update.run(parsed.status, parsed.revision, JSON.stringify(parsed), parsed.endedAt, parsed.code);
      for (const entry of journal) insertMove.run(room.code, entry.move.ply, entry.revision, JSON.stringify(entry.move));
    }
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}
