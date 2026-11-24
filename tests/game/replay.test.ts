import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../../src/game/engine.ts';
import { protectedCells } from '../../src/game/moves.ts';
import { replayMoves } from '../../src/game/replay.ts';
import type { ReplayMove } from '../../src/game/replay.ts';
import type { Action, BoardSize, GameState, Line } from '../../src/game/types.ts';

function alternatingPlacements(boardSize: BoardSize, blackCells: number[]): ReplayMove[] {
  return blackCells.flatMap((at, index): ReplayMove[] => {
    const black: ReplayMove = { actor: 'black', action: { type: 'placeSoldier', at }, claimedLines: [] };
    if (index === blackCells.length - 1) return [black];
    return [black, { actor: 'white', action: { type: 'placeSoldier', at: (10 + Math.floor(index / 8) * 2) * boardSize + (index % 8) * 2 }, claimedLines: [] }];
  });
}

function applyRecorded(boardSize: BoardSize, moves: readonly ReplayMove[]): GameState {
  let state = createGame(boardSize);
  for (const move of moves) {
    const result = applyAction(state, move.actor, move.action, move.claimedLines);
    if (!result.ok) throw new Error(result.code);
    state = result.state;
  }
  return state;
}

describe.each([19, 20] as const)('replay on board size %s', boardSize => {
  it('replays every cursor from empty through the exact recorded prefix', () => {
    const moves = alternatingPlacements(boardSize, [0, 2, 4, 6]);
    for (let through = 0; through <= moves.length; through++) {
      expect(replayMoves(boardSize, moves, through)).toEqual(applyRecorded(boardSize, moves.slice(0, through)));
    }
    expect(replayMoves(boardSize, moves)).toEqual(replayMoves(boardSize, moves, moves.length));
    expect(replayMoves(boardSize, moves, 0)).toEqual(createGame(boardSize));
  });

  it('uses the recorded width rather than interpreting legacy endpoints as new cells', () => {
    const last = boardSize * boardSize - 1;
    const state = replayMoves(boardSize, [{ actor: 'black', action: { type: 'placeSoldier', at: last }, claimedLines: [] }]);
    expect(state.boardSize).toBe(boardSize);
    expect(state.board).toHaveLength(boardSize * boardSize);
    expect(state.board[last]).toEqual({ color: 'black', kind: 'soldier' });
  });

  it.each(['soldier', 'queen'] as const)('reproduces %s captures, army conservation and food expenditure', capturedKind => {
    const blackActions: Action[] = [0, 2, 4, 6, 8].map(column => ({ type: 'placeSoldier', at: 2 * boardSize + column }));
    blackActions.push({ type: 'placeChess', kind: 'rook', at: 0 }, { type: 'moveChess', from: 0, to: 3 });
    const whiteActions: Action[] = capturedKind === 'soldier'
      ? [{ type: 'placeSoldier', at: 3 }, ...[0, 2, 4, 6, 8].map((column): Action => ({ type: 'placeSoldier', at: 15 * boardSize + column }))]
      : [
          ...[0, 2, 4].map((column): Action => ({ type: 'placeSoldier', at: 15 * boardSize + column })),
          { type: 'placeChess', kind: 'queen', at: 3 },
          { type: 'placeSoldier', at: 15 * boardSize + 6 },
          { type: 'placeSoldier', at: 15 * boardSize + 8 },
        ];
    const moves: ReplayMove[] = blackActions.flatMap((action, index): ReplayMove[] => {
      const pair: ReplayMove[] = [{ actor: 'black', action, claimedLines: [] }];
      const white = whiteActions[index];
      if (white) pair.push({ actor: 'white', action: white, claimedLines: [] });
      return pair;
    });
    const state = replayMoves(boardSize, moves);
    expect(state).toEqual(applyRecorded(boardSize, moves));
    expect(state.players.black).toMatchObject({ food: 0, soldiersInReserve: 15, chess: { rook: 'onBoard' } });
    expect(state.players.white.soldiersInReserve).toBe(15);
    expect(state.players.white.chess.queen).toBe(capturedKind === 'queen' ? 'captured' : 'reserve');
    expect(state.board[0]).toBeNull();
    expect(state.board[3]).toEqual({ color: 'black', kind: 'rook' });
    for (const color of ['black', 'white'] as const) {
      expect(state.board.filter(piece => piece?.color === color && piece.kind === 'soldier').length + state.players[color].soldiersInReserve).toBe(20);
    }
  });

  it('requires the exact overline choice and detaches output from frozen recorded claims', () => {
    const moves = alternatingPlacements(boardSize, [0, 1, 2, 4, 5, 3]);
    const last = moves.at(-1);
    if (!last) throw new Error('Missing last move');
    expect(() => replayMoves(boardSize, moves)).toThrow('ply 11: LINES_REQUIRED');
    const choice: Line = { start: 1, dx: 1, dy: 0, cells: [1, 2, 3, 4, 5] };
    last.claimedLines = [choice];
    const source = structuredClone(moves);
    for (const move of moves) {
      Object.freeze(move.action);
      for (const line of move.claimedLines) { Object.freeze(line.cells); Object.freeze(line); }
      Object.freeze(move.claimedLines);
      Object.freeze(move);
    }
    Object.freeze(moves);
    const state = replayMoves(boardSize, moves);
    expect([...protectedCells(state)]).toEqual([1, 2, 3, 4, 5]);
    expect(state.completedLines.black).toEqual([choice]);
    state.completedLines.black[0]?.cells.push(100);
    state.players.black.food = 0;
    state.board[0] = null;
    expect(moves).toEqual(source);
    expect(replayMoves(boardSize, moves).completedLines.black).toEqual([choice]);
    const forged = source.map((move, index) => index === source.length - 1 ? { ...move, claimedLines: [{ ...choice, cells: [1, 2, 3, 4, 6] }] } : move);
    expect(() => replayMoves(boardSize, forged)).toThrow('ply 11: INVALID_LINES');
    const conflicting = source.map((move, index) => index === source.length - 1 ? { ...move, claimedLines: [choice, { start: 0, dx: 1, dy: 0, cells: [0, 1, 2, 3, 4] }] } : move);
    expect(() => replayMoves(boardSize, conflicting)).toThrow('INVALID_LINES');
  });

  it('preserves a prior protected line and refuses continuation after a second crossing line', () => {
    const cells = [0, 1, 2, 3, 4, 2 + 2 * boardSize, 2 + 3 * boardSize, 2 + 4 * boardSize, 2 + boardSize];
    const moves = alternatingPlacements(boardSize, cells);
    const horizontal = moves[8], vertical = moves.at(-1);
    if (!horizontal || !vertical) throw new Error('Missing claimed moves');
    horizontal.claimedLines = [{ start: 0, dx: 1, dy: 0, cells: [0, 1, 2, 3, 4] }];
    vertical.claimedLines = [{ start: 2, dx: 0, dy: 1, cells: Array.from({ length: 5 }, (_, i) => 2 + i * boardSize) }];
    const state = replayMoves(boardSize, moves);
    expect(state).toEqual(applyRecorded(boardSize, moves));
    expect(state).toMatchObject({ boardSize, status: 'finished', winner: 'black', reason: 'two-lines' });
    expect(protectedCells(state).size).toBe(9);
    expect(() => replayMoves(boardSize, [...moves, { actor: 'white', action: { type: 'placeSoldier', at: boardSize }, claimedLines: [] }])).toThrow('GAME_FINISHED');
  });

  it('replays resource exhaustion as a rule terminal, not a synthetic ending action', () => {
    const moves: ReplayMove[] = [];
    for (let turn = 0; turn < 21; turn++) {
      for (const actor of ['black', 'white'] as const) {
        const offset = actor === 'black' ? 0 : 10;
        let action: Action;
        if (turn < 20) action = { type: 'placeSoldier', at: Math.floor(turn / 5) * 2 * boardSize + (turn % 5) * 2 + offset };
        else action = { type: 'placeChess', kind: 'rook', at: 12 * boardSize + offset };
        moves.push({ actor, action, claimedLines: [] });
      }
    }
    moves.push({ actor: 'black', action: { type: 'moveChess', from: 12 * boardSize, to: 12 * boardSize + 10 }, claimedLines: [] });
    expect(replayMoves(boardSize, moves, moves.length - 1).status).toBe('playing');
    const terminal = replayMoves(boardSize, moves);
    expect(terminal).toMatchObject({ boardSize, status: 'finished', winner: 'black', reason: 'no-legal-action' });
    expect(terminal.players.white).toMatchObject({ food: 2, soldiersInReserve: 0, chess: { rook: 'captured' } });
    expect(() => replayMoves(boardSize, [...moves, { actor: 'white', action: { type: 'placeSoldier', at: 1 }, claimedLines: [] }])).toThrow('GAME_FINISHED');
  });

  it.each(['turn-timeout', 'disconnect-timeout', 'server-interrupted'])('keeps %s outside the action history so analysis can continue', reason => {
    const moves = alternatingPlacements(boardSize, [0, 2]);
    const record = { reason, moves };
    const state = replayMoves(boardSize, record.moves);
    expect(state).toMatchObject({ status: 'playing', turn: 'white' });
    const continuation = applyAction(state, 'white', { type: 'placeSoldier', at: boardSize });
    expect(continuation.ok).toBe(true);
    expect(record.moves).toHaveLength(3);
  });
});

it.each([-1, 1.5, 2, NaN, Infinity])('rejects invalid cursor %s rather than clamping it', through => {
  expect(() => replayMoves(19, [{ actor: 'black', action: { type: 'placeSoldier', at: 0 }, claimedLines: [] }], through)).toThrow(RangeError);
});

it('reports rule failures with the offending ply and never skips an illegal record', () => {
  const first: ReplayMove = { actor: 'black', action: { type: 'placeSoldier', at: 0 }, claimedLines: [] };
  expect(() => replayMoves(19, [{ ...first, actor: 'white' }])).toThrow('ply 1: NOT_YOUR_TURN');
  expect(() => replayMoves(19, [{ ...first, action: { type: 'placeSoldier', at: 361 } }])).toThrow('ply 1: OUT_OF_BOUNDS');
  expect(() => replayMoves(19, [{ ...first, action: { type: 'placeChess', kind: 'rook', at: 0 } }])).toThrow('ply 1: NO_FOOD');
  const moves: ReplayMove[] = [first, { ...first, actor: 'white' }];
  const before = structuredClone(moves);
  expect(() => replayMoves(19, moves)).toThrow('ply 2: OCCUPIED');
  expect(moves).toEqual(before);
  expect(replayMoves(19, moves, 1).board[0]).toEqual({ color: 'black', kind: 'soldier' });
});

it('rejects malformed persisted data and external-end pseudo-actions', () => {
  const malformed: ReplayMove[] = JSON.parse('[{"actor":"black","action":{"type":"turn-timeout","kind":"rook","at":0},"claimedLines":[]}]');
  expect(() => replayMoves(19, malformed)).toThrow('ply 1: INVALID_MOVE');
  const missingClaims: ReplayMove[] = JSON.parse('[{"actor":"black","action":{"type":"placeSoldier","at":0}}]');
  expect(() => replayMoves(19, missingClaims)).toThrow('ply 1: INVALID_LINES');
  const invalidSize: BoardSize = JSON.parse('18');
  expect(() => replayMoves(invalidSize, [])).toThrow(RangeError);
});
