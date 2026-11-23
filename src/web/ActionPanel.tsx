import type { Action, PieceKind } from '../game/types.ts';
import { actionLabel, pieceName } from './labels.ts';
interface Props {
  mode: PieceKind | null; moving: boolean; action: Action | null;
  foodChange: number | null; error: string | null;
}
export default function ActionPanel({ mode, moving, action, foodChange, error }: Props) {
  return <section className="action-panel" aria-labelledby="action-title">
    <div className="section-heading"><h2 id="action-title">이번 착수</h2></div>
    <div className="confirmation" aria-live="polite">
      <strong>{action ? actionLabel(action) : moving ? '표시된 목적지를 선택하세요.' : mode ? `${pieceName[mode]}를 놓을 빈 교차점을 선택하세요.` : '배치할 기물 또는 이동할 체스기물을 선택하세요.'}</strong>
      {action && <><p className="small">식량 {foodChange === null ? '계산할 수 없음' : `${foodChange > 0 ? '+' : ''}${foodChange}`}</p><p className="small">점선 기물은 아직 미리보기입니다. 식량과 포획은 확정 후 반영됩니다.</p></>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  </section>;
}
