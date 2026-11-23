import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { serverFixture, action } from '../helpers/server.ts';
import type { Fixture } from '../helpers/server.ts';
import { openStore } from '../../src/server/store.ts';
import { createLobby } from '../../src/server/lobby.ts';
import { SESSION_MS, WAITING_MS } from '../../src/server/clock.ts';

let fixture: Fixture | undefined;
afterEach(() => { fixture?.close(); fixture = undefined; });
function setup() { fixture = serverFixture(); return fixture; }
describe('SQLite store', () => {
  it('uses WAL, foreign keys and a versioned schema; persists receipts across reopen', () => {
    const f = setup(); f.start(); const command = action(f);
    const ack = f.match.command(f.code, f.black.id, command);
    const db = new Database(f.path);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(() => f.store.insert({ ...f.store.room(f.code)!, code: '000000000000', players: { black: { sessionId: 'missing', nickname: 'x', ready: false, connected: false }, white: null } })).toThrow();
    db.close(); f.match.close(); f.store.close();
    const reopened = openStore(f.path);
    expect(reopened.room(f.code)?.game?.board[0]).toEqual({ color: 'black', kind: 'soldier' });
    expect(reopened.receipt(f.code, f.black.id, command.commandId)?.appliedRevision).toBe(ack.appliedRevision);
    reopened.close();
  });
  it('rolls snapshot, resources and revision back when receipt insert fails', () => {
    const f = setup(); f.start(); const before = f.store.room(f.code);
    const db = new Database(f.path);
    db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(FAIL, 'disk write rejected'); END");
    const command = action(f);
    expect(() => f.match.command(f.code, f.black.id, command)).toThrow('disk write rejected');
    expect(f.store.room(f.code)).toEqual(before);
    expect(f.store.receipt(f.code, f.black.id, command.commandId)).toBeUndefined();
    db.close();
  });
  it('refuses stale updates and reserves the white seat atomically', () => {
    const f = setup(), room = f.store.room(f.code)!;
    expect(() => f.store.save({ ...room, revision: room.revision + 1 }, room.revision - 1)).toThrow();
    const lobby = createLobby(f.store, f.clock, f.match.notify);
    const otherCode = lobby.create(f.stranger);
    const id = randomUUID(); f.store.addSession(id, id, 'fourth', f.clock.wallMs());
    expect(lobby.join({ id, nickname: 'fourth', expiresAt: 0 }, otherCode)).toBe(otherCode);
    expect(() => lobby.join(f.white, otherCode)).not.toThrow(); // Existing membership redirects, never takes a second seat.
    const fifth = randomUUID(); f.store.addSession(fifth, fifth, 'fifth', f.clock.wallMs());
    expect(() => lobby.join({ id: fifth, nickname: 'fifth', expiresAt: 0 }, otherCode)).toThrow('ROOM_FULL');
    expect(f.store.room(otherCode)?.players.white?.sessionId).toBe(id);
  });
  it('expires waiting rooms and cascades seven-day result receipts', () => {
    const f = setup(); f.clock.advance(WAITING_MS, false);
    expect(f.store.cleanup(f.clock.wallMs())).toEqual([f.code]);
    const lobby = createLobby(f.store, f.clock, f.match.notify);
    f.code = lobby.create(f.black); lobby.join(f.white, f.code); f.start();
    const command = action(f); f.match.command(f.code, f.black.id, command);
    f.clock.advance(60_000); expect(f.store.room(f.code)?.status).toBe('finished');
    f.clock.advance(SESSION_MS, false);
    expect(f.store.cleanup(f.clock.wallMs())).toEqual([f.code]);
    expect(f.store.receipt(f.code, f.black.id, command.commandId)).toBeUndefined();
  });
  it('aborts interrupted games but preserves finished games and clears waiting readiness', () => {
    const f = setup(); f.start(); const command = action(f); f.match.command(f.code, f.black.id, command);
    f.store.recover(f.clock.wallMs());
    const aborted = f.store.room(f.code)!;
    expect(aborted).toMatchObject({ status: 'aborted', abortReason: 'server-interrupted', game: { status: 'playing' } });
    expect(aborted.game?.board[0]?.color).toBe('black');
    f.store.recover(f.clock.wallMs()); expect(f.store.room(f.code)).toEqual(aborted);
  });
});
