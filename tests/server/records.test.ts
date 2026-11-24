import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { httpFixture, login, roomWithTwo, serverFixture } from '../helpers/server.ts';
import type { HttpFixture, Fixture } from '../helpers/server.ts';
import { createLobby } from '../../src/server/lobby.ts';
import { createRecordsService } from '../../src/server/records.ts';
import { SESSION_MS } from '../../src/server/clock.ts';
import { replayMoves } from '../../src/game/replay.ts';
import { movesPageSchema, recordDetailSchema, recordDownloadSchema, recordsPageSchema } from '../../src/protocol/records.ts';

let http: HttpFixture | undefined, direct: Fixture | undefined;
afterEach(async () => { await http?.close(); direct?.close(); http = undefined; direct = undefined; });
async function active() {
  http = await httpFixture(); const f = http, room = await roomWithTwo(f.app);
  const seats = f.store.room(room.code)!.players;
  for (const seat of [seats.black, seats.white!]) f.match.connect(room.code, seat.sessionId);
  for (const seat of [seats.black, seats.white!]) f.match.command(room.code, seat.sessionId, { type: 'ready', protocolVersion: 2, commandId: randomUUID(), expectedRevision: f.store.room(room.code)!.revision });
  for (const [index, at] of [0, 19, 1].entries()) f.match.command(room.code, index % 2 ? seats.white!.sessionId : seats.black.sessionId, { type: 'action', protocolVersion: 2, commandId: randomUUID(), expectedRevision: f.store.room(room.code)!.revision, action: { type: 'placeSoldier', at }, claimedLines: [] });
  return { f, room, seats };
}
it('pages only committed active moves without joining, changing revision or exposing full snapshots', async () => {
  const { f, room } = await active(), before = f.store.room(room.code);
  const response = await f.app.inject({ url: `/api/records/${room.code}/moves?afterPly=0&limit=2`, headers: { cookie: room.black } });
  expect(response.statusCode).toBe(200);
  const first = movesPageSchema.parse(response.json());
  expect(first.moves.map(move => move.ply)).toEqual([1, 2]); expect(first.nextPly).toBe(2); expect(first.moveCount).toBe(3);
  const second = movesPageSchema.parse((await f.app.inject({ url: `/api/records/${room.code}/moves?afterPly=${first.nextPly}&limit=2`, headers: { cookie: room.white } })).json());
  expect(second.moves.map(move => move.ply)).toEqual([3]); expect(second.nextPly).toBeNull();
  expect(replayMoves(19, [...first.moves, ...second.moves])).toEqual(before?.game);
  expect(f.store.room(room.code)).toEqual(before);
  const snapshot = f.match.snapshot(room.code, before!.players.black.sessionId);
  expect(snapshot).toMatchObject({ moveCount: 3, lastMove: { ply: 3, actor: 'black', action: { type: 'placeSoldier', at: 1 } } });
  expect(snapshot).not.toHaveProperty('moves'); expect(snapshot).not.toHaveProperty('analysis');
  for (const query of ['limit=201', 'afterPly=-1', 'limit=0', 'afterPly=1.5', 'limit=2&owner=forged']) expect((await f.app.inject({ url: `/api/records/${room.code}/moves?${query}`, headers: { cookie: room.black } })).statusCode).toBe(400);
});
it('authorizes every record route and downloads a strict secret-free versioned snapshot', async () => {
  const { f, room, seats } = await active(); f.clock.advance(60_000, false); f.match.settle(room.code);
  const outsider = await login(f.app, '흑');
  for (const suffix of ['', '/moves', '/analysis', '/download']) {
    expect((await f.app.inject({ url: `/api/records/${room.code}${suffix}` })).statusCode).toBe(401);
    expect((await f.app.inject({ url: `/api/records/${room.code}${suffix}`, headers: { cookie: outsider } })).statusCode).toBe(403);
  }
  const list = recordsPageSchema.parse((await f.app.inject({ url: '/api/records', headers: { cookie: room.black } })).json());
  expect(list.records.map(record => record.code)).toEqual([room.code]); expect(list.nextCursor).toBeNull();
  const detail = recordDetailSchema.parse((await f.app.inject({ url: `/api/records/${room.code}`, headers: { cookie: room.white } })).json());
  expect(detail).toMatchObject({ boardSize: 19, historyStatus: 'native', clockAccuracy: 'exact', moveCount: 3, result: { winner: 'black', reason: 'turn-timeout' } });
  const response = await f.app.inject({ url: `/api/records/${room.code}/download`, headers: { cookie: room.black } });
  expect(response.headers['content-disposition']).toBe(`attachment; filename="omokchess-${room.code}.json"`);
  const download = recordDownloadSchema.parse(response.json());
  expect(download).toMatchObject({ formatVersion: 2, detail, analysis: [] }); expect(download.moves).toHaveLength(3);
  expect(response.body).not.toMatch(/sessionId|token_hash|commandId|appliedRevision|deadlineMonoMs|disconnectedSince/);
  for (const secret of [seats.black.sessionId, seats.white!.sessionId, room.black.split('=')[1]!, room.white.split('=')[1]!]) expect(response.body).not.toContain(secret);
});
it('uses stable endedAt/code cursors and rejects invalid list parameters', () => {
  direct = serverFixture(); const f = direct, codes: string[] = [], lobby = createLobby(f.store, f.clock, f.match.notify);
  const records = createRecordsService(f.store, f.clock);
  for (let index = 0; index < 3; index++) {
    if (index) { f.code = lobby.create(f.black, { baseMs: 60_000, incrementMs: 0 }); lobby.join(f.white, f.code); }
    f.start(); f.store.recover(f.clock.wallMs()); codes.push(f.code);
  }
  const first = records.list(f.black.id, { limit: '2' });
  expect(first.records.map(record => record.code)).toEqual([...codes].sort().reverse().slice(0, 2));
  expect(first.nextCursor).not.toBeNull();
  const second = records.list(f.black.id, { cursor: first.nextCursor!, limit: '2' });
  expect(second.records.map(record => record.code)).toEqual([...codes].sort().slice(0, 1)); expect(second.nextCursor).toBeNull();
  expect(records.list(f.stranger.id, {})).toEqual({ records: [], nextCursor: null });
  for (const query of [{ limit: '101' }, { limit: '0' }, { cursor: 'broken' }, { owner: f.black.id }]) expect(() => records.list(f.black.id, query)).toThrow();
});
it('enforces exact seven-day expiry on reads and writes before cleanup and cascades journals and private nodes', async () => {
  const { f, room, seats } = await active(); f.clock.advance(60_000, false); f.match.settle(room.code);
  const input = { id: randomUUID(), parent: { type: 'mainline', ply: 1 }, action: { type: 'placeSoldier', at: 20 }, claimedLines: [] };
  const post = () => f.app.inject({ method: 'POST', url: `/api/records/${room.code}/analysis/nodes`, headers: { cookie: room.black }, payload: input });
  expect((await post()).statusCode).toBe(200);
  const endedAt = f.store.room(room.code)!.endedAt!;
  f.clock.advance(SESSION_MS - 1, false);
  for (const suffix of ['', '/moves', '/analysis', '/download']) expect((await f.app.inject({ url: `/api/records/${room.code}${suffix}`, headers: { cookie: room.black } })).statusCode).toBe(200);
  expect((await post()).statusCode).toBe(200);
  expect(f.store.room(room.code)?.endedAt).toBe(endedAt);
  f.clock.advance(1, false);
  for (const suffix of ['', '/moves', '/analysis', '/download']) expect((await f.app.inject({ url: `/api/records/${room.code}${suffix}`, headers: { cookie: room.black } })).statusCode).toBe(410);
  expect((await post()).statusCode).toBe(410);
  expect(recordsPageSchema.parse((await f.app.inject({ url: '/api/records', headers: { cookie: room.black } })).json()).records).toEqual([]);
  expect(f.store.cleanup(f.clock.wallMs())).toContain(room.code);
  expect(f.store.moves(room.code, 0, 200)).toEqual([]); expect(f.store.analysis(room.code, seats.black.sessionId, 0, 200)).toEqual([]);
  const db = new Database(join(f.directory, 'game.sqlite'));
  try { expect(db.prepare('SELECT * FROM command_receipts WHERE room_code=?').all(room.code)).toEqual([]); } finally { db.close(); }
});
it('labels crash clocks as checkpoints without inventing elapsed crash time', async () => {
  const { f, room } = await active(), before = f.store.room(room.code)!;
  f.clock.advance(12_345, false); f.store.recover(f.clock.wallMs());
  const detail = recordDetailSchema.parse((await f.app.inject({ url: `/api/records/${room.code}`, headers: { cookie: room.black } })).json());
  expect(detail).toMatchObject({ clockAccuracy: 'checkpoint', result: { status: 'aborted', reason: 'server-interrupted' } });
  expect(f.store.room(room.code)?.clockRemainingMs).toEqual(before.clockRemainingMs);
});

it('appends simultaneous private siblings through HTTP without replacing either branch', async () => {
  const { f, room, seats } = await active(); f.store.recover(f.clock.wallMs());
  const requests = [20, 21].map(at => ({ id: randomUUID(), parent: { type: 'mainline', ply: 1 }, action: { type: 'placeSoldier', at }, claimedLines: [] }));
  const responses = await Promise.all(requests.map(payload => f.app.inject({ method: 'POST', url: `/api/records/${room.code}/analysis/nodes`, headers: { cookie: room.black }, payload })));
  for (const response of responses) expect(response.statusCode).toBe(200);
  expect(f.store.analysis(room.code, seats.black.sessionId, 0, 200).map(node => node.id).sort()).toEqual(requests.map(request => request.id).sort());
  const first = requests[0];
  if (!first) throw new Error('Missing sibling request');
  const stranger = await login(f.app);
  expect((await f.app.inject({ method: 'POST', url: `/api/records/${room.code}/analysis/nodes`, headers: { cookie: stranger }, payload: first })).statusCode).toBe(403);
  expect((await f.app.inject({ method: 'POST', url: `/api/records/${room.code}/analysis/nodes`, headers: { cookie: room.black }, payload: { ...first, owner: seats.white!.sessionId } })).statusCode).toBe(400);
  const white = await f.app.inject({ url: `/api/records/${room.code}/analysis`, headers: { cookie: room.white } });
  expect(white.json()).toEqual({ nodes: [], nextCursor: null });
});
