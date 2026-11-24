import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnalysisInput, AnalysisNode, AnalysisParent, RecordDetail } from '../protocol/records.ts';
import type { Action, Line } from '../game/types.ts';
import { api, ApiError, caughtMessage } from './api.ts';
import { useMoves } from './useMoves.ts';
import { analysisPosition } from './analysis-position.ts';
import { colorName, actionLabel } from './labels.ts';
import { displayClock, timeControlLabel } from './clock-display.ts';
import ReviewPosition from './ReviewPosition.tsx';
import MoveList from './MoveList.tsx';
import { commandId } from './command-id.ts';

export default function Review({ code }: { code: string }) {
  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [nodes, setNodes] = useState<AnalysisNode[]>([]);
  const [cursor, setCursor] = useState<AnalysisParent>({ type: 'mainline', ply: 0 });
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState<AnalysisInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [navigationEpoch, setNavigationEpoch] = useState(0);
  const moves = useMoves(code, record?.historyStatus === 'unavailable' ? 0 : record?.moveCount ?? 0);
  const onDirty = useCallback((value: boolean) => setDirty(value), []);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    async function load() {
      const detail = await api.record(code, controller.signal);
      const saved: AnalysisNode[] = [];
      if (detail.historyStatus !== 'unavailable') {
        let next: string | null = null;
        do { const page = await api.analysis(code, next, controller.signal); saved.push(...page.nodes); next = page.nextCursor; } while (next);
      }
      if (!controller.signal.aborted) { setRecord(detail); setNodes(saved); setCursor({ type: 'mainline', ply: detail.moveCount }); }
    }
    void load().catch(reason => { if (!controller.signal.aborted) setError(caughtMessage(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [code, attempt]);
  const position = useMemo(() => {
    if (!record || !moves.ready || record.historyStatus === 'unavailable') return null;
    try { return { ok: true as const, ...analysisPosition(record.boardSize, moves.moves, nodes, cursor) }; }
    catch (reason) { return { ok: false as const, message: reason instanceof Error ? reason.message : '수순을 복기할 수 없습니다.' }; }
  }, [record, moves.ready, moves.moves, nodes, cursor]);
  function navigate(next: AnalysisParent) {
    if (pending || (dirty && !window.confirm('저장하지 않은 선택을 버리고 이동할까요?'))) return;
    setCursor(next); setAnalyzing(next.type === 'variation'); setSaveError(null); setDirty(false);
    setNavigationEpoch(value => value + 1);
  }
  async function persist(input: AnalysisInput) {
    setPending(input); setSaving(true); setSaveError(null);
    try {
      const result = await api.saveAnalysis(code, input);
      setNodes(current => current.some(node => node.id === result.node.id) ? current : [...current, result.node]);
      setCursor({ type: 'variation', nodeId: result.node.id }); setPending(null); setAnalyzing(true); setDirty(false);
    } catch (reason) {
      setSaveError(caughtMessage(reason));
      if (reason instanceof ApiError && reason.status >= 400 && reason.status < 500 && reason.status !== 408 && reason.status !== 429) setPending(null);
    }
    finally { setSaving(false); }
  }
  function save(action: Action, claims: Line[]) { if (!pending) void persist({ id: commandId(), parent: cursor, action, claimedLines: claims }); }
  const title = <><nav className="button-row"><a href="/records">내 기보</a><a href="/">로비로</a></nav><h2>기보 복기·브랜치 분석</h2></>;
  if (loading) return <section className="panel" aria-busy="true">{title}<p role="status">대국과 개인 분석을 불러오고 있습니다.</p><div className="loading-placeholder" aria-hidden="true" /></section>;
  if (error || !record) return <section className="panel">{title}<p role="alert">{error ?? '기보를 찾을 수 없습니다.'}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>기보 다시 불러오기</button></section>;
  const key = cursor.type === 'mainline' ? `main-${cursor.ply}` : cursor.nodeId;
  const rootPly = position?.ok ? position.rootPly : 0;
  const clocks = rootPly ? moves.moves[rootPly - 1]?.clockAfterMs : record.timeControl.kind === 'fischer' ? { black: record.timeControl.baseMs, white: record.timeControl.baseMs } : null;
  return <section className="review-page" aria-label="대국 복기">
    <header className="panel">{title}<p>{record.players.black.nickname} · {record.players.white?.nickname ?? '상대 없음'} — {record.result.winner ? `${colorName[record.result.winner]} 승리` : '승패 없이 중단'}</p><p className="small muted">{timeControlLabel(record.timeControl)} · 만료 {new Date(record.expiresAt).toLocaleString('ko-KR')} · 쿠키를 지우면 접근할 수 없습니다.</p>
      {record.clockAccuracy === 'checkpoint' && <p className="small">서버 중단 시계는 마지막 저장 시점의 기록입니다.</p>}
      {record.historyStatus === 'reconstructed' && <p className="small">과거 명령에서 복원한 수순입니다. 저장되지 않은 시간은 표시하지 않습니다.</p>}
      <a href={`/api/records/${encodeURIComponent(code)}/download`} download>JSON 기보 다운로드</a>
    </header>
    {record.historyStatus === 'unavailable' ? <><p role="status">과거 수순 복원 불가 · 최종 보드만 제공하며 복기·분기 두기는 사용할 수 없습니다.</p>{record.finalState && <ReviewPosition game={record.finalState} lastAction={null} analyzing={false} busy={false} onSave={save} onDirty={onDirty} />}</>
      : !moves.ready ? <section className="panel" aria-busy={!moves.error}><p role={moves.error ? 'alert' : 'status'}>{moves.error ?? '확정 수순을 불러오고 있습니다.'}</p>{moves.error && <button type="button" onClick={moves.retry}>기보 다시 불러오기</button>}</section>
      : position?.ok ? <>
        <section className="panel review-navigation"><p role="status">{cursor.type === 'mainline' ? `본선 ${cursor.ply} / ${record.moveCount}수` : `개인 분기 ${nodes.find(node => node.id === cursor.nodeId)?.sequence ?? ''} · 본선 ${rootPly}수에서 분기`}</p>
          <div className="button-row"><button disabled={Boolean(pending) || (cursor.type === 'mainline' && cursor.ply === 0)} onClick={() => navigate({ type: 'mainline', ply: 0 })}>처음</button><button disabled={Boolean(pending) || (cursor.type === 'mainline' && cursor.ply === 0)} onClick={() => navigate(cursor.type === 'mainline' ? { type: 'mainline', ply: Math.max(0, cursor.ply - 1) } : nodes.find(node => node.id === cursor.nodeId)?.parent ?? { type: 'mainline', ply: 0 })}>이전 수</button><button disabled={Boolean(pending) || cursor.type !== 'mainline' || cursor.ply >= record.moveCount} onClick={() => navigate({ type: 'mainline', ply: Math.min(record.moveCount, rootPly + 1) })}>다음 수</button><button disabled={Boolean(pending) || (cursor.type === 'mainline' && cursor.ply === record.moveCount)} onClick={() => navigate({ type: 'mainline', ply: record.moveCount })}>마지막</button></div>
          <p className="small">본선 기록 시계 · 흑 {displayClock(clocks?.black ?? null)} / 백 {displayClock(clocks?.white ?? null)} · 분석 중에는 흐르지 않습니다.</p>
          <div className="button-row"><button disabled={Boolean(pending) || analyzing || position.game.status === 'finished'} onClick={() => setAnalyzing(true)}>여기서 분기 두기</button><button disabled={Boolean(pending) || (!analyzing && cursor.type === 'mainline')} onClick={() => navigate({ type: 'mainline', ply: rootPly })}>본선으로 돌아가기</button></div>
        </section>
        {saving && <p role="status">분기 수를 서버에 저장하고 있습니다.</p>}
        {saveError && <div className="error-message" role="alert"><p>{saveError} 저장 여부를 다시 확인해 주세요.</p><button disabled={saving || !pending} onClick={() => { if (pending) void persist(pending); }}>분기 저장 다시 시도</button></div>}
        <ReviewPosition key={`${key}-${analyzing}-${navigationEpoch}`} game={position.game} lastAction={position.lastAction} analyzing={analyzing} busy={Boolean(pending)} onSave={save} onDirty={onDirty} />
        <div className="review-lists"><section className="panel"><h3>본선 수순</h3><MoveList moves={moves.moves} boardSize={record.boardSize} selected={cursor.type === 'mainline' ? cursor.ply : undefined} disabled={Boolean(pending)} onSelect={ply => navigate({ type: 'mainline', ply })} /></section><section className="panel"><h3>내 브랜치</h3><p className="small muted">나에게만 보입니다. 저장된 분기는 다운로드에도 포함됩니다.</p>{!nodes.length && <p>저장된 브랜치가 없습니다.</p>}<ul className="variation-list">{nodes.map(node => <li key={node.id}><button disabled={Boolean(pending)} aria-pressed={cursor.type === 'variation' && cursor.nodeId === node.id} onClick={() => navigate({ type: 'variation', nodeId: node.id })}>분기 {node.sequence} · {colorName[node.actor]} {actionLabel(node.action, record.boardSize)}<span className="small">{node.parent.type === 'mainline' ? `본선 ${node.parent.ply}수에서` : `분기 ${nodes.find(parent => parent.id === (node.parent.type === 'variation' ? node.parent.nodeId : ''))?.sequence ?? '?'}에서`}</span></button></li>)}</ul></section></div>
      </> : <p role="alert">{position && !position.ok ? position.message : '수순을 복기할 수 없습니다.'}</p>}
  </section>;
}
