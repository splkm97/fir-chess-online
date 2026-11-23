import type { PieceKind, Supply } from '../game/types.ts';
import { CHESS_KINDS } from '../game/types.ts';
import { pieceName } from './labels.ts';
import PieceIcon from './PieceIcon.tsx';
interface Props { supply: Supply; mode: PieceKind | null; enabled: boolean; onMode: (kind: PieceKind) => void }
export default function PieceTray({ supply, mode, enabled, onMode }: Props) {
  return <section className="piece-tray" aria-labelledby="piece-tray-title">
    <h2 id="piece-tray-title">내 배치 선택</h2>
    <div className="piece-options">
      <button type="button" aria-pressed={mode === 'soldier'} aria-label="군사 배치" disabled={!enabled || supply.soldiersInReserve === 0} onClick={() => onMode('soldier')}><PieceIcon className="reserve-glyph" kind="soldier" /><strong>군사 배치</strong><span className="small">{supply.food < 5 ? '식량 +1' : '식량 최대'}{supply.soldiersInReserve === 0 ? ' · 공급 없음' : ''}</span></button>
      {CHESS_KINDS.map(kind => <button key={kind} type="button" aria-pressed={mode === kind} aria-label={`${pieceName[kind]} 배치`} disabled={!enabled || supply.food < 3 || supply.chess[kind] !== 'reserve'} onClick={() => onMode(kind)}><PieceIcon className="reserve-glyph" kind={kind} /><strong>{pieceName[kind]}</strong><span className="small">{supply.chess[kind] === 'captured' ? '영구 제외' : supply.chess[kind] === 'onBoard' ? '보드 위' : '식량 3'}</span></button>)}
    </div>
  </section>;
}
