import { createGame, applyAction } from '../game/engine.ts';
import { COLORS, opposite } from '../game/types.ts';
import type { Color } from '../game/types.ts';
import { commandSchema, roomSchema } from '../protocol/messages.ts';
import type { Command, RoomSnapshot, ServerMessage } from '../protocol/messages.ts';
import type { Clock } from './clock.ts';
import type { MoveRecord } from '../protocol/records.ts';
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
function checkpointClock(room: StoredRoom, now: number) {
  if (room.deadlineMonoMs === null || room.game?.status !== 'playing' || !room.clockRemainingMs) return;
  const color = room.game.turn;
  const left = Math.max(0, room.deadlineMonoMs - now);
  room.turnElapsedMs += Math.max(0, room.clockRemainingMs[color] - left);
  room.clockRemainingMs[color] = left;
}
function freeze(room: StoredRoom, now: number, wall: number) {
  checkpointClock(room, now);
  room.deadlineMonoMs = null;
  for (const color of COLORS) { room.disconnectRemainingMs[color] = remaining(room, color, now); room.disconnectedSince[color] = null; }
  room.endedAt = wall;
}
function lose(room: StoredRoom, loser: Color, reason: 'turn-timeout' | 'disconnect-timeout', now: number, wall: number) {
  if (!room.game) throw new Error('A running match must have a game');
  const { boardSize, board, players, completedLines } = room.game;
  freeze(room, now, wall);
  room.game = { boardSize, board, players, completedLines, status: 'finished', winner: opposite(loser), reason };
  room.status = 'finished';
}
function startIfReady(room: StoredRoom, now: number) {
  if (room.status !== 'waiting' || !COLORS.every(color => room.players[color]?.ready && room.players[color]?.connected)) return;
  if (room.timeControl.kind !== 'fischer') throw new Error('Legacy rooms cannot start');
  room.game = createGame(); room.status = 'active';
  room.clockRemainingMs = { black: room.timeControl.baseMs, white: room.timeControl.baseMs };
  room.turnElapsedMs = 0; room.deadlineMonoMs = now + room.timeControl.baseMs;
}

export function createMatchService(store: Store, clock: Clock, onError: (error: unknown) => void = error => console.error('Match timer failed', error)): MatchService {
  const timers = new Map<string, () => void>();
  const listeners = new Set<(code: string) => void>();
  const pendingDisconnects = new Map<string, { sessionId: string; at: number }[]>();
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
        retrySettlement(room.code);
      }
    }, Math.max(0, deadline - clock.nowMs())));
  }
  function commit(room: StoredRoom, oldRevision: number) {
    room.revision = oldRevision + 1;
    store.save(room, oldRevision);
    schedule(room); notify(room.code);
  }
  function expire(room: StoredRoom, now: number): boolean {
    if (room.status === 'active' && room.deadlineMonoMs !== null && now >= room.deadlineMonoMs && room.game?.status === 'playing') {
      lose(room, room.game.turn, 'turn-timeout', now, clock.wallMs());
      return true;
    }
    if (room.status !== 'paused') return false;
    const black = room.disconnectedSince.black === null ? Infinity : room.disconnectedSince.black + room.disconnectRemainingMs.black;
    const white = room.disconnectedSince.white === null ? Infinity : room.disconnectedSince.white + room.disconnectRemainingMs.white;
    if (now < Math.min(black, white)) return false;
    if (black === white) {
      freeze(room, now, clock.wallMs()); room.status = 'aborted'; room.abortReason = 'both-disconnected';
    } else lose(room, black < white ? 'black' : 'white', 'disconnect-timeout', now, clock.wallMs());
    return true;
  }
  function changeConnection(room: StoredRoom, sessionId: string, connected: boolean, now: number): boolean {
    const color = memberColor(room, sessionId), seat = room.players[color];
    if (!seat || terminal(room) || seat.connected === connected) return false;
    seat.connected = connected;
    if (room.status === 'waiting') startIfReady(room, now);
    else if (!connected) {
      if (room.status === 'active') {
        checkpointClock(room, now);
        room.deadlineMonoMs = null; room.status = 'paused';
      }
      room.disconnectedSince[color] = now;
    } else {
      room.disconnectRemainingMs[color] = remaining(room, color, now);
      room.disconnectedSince[color] = null;
      if (COLORS.every(player => room.players[player]?.connected)) {
        if (!room.clockRemainingMs || room.game?.status !== 'playing') throw new Error('Paused room has no clock');
        room.status = 'active'; room.deadlineMonoMs = now + room.clockRemainingMs[room.game.turn];
      }
    }
    return true;
  }
  function retrySettlement(code: string) {
    timers.get(code)?.(); timers.delete(code);
    if (closed) return;
    timers.set(code, clock.schedule(() => {
      timers.delete(code);
      try { settle(code); }
      catch (error) {
        if (error instanceof ServiceError && ['ROOM_NOT_FOUND', 'ROOM_EXPIRED'].includes(error.code)) { pendingDisconnects.delete(code); return; }
        onError(error); retrySettlement(code);
      }
    }, 1000));
  }
  function settle(code: string, now = clock.nowMs()): StoredRoom {
    const room = requireRoom(store, code, clock);
    const pending = pendingDisconnects.get(code);
    let changed = false;
    if (pending) {
      for (const event of pending) {
        changed = expire(room, event.at) || changed;
        changed = changeConnection(room, event.sessionId, false, event.at) || changed;
      }
    }
    changed = expire(room, now) || changed;
    if (changed) {
      const oldRevision = room.revision;
      room.revision++;
      store.save(room, oldRevision);
    }
    pendingDisconnects.delete(code);
    schedule(room);
    if (changed) notify(code);
    return room;
  }
  function setConnected(code: string, sessionId: string, connected: boolean) {
    memberColor(requireRoom(store, code, clock), sessionId);
    const room = settle(code);
    if (changeConnection(room, sessionId, connected, clock.nowMs())) commit(room, room.revision);
  }
  return {
    settle, notify,
    connect(code, sessionId) { setConnected(code, sessionId, true); },
    disconnect(code, sessionId) {
      memberColor(requireRoom(store, code, clock), sessionId);
      const events = pendingDisconnects.get(code) ?? [];
      if (!events.some(event => event.sessionId === sessionId)) events.push({ sessionId, at: clock.nowMs() });
      pendingDisconnects.set(code, events);
      try { settle(code); }
      catch (error) { retrySettlement(code); throw error; }
    },
    snapshot(code, sessionId) {
      memberColor(requireRoom(store, code, clock), sessionId);
      const room = settle(code), now = clock.nowMs();
      const view = (color: Color) => { const seat = room.players[color]; return seat ? { nickname: seat.nickname, ready: seat.ready, connected: seat.connected } : null; };
      const banks = room.clockRemainingMs ? { ...room.clockRemainingMs } : null;
      if (banks && room.game?.status === 'playing' && room.deadlineMonoMs !== null) banks[room.game.turn] = Math.max(0, room.deadlineMonoMs - now);
      return roomSchema.parse({
        code: room.code, revision: room.revision, status: room.status, you: memberColor(room, sessionId),
        players: { black: view('black'), white: view('white') }, game: room.game,
        timeControl: room.timeControl, clockRemainingMs: banks, moveCount: room.moveCount, lastMove: room.lastMove,
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
      const now = clock.nowMs(), wall = clock.wallMs();
      const room = settle(code, now);
      if (terminal(room)) throw new ServiceError('GAME_FINISHED');
      if (!room.players[color]?.connected) throw new ServiceError('NOT_CONNECTED');
      if (command.expectedRevision !== room.revision) throw new ServiceError('STALE_REVISION');
      const oldRevision = room.revision;
      let move: MoveRecord | undefined;
      if (command.type === 'ready') {
        if (room.status !== 'waiting') throw new ServiceError('GAME_STARTED');
        const seat = room.players[color];
        if (!seat) throw new ServiceError('NOT_A_MEMBER', 403);
        if (!seat.ready) { seat.ready = true; room.revision++; }
        startIfReady(room, now);
      } else {
        if (room.status !== 'active' || !room.game) throw new ServiceError('GAME_PAUSED');
        if (room.timeControl.kind !== 'fischer' || !room.clockRemainingMs) throw new Error('Live room has no Fischer clock');
        const captured = command.action.type === 'moveChess' ? room.game.board[command.action.to] ?? null : null;
        const result = applyAction(room.game, color, command.action, command.claimedLines);
        if (!result.ok) throw new ServiceError(result.code);
        checkpointClock(room, now);
        room.clockRemainingMs[color] += room.timeControl.incrementMs;
        room.moveCount++;
        room.lastMove = { ply: room.moveCount, actor: color, action: command.action };
        move = { ...room.lastMove, claimedLines: command.claimedLines, recordedAt: wall, elapsedMs: room.turnElapsedMs, clockAfterMs: { ...room.clockRemainingMs }, captured };
        room.turnElapsedMs = 0;
        room.game = result.state; room.revision++;
        room.deadlineMonoMs = null;
        if (result.state.status === 'finished') { freeze(room, now, wall); room.status = 'finished'; }
        else room.deadlineMonoMs = now + room.clockRemainingMs[result.state.turn];
      }
      store.save(room, oldRevision, { sessionId, commandId: command.commandId, request, appliedRevision: room.revision }, move);
      schedule(room);
      // The caller sends ACK only after this commit; snapshots never precede commit.
      notify(code);
      return { type: 'ack', commandId: command.commandId, appliedRevision: room.revision };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { closed = true; for (const cancel of timers.values()) cancel(); timers.clear(); pendingDisconnects.clear(); listeners.clear(); },
  };
}
