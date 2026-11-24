import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { applyAction } from '../game/engine.ts';
import { replayMoves } from '../game/replay.ts';
import type { ReplayMove } from '../game/replay.ts';
import { httpErrorSchema, roomCodeSchema } from '../protocol/messages.ts';
import { analysisInputSchema, analysisPageSchema, analysisSavedSchema, movesPageSchema, recordDetailSchema, recordDownloadSchema, recordsPageSchema, recordSummarySchema } from '../protocol/records.ts';
import type { AnalysisInput, AnalysisNode, AnalysisParent, RecordDetail, RecordSummary } from '../protocol/records.ts';
import type { Clock } from './clock.ts';
import { SESSION_MS } from './clock.ts';
import { memberColor } from './lobby.ts';
import { ServiceError } from './store.ts';
import type { Session, Store, StoredRoom } from './store.ts';

const cursorSchema = z.strictObject({ endedAt: z.number(), code: roomCodeSchema });
const integerQuery = (fallback: number, maximum: number) => z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().max(maximum)).optional().transform(value => value ?? fallback);
const listQuery = z.strictObject({ cursor: z.string().max(512).optional(), limit: integerQuery(20, 100).refine(value => value > 0) });
const movesQuery = z.strictObject({ afterPly: integerQuery(0, Number.MAX_SAFE_INTEGER), limit: integerQuery(200, 200).refine(value => value > 0) });
const analysisQuery = z.strictObject({ cursor: z.string().max(32).optional(), limit: integerQuery(200, 200).refine(value => value > 0) });

function summary(room: StoredRoom): RecordSummary {
  if ((room.status !== 'finished' && room.status !== 'aborted') || room.endedAt === null) throw new ServiceError('RECORD_NOT_FINISHED');
  return recordSummarySchema.parse({
    code: room.code, boardSize: room.game?.boardSize ?? (room.timeControl.kind === 'legacy-turn' ? 20 : 19),
    players: { black: { nickname: room.players.black.nickname }, white: room.players.white ? { nickname: room.players.white.nickname } : null },
    timeControl: room.timeControl,
    result: { status: room.status, winner: room.status === 'finished' && room.game?.status === 'finished' ? room.game.winner : null, reason: room.abortReason ?? (room.game?.status === 'finished' ? room.game.reason : 'unknown') },
    endedAt: room.endedAt, expiresAt: room.endedAt + SESSION_MS, moveCount: room.moveCount, historyStatus: room.historyStatus,
  });
}
function detail(room: StoredRoom): RecordDetail {
  return recordDetailSchema.parse({ ...summary(room), finalState: room.game, clockAccuracy: room.clockAccuracy });
}
function decodeCursor(cursor?: string) {
  if (cursor === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid encoding');
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch { throw new ServiceError('INVALID_CURSOR', 400); }
}
function analysisCursor(cursor?: string): number {
  if (cursor === undefined) return 0;
  if (!/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) throw new ServiceError('INVALID_CURSOR', 400);
  return Number(cursor);
}

export function createRecordsService(store: Store, clock: Clock) {
  function accessible(code: string, owner: string, terminal = true): StoredRoom {
    const room = store.room(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 404);
    memberColor(room, owner);
    if (room.endedAt !== null && room.endedAt + SESSION_MS <= clock.wallMs()) throw new ServiceError('RECORD_EXPIRED', 410);
    if (terminal) summary(room);
    return room;
  }
  function parentState(room: StoredRoom, owner: string, parent: AnalysisParent) {
    if (room.historyStatus === 'unavailable' || !room.game) throw new ServiceError('HISTORY_UNAVAILABLE');
    const branch: ReplayMove[] = [];
    const visited = new Set<string>();
    let ancestor = parent;
    while (ancestor.type === 'variation') {
      if (visited.has(ancestor.nodeId)) throw new ServiceError('INVALID_ANALYSIS_PARENT');
      visited.add(ancestor.nodeId);
      const node = store.analysisNode(room.code, owner, ancestor.nodeId);
      if (!node) throw new ServiceError('ANALYSIS_PARENT_NOT_FOUND', 404);
      branch.push(node); ancestor = node.parent;
    }
    if (ancestor.ply > room.moveCount) throw new ServiceError('INVALID_ANALYSIS_PARENT');
    const mainline = store.moves(room.code, 0, ancestor.ply);
    if (mainline.length !== ancestor.ply || mainline.some((move, index) => move.ply !== index + 1)) throw new ServiceError('HISTORY_UNAVAILABLE');
    return replayMoves(room.game.boardSize, [...mainline, ...branch.reverse()]);
  }
  return {
    list(owner: string, query: unknown) {
      const { cursor, limit } = listQuery.parse(query);
      const rooms = store.recordRooms(owner, clock.wallMs(), decodeCursor(cursor), limit + 1);
      const records = rooms.slice(0, limit).map(summary), last = records.at(-1);
      return recordsPageSchema.parse({ records, nextCursor: rooms.length > limit && last ? Buffer.from(JSON.stringify({ endedAt: last.endedAt, code: last.code })).toString('base64url') : null });
    },
    detail(code: string, owner: string) { return detail(accessible(code, owner)); },
    moves(code: string, owner: string, query: unknown) {
      const { afterPly, limit } = movesQuery.parse(query);
      return store.transaction(() => {
        const room = accessible(code, owner, false);
        if (room.historyStatus === 'unavailable') throw new ServiceError('HISTORY_UNAVAILABLE');
        const rows = store.moves(code, afterPly, limit + 1), moves = rows.slice(0, limit);
        return movesPageSchema.parse({ moves, nextPly: rows.length > limit ? moves.at(-1)?.ply ?? null : null, moveCount: room.moveCount });
      });
    },
    analysis(code: string, owner: string, query: unknown) {
      const { cursor, limit } = analysisQuery.parse(query);
      return store.transaction(() => {
        accessible(code, owner);
        const rows = store.analysis(code, owner, analysisCursor(cursor), limit + 1), nodes = rows.slice(0, limit);
        return analysisPageSchema.parse({ nodes, nextCursor: rows.length > limit ? String(nodes.at(-1)!.sequence) : null });
      });
    },
    append(code: string, owner: string, input: unknown) {
      const request = analysisInputSchema.parse(input);
      return store.transaction(() => {
        const room = accessible(code, owner);
        if (room.historyStatus === 'unavailable') throw new ServiceError('HISTORY_UNAVAILABLE');
        const existing = store.analysisNode(code, owner, request.id);
        if (existing) {
          const saved: AnalysisInput = { id: existing.id, parent: existing.parent, action: existing.action, claimedLines: existing.claimedLines };
          if (!isDeepStrictEqual(saved, request)) throw new ServiceError('ANALYSIS_ID_REUSED');
          return { node: existing };
        }
        const state = parentState(room, owner, request.parent);
        if (state.status === 'finished') throw new ServiceError('GAME_FINISHED');
        const result = applyAction(state, state.turn, request.action, request.claimedLines);
        if (!result.ok) throw new ServiceError(result.code);
        const createdAt = clock.wallMs();
        if (room.endedAt !== null && room.endedAt + SESSION_MS <= createdAt) throw new ServiceError('RECORD_EXPIRED', 410);
        const node: AnalysisNode = { ...request, actor: state.turn, createdAt, sequence: store.nextAnalysisSequence(code, owner) };
        store.appendAnalysis(code, owner, node);
        return { node };
      });
    },
    download(code: string, owner: string) {
      return store.transaction(() => {
        const room = accessible(code, owner);
        return recordDownloadSchema.parse({ formatVersion: 2, detail: detail(room), moves: store.moves(code, 0, -1), analysis: store.analysis(code, owner, 0, -1) });
      });
    },
  };
}

export function registerRecords(app: FastifyInstance, store: Store, clock: Clock, authorize: (request: FastifyRequest, reply: FastifyReply) => Session): void {
  const service = createRecordsService(store, clock);
  const params = z.toJSONSchema(z.strictObject({ code: roomCodeSchema }), { target: 'draft-7' });
  const responses = (schema: z.ZodType) => ({ 200: z.toJSONSchema(schema, { target: 'draft-7' }), '4xx': z.toJSONSchema(httpErrorSchema, { target: 'draft-7' }), '5xx': z.toJSONSchema(httpErrorSchema, { target: 'draft-7' }) });
  app.get('/api/records', { schema: { response: responses(recordsPageSchema) } }, async (request, reply) => service.list(authorize(request, reply).id, request.query));
  app.get<{ Params: { code: string } }>('/api/records/:code', { schema: { params, response: responses(recordDetailSchema) } }, async (request, reply) => service.detail(request.params.code, authorize(request, reply).id));
  app.get<{ Params: { code: string } }>('/api/records/:code/moves', { schema: { params, response: responses(movesPageSchema) } }, async (request, reply) => service.moves(request.params.code, authorize(request, reply).id, request.query));
  app.get<{ Params: { code: string } }>('/api/records/:code/analysis', { schema: { params, response: responses(analysisPageSchema) } }, async (request, reply) => service.analysis(request.params.code, authorize(request, reply).id, request.query));
  app.post<{ Params: { code: string } }>('/api/records/:code/analysis/nodes', { schema: { params, body: z.toJSONSchema(analysisInputSchema, { target: 'draft-7' }), response: responses(analysisSavedSchema) } }, async (request, reply) => service.append(request.params.code, authorize(request, reply).id, request.body));
  app.get<{ Params: { code: string } }>('/api/records/:code/download', { schema: { params, response: responses(recordDownloadSchema) } }, async (request, reply) => {
    const download = service.download(request.params.code, authorize(request, reply).id);
    reply.header('Content-Disposition', `attachment; filename="omokchess-${request.params.code}.json"`);
    return download;
  });
}
