import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { httpFixture, login } from '../helpers/server.ts';
import type { HttpFixture } from '../helpers/server.ts';
import { SESSION_MS } from '../../src/server/clock.ts';
import { sessionSchema } from '../../src/protocol/messages.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });
describe('nonmember sessions', () => {
  it('issues HttpOnly, Lax scoped cookies and stores only token hashes', async () => {
    fixture = await httpFixture(); const { app, directory } = fixture;
    const response = await app.inject({ method: 'POST', url: '/api/session', payload: { nickname: '  <b>🙂</b>  ' } });
    expect(response.statusCode).toBe(200);
    expect(sessionSchema.parse(response.json())).toEqual({ nickname: '<b>🙂</b>', roomCode: null });
    const cookie = response.headers['set-cookie']; expect(cookie).toEqual(expect.stringContaining('HttpOnly')); expect(cookie).toEqual(expect.stringContaining('SameSite=Lax')); expect(cookie).toEqual(expect.stringContaining('Path=/'));
    expect(cookie).not.toEqual(expect.stringContaining('Secure'));
    const db = new Database(join(directory, 'game.sqlite'));
    const row = db.prepare<[], { token_hash: string }>('SELECT token_hash FROM sessions').get();
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(String(cookie)).not.toContain(row?.token_hash);
    expect(response.body).not.toMatch(/token|sessionId/);
    db.close();
  });
  it('sets Secure in production', async () => {
    fixture = await httpFixture(true);
    const response = await fixture.app.inject({ method: 'POST', url: '/api/session', payload: { nickname: 'safe' } });
    expect(response.headers['set-cookie']).toEqual(expect.stringContaining('Secure'));
  });
  it.each(['', ' '.repeat(4), 'a'.repeat(21), 'abc\nxyz', 'abc\u200dxyz'])('rejects invalid nickname %j', async nickname => {
    fixture = await httpFixture();
    const response = await fixture.app.inject({ method: 'POST', url: '/api/session', payload: { nickname } });
    expect(response.statusCode).toBe(400);
  });
  it('counts Unicode code points rather than UTF-16 units', async () => {
    fixture = await httpFixture();
    const response = await fixture.app.inject({ method: 'POST', url: '/api/session', payload: { nickname: '🙂'.repeat(20) } });
    expect(response.statusCode).toBe(200);
  });
  it('renews valid authentication and expires idle sessions at the exact boundary', async () => {
    fixture = await httpFixture(); const { app, clock } = fixture;
    const cookie = await login(app);
    clock.advance(SESSION_MS - 1, false);
    expect((await app.inject({ url: '/api/session', headers: { cookie } })).statusCode).toBe(200);
    clock.advance(SESSION_MS, false);
    expect((await app.inject({ url: '/api/session', headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/session' })).statusCode).toBe(401);
    const replacement = await login(app);
    expect(replacement).not.toBe(cookie);
  });
  it('rejects cross-origin mutations, forged cookies and unexpected fields', async () => {
    fixture = await httpFixture(); const { app } = fixture;
    expect((await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'https://evil.example' }, payload: { nickname: 'x' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/session', payload: { nickname: 'x', color: 'white' } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/session', headers: { cookie: 'omokchess_session=forged' } })).statusCode).toBe(401);
  });
});
