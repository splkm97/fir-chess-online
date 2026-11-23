import { useEffect, useMemo, useState } from 'react';
import type { Action, Line, PieceKind } from '../game/types.ts';
import { cellLabel, opposite } from '../game/types.ts';
import type { Command, RoomSnapshot } from '../protocol/messages.ts';
import { previewAction, applyAction } from '../game/engine.ts';
import { canMove, protectedCells } from '../game/moves.ts';
import { actionAt, completeUniqueLines, lineSelectionComplete } from './board-input.ts';
import { actionLabel, errorText } from './labels.ts';
import Board from './Board.tsx';
import ActionPanel from './ActionPanel.tsx';
import LinePicker from './LinePicker.tsx';
import MatchStatus from './MatchStatus.tsx';
import PlayerResources from './PlayerResources.tsx';
import PieceTray from './PieceTray.tsx';
interface Draft { revision: number; mode: PieceKind | null; from: number | null; action: Action | null; claims: Line[] }
interface Props { room: RoomSnapshot; receivedAt: number; enabled: boolean; pending: Command | null; onLobby: () => void; onRetryPending: () => void; onAction: (action: Action, claimedLines: Line[]) => boolean }
export default function Match({ room, receivedAt, enabled, pending, onLobby, onRetryPending, onAction }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    setNow(performance.now());
    if (room.status !== 'active' && room.status !== 'paused') return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [room.status, receivedAt]);
  const elapsed = Math.max(0, now - receivedAt);
  const terminal = room.status === 'finished' || room.status === 'aborted';
  const game = room.game;
  useEffect(() => { setDraft(null); setError(null); }, [room.revision]);
  const activeDraft = draft?.revision === room.revision ? draft : null;
  const pendingAction = pending?.type === 'action' && pending.expectedRevision === room.revision ? pending : null;
  const action = pendingAction?.action ?? activeDraft?.action ?? null;
  const claims = pendingAction?.claimedLines ?? activeDraft?.claims ?? [];
  const preview = useMemo(() => game && action ? previewAction(game, room.you, action) : null, [game, room.you, action]);
  const protectedSet = useMemo(() => game ? protectedCells(game) : new Set<number>(), [game]);
  const legal = useMemo(() => {
    const cells = new Set<number>();
    if (!game || !enabled || pending || activeDraft?.from == null || game.players[room.you].food < 2) return cells;
    for (let cell = 0; cell < 400; cell++) if (canMove(game.board, activeDraft.from, cell, room.you, protectedSet)) cells.add(cell);
    return cells;
  }, [game, enabled, pending, activeDraft?.from, room.you, protectedSet]);
  const needed = game ? 2 - game.completedLines[room.you].length : 0;
  const canAct = enabled && !pending && room.status === 'active' && game?.status === 'playing' && game.turn === room.you;
  function cancel() { if (pending) return; setDraft(null); setError(null); setNotice('선택을 취소했습니다.'); }
  function chooseMode(mode: PieceKind) {
    if (!canAct) return;
    setDraft({ revision: room.revision, mode, from: null, action: null, claims: [] }); setError(null); setNotice(null);
  }
  function select(cell: number) {
    if (!game || !canAct) return;
    const piece = game.board[cell];
    if (piece?.color === room.you && piece.kind !== 'soldier') {
      if (protectedSet.has(cell)) { setError(errorText('PROTECTED')); return; }
      if (game.players[room.you].food < 2) { setError(errorText('NO_FOOD')); return; }
      setDraft({ revision: room.revision, mode: null, from: cell, action: null, claims: [] }); setError(null); setNotice(null); return;
    }
    const candidate = actionAt(activeDraft?.mode ?? null, activeDraft?.from ?? null, cell);
    if (!candidate) { setError('먼저 배치할 기물 또는 이동할 내 체스기물을 선택해 주세요.'); return; }
    const result = previewAction(game, room.you, candidate);
    if (!result.ok) { setError(errorText(result.code)); return; }
    setDraft({ revision: room.revision, mode: activeDraft?.mode ?? null, from: activeDraft?.from ?? null, action: candidate, claims: completeUniqueLines(result.candidates, [], needed) });
    setError(null); setNotice(null);
  }
  function chooseLine(line: Line) {
    if (!activeDraft || !preview?.ok || pending) return;
    setDraft({ ...activeDraft, claims: completeUniqueLines(preview.candidates, [...claims, line], needed) });
  }
  function confirm() {
    if (!game || !canAct || !action || !preview?.ok || !activeDraft) return;
    const result = applyAction(game, room.you, action, claims);
    if (!result.ok) { setError(errorText(result.code)); return; }
    if (!onAction(action, claims)) setError('아직 서버와 동기화되지 않았습니다. 연결 상태를 확인한 뒤 다시 확정해 주세요.');
  }
  const showPreview = preview?.ok ? preview.state : game;
  const complete = preview?.ok && lineSelectionComplete(preview.candidates, claims, needed);
  const selected = activeDraft?.from ?? null;
  const previewCell = action ? action.type === 'moveChess' ? action.to : action.at : null;
  return <div className="match-cockpit">
    <aside className="cockpit-resources" aria-label="양측 자원과 배치">
      <PlayerResources room={room} color={opposite(room.you)} elapsed={elapsed} />
      <PlayerResources room={room} color={room.you} elapsed={elapsed} />
      {game && !terminal && <PieceTray supply={game.players[room.you]} mode={activeDraft?.mode ?? null} enabled={canAct} onMode={chooseMode} />}
    </aside>
    <div className="cockpit-board"><Board game={showPreview} selected={selected} legal={legal} previewCell={previewCell} claimedLines={claims} onSelect={select} onCancel={cancel} /></div>
    <aside className="cockpit-command" aria-label="착수 명령">
      <MatchStatus room={room} elapsed={elapsed} />
      <div className="command-content">
        {game && !terminal && <>
          <p className="turn-instruction" role="status">{pending ? '서버에서 요청을 확인하고 있습니다.' : room.status === 'paused' ? '재연결을 기다리는 동안 보드를 살펴볼 수 있습니다.' : canAct ? '내 차례입니다. 한 수를 선택하세요.' : '상대의 차례입니다. 보드를 살펴보세요.'}</p>
          {!pending && <ActionPanel mode={activeDraft?.mode ?? null} moving={selected !== null} action={action} foodChange={preview?.ok ? preview.state.players[room.you].food - game.players[room.you].food : null} error={error} />}
          {preview?.ok && preview.candidates.length > 0 && !pending && <LinePicker candidates={preview.candidates} selected={claims} needed={needed} onChoose={chooseLine} onReset={() => { if (activeDraft) setDraft({ ...activeDraft, claims: [] }); }} />}
          {notice && <p className="small muted" role="status">{notice}</p>}
        </>}
        {pending?.type === 'action' && <div className="pending-summary" role="status"><strong>확인 중: {actionLabel(pending.action)}</strong>{pending.claimedLines.length > 0 && <p>보호 구간: {pending.claimedLines.map(line => line.cells.map(cellLabel).join(' · ')).join(' / ')}</p>}<p className="small">응답을 확인할 때까지 다음 수를 보내지 않습니다.</p>{enabled && <button type="button" onClick={onRetryPending}>같은 요청 다시 확인</button>}</div>}
        {!terminal && <details className="command-help"><summary>착수 규칙</summary><p className="small muted">이동하려면 보드의 내 체스기물을 선택하세요. 이동 비용은 식량 2이며, 보호된 기물과 군사는 이동할 수 없습니다.</p><p className="small muted">방 상태가 바뀌면 미확정 선택은 초기화됩니다. 서버에서 확인한 착수만 보드에 남습니다.</p></details>}
      </div>
      <div className="command-footer">
        {game && !terminal && <div className="confirm-buttons"><button type="button" className="primary" disabled={!canAct || !complete || Boolean(pending)} onClick={confirm}>착수 확정</button><button type="button" disabled={Boolean(pending) || (!action && !activeDraft?.mode && selected === null)} onClick={cancel}>선택 취소</button></div>}
        {terminal && <section className="result-actions"><p>이 보드는 마지막 확정 기록입니다. 새 방에서 다시 만날 수 있습니다.</p><button type="button" className="primary" onClick={onLobby}>새 방 만들기로 이동</button></section>}
      </div>
    </aside>
  </div>;
}
