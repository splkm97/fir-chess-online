import { expect, it } from 'vitest';
import { createGame } from '../../src/game/engine.ts';
import { analysisInputSchema, analysisNodeSchema, moveRecordSchema, recordDetailSchema, recordDownloadSchema } from '../../src/protocol/records.ts';

const summary = { code: '000000000001', boardSize: 20, players: { black: { nickname: '흑' }, white: { nickname: '백' } }, timeControl: { kind: 'legacy-turn', turnMs: 60000 }, result: { status: 'aborted', winner: null, reason: 'server-interrupted' }, endedAt: 1000, expiresAt: 604801000, moveCount: 1, historyStatus: 'reconstructed' };
const move = { ply: 1, actor: 'black', action: { type: 'placeSoldier', at: 399 }, claimedLines: [], recordedAt: null, elapsedMs: null, clockAfterMs: null, captured: null };
const input = { id: '00000000-0000-4000-8000-000000000001', parent: { type: 'mainline', ply: 0 }, action: { type: 'placeSoldier', at: 399 }, claimedLines: [] };
it('retains legacy coordinates and nullable unknown timing in strict record DTOs', () => {
  expect(moveRecordSchema.parse(move)).toEqual(move);
  const detail = { ...summary, finalState: createGame(20), clockAccuracy: 'unknown' };
  expect(recordDetailSchema.parse(detail)).toEqual(detail);
  expect(recordDownloadSchema.parse({ formatVersion: 2, detail, moves: [move], analysis: [] })).toMatchObject({ moves: [move] });
  expect(recordDetailSchema.safeParse({ ...detail, boardSize: 19 }).success).toBe(false);
  expect(recordDownloadSchema.safeParse({ formatVersion: 2, detail: { ...detail, boardSize: 19, finalState: createGame() }, moves: [move], analysis: [] }).success).toBe(false);
  expect(moveRecordSchema.safeParse({ ...move, sessionId: 'secret' }).success).toBe(false);
  expect(recordDetailSchema.safeParse({ ...detail, token: 'secret' }).success).toBe(false);
});
it('allows only append-only analysis input and excludes ownership or trusted outcome claims', () => {
  expect(analysisInputSchema.parse(input)).toEqual(input);
  for (const extra of [{ owner: 'other' }, { actor: 'black' }, { sequence: 1 }, { createdAt: 1 }, { winner: 'black' }, { boardSize: 20 }]) expect(analysisInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  for (const parent of [{ type: 'mainline', ply: -1 }, { type: 'variation', nodeId: 'missing' }, { type: 'mainline', ply: 0, nodeId: input.id }]) expect(analysisInputSchema.safeParse({ ...input, parent }).success).toBe(false);
  expect(analysisNodeSchema.safeParse({ ...input, actor: 'white', createdAt: 1, sequence: 1 }).success).toBe(true);
});
