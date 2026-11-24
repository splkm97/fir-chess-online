import { SIZE, validCell } from '../game/types.ts';
import type { Action, BoardSize, Line, PieceKind } from '../game/types.ts';
import { remainingLines } from '../game/lines.ts';

export const BOARD_MARGIN = 25;
export const BOARD_STEP = 50;
export const boardExtent = (size: BoardSize) => 2 * BOARD_MARGIN + (size - 1) * BOARD_STEP;
export const DRAG_THRESHOLD = 8;
export interface Rect { left: number; top: number; width: number; height: number }
export function pointToCell(clientX: number, clientY: number, rect: Rect, size: BoardSize = SIZE): number | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const extent = boardExtent(size);
  const x = (clientX - rect.left) / rect.width * extent;
  const y = (clientY - rect.top) / rect.height * extent;
  if (x < 0 || y < 0 || x >= extent || y >= extent) return null;
  const col = Math.floor((x - BOARD_MARGIN) / BOARD_STEP + 0.5);
  const row = Math.floor((y - BOARD_MARGIN) / BOARD_STEP + 0.5);
  return col >= 0 && col < size && row >= 0 && row < size ? row * size + col : null;
}
export function keyboardCell(cell: number, key: string, size: BoardSize = SIZE): number {
  const x = cell % size, y = Math.floor(cell / size);
  switch (key) {
    case 'ArrowLeft': return y * size + Math.max(0, x - 1);
    case 'ArrowRight': return y * size + Math.min(size - 1, x + 1);
    case 'ArrowUp': return Math.max(0, y - 1) * size + x;
    case 'ArrowDown': return Math.min(size - 1, y + 1) * size + x;
    case 'Home': return y * size;
    case 'End': return y * size + size - 1;
    default: return cell;
  }
}
export function isTap(startX: number, startY: number, endX: number, endY: number): boolean {
  return Math.hypot(endX - startX, endY - startY) < DRAG_THRESHOLD;
}
export function actionAt(mode: PieceKind | null, from: number | null, at: number, size: BoardSize = SIZE): Action | null {
  if (!validCell(at, size)) return null;
  if (from !== null) return validCell(from, size) ? { type: 'moveChess', from, to: at } : null;
  if (mode === 'soldier') return { type: 'placeSoldier', at };
  return mode ? { type: 'placeChess', kind: mode, at } : null;
}
export function completeUniqueLines(candidates: Line[], selected: Line[], needed: number): Line[] {
  const result = selected.slice();
  while (result.length < needed) {
    const remaining = remainingLines(candidates, result);
    if (remaining.length !== 1) break;
    const line = remaining[0];
    if (line) result.push(line);
  }
  return result;
}
export function lineSelectionComplete(candidates: Line[], selected: Line[], needed: number): boolean {
  return selected.length >= needed || remainingLines(candidates, selected).length === 0;
}
