import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { commandSchema } from '../protocol/messages.ts';
import type { ServerMessage } from '../protocol/messages.ts';
import type { Clock } from './clock.ts';
import type { MatchService } from './match.ts';
import { ServiceError } from './store.ts';
import type { Session, Store } from './store.ts';

interface Connection { socket: WebSocket; code: string; sessionId: string; lastPong: number }
export interface SocketTransport { close(): void; expire(codes: string[]): void }
export function registerSockets(app: FastifyInstance, store: Store, match: MatchService, clock: Clock, authorize: (request: FastifyRequest) => Session, origin: string): SocketTransport {
  const connections = new Map<string, Connection>();
  const authenticated = new WeakMap<FastifyRequest, Session>();
  let stopped = false;
  let cancelHeartbeat: (() => void) | undefined;
  function key(connection: Connection) { return `${connection.code}:${connection.sessionId}`; }
  function current(connection: Connection) { return connections.get(key(connection)) === connection; }
  function disconnected(connection: Connection) {
    if (!current(connection)) return;
    connections.delete(key(connection));
    if (stopped) return;
    try { match.disconnect(connection.code, connection.sessionId); }
    catch (error) {
      if (!(error instanceof ServiceError && ['ROOM_NOT_FOUND', 'ROOM_EXPIRED'].includes(error.code))) app.log.error({ err: error }, 'Failed to persist disconnect');
    }
  }
  function send(connection: Connection, message: ServerMessage) {
    if (!current(connection) || connection.socket.readyState !== 1) return;
    if (connection.socket.bufferedAmount > 1024 * 1024) {
      disconnected(connection); connection.socket.close(1013, 'SLOW_CONSUMER'); connection.socket.terminate(); return;
    }
    connection.socket.send(JSON.stringify(message), error => {
      if (error) { app.log.warn({ err: error }, 'Socket send failed'); disconnected(connection); connection.socket.terminate(); }
    });
  }
  function snapshot(connection: Connection) {
    try { send(connection, { type: 'snapshot', room: match.snapshot(connection.code, connection.sessionId) }); }
    catch (error) {
      if (error instanceof ServiceError) send(connection, { type: 'error', code: error.code });
      else { app.log.error({ err: error }, 'Snapshot failed'); send(connection, { type: 'error', code: 'SERVER_ERROR' }); }
    }
  }
  const unsubscribe = match.subscribe(code => {
    for (const connection of connections.values()) if (connection.code === code) snapshot(connection);
  });
  function heartbeat() {
    if (stopped) return;
    for (const connection of connections.values()) {
      if (clock.nowMs() - connection.lastPong >= 10_000) { disconnected(connection); connection.socket.terminate(); }
      else {
        try { store.touchSession(connection.sessionId, clock.wallMs()); connection.socket.ping(); }
        catch (error) { app.log.error({ err: error }, 'Heartbeat failed'); disconnected(connection); connection.socket.terminate(); }
      }
    }
    cancelHeartbeat = clock.schedule(heartbeat, 5000);
  }
  cancelHeartbeat = clock.schedule(heartbeat, 5000);
  app.get<{ Params: { code: string } }>('/api/rooms/:code/socket', {
    websocket: true,
    schema: { params: { type: 'object', properties: { code: { type: 'string', pattern: '^[0-9A-HJKMNP-TV-Z]{12}$' } }, required: ['code'], additionalProperties: false } },
    preValidation: async request => {
      if (request.headers.origin !== origin) throw new ServiceError('ORIGIN_FORBIDDEN', 403);
      const session = authorize(request);
      match.snapshot(request.params.code, session.id);
      authenticated.set(request, session);
    },
  }, (socket, request) => {
    const session = authenticated.get(request);
    if (!session) { socket.close(1008, 'UNAUTHENTICATED'); return; }
    const connection: Connection = { socket, code: request.params.code, sessionId: session.id, lastPong: clock.nowMs() };
    socket.on('message', (data, binary) => {
      if (!current(connection)) return;
      if (binary) { send(connection, { type: 'error', code: 'INVALID_MESSAGE' }); return; }
      let value: unknown;
      try { value = JSON.parse(data.toString()); }
      catch { send(connection, { type: 'error', code: 'INVALID_JSON' }); return; }
      if (typeof value === 'object' && value !== null && 'protocolVersion' in value && value.protocolVersion !== 2) {
        send(connection, { type: 'error', code: 'PROTOCOL_VERSION_MISMATCH' }); return;
      }
      const parsed = commandSchema.safeParse(value);
      if (!parsed.success) { send(connection, { type: 'error', code: 'INVALID_COMMAND' }); return; }
      const command = parsed.data;
      try {
        const ack = match.command(connection.code, connection.sessionId, command);
        send(connection, ack);
        snapshot(connection);
      } catch (error) {
        const code = error instanceof ServiceError ? error.code : 'SERVER_ERROR';
        if (!(error instanceof ServiceError)) app.log.error({ err: error }, 'Command failed');
        const room = store.room(connection.code);
        send(connection, { type: 'error', code, commandId: command.commandId, ...(room ? { currentRevision: room.revision } : {}) });
        if (code !== 'SERVER_ERROR') snapshot(connection);
      }
    });
    socket.on('pong', () => { if (current(connection)) connection.lastPong = clock.nowMs(); });
    socket.on('close', () => disconnected(connection));
    socket.on('error', error => { app.log.warn({ err: error }, 'WebSocket failed'); disconnected(connection); });
    const previous = connections.get(key(connection));
    connections.set(key(connection), connection);
    if (previous) previous.socket.close(4001, 'REPLACED');
    try { match.connect(connection.code, connection.sessionId); snapshot(connection); }
    catch (error) {
      app.log.error({ err: error }, 'Connection state failed');
      send(connection, { type: 'error', code: 'SERVER_ERROR' }); disconnected(connection); socket.close(1011, 'SERVER_ERROR');
    }
  });
  return {
    expire(codes) {
      const expired = new Set(codes);
      for (const connection of connections.values()) if (expired.has(connection.code)) {
        send(connection, { type: 'error', code: 'ROOM_EXPIRED' });
        connections.delete(key(connection)); connection.socket.close(1000, 'ROOM_EXPIRED');
      }
    },
    close() {
      stopped = true; cancelHeartbeat?.(); unsubscribe();
      for (const connection of connections.values()) connection.socket.terminate();
      connections.clear();
    },
  };
}
