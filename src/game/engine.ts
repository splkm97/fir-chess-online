import { CHESS_KINDS, SIZE, opposite, validCell } from './types.ts';
import type { Action, ApplyResult, Color, Failure, GameState, Line, PreviewResult, Supply } from './types.ts';
import { canMove, protectedCells } from './moves.ts';
import { findLines, lineKey, linesConflict, remainingLines } from './lines.ts';
function supply(): Supply { return { food: 0, soldiersInReserve: 20, chess: { rook: 'reserve', bishop: 'reserve', knight: 'reserve', queen: 'reserve' } }; }
export function createGame(): GameState { return { status: 'playing', turn: 'black', board: Array.from({ length: SIZE * SIZE }, () => null), players: { black: supply(), white: supply() }, completedLines: { black: [], white: [] } }; }
function failure(code: Failure['code']): Failure { return { ok: false, code }; }
export function previewAction(state: GameState, actor: Color, action: Action): PreviewResult {
  if (state.status !== 'playing') return failure('GAME_FINISHED');
  if (state.turn !== actor) return failure('NOT_YOUR_TURN');
  const at = action.type === 'moveChess' ? action.to : action.at;
  if (!validCell(at) || (action.type === 'moveChess' && !validCell(action.from))) return failure('OUT_OF_BOUNDS');
  const own = state.players[actor];
  if (action.type === 'moveChess') {
    const protectedSet = protectedCells(state);
    if (protectedSet.has(action.from) || protectedSet.has(at)) return failure('PROTECTED');
    if (!canMove(state.board, action.from, at, actor, protectedSet)) return failure('INVALID_MOVE');
    if (own.food < 2) return failure('NO_FOOD');
  } else {
    if (state.board[at] != null) return failure('OCCUPIED');
    if (action.type === 'placeSoldier') { if (own.soldiersInReserve < 1) return failure('NO_SUPPLY'); }
    else { if (!CHESS_KINDS.includes(action.kind) || own.chess[action.kind] !== 'reserve') return failure('NO_SUPPLY'); if (own.food < 3) return failure('NO_FOOD'); }
  }
  const next: GameState = { ...state, board: state.board.slice(), players: { black: { ...state.players.black, chess: { ...state.players.black.chess } }, white: { ...state.players.white, chess: { ...state.players.white.chess } } }, completedLines: { black: state.completedLines.black.slice(), white: state.completedLines.white.slice() } };
  const resources = next.players[actor];
  if (action.type === 'placeSoldier') { next.board[at] = { color: actor, kind: 'soldier' }; resources.soldiersInReserve--; resources.food = Math.min(5, resources.food + 1); }
  else if (action.type === 'placeChess') { next.board[at] = { color: actor, kind: action.kind }; resources.chess[action.kind] = 'onBoard'; resources.food -= 3; }
  else {
    const captured = next.board[at];
    if (captured) { if (captured.kind === 'soldier') next.players[captured.color].soldiersInReserve++; else next.players[captured.color].chess[captured.kind] = 'captured'; }
    next.board[at] = next.board[action.from] ?? null; next.board[action.from] = null; resources.food -= 2;
  }
  return { ok: true, state: next, candidates: findLines(next, actor) };
}
export function hasLegalAction(state: GameState, color: Color): boolean {
  const supply = state.players[color];
  if (state.board.some(piece => piece === null) && (supply.soldiersInReserve > 0 || (supply.food >= 3 && CHESS_KINDS.some(kind => supply.chess[kind] === 'reserve')))) return true;
  if (supply.food < 2) return false;
  const protectedSet = protectedCells(state);
  for (let from = 0; from < SIZE * SIZE; from++) {
    const piece = state.board[from];
    if (!piece || piece.color !== color || piece.kind === 'soldier' || protectedSet.has(from)) continue;
    for (let to = 0; to < SIZE * SIZE; to++) if (canMove(state.board, from, to, color, protectedSet)) return true;
  }
  return false;
}
export function applyAction(state: GameState, actor: Color, action: Action, claimedLines: Line[] = []): ApplyResult {
  const preview = previewAction(state, actor, action); if (!preview.ok) return preview;
  const next = preview.state, needed = 2 - next.completedLines[actor].length;
  if (claimedLines.length > needed) return failure('INVALID_LINES');
  const selected: Line[] = [];
  for (const claim of claimedLines) {
    const canonical = preview.candidates.find(line => lineKey(line) === lineKey(claim) && line.cells.length === claim.cells.length && line.cells.every((cell, i) => cell === claim.cells[i]));
    if (!canonical || selected.some(line => linesConflict(line, canonical))) return failure('INVALID_LINES');
    selected.push(canonical);
  }
  if (selected.length < needed && remainingLines(preview.candidates, selected).length > 0) return failure('LINES_REQUIRED');
  next.completedLines[actor].push(...selected);
  const boardState = { board: next.board, players: next.players, completedLines: next.completedLines };
  if (next.completedLines[actor].length >= 2) return { ok: true, state: { ...boardState, status: 'finished', winner: actor, reason: 'two-lines' } };
  const opponent = opposite(actor);
  if (!hasLegalAction(next, opponent)) return { ok: true, state: { ...boardState, status: 'finished', winner: actor, reason: 'no-legal-action' } };
  return { ok: true, state: { ...next, status: 'playing', turn: opponent } };
}
