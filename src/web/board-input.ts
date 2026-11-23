import { SIZE, validCell } from '../game/types.ts';
import type { Action, Line, PieceKind } from '../game/types.ts';
import { remainingLines } from '../game/lines.ts';

export const BOARD_EXTENT = 1000;
export const BOARD_MARGIN = 25;
export const BOARD_STEP = 50;
export const DRAG_THRESHOLD = 8;
export interface Rect { left: number; top: number; width: number; height: number }
export function pointToCell(clientX: number, clientY: number, rect: Rect): number | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (clientX - rect.left) / rect.width * BOARD_EXTENT;
  const y = (clientY - rect.top) / rect.height * BOARD_EXTENT;
  if (x < 0 || y < 0 || x >= BOARD_EXTENT || y >= BOARD_EXTENT) return null;
  const col = Math.floor((x - BOARD_MARGIN) / BOARD_STEP + 0.5);
  const row = Math.floor((y - BOARD_MARGIN) / BOARD_STEP + 0.5);
  return col >= 0 && col < SIZE && row >= 0 && row < SIZE ? row * SIZE + col : null;
}
export function keyboardCell(cell: number, key: string): number {
  const x = cell % SIZE, y = Math.floor(cell / SIZE);
  switch (key) {
    case 'ArrowLeft': return y * SIZE + Math.max(0, x - 1);
    case 'ArrowRight': return y * SIZE + Math.min(SIZE - 1, x + 1);
    case 'ArrowUp': return Math.max(0, y - 1) * SIZE + x;
    case 'ArrowDown': return Math.min(SIZE - 1, y + 1) * SIZE + x;
    case 'Home': return y * SIZE;
    case 'End': return y * SIZE + SIZE - 1;
    default: return cell;
  }
}
export function isTap(startX: number, startY: number, endX: number, endY: number): boolean {
  return Math.hypot(endX - startX, endY - startY) < DRAG_THRESHOLD;
}
export function actionAt(mode: PieceKind | null, from: number | null, at: number): Action | null {
  if (!validCell(at)) return null;
  if (from !== null) return validCell(from) ? { type: 'moveChess', from, to: at } : null;
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
