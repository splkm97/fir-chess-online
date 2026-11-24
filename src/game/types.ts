export const SIZE = 19;
export type BoardSize = 19 | 20;
export const COLORS = ['black', 'white'] as const;
export const CHESS_KINDS = ['rook', 'bishop', 'knight', 'queen'] as const;
export type Color = typeof COLORS[number];
export type ChessKind = typeof CHESS_KINDS[number];
export type PieceKind = 'soldier' | ChessKind;
export interface Piece { color: Color; kind: PieceKind }
export interface Line { start: number; dx: number; dy: number; cells: number[] }
export interface Supply { food: number; soldiersInReserve: number; chess: Record<ChessKind, 'reserve' | 'onBoard' | 'captured'> }
export type GameResultReason = 'two-lines' | 'no-legal-action' | 'turn-timeout' | 'disconnect-timeout';
export interface GameBoard { boardSize: BoardSize; board: (Piece | null)[]; players: Record<Color, Supply>; completedLines: Record<Color, Line[]> }
export type GameState = GameBoard & ({ status: 'playing'; turn: Color } | { status: 'finished'; winner: Color; reason: GameResultReason });
export type Action = { type: 'placeSoldier'; at: number } | { type: 'placeChess'; kind: ChessKind; at: number } | { type: 'moveChess'; from: number; to: number };
export type RuleError = 'GAME_FINISHED' | 'NOT_YOUR_TURN' | 'OUT_OF_BOUNDS' | 'OCCUPIED' | 'NO_SUPPLY' | 'NO_FOOD' | 'INVALID_MOVE' | 'PROTECTED' | 'INVALID_LINES' | 'LINES_REQUIRED';
export type Failure = { ok: false; code: RuleError };
export type ApplyResult = { ok: true; state: GameState } | Failure;
export type PreviewResult = { ok: true; state: GameState; candidates: Line[] } | Failure;
export function opposite(color: Color): Color { return color === 'black' ? 'white' : 'black'; }
export function validCell(cell: number, boardSize: BoardSize = SIZE): boolean { return Number.isInteger(cell) && cell >= 0 && cell < boardSize * boardSize; }
export function cellLabel(cell: number, boardSize: BoardSize = SIZE): string { return String.fromCharCode(65 + cell % boardSize) + (Math.floor(cell / boardSize) + 1); }
