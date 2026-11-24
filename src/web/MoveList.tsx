import type { BoardSize, PieceKind } from '../game/types.ts';
import type { MoveRecord } from '../protocol/records.ts';
import { actionLabel, colorName, pieceName } from './labels.ts';
import { displayClock } from './clock-display.ts';

interface Props { moves: readonly MoveRecord[]; boardSize: BoardSize; selected?: number | undefined; onSelect?: (ply: number) => void; disabled?: boolean }
export default function MoveList({ moves, boardSize, selected, onSelect, disabled = false }: Props) {
  if (!moves.length) return <p className="small muted">확정된 착수가 없습니다.</p>;
  const pieces = new Map<number, PieceKind>();
  return <ol className="move-list" aria-label="착수 목록">{moves.map(move => {
    const action = move.action;
    const kind = action.type === 'placeSoldier' ? 'soldier' : action.type === 'placeChess' ? action.kind : pieces.get(action.from);
    if (action.type === 'moveChess') pieces.delete(action.from);
    if (kind) pieces.set(action.type === 'moveChess' ? action.to : action.at, kind);
    const content = <><span>{move.ply}. {colorName[move.actor]} {kind ? pieceName[kind] : '체스'} · {actionLabel(action, boardSize)}</span>{move.captured && <span className="small">포획: {colorName[move.captured.color]} {pieceName[move.captured.kind]}</span>}<span className="small muted">남은 시간 {displayClock(move.clockAfterMs?.[move.actor] ?? null)}</span></>;
    return <li key={move.ply}>{onSelect ? <button type="button" aria-current={selected === move.ply ? 'step' : undefined} disabled={disabled} onClick={() => onSelect(move.ply)}>{content}</button> : <div>{content}</div>}</li>;
  })}</ol>;
}
