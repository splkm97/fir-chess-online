import { afterEach, describe, expect, it } from 'vitest';
import { httpFixture, login, roomWithTwo } from '../helpers/server.ts';
import type { HttpFixture } from '../helpers/server.ts';
import { roomCreatedSchema, roomSchema } from '../../src/protocol/messages.ts';
import { WAITING_MS } from '../../src/server/clock.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });
describe('invitation lobby', () => {
  it('assigns two distinct seats and never leaks public snapshots to outsiders', async () => {
    fixture = await httpFixture(); const { app } = fixture;
    const { black, white, code } = await roomWithTwo(app); const outsider = await login(app, '흑');
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    const snapshot = await app.inject({ url: `/api/rooms/${code}`, headers: { cookie: black } });
    expect(roomSchema.parse(snapshot.json())).toMatchObject({ you: 'black', players: { black: { nickname: '흑' }, white: { nickname: '백' } } });
    expect(snapshot.body).not.toMatch(/sessionId|token|deadlineMonoMs|disconnectedSince/);
    expect((await app.inject({ url: `/api/rooms/${code}`, headers: { cookie: white } })).json().you).toBe('white');
    expect((await app.inject({ url: `/api/rooms/${code}`, headers: { cookie: outsider } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${code}/join`, headers: { cookie: outsider }, payload: {} })).json().code).toBe('ROOM_FULL');
    expect((await app.inject({ url: `/api/rooms/${code}` })).statusCode).toBe(401);
  });
  it('makes create/join retries idempotent and redirects an existing seat to its room', async () => {
    fixture = await httpFixture(); const { app, store } = fixture;
    const { black, white, code } = await roomWithTwo(app);
    const revision = store.room(code)?.revision;
    for (const cookie of [black, white]) {
      expect((await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie }, payload: { timeControl: { baseMs: 90_000, incrementMs: 5000 } } })).json()).toEqual({ code });
      expect((await app.inject({ method: 'POST', url: `/api/rooms/${code}/join`, headers: { cookie }, payload: {} })).json()).toEqual({ code });
    }
    expect(store.room(code)?.revision).toBe(revision);
    expect(store.room(code)?.timeControl).toEqual({ kind: 'fischer', baseMs: 60_000, incrementMs: 0 });
    const stranger = await login(app);
    const other = roomCreatedSchema.parse((await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: stranger }, payload: { timeControl: { baseMs: 60_000, incrementMs: 0 } } })).json());
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${other.code}/join`, headers: { cookie: white }, payload: {} })).json()).toEqual({ code });
    expect(store.room(other.code)?.players.white).toBeNull();
    expect((await app.inject({ url: '/api/session', headers: { cookie: white } })).json().roomCode).toBe(code);
  });
  it('distinguishes malformed, missing and expired room codes', async () => {
    fixture = await httpFixture(); const { app, clock } = fixture;
    const { black, code } = await roomWithTwo(app);
    expect((await app.inject({ url: '/api/rooms/no', headers: { cookie: black } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/rooms/000000000000', headers: { cookie: black } })).json().code).toBe('ROOM_NOT_FOUND');
    clock.advance(WAITING_MS, false);
    expect((await app.inject({ url: `/api/rooms/${code}`, headers: { cookie: black } })).json().code).toBe('ROOM_EXPIRED');
  });
  it('requires authenticated JSON room mutations and rejects client-selected seats', async () => {
    fixture = await httpFixture(); const { app } = fixture;
    expect((await app.inject({ method: 'POST', url: '/api/rooms', payload: { timeControl: { baseMs: 60_000, incrementMs: 0 } } })).statusCode).toBe(401);
    const cookie = await login(app);
    expect((await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie }, payload: { playerId: 'other', color: 'white' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie, origin: 'https://evil.example' }, payload: {} })).statusCode).toBe(403);
  });
});
