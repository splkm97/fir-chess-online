import { z } from 'zod';
import { clockPairSchema, colorSchema, gameSchema, pieceSchema, recordActionSchema, recordLineSchema, roomCodeSchema, timeControlSchema } from './messages.ts';

export const recordSummarySchema = z.strictObject({
  code: roomCodeSchema, boardSize: z.union([z.literal(19), z.literal(20)]),
  players: z.strictObject({ black: z.strictObject({ nickname: z.string() }), white: z.strictObject({ nickname: z.string() }).nullable() }),
  timeControl: timeControlSchema,
  result: z.strictObject({ status: z.enum(['finished', 'aborted']), winner: colorSchema.nullable(), reason: z.string() }),
  endedAt: z.number(), expiresAt: z.number(), moveCount: z.number().int().nonnegative().safe(),
  historyStatus: z.enum(['native', 'reconstructed', 'unavailable']),
});
export type RecordSummary = z.infer<typeof recordSummarySchema>;
export const recordDetailSchema = recordSummarySchema.extend({ finalState: gameSchema.nullable(), clockAccuracy: z.enum(['exact', 'checkpoint', 'unknown']) }).superRefine((record, ctx) => {
  if (record.finalState && record.finalState.boardSize !== record.boardSize) ctx.addIssue({ code: 'custom', message: 'Record board size mismatch' });
});
export type RecordDetail = z.infer<typeof recordDetailSchema>;
export const moveRecordSchema = z.strictObject({
  ply: z.number().int().positive().safe(), actor: colorSchema, action: recordActionSchema,
  claimedLines: z.array(recordLineSchema).max(2), recordedAt: z.number().nullable(), elapsedMs: z.number().nonnegative().nullable(),
  clockAfterMs: clockPairSchema.nullable(), captured: pieceSchema.nullable(),
});
export type MoveRecord = z.infer<typeof moveRecordSchema>;
export const recordsPageSchema = z.strictObject({ records: z.array(recordSummarySchema), nextCursor: z.string().nullable() });
export const movesPageSchema = z.strictObject({ moves: z.array(moveRecordSchema), nextPly: z.number().int().positive().safe().nullable(), moveCount: z.number().int().nonnegative().safe() });
export const analysisParentSchema = z.discriminatedUnion('type', [z.strictObject({ type: z.literal('mainline'), ply: z.number().int().nonnegative().safe() }), z.strictObject({ type: z.literal('variation'), nodeId: z.uuid() })]);
export type AnalysisParent = z.infer<typeof analysisParentSchema>;
export const analysisInputSchema = z.strictObject({ id: z.uuid(), parent: analysisParentSchema, action: recordActionSchema, claimedLines: z.array(recordLineSchema).max(2) });
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export const analysisNodeSchema = analysisInputSchema.extend({ actor: colorSchema, createdAt: z.number(), sequence: z.number().int().positive().safe() });
export type AnalysisNode = z.infer<typeof analysisNodeSchema>;
export const analysisPageSchema = z.strictObject({ nodes: z.array(analysisNodeSchema), nextCursor: z.string().nullable() });
export const analysisSavedSchema = z.strictObject({ node: analysisNodeSchema });
export const recordDownloadSchema = z.strictObject({ formatVersion: z.literal(2), detail: recordDetailSchema, moves: z.array(moveRecordSchema), analysis: z.array(analysisNodeSchema) }).superRefine((download, ctx) => {
  const width = download.detail.boardSize, size = width ** 2;
  for (const move of [...download.moves, ...download.analysis]) {
    const cells = move.action.type === 'moveChess' ? [move.action.from, move.action.to] : [move.action.at];
    if (cells.some(cell => cell >= size) || move.claimedLines.some(line => line.start >= size || line.cells.some(cell => cell >= size))) ctx.addIssue({ code: 'custom', message: 'Record coordinate outside board' });
    for (const line of move.claimedLines) {
      const x = line.start % width, y = Math.floor(line.start / width);
      if ((line.dx === 0 && line.dy !== 1) || line.cells.some((at, index) => {
        const column = x + index * line.dx, row = y + index * line.dy;
        return column < 0 || column >= width || row < 0 || row >= width || at !== row * width + column;
      })) ctx.addIssue({ code: 'custom', message: 'Invalid record line geometry' });
    }
  }
});
