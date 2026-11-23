import { createGame, applyAction } from '../game/engine.ts';
import { COLORS, opposite } from '../game/types.ts';
import type { Color } from '../game/types.ts';
import { commandSchema, roomSchema } from '../protocol/messages.ts';
import type { Command, RoomSnapshot, ServerMessage } from '../protocol/messages.ts';
import type { Clock } from './clock.ts';
import { TURN_MS } from './clock.ts';
import { memberColor, requireRoom } from './lobby.ts';
import { ServiceError } from './store.ts';
import type { Store, StoredRoom } from './store.ts';

type Ack = Extract<ServerMessage, { type: 'ack' }>;
export interface MatchService {
  snapshot(code: string, sessionId: string): RoomSnapshot;
  connect(code: string, sessionId: string): void;
  disconnect(code: string, sessionId: string): void;
  command(code: string, sessionId: string, command: Command): Ack;
  settle(code: string): StoredRoom;
  notify(code: string): void;
  subscribe(listener: (code: string) => void): () => void;
  close(): void;
}

function terminal(room: StoredRoom): boolean { return room.status === 'finished' || room.status === 'aborted'; }
function remaining(room: StoredRoom, color: Color, now: number): number {
  const since = room.disconnectedSince[color];
  return Math.max(0, room.disconnectRemainingMs[color] - (since === null ? 0 : now - since));
}
function freeze(room: StoredRoom, now: number, wall: number) {
  room.turnRemainingMs = room.deadlineMonoMs === null ? room.turnRemainingMs : Math.max(0, room.deadlineMonoMs - now);
  room.deadlineMonoMs = null;
  for (const color of COLORS) { room.disconnectRemainingMs[color] = remaining(room, color, now); room.disconnectedSince[color] = null; }
  room.endedAt = wall;
}
function lose(room: StoredRoom, loser: Color, reason: 'turn-timeout' | 'disconnect-timeout', now: number, wall: number) {
  if (!room.game) throw new Error('A running match must have a game');
  const { board, players, completedLines } = room.game;
  room.game = { board, players, completedLines, status: 'finished', winner: opposite(loser), reason };
  freeze(room, now, wall);
  room.status = 'finished';
}
function startIfReady(room: StoredRoom, now: number) {
  if (room.status !== 'waiting' || !COLORS.every(color => room.players[color]?.ready && room.players[color]?.connected)) return;
  room.game = createGame(); room.status = 'active'; room.turnRemainingMs = TURN_MS; room.deadlineMonoMs = now + TURN_MS;
}

export function createMatchService(store: Store, clock: Clock, onError: (error: unknown) => void = error => console.error('Match timer failed', error)): MatchService {
  const timers = new Map<string, () => void>();
  const listeners = new Set<(code: string) => void>();
  let closed = false;
  function notify(code: string) { for (const listener of listeners) listener(code); }
  function schedule(room: StoredRoom) {
    timers.get(room.code)?.(); timers.delete(room.code);
    if (closed || terminal(room)) return;
    let deadline = room.status === 'active' ? room.deadlineMonoMs : null;
    if (room.status === 'paused') {
      for (const color of COLORS) {
        const since = room.disconnectedSince[color];
        if (since !== null) deadline = Math.min(deadline ?? Infinity, since + room.disconnectRemainingMs[color]);
      }
    }
    if (deadline === null) return;
    timers.set(room.code, clock.schedule(() => {
      timers.delete(room.code);
      try { settle(room.code); }
      catch (error) {
        onError(error);
        // A failed database write cannot erase a deadline. Retry from persisted state.
        if (!closed) timers.set(room.code, clock.schedule(() => { timers.delete(room.code); const current = store.room(room.code); if (current) schedule(current); }, 1000));
      }
    }, Math.max(0, deadline - clock.nowMs())));
  }
  function commit(room: StoredRoom, oldRevision: number) {
    room.revision = oldRevision + 1;
    store.save(room, oldRevision);
    schedule(room); notify(room.code);
  }
  function settle(code: string): StoredRoom {
    const room = requireRoom(store, code, clock);
    const now = clock.nowMs();
    if (room.status === 'active' && room.deadlineMonoMs !== null && now >= room.deadlineMonoMs && room.game?.status === 'playing') {
      lose(room, room.game.turn, 'turn-timeout', now, clock.wallMs());
    } else if (room.status === 'paused') {
      const black = room.disconnectedSince.black === null ? Infinity : room.disconnectedSince.black + room.disconnectRemainingMs.black;
      const white = room.disconnectedSince.white === null ? Infinity : room.disconnectedSince.white + room.disconnectRemainingMs.white;
      if (now < Math.min(black, white)) { schedule(room); return room; }
      if (black === white) {
        freeze(room, now, clock.wallMs()); room.status = 'aborted'; room.abortReason = 'both-disconnected';
      } else lose(room, black < white ? 'black' : 'white', 'disconnect-timeout', now, clock.wallMs());
    } else { schedule(room); return room; }
    commit(room, room.revision);
    return room;
  }
  function setConnected(code: string, sessionId: string, connected: boolean) {
    const initial = requireRoom(store, code, clock);
    const color = memberColor(initial, sessionId);
    const room = settle(code);
    const seat = room.players[color];
    if (!seat || terminal(room) || seat.connected === connected) return;
    const now = clock.nowMs();
    seat.connected = connected;
    if (room.status === 'waiting') startIfReady(room, now);
    else if (!connected) {
      if (room.status === 'active') {
        room.turnRemainingMs = Math.max(0, (room.deadlineMonoMs ?? now) - now);
        room.deadlineMonoMs = null; room.status = 'paused';
      }
      room.disconnectedSince[color] = now;
    } else {
      room.disconnectRemainingMs[color] = remaining(room, color, now);
      room.disconnectedSince[color] = null;
      if (COLORS.every(player => room.players[player]?.connected)) {
        room.status = 'active'; room.deadlineMonoMs = now + room.turnRemainingMs;
      }
    }
    commit(room, room.revision);
  }
  return {
    settle, notify,
    connect(code, sessionId) { setConnected(code, sessionId, true); },
    disconnect(code, sessionId) { setConnected(code, sessionId, false); },
    snapshot(code, sessionId) {
      memberColor(requireRoom(store, code, clock), sessionId);
      const room = settle(code), now = clock.nowMs();
      const view = (color: Color) => { const seat = room.players[color]; return seat ? { nickname: seat.nickname, ready: seat.ready, connected: seat.connected } : null; };
      return roomSchema.parse({
        code: room.code, revision: room.revision, status: room.status, you: memberColor(room, sessionId),
        players: { black: view('black'), white: view('white') }, game: room.game,
        turnRemainingMs: room.deadlineMonoMs === null ? room.turnRemainingMs : Math.max(0, room.deadlineMonoMs - now),
        disconnectRemainingMs: { black: remaining(room, 'black', now), white: remaining(room, 'white', now) },
        serverTime: clock.wallMs(), abortReason: room.abortReason,
      });
    },
    command(code, sessionId, input) {
      const command = commandSchema.parse(input);
      const initial = requireRoom(store, code, clock);
      const color = memberColor(initial, sessionId);
      const request = JSON.stringify(command);
      const receipt = store.receipt(code, sessionId, command.commandId);
      if (receipt) {
        if (receipt.request !== request) throw new ServiceError('COMMAND_ID_REUSED');
        return { type: 'ack', commandId: command.commandId, appliedRevision: receipt.appliedRevision };
      }
      const room = settle(code);
      if (terminal(room)) throw new ServiceError('GAME_FINISHED');
      if (!room.players[color]?.connected) throw new ServiceError('NOT_CONNECTED');
      if (command.expectedRevision !== room.revision) throw new ServiceError('STALE_REVISION');
      const oldRevision = room.revision;
      if (command.type === 'ready') {
        if (room.status !== 'waiting') throw new ServiceError('GAME_STARTED');
        const seat = room.players[color];
        if (!seat) throw new ServiceError('NOT_A_MEMBER', 403);
        if (!seat.ready) { seat.ready = true; room.revision++; }
        startIfReady(room, clock.nowMs());
      } else {
        if (room.status !== 'active' || !room.game) throw new ServiceError('GAME_PAUSED');
        const result = applyAction(room.game, color, command.action, command.claimedLines);
        if (!result.ok) throw new ServiceError(result.code);
        room.game = result.state; room.revision++;
        if (result.state.status === 'finished') { freeze(room, clock.nowMs(), clock.wallMs()); room.status = 'finished'; }
        else { room.turnRemainingMs = TURN_MS; room.deadlineMonoMs = clock.nowMs() + TURN_MS; }
      }
      store.save(room, oldRevision, { sessionId, commandId: command.commandId, request, appliedRevision: room.revision });
      schedule(room);
      // The caller sends ACK only after this commit; snapshots never precede commit.
      notify(code);
      return { type: 'ack', commandId: command.commandId, appliedRevision: room.revision };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { closed = true; for (const cancel of timers.values()) cancel(); timers.clear(); listeners.clear(); },
  };
}
