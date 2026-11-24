import { describe, expect, it } from 'vitest';
import { applyAction, createGame, hasLegalAction, previewAction } from '../../src/game/engine.ts';
import { findLines } from '../../src/game/lines.ts';
import { canMove, protectedCells } from '../../src/game/moves.ts';
import { cellLabel, SIZE, validCell } from '../../src/game/types.ts';

it('defaults new games and coordinate helpers to A1–S19 without reducing the army', () => {
  const state = createGame();
  expect(SIZE).toBe(19);
  expect(state.boardSize).toBe(19);
  expect(state.board).toHaveLength(361);
  expect(state.players.black.soldiersInReserve).toBe(20);
  expect(state.players.white.soldiersInReserve).toBe(20);
  expect(cellLabel(0)).toBe('A1');
  expect(cellLabel(360)).toBe('S19');
  expect(validCell(360)).toBe(true);
  expect(validCell(361)).toBe(false);
  expect(validCell(399)).toBe(false);
  expect(cellLabel(399, 20)).toBe('T20');
  expect(validCell(399, 20)).toBe(true);
});

describe.each([19, 20] as const)('%s×%s state geometry', boardSize => {
  const last = boardSize * boardSize - 1;

  it('accepts both extreme corners and rejects the first off-board cell and move origin', () => {
    const state = createGame(boardSize);
    const first = applyAction(state, 'black', { type: 'placeSoldier', at: 0 });
    if (!first.ok) throw new Error(first.code);
    const result = applyAction(first.state, 'white', { type: 'placeSoldier', at: last });
    if (!result.ok) throw new Error(result.code);
    expect(result.state.boardSize).toBe(boardSize);
    expect(result.state.board).toHaveLength(boardSize * boardSize);
    expect(result.state.board[last]).toEqual({ color: 'white', kind: 'soldier' });
    expect(previewAction(state, 'black', { type: 'placeSoldier', at: last + 1 })).toEqual({ ok: false, code: 'OUT_OF_BOUNDS' });
    expect(previewAction(state, 'black', { type: 'moveChess', from: last + 1, to: 0 })).toEqual({ ok: false, code: 'OUT_OF_BOUNDS' });
  });

  it('moves from the last corner using the stored width, including legal-action search', () => {
    const state = createGame(boardSize);
    state.board[last] = { color: 'black', kind: 'rook' };
    state.players.black.soldiersInReserve = 0;
    state.players.black.food = 2;
    state.players.black.chess.rook = 'onBoard';
    expect(hasLegalAction(state, 'black')).toBe(true);
    const result = applyAction(state, 'black', { type: 'moveChess', from: last, to: last - boardSize });
    if (!result.ok) throw new Error(result.code);
    expect(result.state.board[last]).toBeNull();
    expect(result.state.board[last - boardSize]).toEqual({ color: 'black', kind: 'rook' });
    expect(result.state.players.black.food).toBe(0);
    expect(state.board[last]).toEqual({ color: 'black', kind: 'rook' });
  });

  it('does not wrap a row boundary into a rook move or five-piece line', () => {
    const state = createGame(boardSize);
    state.board[boardSize - 1] = { color: 'black', kind: 'rook' };
    expect(canMove(state.board, boardSize - 1, boardSize, 'black', new Set(), boardSize)).toBe(false);
    for (let cell = boardSize - 2; cell < boardSize + 3; cell++) state.board[cell] = { color: 'black', kind: 'soldier' };
    expect(findLines(state, 'black')).toEqual([]);
  });

  it.each([[1, 0], [0, 1], [1, 1], [1, -1]])('recognizes edge direction %s,%s without crossing the boundary', (dx, dy) => {
    const state = createGame(boardSize);
    const start = dy === -1 ? last - 4 : last - 4 * (dy * boardSize + dx);
    const cells = Array.from({ length: 5 }, (_, index) => start + index * (dy * boardSize + dx));
    for (const cell of cells) state.board[cell] = { color: 'black', kind: 'soldier' };
    expect(findLines(state, 'black')).toEqual([{ start, dx, dy, cells }]);
  });

  it('retains width, corner coordinates and both protection lines on a two-line win', () => {
    const state = createGame(boardSize);
    for (let distance = 1; distance <= 4; distance++) {
      state.board[last - distance] = { color: 'black', kind: 'soldier' };
      state.board[last - distance * boardSize] = { color: 'black', kind: 'soldier' };
    }
    state.players.black.soldiersInReserve -= 8;
    const action = { type: 'placeSoldier', at: last } as const;
    const preview = previewAction(state, 'black', action);
    if (!preview.ok) throw new Error(preview.code);
    const result = applyAction(state, 'black', action, preview.candidates);
    if (!result.ok) throw new Error(result.code);
    expect(result.state).toMatchObject({ boardSize, status: 'finished', winner: 'black', reason: 'two-lines' });
    expect(result.state).not.toHaveProperty('turn');
    expect(protectedCells(result.state).size).toBe(9);
    expect(protectedCells(result.state).has(last)).toBe(true);
    expect(result.state.players.black.soldiersInReserve).toBe(11);
    expect(previewAction(result.state, 'white', { type: 'placeSoldier', at: 0 })).toEqual({ ok: false, code: 'GAME_FINISHED' });
  });

  it('retains width on the no-legal-action terminal branch', () => {
    const state = createGame(boardSize);
    state.players.white.soldiersInReserve = 0;
    const result = applyAction(state, 'black', { type: 'placeSoldier', at: last });
    if (!result.ok) throw new Error(result.code);
    expect(result.state).toMatchObject({ boardSize, status: 'finished', winner: 'black', reason: 'no-legal-action' });
    expect(result.state).not.toHaveProperty('turn');
  });
});
