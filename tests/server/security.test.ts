import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { httpFixture, login, peer, readyPeer, roomWithTwo } from '../helpers/server.ts';
import type { HttpFixture, Peer } from '../helpers/server.ts';
import { SESSION_MS } from '../../src/server/clock.ts';

let fixture: HttpFixture | undefined;
const peers: Peer[] = [];
afterEach(async () => { for (const client of peers) await client.close(); peers.length = 0; await fixture?.close(); fixture = undefined; });
describe('security boundaries', () => {
  it('authenticates upgrade cookie, membership and exact Origin before allocating a connection', async () => {
    fixture = await httpFixture(); const { app } = fixture;
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const room = await roomWithTwo(app), outsider = await login(app, '흑');
    await expect(peer(address, room.code, '')).rejects.toThrow('401');
    await expect(peer(address, room.code, room.black, 'http://localhost.evil.example')).rejects.toThrow('403');
    await expect(peer(address, room.code, room.black, '')).rejects.toThrow('403');
    await expect(peer(address, room.code, outsider)).rejects.toThrow('403');
    expect(app.websocketServer.clients.size).toBe(0);
  });
  it('ignores forged player, timestamp, revision and winner claims without changing state', async () => {
    fixture = await httpFixture(); const { app, store } = fixture;
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const room = await roomWithTwo(app);
    const black = await peer(address, room.code, room.black), white = await peer(address, room.code, room.white); peers.push(black, white);
    await readyPeer(black, store.room(room.code)!.revision); await readyPeer(white, store.room(room.code)!.revision);
    const before = store.room(room.code);
    for (const extra of [{ playerId: before!.players.black.sessionId }, { color: 'black' }, { winner: 'white' }, { sentAt: 0 }, { expectedRevision: -1 }]) {
      white.socket.send(JSON.stringify({ type: 'action', protocolVersion: 2, commandId: randomUUID(), expectedRevision: before!.revision, action: { type: 'placeSoldier', at: 0 }, claimedLines: [], ...extra }));
      expect(await white.next(message => message.type === 'error')).toMatchObject({ code: 'INVALID_COMMAND' });
    }
    white.socket.send(JSON.stringify({ type: 'action', protocolVersion: 1, commandId: randomUUID(), expectedRevision: before!.revision, action: { type: 'placeSoldier', at: 0 }, claimedLines: [] }));
    expect(await white.next(message => message.type === 'error')).toMatchObject({ code: 'PROTOCOL_VERSION_MISMATCH' });
    white.socket.send(JSON.stringify({ type: 'action', protocolVersion: 2, commandId: randomUUID(), expectedRevision: before!.revision, action: { type: 'placeSoldier', at: 0 }, claimedLines: [] }));
    expect(await white.next(message => message.type === 'error')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect(store.room(room.code)).toEqual(before);
    const snapshot = await black.next(message => message.type === 'snapshot');
    const wire = JSON.stringify(snapshot);
    expect(wire).not.toContain(before!.players.black.sessionId);
    expect(wire).not.toContain(before!.players.white!.sessionId);
    expect(wire).not.toContain(room.black.split('=')[1]);
  });
  it('enforces HTTP size and fixed-window session rate limits', async () => {
    fixture = await httpFixture(); const { app, clock } = fixture;
    const cookie = await login(app);
    expect((await app.inject({ method: 'POST', url: '/api/session', payload: { nickname: 'x'.repeat(16_384) } })).statusCode).toBe(413);
    for (let index = 0; index < 30; index++) expect((await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie }, payload: { timeControl: { baseMs: 60_000, incrementMs: 0 } } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie }, payload: { timeControl: { baseMs: 60_000, incrementMs: 0 } } })).statusCode).toBe(429);
    clock.advance(60_000);
    expect((await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie }, payload: { timeControl: { baseMs: 60_000, incrementMs: 0 } } })).statusCode).toBe(200);
  });
  it('does not trust spoofed forwarding headers for IP limits', async () => {
    fixture = await httpFixture(); const { app } = fixture;
    for (let index = 0; index < 120; index++) {
      const response = await app.inject({ method: 'POST', url: '/api/rooms', payload: { timeControl: { baseMs: 60_000, incrementMs: 0 } }, headers: { 'x-forwarded-for': `192.0.2.${index}` } });
      expect(response.statusCode).toBe(401);
    }
    expect((await app.inject({ method: 'POST', url: '/api/rooms', payload: {}, headers: { 'x-forwarded-for': '203.0.113.1' } })).statusCode).toBe(429);
  });
  it('keeps active-session ownership valid beyond idle expiry, without accepting a nickname substitute', async () => {
    fixture = await httpFixture(); const { app, store, match, clock } = fixture;
    const { black, code } = await roomWithTwo(app);
    const room = store.room(code)!;
    match.connect(code, room.players.black.sessionId); match.connect(code, room.players.white!.sessionId);
    for (const id of [room.players.black.sessionId, room.players.white!.sessionId]) match.command(code, id, { type: 'ready', protocolVersion: 2, commandId: randomUUID(), expectedRevision: store.room(code)!.revision });
    clock.wall += SESSION_MS + 1;
    expect((await app.inject({ url: '/api/session', headers: { cookie: black } })).statusCode).toBe(200);
    const impostor = await login(app, '흑');
    expect((await app.inject({ url: `/api/rooms/${code}`, headers: { cookie: impostor } })).statusCode).toBe(403);
  });
});
