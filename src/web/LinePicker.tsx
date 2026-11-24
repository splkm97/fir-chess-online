import { useEffect, useRef } from 'react';
import type { BoardSize, Line } from '../game/types.ts';
import { cellLabel, SIZE } from '../game/types.ts';
import { lineKey, remainingLines } from '../game/lines.ts';
interface Props { candidates: Line[]; selected: Line[]; needed: number; boardSize?: BoardSize; analysis?: boolean; onChoose: (line: Line) => void; onReset: () => void }
export default function LinePicker({ candidates, selected, needed, boardSize = SIZE, analysis = false, onChoose, onReset }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [selected.length]);
  const options = selected.length >= needed ? [] : remainingLines(candidates, selected);
  return <section data-testid="line-picker" className="line-picker" aria-labelledby="line-picker-title">
    <h3 ref={heading} tabIndex={-1} id="line-picker-title">보호할 다섯 기물을 선택하세요</h3>
    <p className="small">같은 직선의 겹친 구간은 한 줄만 인정됩니다. {analysis ? '분석 시계는 흐르지 않습니다.' : '선택 중에도 대국 시간은 흐릅니다.'}</p>
    {selected.length > 0 && <ul className="small">{selected.map(line => <li key={lineKey(line)}>선택됨: {line.cells.map(cell => cellLabel(cell, boardSize)).join(' · ')}</li>)}</ul>}
    <div className="line-options">{options.map(line => <button type="button" key={lineKey(line)} data-line-key={lineKey(line)} onClick={() => onChoose(line)}>{cellLabel(line.start, boardSize)}–{cellLabel(line.cells[4] ?? line.start, boardSize)}<span className="small">{line.cells.map(cell => cellLabel(cell, boardSize)).join(' · ')}</span></button>)}</div>
    {options.length === 0 && <p className="success-message" role="status">보호 구간 선택 완료. 착수를 확정해 주세요.</p>}
    {selected.length > 0 && <button type="button" onClick={onReset}>보호 구간 다시 선택</button>}
  </section>;
}
