import { afterEach, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { serverFixture, action, peer, readyPeer } from '../helpers/server.ts';
import type { Fixture, Peer } from '../helpers/server.ts';
import { roomCreatedSchema, roomSchema } from '../../src/protocol/messages.ts';
import type { Command } from '../../src/protocol/messages.ts';
import { createLobby } from '../../src/server/lobby.ts';
import { openStore } from '../../src/server/store.ts';

let fixture: Fixture | undefined;
const children: ChildProcessWithoutNullStreams[] = [], clients: Peer[] = [];
async function stop(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill(signal); await exited;
}
afterEach(async () => {
  for (const child of children) await stop(child, 'SIGKILL'); children.length = 0;
  for (const client of clients) await client.close(); clients.length = 0;
  fixture?.close(); fixture = undefined;
});
async function launch(path: string) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../src/server/main.ts', import.meta.url))], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', NODE_ENV: 'test', DATABASE_PATH: path, PUBLIC_ORIGIN: 'http://localhost' },
    stdio: 'pipe',
  });
  children.push(child);
  let output = '';
  const address = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Child startup timed out: ${output}`)); }, 5000);
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      const address = /Omokchess listening at (http:\/\/[^\s]+)/.exec(output)?.[1];
      if (address) { clearTimeout(timer); resolve(address); }
    });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Child exited ${code}: ${output}`)); });
  });
  return { child, address, output: () => output };
}
async function request(address: string, path: string, cookie: string, payload?: object) {
  const response = await fetch(address + path, { method: payload ? 'POST' : 'GET', headers: { cookie, 'content-type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}
async function game(address: string) {
  async function login(nickname: string) {
    const response = await request(address, '/api/session', '', { nickname });
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Cookie missing');
    return cookie;
  }
  const blackCookie = await login('흑'), whiteCookie = await login('백');
  const { code } = roomCreatedSchema.parse(await (await request(address, '/api/rooms', blackCookie, { timeControl: { baseMs: 60_000, incrementMs: 0 } })).json());
  await request(address, `/api/rooms/${code}/join`, whiteCookie, {});
  const black = await peer(address, code, blackCookie), white = await peer(address, code, whiteCookie); clients.push(black, white);
  let snapshot = roomSchema.parse(await (await request(address, `/api/rooms/${code}`, blackCookie)).json());
  await readyPeer(black, snapshot.revision);
  snapshot = roomSchema.parse(await (await request(address, `/api/rooms/${code}`, whiteCookie)).json());
  await readyPeer(white, snapshot.revision);
  snapshot = roomSchema.parse(await (await request(address, `/api/rooms/${code}`, blackCookie)).json());
  const command: Command = { type: 'action', protocolVersion: 2, commandId: randomUUID(), expectedRevision: snapshot.revision, action: { type: 'placeSoldier', at: 22 }, claimedLines: [] };
  black.send(command); await black.next(message => message.type === 'ack' && message.commandId === command.commandId);
  return { code, blackCookie, black, white, command };
}
it('aborts active and paused games across a real killed process, retaining board, receipts and completed results', async () => {
  fixture = serverFixture(); const f = fixture;
  f.start(); const finishedCommand = action(f); f.match.command(f.code, f.black.id, finishedCommand); f.clock.advance(60_000);
  const finished = f.store.room(f.code);
  const lobby = createLobby(f.store, f.clock, f.match.notify), waiting = lobby.create(f.stranger, { baseMs: 60_000, incrementMs: 0 });
  f.match.connect(waiting, f.stranger.id);
  f.match.command(waiting, f.stranger.id, { type: 'ready', protocolVersion: 2, commandId: randomUUID(), expectedRevision: f.store.room(waiting)!.revision });
  f.match.close(); f.store.close();
  const first = await launch(f.path);
  const active = await game(first.address), paused = await game(first.address);
  await paused.black.close();
  await paused.white.next(message => message.type === 'snapshot' && message.room.status === 'paused');
  await stop(first.child, 'SIGKILL');
  const second = await launch(f.path);
  for (const room of [active, paused]) {
    const snapshot = roomSchema.parse(await (await request(second.address, `/api/rooms/${room.code}`, room.blackCookie)).json());
    expect(snapshot).toMatchObject({ status: 'aborted', abortReason: 'server-interrupted', game: { status: 'playing' } });
    expect(snapshot.game?.board[22]).toEqual({ color: 'black', kind: 'soldier' });
    expect(snapshot.game).not.toHaveProperty('winner');
  }
  const reconnect = await peer(second.address, active.code, active.blackCookie); clients.push(reconnect);
  reconnect.send(active.command);
  expect(await reconnect.next(message => message.type === 'ack' && message.commandId === active.command.commandId)).toMatchObject({ appliedRevision: active.command.expectedRevision + 1 });
  expect(first.output() + second.output()).not.toContain(active.blackCookie.split('=')[1]);
  await stop(second.child, 'SIGTERM');
  const store = openStore(f.path);
  expect(store.room(f.code)).toEqual(finished);
  expect(store.receipt(f.code, f.black.id, finishedCommand.commandId)).toBeDefined();
  expect(store.room(waiting)).toMatchObject({ status: 'waiting', players: { black: { ready: false, connected: false } } });
  store.close();
}, 20_000);
