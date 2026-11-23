import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { GameBoard, Line } from '../game/types.ts';
import { cellLabel, COLORS, SIZE } from '../game/types.ts';
import { protectedCells } from '../game/moves.ts';
import { lineKey } from '../game/lines.ts';
import { BOARD_EXTENT, BOARD_MARGIN, BOARD_STEP, isTap, keyboardCell, pointToCell } from './board-input.ts';
import { colorName, pieceGlyph, pieceName } from './labels.ts';

interface Props {
  game: GameBoard | null;
  selected: number | null;
  legal: ReadonlySet<number>;
  previewCell: number | null;
  claimedLines: Line[];
  onSelect: (cell: number) => void;
  onCancel: () => void;
}
const cells = Array.from({ length: SIZE * SIZE }, (_, cell) => cell);
const axes = Array.from({ length: SIZE }, (_, i) => i);
const point = (cell: number) => ({ x: BOARD_MARGIN + cell % SIZE * BOARD_STEP, y: BOARD_MARGIN + Math.floor(cell / SIZE) * BOARD_STEP });

export default function Board({ game, selected, legal, previewCell, claimedLines, onSelect, onCancel }: Props) {
  const [zoom, setZoom] = useState(0);
  const [focus, setFocus] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const pointers = useRef(new Set<number>());
  const protectedSet = useMemo(() => game ? protectedCells(game) : new Set<number>(), [game]);
  const completed = game ? COLORS.flatMap(color => game.completedLines[color].map((line, index) => ({ color, line, index }))) : [];
  function focusCell(cell: number) {
    setFocus(cell);
    const node = svg.current?.querySelector<SVGGElement>(`[data-cell="${cell}"]`);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function keyDown(event: KeyboardEvent<SVGGElement>, cell: number) {
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(cell); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); focusCell(keyboardCell(cell, event.key));
    }
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    pointers.current.add(event.pointerId);
    if (pointers.current.size > 1) { if (gesture.current) gesture.current.moved = true; return; }
    if (event.button !== 0) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = gesture.current;
    if (start && !isTap(start.x, start.y, event.clientX, event.clientY)) start.moved = true;
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    gesture.current = null;
    if (start.moved || !isTap(start.x, start.y, event.clientX, event.clientY)) return;
    const cell = pointToCell(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (cell !== null) { setFocus(cell); onSelect(cell); }
  }
  return <section className="board-section" aria-label="대국 보드">
    <div className="board-toolbar">
      <span className="small muted">20 × 20 교차점</span>
      <div className="button-row"><button type="button" onClick={() => setZoom(value => Math.min(3, value + 1))} disabled={zoom === 3}>확대</button><button type="button" onClick={() => setZoom(value => Math.max(0, value - 1))} disabled={zoom === 0}>축소</button><button type="button" onClick={() => setZoom(0)} disabled={zoom === 0}>전체 보기</button></div>
    </div>
    <div className="board-scroll" data-testid="board" onScroll={() => { if (gesture.current) gesture.current.moved = true; }}>
      <svg ref={svg} className="game-board" viewBox={`0 0 ${BOARD_EXTENT} ${BOARD_EXTENT}`} style={zoom ? { width: `${880 + (zoom - 1) * 240}px`, minWidth: '100%' } : undefined} role="group" aria-label="오목체스 보드, 방향키로 이동하고 Enter로 선택" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={event => { pointers.current.delete(event.pointerId); gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }}>
        <title>오목체스 교차점 보드</title>
        <g className="board-grid" aria-hidden="true">{axes.map(i => <g key={i}><line x1={25} y1={point(i).x} x2={975} y2={point(i).x} /><line x1={point(i).x} y1={25} x2={point(i).x} y2={975} /></g>)}</g>
        <g aria-hidden="true" className="completed-lines">{completed.map(({ color, line }) => {
          const end = line.cells[4]; if (end === undefined) return null;
          const a = point(line.start), b = point(end);
          return <line key={`${color}-${lineKey(line)}`} className={`completed-line ${color}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}</g>
        {cells.map(cell => {
          const { x, y } = point(cell), piece = game?.board[cell];
          const label = `${cellLabel(cell)}, ${piece ? `${colorName[piece.color]} ${pieceName[piece.kind]}` : '빈 교차점'}${protectedSet.has(cell) ? ', 보호됨' : ''}${legal.has(cell) ? ', 합법 목적지' : ''}${previewCell === cell ? ', 착수 미리보기' : ''}`;
          return <g key={cell} data-cell={cell} transform={`translate(${x} ${y})`} role="button" aria-label={label} aria-pressed={selected === cell || previewCell === cell} tabIndex={focus === cell ? 0 : -1} onFocus={() => setFocus(cell)} onKeyDown={event => keyDown(event, cell)} onClick={event => { if (event.detail === 0) onSelect(cell); }} className={`intersection${previewCell === cell ? ' preview' : ''}`}>
            <rect className="cell-target" x={-25} y={-25} width={50} height={50} />
            {legal.has(cell) && <circle className="legal-dot" r={piece ? 23 : 6} />}
            {piece && <><circle className={`piece ${piece.color}`} r={19} /><text aria-hidden="true" className={`piece-glyph ${piece.color} ${piece.kind}`} textAnchor="middle" dominantBaseline="central">{pieceGlyph[piece.kind]}</text></>}
            {protectedSet.has(cell) && <rect className="protected-ring" x={-22} y={-22} width={44} height={44} rx={6} />}
            {(selected === cell || previewCell === cell) && <circle className="selected-ring" r={24} />}
          </g>;
        })}
        <g aria-hidden="true" className="claimed-lines">{claimedLines.map(line => {
          const end = line.cells[4]; if (end === undefined) return null;
          const a = point(line.start), b = point(end);
          return <line key={lineKey(line)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}</g>
        <g aria-hidden="true" className="crown-markers">{completed.flatMap(({ color, line, index }) => [line.start, line.cells[4]].map((cell, end) => {
          if (cell === undefined) return null;
          const { x, y } = point(cell);
          return <g key={`${color}-${lineKey(line)}-${end}`} transform={`translate(${x + (index ? 10 : -10)},${y - 17})`}><circle r={10} /><text textAnchor="middle" dominantBaseline="central">♛</text></g>;
        }))}</g>
        <g className="board-coordinates" aria-hidden="true">{axes.map(i => <g key={i}><text x={point(i).x} y={12} textAnchor="middle">{String.fromCharCode(65 + i)}</text><text x={3} y={point(i).x + 4}>{i + 1}</text></g>)}</g>
      </svg>
    </div>
    <p className="board-help small muted">교차점 선택은 미리보기입니다. 아래에서 착수를 확정하세요. 확대하면 교차점 간격이 44px 이상이며, 보드 안을 스크롤할 수 있습니다. 방향키 이동 · Enter 선택 · Esc 취소</p>
    {completed.length > 0 && <ul className="line-legend small">{completed.map(({ color, line, index }) => <li key={`${color}-${lineKey(line)}`}>{colorName[color]} {index + 1}번째 보호 줄: {line.cells.map(cellLabel).join(' · ')} — 왕관 2개</li>)}</ul>}
  </section>;
}
