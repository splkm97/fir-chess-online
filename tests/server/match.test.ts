import { afterEach, describe, expect, it } from 'vitest';
import { action, ready, serverFixture } from '../helpers/server.ts';
import type { Fixture } from '../helpers/server.ts';
import { previewAction } from '../../src/game/engine.ts';

let fixture: Fixture | undefined;
afterEach(() => { fixture?.close(); fixture = undefined; });
function setup() { fixture = serverFixture(); fixture.start(); return fixture; }
describe('authoritative match clock and commands', () => {
  it('starts only with two ready and connected seats; repeated ready is revision-idempotent', () => {
    fixture = serverFixture(); const f = fixture;
    f.match.connect(f.code, f.black.id);
    f.match.command(f.code, f.black.id, ready(f));
    expect(f.store.room(f.code)?.status).toBe('waiting');
    const revision = f.store.room(f.code)?.revision;
    f.match.command(f.code, f.black.id, ready(f));
    expect(f.store.room(f.code)?.revision).toBe(revision);
    expect(() => f.match.command(f.code, f.white.id, ready(f))).toThrow('NOT_CONNECTED');
    f.match.connect(f.code, f.white.id); f.match.command(f.code, f.white.id, ready(f));
    expect(f.store.room(f.code)).toMatchObject({ status: 'active', game: { turn: 'black' } });
  });
  it('accepts at 59,999ms and grants the next player exactly 60 seconds', () => {
    const f = setup(); f.clock.advance(59_999, false);
    f.match.command(f.code, f.black.id, action(f));
    expect(f.match.snapshot(f.code, f.white.id)).toMatchObject({ status: 'active', turnRemainingMs: 60_000, game: { turn: 'white' } });
  });
  it.each([60_000, 60_001, 90_000])('rejects a fresh action at %ims even when its timer has not fired', elapsed => {
    const f = setup(); const command = action(f); f.clock.advance(elapsed, false);
    expect(() => f.match.command(f.code, f.black.id, command)).toThrow('GAME_FINISHED');
    expect(f.store.room(f.code)).toMatchObject({ status: 'finished', game: { winner: 'white', reason: 'turn-timeout' } });
    expect(f.store.room(f.code)?.game?.board[0]).toBeNull();
    expect(f.store.receipt(f.code, f.black.id, command.commandId)).toBeUndefined();
  });
  it('settles turn expiry before disconnect and does not mutate absorbing results', () => {
    const f = setup(); f.clock.advance(60_000, false); f.match.disconnect(f.code, f.black.id);
    const done = f.store.room(f.code);
    expect(done?.game).toMatchObject({ winner: 'white', reason: 'turn-timeout' });
    f.match.connect(f.code, f.black.id); f.match.disconnect(f.code, f.white.id); f.clock.advance(500_000);
    expect(() => f.match.command(f.code, f.black.id, ready(f))).toThrow('GAME_FINISHED');
    expect(f.store.room(f.code)).toEqual(done);
  });
  it('freezes the turn and accumulates disconnect usage over multiple reconnects', () => {
    const f = setup(); f.clock.advance(10_000); f.match.disconnect(f.code, f.black.id);
    expect(f.match.snapshot(f.code, f.white.id).turnRemainingMs).toBe(50_000);
    f.clock.advance(20_000); f.match.connect(f.code, f.black.id);
    expect(f.match.snapshot(f.code, f.black.id)).toMatchObject({ status: 'active', turnRemainingMs: 50_000, disconnectRemainingMs: { black: 160_000 } });
    f.clock.advance(5000); f.match.disconnect(f.code, f.black.id);
    f.clock.advance(10_000); f.match.connect(f.code, f.black.id);
    expect(f.match.snapshot(f.code, f.black.id)).toMatchObject({ status: 'active', turnRemainingMs: 45_000, disconnectRemainingMs: { black: 150_000 } });
    f.clock.advance(44_999); expect(f.store.room(f.code)?.status).toBe('active');
    f.clock.advance(1); expect(f.store.room(f.code)?.game).toMatchObject({ winner: 'white', reason: 'turn-timeout' });
  });
  it('allows return at 179,999ms but not at 180,000ms', () => {
    const f = setup(); f.match.disconnect(f.code, f.black.id); f.clock.advance(179_999, false); f.match.connect(f.code, f.black.id);
    expect(f.match.snapshot(f.code, f.black.id).disconnectRemainingMs.black).toBe(1);
    f.match.disconnect(f.code, f.black.id); f.clock.advance(1, false); f.match.connect(f.code, f.black.id);
    expect(f.store.room(f.code)?.game).toMatchObject({ winner: 'white', reason: 'disconnect-timeout' });
  });
  it('keeps independent budgets and does not resume until both reconnect', () => {
    const f = setup(); f.match.disconnect(f.code, f.black.id); f.clock.advance(10_000); f.match.disconnect(f.code, f.white.id);
    f.clock.advance(20_000); f.match.connect(f.code, f.black.id);
    expect(f.match.snapshot(f.code, f.black.id)).toMatchObject({ status: 'paused', turnRemainingMs: 60_000, disconnectRemainingMs: { black: 150_000, white: 160_000 } });
    f.clock.advance(10_000); f.match.connect(f.code, f.white.id);
    expect(f.match.snapshot(f.code, f.black.id)).toMatchObject({ status: 'active', turnRemainingMs: 60_000, disconnectRemainingMs: { black: 150_000, white: 150_000 } });
  });
  it('uses earliest budget deadline even if both expired before a late callback', () => {
    const f = setup(); f.match.disconnect(f.code, f.white.id); f.clock.advance(1, false); f.match.disconnect(f.code, f.black.id);
    f.clock.advance(200_000, false); f.match.settle(f.code);
    expect(f.store.room(f.code)?.game).toMatchObject({ winner: 'black', reason: 'disconnect-timeout' });
  });
  it('aborts simultaneous disconnect expirations without manufacturing a winner', () => {
    const f = setup(); f.match.disconnect(f.code, f.white.id); f.match.disconnect(f.code, f.black.id);
    f.clock.advance(180_000);
    expect(f.store.room(f.code)).toMatchObject({ status: 'aborted', abortReason: 'both-disconnected', game: { status: 'playing' } });
    expect(f.clock.timerCount).toBe(0);
  });
  it('ignores wall clock jumps for turn adjudication', () => {
    const f = setup(); f.clock.wall += 1_000_000;
    expect(f.match.snapshot(f.code, f.black.id).turnRemainingMs).toBe(60_000);
    f.clock.advance(59_999); expect(f.store.room(f.code)?.status).toBe('active');
    f.clock.advance(1); expect(f.store.room(f.code)?.status).toBe('finished');
  });
  it('replays accepted receipts before deadline/revision checks without applying twice', () => {
    const f = setup(); const command = action(f); const ack = f.match.command(f.code, f.black.id, command);
    f.clock.advance(60_000);
    expect(f.match.command(f.code, f.black.id, command)).toEqual(ack);
    expect(f.store.room(f.code)?.game?.players.black.food).toBe(1);
    expect(() => f.match.command(f.code, f.black.id, { ...command, action: { type: 'placeSoldier', at: 1 } })).toThrow('COMMAND_ID_REUSED');
  });
  it('rejects stale, wrong-turn, nonmember and illegal actions without resources changing', () => {
    const f = setup(); const before = f.store.room(f.code);
    expect(() => f.match.command(f.code, f.black.id, { ...action(f), expectedRevision: 0 })).toThrow('STALE_REVISION');
    expect(() => f.match.command(f.code, f.white.id, action(f))).toThrow('NOT_YOUR_TURN');
    expect(() => f.match.command(f.code, f.stranger.id, action(f))).toThrow('NOT_A_MEMBER');
    expect(() => f.match.command(f.code, f.black.id, { ...action(f), action: { type: 'placeChess', kind: 'queen', at: 0 } })).toThrow('NO_FOOD');
    expect(f.store.room(f.code)).toEqual(before);
  });
  it('integrates line scoring through real legal commands and persists two-line victory', () => {
    const f = setup();
    const placements = [0, 1, 2, 3, 4, 20, 21, 22, 23, 24];
    for (const [index, cell] of placements.entries()) {
      const command = action(f, cell), game = f.store.room(f.code)?.game;
      if (!game) throw new Error('Missing running game');
      const preview = previewAction(game, 'black', command.action);
      if (!preview.ok) throw new Error(preview.code);
      f.match.command(f.code, f.black.id, { ...command, claimedLines: preview.candidates });
      if (index < placements.length - 1) f.match.command(f.code, f.white.id, action(f, 300 + index * 2));
    }
    const room = f.store.room(f.code);
    expect(room).toMatchObject({ status: 'finished', game: { winner: 'black', reason: 'two-lines' } });
    expect(room?.game?.completedLines.black).toHaveLength(2);
    expect(f.clock.timerCount).toBe(0);
  });
});
