import { randomBytes } from 'node:crypto';
import type { Clock } from './clock.ts';
import { DISCONNECT_MS, SESSION_MS, WAITING_MS } from './clock.ts';
import { timeControlInputSchema } from '../protocol/messages.ts';
import type { TimeControlInput } from '../protocol/messages.ts';
import { ServiceError } from './store.ts';
import type { Session, Store, StoredRoom } from './store.ts';
import type { Color } from '../game/types.ts';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function memberColor(room: StoredRoom, sessionId: string): Color {
  if (room.players.black.sessionId === sessionId) return 'black';
  if (room.players.white?.sessionId === sessionId) return 'white';
  throw new ServiceError('NOT_A_MEMBER', 403);
}
export function requireRoom(store: Store, code: string, clock: Clock): StoredRoom {
  const room = store.room(code);
  if (!room) throw new ServiceError('ROOM_NOT_FOUND', 404);
  if (room.status === 'waiting' && room.createdAt + WAITING_MS <= clock.wallMs()) throw new ServiceError('ROOM_EXPIRED', 410);
  if (room.endedAt !== null && room.endedAt + SESSION_MS <= clock.wallMs()) throw new ServiceError('ROOM_EXPIRED', 410);
  return room;
}
export function createLobby(store: Store, clock: Clock, changed: (code: string) => void) {
  return {
    create(session: Session, input: TimeControlInput): string {
      const timeControl = timeControlInputSchema.parse(input);
      return store.transaction(() => {
        const existing = store.currentRoom(session.id, clock.wallMs());
        if (existing) return existing;
        for (;;) {
          const code = Array.from(randomBytes(12), byte => ALPHABET[byte & 31]).join('');
          const room: StoredRoom = {
            version: 2, code, revision: 0, status: 'waiting',
            players: { black: { sessionId: session.id, nickname: session.nickname, ready: false, connected: false }, white: null },
            game: null, deadlineMonoMs: null, timeControl: { kind: 'fischer', ...timeControl },
            clockRemainingMs: { black: timeControl.baseMs, white: timeControl.baseMs }, turnElapsedMs: 0,
            moveCount: 0, lastMove: null, historyStatus: 'native', historyError: null, clockAccuracy: 'exact',
            disconnectRemainingMs: { black: DISCONNECT_MS, white: DISCONNECT_MS },
            disconnectedSince: { black: null, white: null }, abortReason: null,
            createdAt: clock.wallMs(), endedAt: null,
          };
          try { store.insert(room); return code; }
          catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY')) throw error;
          }
        }
      });
    },
    join(session: Session, code: string): string {
      let updated = false;
      const result = store.transaction(() => {
        const existing = store.currentRoom(session.id, clock.wallMs());
        if (existing && existing !== code) return existing;
        const room = requireRoom(store, code, clock);
        if (room.players.black.sessionId === session.id || room.players.white?.sessionId === session.id) return code;
        if (room.players.white) throw new ServiceError('ROOM_FULL');
        if (room.status !== 'waiting') throw new ServiceError('ROOM_CLOSED');
        room.players.white = { sessionId: session.id, nickname: session.nickname, ready: false, connected: false };
        room.revision++;
        store.save(room, room.revision - 1);
        updated = true;
        return code;
      });
      if (updated) changed(code);
      return result;
    },
  };
}
