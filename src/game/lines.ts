import type { Color, GameBoard, Line } from './types.ts';
const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
export function lineKey(line: Line): string { return line.start + ':' + line.dx + ':' + line.dy; }
export function linesConflict(a: Line, b: Line): boolean { return a.dx === b.dx && a.dy === b.dy && a.cells.some(cell => b.cells.includes(cell)); }
export function findLines(state: GameBoard, color: Color): Line[] {
  const result: Line[] = [];
  for (let start = 0; start < state.boardSize * state.boardSize; start++) {
    if (state.board[start]?.color !== color) continue;
    const x = start % state.boardSize, y = Math.floor(start / state.boardSize);
    for (const [dx, dy] of directions) {
      const ex = x + dx * 4, ey = y + dy * 4;
      if (ex < 0 || ex >= state.boardSize || ey < 0 || ey >= state.boardSize) continue;
      let count = 1;
      for (; count < 5; count++) if (state.board[start + count * (dy * state.boardSize + dx)]?.color !== color) break;
      if (count !== 5) continue;
      const candidate: Line = { start, dx, dy, cells: Array.from({ length: 5 }, (_, i) => start + i * (dy * state.boardSize + dx)) };
      if (!state.completedLines[color].some(existing => linesConflict(existing, candidate))) result.push(candidate);
    }
  }
  return result;
}
export function remainingLines(candidates: Line[], selected: Line[]): Line[] { return candidates.filter(line => !selected.some(chosen => linesConflict(line, chosen))); }
