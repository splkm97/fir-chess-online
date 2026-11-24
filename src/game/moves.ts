import { SIZE, validCell } from './types.ts';
import type { BoardSize, Color, GameBoard, Piece } from './types.ts';
export function protectedCells(state: GameBoard): Set<number> { return new Set([...state.completedLines.black, ...state.completedLines.white].flatMap(line => line.cells)); }
export function canMove(board: (Piece | null)[], from: number, to: number, color: Color, protectedSet: ReadonlySet<number>, boardSize: BoardSize = SIZE): boolean {
  if (!validCell(from, boardSize) || !validCell(to, boardSize) || from === to || protectedSet.has(from) || protectedSet.has(to)) return false;
  const piece = board[from]; const target = board[to];
  if (!piece || piece.color !== color || piece.kind === 'soldier' || target?.color === color) return false;
  const x = from % boardSize, y = Math.floor(from / boardSize), tx = to % boardSize, ty = Math.floor(to / boardSize);
  const dx = tx - x, dy = ty - y, ax = Math.abs(dx), ay = Math.abs(dy);
  if (piece.kind === 'knight') return (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
  const straight = dx === 0 || dy === 0, diagonal = ax === ay;
  if ((piece.kind === 'rook' && !straight) || (piece.kind === 'bishop' && !diagonal) || (piece.kind === 'queen' && !straight && !diagonal)) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let cx = x + sx, cy = y + sy; cx !== tx || cy !== ty; cx += sx, cy += sy) if (board[cy * boardSize + cx] != null) return false;
  return true;
}
