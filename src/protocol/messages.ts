import { z } from 'zod';
export const colorSchema = z.enum(['black', 'white']);
const cell = z.number().int().min(0).max(360);
const legacyCell = z.number().int().min(0).max(399);
const chessKind = z.enum(['rook', 'bishop', 'knight', 'queen']);
export const pieceSchema = z.strictObject({ color: colorSchema, kind: z.enum(['soldier', 'rook', 'bishop', 'knight', 'queen']) });
const lineFor = (coordinate: typeof cell) => z.strictObject({ start: coordinate, dx: z.number().int().min(0).max(1), dy: z.number().int().min(-1).max(1), cells: z.array(coordinate).length(5) });
export const lineSchema = lineFor(cell);
export const recordLineSchema = lineFor(legacyCell);
const chessStatus = z.enum(['reserve', 'onBoard', 'captured']);
const supply = z.strictObject({ food: z.number().int().min(0).max(5), soldiersInReserve: z.number().int().min(0).max(20), chess: z.strictObject({ rook: chessStatus, bishop: chessStatus, knight: chessStatus, queen: chessStatus }) });
const boardFields = { boardSize: z.union([z.literal(19), z.literal(20)]), board: z.array(pieceSchema.nullable()).min(361).max(400), players: z.strictObject({ black: supply, white: supply }), completedLines: z.strictObject({ black: z.array(recordLineSchema).max(2), white: z.array(recordLineSchema).max(2) }) };
export const gameSchema = z.discriminatedUnion('status', [z.strictObject({ ...boardFields, status: z.literal('playing'), turn: colorSchema }), z.strictObject({ ...boardFields, status: z.literal('finished'), winner: colorSchema, reason: z.enum(['two-lines', 'no-legal-action', 'turn-timeout', 'disconnect-timeout']) })]).superRefine((game, ctx) => {
  if (game.board.length !== game.boardSize ** 2) ctx.addIssue({ code: 'custom', message: 'Board length does not match boardSize' });
  for (const line of [...game.completedLines.black, ...game.completedLines.white]) {
    const x = line.start % game.boardSize, y = Math.floor(line.start / game.boardSize);
    if ((line.dx === 0 && line.dy !== 1) || line.cells.some((at, index) => {
      const column = x + index * line.dx, row = y + index * line.dy;
      return column < 0 || column >= game.boardSize || row < 0 || row >= game.boardSize || at !== row * game.boardSize + column;
    })) ctx.addIssue({ code: 'custom', message: 'Invalid protected line geometry' });
  }
});
const actionFor = (coordinate: typeof cell) => z.discriminatedUnion('type', [z.strictObject({ type: z.literal('placeSoldier'), at: coordinate }), z.strictObject({ type: z.literal('placeChess'), at: coordinate, kind: chessKind }), z.strictObject({ type: z.literal('moveChess'), from: coordinate, to: coordinate })]);
export const actionSchema = actionFor(cell);
export const recordActionSchema = actionFor(legacyCell);
export const timeControlInputSchema = z.strictObject({ baseMs: z.number().int().min(1000).max(10_800_000).multipleOf(1000), incrementMs: z.number().int().min(0).max(180_000).multipleOf(1000) });
export type TimeControlInput = z.infer<typeof timeControlInputSchema>;
export const timeControlSchema = z.discriminatedUnion('kind', [timeControlInputSchema.extend({ kind: z.literal('fischer') }), z.strictObject({ kind: z.literal('legacy-turn'), turnMs: z.literal(60_000) })]);
export const clockPairSchema = z.strictObject({ black: z.number().nonnegative(), white: z.number().nonnegative() });
export const lastMoveSchema = z.strictObject({ ply: z.number().int().positive().safe(), actor: colorSchema, action: recordActionSchema });
export const createRoomInputSchema = z.strictObject({ timeControl: timeControlInputSchema });
const envelope = { protocolVersion: z.literal(2), commandId: z.uuid(), expectedRevision: z.number().int().nonnegative().safe() };
export const commandSchema = z.discriminatedUnion('type', [z.strictObject({ ...envelope, type: z.literal('ready') }), z.strictObject({ ...envelope, type: z.literal('action'), action: actionSchema, claimedLines: z.array(lineSchema).max(2) })]);
export type Command = z.infer<typeof commandSchema>;
const playerView = z.strictObject({ nickname: z.string(), ready: z.boolean(), connected: z.boolean() });
export const roomSchema = z.strictObject({ code: z.string(), revision: z.number().int().nonnegative().safe(), status: z.enum(['waiting', 'active', 'paused', 'finished', 'aborted']), you: colorSchema, players: z.strictObject({ black: playerView.nullable(), white: playerView.nullable() }), game: gameSchema.nullable(), timeControl: timeControlSchema, clockRemainingMs: clockPairSchema.nullable(), moveCount: z.number().int().nonnegative().safe(), lastMove: lastMoveSchema.nullable(), disconnectRemainingMs: clockPairSchema, serverTime: z.number(), abortReason: z.enum(['server-interrupted', 'both-disconnected']).nullable() }).superRefine((room, ctx) => {
  const legacy = room.timeControl.kind === 'legacy-turn';
  if (legacy ? room.clockRemainingMs !== null || !['finished', 'aborted'].includes(room.status) : room.clockRemainingMs === null) ctx.addIssue({ code: 'custom', message: 'Invalid room clock policy' });
  if (room.game && room.game.boardSize !== (legacy ? 20 : 19)) ctx.addIssue({ code: 'custom', message: 'Invalid room board size' });
  if ((room.moveCount === 0) !== (room.lastMove === null) || (room.lastMove && room.lastMove.ply !== room.moveCount)) ctx.addIssue({ code: 'custom', message: 'Invalid last move checkpoint' });
  if (!legacy && room.lastMove) {
    const action = room.lastMove.action;
    if (action.type === 'moveChess' ? action.from > 360 || action.to > 360 : action.at > 360) ctx.addIssue({ code: 'custom', message: 'Invalid live last move coordinate' });
  }
});
export type RoomSnapshot = z.infer<typeof roomSchema>;
export const serverMessageSchema = z.discriminatedUnion('type', [z.strictObject({ type: z.literal('snapshot'), room: roomSchema }), z.strictObject({ type: z.literal('ack'), commandId: z.uuid(), appliedRevision: z.number().int().nonnegative() }), z.strictObject({ type: z.literal('error'), commandId: z.uuid().optional(), code: z.string(), currentRevision: z.number().int().nonnegative().optional() })]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export const nicknameSchema = z.string().trim().refine(value => [...value].length >= 1 && [...value].length <= 20 && !/[\p{Cc}\p{Cf}]/u.test(value), '닉네임은 제어문자 없이 1–20자로 입력하세요.');
export const sessionInputSchema = z.strictObject({ nickname: nicknameSchema });
export const sessionSchema = z.strictObject({ nickname: z.string(), roomCode: z.string().nullable() });
export type SessionView = z.infer<typeof sessionSchema>;
export const roomCodeSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{12}$/);
export const roomCreatedSchema = z.strictObject({ code: roomCodeSchema });
export const emptyBodySchema = z.strictObject({});
export const httpErrorSchema = z.strictObject({ code: z.string(), message: z.string().optional() });
