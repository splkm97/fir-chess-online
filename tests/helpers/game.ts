import { createGame } from '../../src/game/engine.ts';
import type { Color, GameState, PieceKind } from '../../src/game/types.ts';
export function position(entries: [number, Color, PieceKind][], turn: Color = 'black'): GameState { const state = createGame(); if (state.status === 'playing') state.turn = turn; for (const [cell, color, kind] of entries) { state.board[cell] = {color,kind}; if (kind === 'soldier') state.players[color].soldiersInReserve--; else state.players[color].chess[kind] = 'onBoard'; } return state; }
