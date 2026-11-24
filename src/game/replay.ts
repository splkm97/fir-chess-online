import { applyAction, createGame } from './engine.ts';
import type { Action, BoardSize, Color, GameState, Line } from './types.ts';

export interface ReplayMove { actor: Color; action: Action; claimedLines: Line[] }

export function replayMoves(boardSize: BoardSize, moves: readonly ReplayMove[], through: number = moves.length): GameState {
  if (boardSize !== 19 && boardSize !== 20) throw new RangeError('Invalid replay board size');
  if (!Number.isInteger(through) || through < 0 || through > moves.length) throw new RangeError('Invalid replay cursor');
  let state = createGame(boardSize);
  for (let index = 0; index < through; index++) {
    const move = moves[index];
    if (!move || (move.actor !== 'black' && move.actor !== 'white') || !move.action || !['placeSoldier', 'placeChess', 'moveChess'].includes(move.action.type)) {
      throw new Error(`Invalid replay move at ply ${index + 1}: INVALID_MOVE`);
    }
    if (!Array.isArray(move.claimedLines)) throw new Error(`Invalid replay move at ply ${index + 1}: INVALID_LINES`);
    const result = applyAction(state, move.actor, move.action, move.claimedLines);
    if (!result.ok) throw new Error(`Invalid replay move at ply ${index + 1}: ${result.code}`);
    state = result.state;
  }
  return state;
}
