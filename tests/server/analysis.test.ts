import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { action, serverFixture } from '../helpers/server.ts';
import type { Fixture } from '../helpers/server.ts';
import { createRecordsService } from '../../src/server/records.ts';
import { createLobby } from '../../src/server/lobby.ts';
import { openStore } from '../../src/server/store.ts';
import type { AnalysisInput, AnalysisNode, AnalysisParent } from '../../src/protocol/records.ts';
import type { Action } from '../../src/game/types.ts';
import { previewAction } from '../../src/game/engine.ts';
import { replayMoves } from '../../src/game/replay.ts';

let fixture: Fixture | undefined;
afterEach(() => { fixture?.close(); fixture = undefined; });
function setup(terminal = true) {
  fixture = serverFixture(); const f = fixture; f.start();
  f.match.command(f.code, f.black.id, action(f, 0)); f.match.command(f.code, f.white.id, action(f, 19));
  if (terminal) f.store.recover(f.clock.wallMs());
  return { f, records: createRecordsService(f.store, f.clock) };
}
function input(parent: AnalysisParent = { type: 'mainline', ply: 1 }, action: Action = { type: 'placeSoldier', at: 20 }): AnalysisInput {
  return { id: randomUUID(), parent, action, claimedLines: [] };
}
it('allows both colors, sibling and nested variations while keeping mainline and other owner branches immutable', () => {
  const { f, records } = setup(), before = f.store.room(f.code), moves = f.store.moves(f.code, 0, 200);
  const first = records.append(f.code, f.black.id, input()).node;
  const sibling = records.append(f.code, f.black.id, input({ type: 'mainline', ply: 1 }, { type: 'placeSoldier', at: 21 })).node;
  const nested = records.append(f.code, f.black.id, input({ type: 'variation', nodeId: first.id }, { type: 'placeSoldier', at: 1 })).node;
  const privateWhite = records.append(f.code, f.white.id, input()).node;
  expect([first.actor, sibling.actor, nested.actor]).toEqual(['white', 'white', 'black']);
  expect([first.sequence, sibling.sequence, nested.sequence]).toEqual([1, 2, 3]);
  expect(records.analysis(f.code, f.black.id, {}).nodes).toEqual([first, sibling, nested]);
  expect(records.analysis(f.code, f.white.id, {}).nodes).toEqual([privateWhite]);
  expect(records.download(f.code, f.black.id).analysis).toEqual([first, sibling, nested]);
  expect(records.download(f.code, f.white.id).analysis).toEqual([privateWhite]);
  expect(f.store.room(f.code)).toEqual(before); expect(f.store.moves(f.code, 0, 200)).toEqual(moves);
  const firstPage = records.analysis(f.code, f.black.id, { limit: '2' });
  expect(firstPage).toEqual({ nodes: [first, sibling], nextCursor: '2' });
  expect(records.analysis(f.code, f.black.id, { cursor: firstPage.nextCursor!, limit: '2' })).toEqual({ nodes: [nested], nextCursor: null });
});
it('retries one ID exactly once, rejects conflicting payload and retains unrelated siblings after an insertion failure', () => {
  const { f, records } = setup(), request = input(), saved = records.append(f.code, f.black.id, request);
  f.clock.advance(1000, false);
  expect(records.append(f.code, f.black.id, request)).toEqual(saved);
  expect(() => records.append(f.code, f.black.id, { ...request, action: { type: 'placeSoldier', at: 21 } })).toThrow('ANALYSIS_ID_REUSED');
  const db = new Database(f.path), retry = input({ type: 'variation', nodeId: saved.node.id }, { type: 'placeSoldier', at: 1 });
  try {
    db.exec("CREATE TRIGGER fail_analysis BEFORE INSERT ON analysis_nodes BEGIN SELECT RAISE(FAIL,'node rejected'); END");
    expect(() => records.append(f.code, f.black.id, retry)).toThrow('node rejected');
    expect(records.analysis(f.code, f.black.id, {}).nodes).toEqual([saved.node]);
    db.exec('DROP TRIGGER fail_analysis');
    const sibling = records.append(f.code, f.black.id, input({ type: 'mainline', ply: 0 }, { type: 'placeSoldier', at: 100 })).node;
    const retried = records.append(f.code, f.black.id, retry).node;
    expect([sibling.sequence, retried.sequence]).toEqual([2, 3]);
    expect(records.analysis(f.code, f.black.id, {}).nodes).toEqual([saved.node, sibling, retried]);
  } finally { db.close(); }
});
it('refuses active/paused writes, forged owner fields, nonmembers, nonexistent or cross-owner/room parents and cycles', () => {
  const { f, records } = setup(false);
  expect(() => records.append(f.code, f.black.id, input())).toThrow('RECORD_NOT_FINISHED');
  f.match.disconnect(f.code, f.white.id);
  expect(() => records.append(f.code, f.black.id, input())).toThrow('RECORD_NOT_FINISHED');
  f.store.recover(f.clock.wallMs());
  expect(() => records.append(f.code, f.stranger.id, input())).toThrow('NOT_A_MEMBER');
  expect(() => records.append(f.code, f.black.id, { ...input(), owner: f.white.id })).toThrow();
  expect(() => records.append(f.code, f.black.id, input({ type: 'mainline', ply: 3 }))).toThrow('INVALID_ANALYSIS_PARENT');
  expect(() => records.append(f.code, f.black.id, input({ type: 'variation', nodeId: randomUUID() }))).toThrow('ANALYSIS_PARENT_NOT_FOUND');
  const privateWhite = records.append(f.code, f.white.id, input()).node;
  expect(() => records.append(f.code, f.black.id, input({ type: 'variation', nodeId: privateWhite.id }))).toThrow('ANALYSIS_PARENT_NOT_FOUND');
  const self = input(); self.parent = { type: 'variation', nodeId: self.id };
  expect(() => records.append(f.code, f.black.id, self)).toThrow('ANALYSIS_PARENT_NOT_FOUND');
  const firstCode = f.code, node = records.append(firstCode, f.black.id, input()).node;
  const lobby = createLobby(f.store, f.clock, f.match.notify);
  f.code = lobby.create(f.black, { baseMs: 60_000, incrementMs: 0 }); lobby.join(f.white, f.code); f.start(); f.store.recover(f.clock.wallMs());
  expect(() => records.append(f.code, f.black.id, input({ type: 'variation', nodeId: node.id }))).toThrow('ANALYSIS_PARENT_NOT_FOUND');
});
it('validates occupancy, food, board bounds and moves using pure parent replay, not the external result', () => {
  const { f, records } = setup(false); f.clock.advance(60_000, false); f.match.settle(f.code);
  expect(f.store.room(f.code)?.game).toMatchObject({ status: 'finished', reason: 'turn-timeout' });
  expect(records.append(f.code, f.white.id, input({ type: 'mainline', ply: 2 }, { type: 'placeSoldier', at: 360 })).node.actor).toBe('black');
  expect(() => records.append(f.code, f.black.id, input({ type: 'mainline', ply: 2 }, { type: 'placeSoldier', at: 0 }))).toThrow('OCCUPIED');
  expect(() => records.append(f.code, f.black.id, input({ type: 'mainline', ply: 0 }, { type: 'placeChess', kind: 'queen', at: 0 }))).toThrow('NO_FOOD');
  expect(() => records.append(f.code, f.black.id, input({ type: 'mainline', ply: 0 }, { type: 'placeSoldier', at: 361 }))).toThrow('OUT_OF_BOUNDS');
  expect(() => records.append(f.code, f.black.id, input({ type: 'mainline', ply: 2 }, { type: 'moveChess', from: 0, to: 2 }))).toThrow('INVALID_MOVE');
});
it('preserves private nodes across reopening and never changes record expiration on append', () => {
  const { f, records } = setup(), request = input(), saved = records.append(f.code, f.black.id, request), detail = records.detail(f.code, f.black.id);
  f.match.close(); f.store.close();
  const store = openStore(f.path);
  try {
    const reopened = createRecordsService(store, f.clock);
    expect(reopened.append(f.code, f.black.id, request)).toEqual(saved);
    expect(reopened.download(f.code, f.black.id).analysis).toEqual([saved.node]);
    expect(reopened.download(f.code, f.white.id).analysis).toEqual([]);
    expect(reopened.detail(f.code, f.black.id).expiresAt).toBe(detail.expiresAt);
  } finally { store.close(); }
});
it('records protected-line choices and refuses continuation of rule-terminal variations', () => {
  fixture = serverFixture(); const f = fixture; f.start(); f.store.recover(f.clock.wallMs());
  const records = createRecordsService(f.store, f.clock);
  let parent: AnalysisParent = { type: 'mainline', ply: 0 };
  const branch: AnalysisNode[] = [];
  function append(action: Action) {
    const state = replayMoves(19, branch);
    if (state.status !== 'playing') throw new Error('Unexpected terminal fixture');
    const preview = previewAction(state, state.turn, action);
    if (!preview.ok) throw new Error(preview.code);
    const node = records.append(f.code, f.black.id, { ...input(parent, action), claimedLines: preview.candidates }).node;
    branch.push(node); parent = { type: 'variation', nodeId: node.id };
    return node;
  }
  for (let index = 0; index < 5; index++) {
    append({ type: 'placeSoldier', at: index });
    if (index < 4) append({ type: 'placeSoldier', at: 300 + index * 2 });
  }
  append({ type: 'placeChess', kind: 'rook', at: 95 });
  append({ type: 'placeSoldier', at: 20 });
  expect(() => records.append(f.code, f.black.id, input(parent, { type: 'moveChess', from: 95, to: 0 }))).toThrow('PROTECTED');
  append({ type: 'placeSoldier', at: 308 });
  for (const [index, at] of [19, 21, 22, 23].entries()) {
    const last = append({ type: 'placeSoldier', at });
    if (at === 23) {
      expect(() => records.append(f.code, f.black.id, input({ type: 'variation', nodeId: last.id }, { type: 'placeSoldier', at: 350 }))).toThrow('GAME_FINISHED');
    } else append({ type: 'placeSoldier', at: 310 + index * 2 });
  }
  expect(f.store.moves(f.code, 0, 200)).toEqual([]);
  expect(f.store.room(f.code)?.moveCount).toBe(0);
});
