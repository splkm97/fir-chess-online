import { useEffect, useMemo, useState } from 'react';
import type { Action, GameState, Line, PieceKind } from '../game/types.ts';
import { CHESS_KINDS, COLORS } from '../game/types.ts';
import { applyAction, previewAction } from '../game/engine.ts';
import { canMove, protectedCells } from '../game/moves.ts';
import Board from './Board.tsx';
import PieceTray from './PieceTray.tsx';
import LinePicker from './LinePicker.tsx';
import { actionAt, completeUniqueLines, lineSelectionComplete } from './board-input.ts';
import { colorName, errorText, actionLabel, pieceName } from './labels.ts';
interface Props { game: GameState; lastAction: Action | null; analyzing: boolean; busy: boolean; onSave: (action: Action, claims: Line[]) => void; onDirty: (dirty: boolean) => void }
export default function ReviewPosition({ game, lastAction, analyzing, busy, onSave, onDirty }: Props) {
  const [mode, setMode] = useState<PieceKind | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [claims, setClaims] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const actor = game.status === 'playing' ? game.turn : null;
  const canAct = analyzing && actor !== null && !busy;
  const preview = useMemo(() => action && actor ? previewAction(game, actor, action) : null, [game, actor, action]);
  const protectedSet = useMemo(() => protectedCells(game), [game]);
  const legal = useMemo(() => {
    const result = new Set<number>();
    if (!canAct || from === null || !actor || game.players[actor].food < 2) return result;
    for (let at = 0; at < game.board.length; at++) if (canMove(game.board, from, at, actor, protectedSet, game.boardSize)) result.add(at);
    return result;
  }, [canAct, from, actor, game, protectedSet]);
  const needed = actor ? 2 - game.completedLines[actor].length : 0;
  useEffect(() => { onDirty(action !== null); return () => onDirty(false); }, [action, onDirty]);
  function cancel() { if (busy) return; setMode(null); setFrom(null); setAction(null); setClaims([]); setError(null); }
  function select(cell: number) {
    if (!canAct || !actor) return;
    const piece = game.board[cell];
    if (piece?.color === actor && piece.kind !== 'soldier') {
      if (protectedSet.has(cell)) { setError(errorText('PROTECTED')); return; }
      if (game.players[actor].food < 2) { setError(errorText('NO_FOOD')); return; }
      setMode(null); setFrom(cell); setAction(null); setClaims([]); setError(null); return;
    }
    const candidate = actionAt(mode, from, cell, game.boardSize);
    if (!candidate) { setError('배치할 기물 또는 이동할 체스기물을 먼저 선택하세요.'); return; }
    const result = previewAction(game, actor, candidate);
    if (!result.ok) { setError(errorText(result.code)); return; }
    setAction(candidate); setClaims(completeUniqueLines(result.candidates, [], needed)); setError(null);
  }
  function save() {
    if (!canAct || !actor || !action) return;
    const result = applyAction(game, actor, action, claims);
    if (!result.ok) { setError(errorText(result.code)); return; }
    onSave(action, claims);
  }
  const shown = preview?.ok ? preview.state : game;
  const lastCell = lastAction ? lastAction.type === 'moveChess' ? lastAction.to : lastAction.at : null;
  const previewCell = action ? action.type === 'moveChess' ? action.to : action.at : null;
  return <div className="review-position">
    <Board game={shown} selected={from} legal={legal} previewCell={previewCell} claimedLines={claims} lastCell={lastCell} onSelect={select} onCancel={cancel} />
    <section className="review-controls" aria-label="복기 위치와 분석 조작">
      <div className="review-resources">{COLORS.map(color => <article key={color} aria-label={`${colorName[color]} 복기 자원`}><h3>{colorName[color]}</h3><p>식량 {shown.players[color].food} / 5 · 공급 군사 {shown.players[color].soldiersInReserve} · 보호 줄 {shown.completedLines[color].length}</p><p className="small">{CHESS_KINDS.map(kind => { const status = shown.players[color].chess[kind]; return `${pieceName[kind]} ${status === 'reserve' ? '공급' : status === 'onBoard' ? '보드' : '제외'}`; }).join(' · ')}</p></article>)}</div>
      {analyzing && actor && <><p role="status">분석 · {colorName[actor]}의 차례 · 시계 정지</p><PieceTray supply={game.players[actor]} mode={mode} enabled={canAct} onMode={value => { setMode(value); setFrom(null); setAction(null); setClaims([]); setError(null); }} />
        {action && <p>{actionLabel(action, game.boardSize)}</p>}
        {preview?.ok && preview.candidates.length > 0 && <LinePicker analysis boardSize={game.boardSize} candidates={preview.candidates} selected={claims} needed={needed} onChoose={line => { if (!busy) setClaims(completeUniqueLines(preview.candidates, [...claims, line], needed)); }} onReset={() => { if (!busy) setClaims([]); }} />}
        <div className="button-row"><button type="button" className="primary" disabled={!canAct || !preview?.ok || !lineSelectionComplete(preview.candidates, claims, needed)} onClick={save}>분기 수 저장</button><button type="button" disabled={busy || (!mode && from === null && !action)} onClick={cancel}>선택 취소</button></div>
      </>}
      {game.status === 'finished' && <p>규칙상 종료된 위치입니다. 이전 수순에서 분기할 수 있습니다.</p>}
      {!analyzing && <p className="small muted">본선은 읽기 전용입니다. 수순을 고른 뒤 ‘여기서 분기 두기’로 개인 분석을 시작하세요.</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
    </section>
  </div>;
}
