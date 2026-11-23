import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.ts';
import { createMatchService } from '../../src/server/match.ts';
import type { MatchService } from '../../src/server/match.ts';
import { openStore } from '../../src/server/store.ts';
import type { Session, Store } from '../../src/server/store.ts';
import { createLobby } from '../../src/server/lobby.ts';
import { hashToken } from '../../src/server/session.ts';
import type { Clock } from '../../src/server/clock.ts';
import { serverMessageSchema, roomCreatedSchema } from '../../src/protocol/messages.ts';
import type { Command, ServerMessage } from '../../src/protocol/messages.ts';

export class FakeClock implements Clock {
  mono = 0;
  wall = 1_800_000_000_000;
  private nextId = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  nowMs() { return this.mono; }
  wallMs() { return this.wall; }
  schedule(callback: () => void, delayMs: number) {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.mono + delayMs, callback });
    return () => { this.timers.delete(id); };
  }
  advance(ms: number, runTimers = true) {
    this.mono += ms; this.wall += ms;
    if (!runTimers) return;
    for (;;) {
      const due = [...this.timers].filter(([, timer]) => timer.at <= this.mono).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) return;
      this.timers.delete(due[0]); due[1].callback();
    }
  }
  get timerCount() { return this.timers.size; }
}

export interface Fixture {
  directory: string; path: string; store: Store; clock: FakeClock; match: MatchService;
  black: Session; white: Session; stranger: Session; code: string;
  connect(): void; start(): void; close(): void;
}
export function serverFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'omokchess-server-'));
  const path = join(directory, 'game.sqlite');
  const store = openStore(path), clock = new FakeClock();
  const match = createMatchService(store, clock);
  function session(nickname: string): Session {
    const id = randomUUID(); store.addSession(id, hashToken(id), nickname, clock.wallMs());
    return { id, nickname, expiresAt: clock.wallMs() + 604_800_000 };
  }
  const black = session('흑'), white = session('백'), stranger = session('흑');
  const lobby = createLobby(store, clock, match.notify);
  const code = lobby.create(black); lobby.join(white, code);
  const fixture: Fixture = {
    directory, path, store, clock, match, black, white, stranger, code,
    connect() { match.connect(fixture.code, black.id); match.connect(fixture.code, white.id); },
    start() { fixture.connect(); match.command(fixture.code, black.id, ready(fixture)); match.command(fixture.code, white.id, ready(fixture)); },
    close() { match.close(); store.close(); rmSync(directory, { recursive: true, force: true }); },
  };
  return fixture;
}
export function ready(fixture: Fixture): Command {
  return { type: 'ready', protocolVersion: 1, commandId: randomUUID(), expectedRevision: fixture.store.room(fixture.code)?.revision ?? 0 };
}
export function action(fixture: Fixture, at = 0): Extract<Command, { type: 'action' }> {
  return { type: 'action', protocolVersion: 1, commandId: randomUUID(), expectedRevision: fixture.store.room(fixture.code)?.revision ?? 0, action: { type: 'placeSoldier', at }, claimedLines: [] };
}

export interface HttpFixture { app: FastifyInstance; store: Store; match: MatchService; clock: FakeClock; directory: string; close(): Promise<void> }
export async function httpFixture(production = false): Promise<HttpFixture> {
  const directory = mkdtempSync(join(tmpdir(), 'omokchess-http-'));
  const path = join(directory, 'game.sqlite'), store = openStore(path), clock = new FakeClock();
  const match = createMatchService(store, clock);
  const app = await buildApp({ host: '127.0.0.1', port: 0, origin: 'http://localhost', databasePath: path, production }, { store, clock, match });
  return { app, store, match, clock, directory, async close() { await app.close(); rmSync(directory, { recursive: true, force: true }); } };
}
export async function login(app: FastifyInstance, nickname = '플레이어'): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/session', payload: { nickname } });
  if (response.statusCode !== 200) throw new Error(response.body);
  const value = response.headers['set-cookie'];
  const cookie = (Array.isArray(value) ? value[0] : value)?.split(';')[0];
  if (!cookie) throw new Error('Session cookie missing');
  return cookie;
}
export async function roomWithTwo(app: FastifyInstance) {
  const black = await login(app, '흑'), white = await login(app, '백');
  const created = await app.inject({ method: 'POST', url: '/api/rooms', payload: {}, headers: { cookie: black } });
  const { code } = roomCreatedSchema.parse(created.json());
  const joined = await app.inject({ method: 'POST', url: `/api/rooms/${code}/join`, payload: {}, headers: { cookie: white } });
  if (joined.statusCode !== 200) throw new Error(joined.body);
  return { black, white, code };
}
export interface Peer {
  socket: WebSocket; messages: ServerMessage[];
  next(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage>;
  send(command: Command): void;
  close(): Promise<void>;
}
export async function peer(address: string, code: string, cookie: string, origin = 'http://localhost', autoPong = true): Promise<Peer> {
  const socket = new WebSocket(`${address.replace('http', 'ws')}/api/rooms/${code}/socket`, { headers: { cookie, origin }, autoPong });
  const messages: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  socket.on('message', data => { messages.push(serverMessageSchema.parse(JSON.parse(data.toString()))); for (const wake of waiters) wake(); });
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return {
    socket, messages,
    next(predicate) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`Socket message timeout: ${JSON.stringify(messages)}`)); }, 3000);
        function check() {
          const index = messages.findIndex(predicate);
          if (index >= 0) { const message = messages.splice(index, 1)[0]; if (message) { clearTimeout(timer); waiters.delete(check); resolve(message); } }
        }
        waiters.add(check); check();
      });
    },
    send(command) { socket.send(JSON.stringify(command)); },
    async close() { if (socket.readyState === WebSocket.CLOSED) return; await new Promise<void>(resolve => { socket.once('close', () => resolve()); socket.terminate(); }); },
  };
}
export async function readyPeer(client: Peer, revision: number) {
  const command: Command = { type: 'ready', protocolVersion: 1, commandId: randomUUID(), expectedRevision: revision };
  client.send(command);
  return client.next(message => message.type === 'ack' && message.commandId === command.commandId);
}
