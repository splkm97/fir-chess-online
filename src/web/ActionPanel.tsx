import type { Action, PieceKind, Supply } from '../game/types.ts';
import { CHESS_KINDS } from '../game/types.ts';
import { actionLabel, pieceGlyph, pieceName } from './labels.ts';
interface Props {
  supply: Supply; mode: PieceKind | null; moving: boolean; enabled: boolean; action: Action | null;
  canConfirm: boolean; pending: boolean; error: string | null;
  onMode: (kind: PieceKind) => void; onConfirm: () => void; onCancel: () => void;
}
export default function ActionPanel({ supply, mode, moving, enabled, action, canConfirm, pending, error, onMode, onConfirm, onCancel }: Props) {
  return <section className="action-panel" aria-labelledby="action-title">
    <div className="section-heading"><h2 id="action-title">이번 착수</h2><span className="small muted">식량 {supply.food} / 5</span></div>
    <div className="piece-options">
      <button type="button" aria-pressed={mode === 'soldier'} aria-label="군사 배치" disabled={!enabled || supply.soldiersInReserve === 0} onClick={() => onMode('soldier')}><span className="reserve-glyph" aria-hidden="true">{pieceGlyph.soldier}</span><strong>군사 배치</strong><span className="small">{supply.soldiersInReserve}개 · 식량 +1</span></button>
      {CHESS_KINDS.map(kind => <button key={kind} type="button" aria-pressed={mode === kind} aria-label={`${pieceName[kind]} 배치`} disabled={!enabled || supply.food < 3 || supply.chess[kind] !== 'reserve'} onClick={() => onMode(kind)}><span className="reserve-glyph" aria-hidden="true">{pieceGlyph[kind]}</span><strong>{pieceName[kind]} 배치</strong><span className="small">{supply.chess[kind] === 'captured' ? '영구 제외' : supply.chess[kind] === 'onBoard' ? '보드 위' : '식량 3 사용'}</span></button>)}
    </div>
    <p className="small muted">이동하려면 보드의 내 체스기물을 선택하세요. 이동 비용은 식량 2이며, 보호된 기물과 군사는 이동할 수 없습니다.</p>
    <div className="confirmation" aria-live="polite">
      <strong>{action ? actionLabel(action) : moving ? '표시된 목적지를 선택하세요.' : mode ? `${pieceName[mode]}를 놓을 빈 교차점을 선택하세요.` : '배치할 기물 또는 이동할 체스기물을 선택하세요.'}</strong>
      {action && <p className="small">점선 기물은 아직 미리보기입니다. 식량과 포획은 확정 후 반영됩니다.</p>}
      {pending && <p className="small">착수 요청 확인 중 — 재접속해도 같은 요청만 확인합니다.</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
    <div className="confirm-buttons"><button type="button" className="primary" disabled={!enabled || !canConfirm || pending} onClick={onConfirm}>착수 확정</button><button type="button" disabled={pending || (!action && !mode && !moving)} onClick={onCancel}>선택 취소</button></div>
  </section>;
}
