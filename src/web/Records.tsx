import { useEffect, useState } from 'react';
import type { RecordSummary } from '../protocol/records.ts';
import { api, caughtMessage } from './api.ts';
import { colorName } from './labels.ts';
import { timeControlLabel } from './clock-display.ts';

export default function Records() {
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError(null);
    void api.records(cursor, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      setRecords(current => cursor ? [...current, ...page.records.filter(record => !current.some(previous => previous.code === record.code))] : page.records);
      setNext(page.nextCursor);
    }).catch(reason => { if (!controller.signal.aborted) setError(caughtMessage(reason)); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [cursor, attempt]);
  return <section className="panel records-page" aria-labelledby="records-title" aria-busy={busy}>
    <a href="/">로비로</a><h2 id="records-title">내 기보</h2>
    <p className="small muted">이 브라우저의 참가 기록입니다. 종료 후 7일 보관하며, 개인 분석을 수정해도 기간은 연장되지 않습니다. 장기 보관하려면 JSON을 내려받으세요.</p>
    {busy && <div role="status"><p>기보를 불러오고 있습니다.</p><div className="loading-placeholder" aria-hidden="true" /></div>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>기보 다시 불러오기</button></div>}
    {!busy && !error && !records.length && <p>보관 중인 종료 대국이 없습니다.</p>}
    <ul className="record-list">{records.map(record => <li key={record.code}>
      <a href={`/records/${encodeURIComponent(record.code)}`}><strong>{record.players.black.nickname} · {record.players.white?.nickname ?? '상대 없음'}</strong><span>{record.result.winner ? `${colorName[record.result.winner]} 승리` : '승패 없이 중단'} · {record.moveCount}수 · {record.boardSize} × {record.boardSize}</span></a>
      <p className="small muted">{timeControlLabel(record.timeControl)} · 종료 {new Date(record.endedAt).toLocaleString('ko-KR')}</p>
      <p className="small">{record.historyStatus === 'unavailable' ? '과거 수순 복원 불가 · 최종 보드만 제공' : record.historyStatus === 'reconstructed' ? '명령 기록에서 복원한 기보 · 과거 시간 기록 없음' : '확정 착수 기보'}</p>
    </li>)}</ul>
    {next && <button type="button" disabled={busy} onClick={() => setCursor(next)}>이전 대국 더 보기</button>}
  </section>;
}
