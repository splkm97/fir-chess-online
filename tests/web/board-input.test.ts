import { describe, expect, it } from 'vitest';
import { actionAt, boardExtent, BOARD_MARGIN, BOARD_STEP, completeUniqueLines, isTap, keyboardCell, lineSelectionComplete, pointToCell } from '../../src/web/board-input.ts';
import { applyAction, createGame, previewAction } from '../../src/game/engine.ts';
import { lineKey, remainingLines } from '../../src/game/lines.ts';
import type { Line } from '../../src/game/types.ts';

describe('교차점 좌표 변환', () => {
  it.each([328, 358, 720, 880, 1120])('전체 보기와 확대 너비 %i에서 모든 교차점을 그대로 선택한다', width => {
    const rect = { left: 16, top: 125, width, height: width };
    for (const size of [19, 20] as const) {
      for (let cell = 0; cell < size * size; cell++) {
        const x = rect.left + (BOARD_MARGIN + cell % size * BOARD_STEP) / boardExtent(size) * width;
        const y = rect.top + (BOARD_MARGIN + Math.floor(cell / size) * BOARD_STEP) / boardExtent(size) * width;
        expect(pointToCell(x, y, rect, size)).toBe(cell);
        if (size === 19) expect(pointToCell(x, y, rect)).toBe(cell);
      }
    }
  });
  it('보드가 스크롤로 이동해도 화면 좌표를 정확하게 변환한다', () => {
    const rect = { left: -240, top: -300, width: 880, height: 880 };
    expect(pointToCell(-240 + 10.5 * 880 / 19, -300 + 12.5 * 880 / 19, rect)).toBe(238);
    expect(pointToCell(-240 + 10.5 * 44, -300 + 12.5 * 44, rect, 20)).toBe(250);
  });
  it('가장자리에서 교차점 중심을 셀 모서리로 오인하지 않는다', () => {
    const rect = { left: 10, top: 20, width: 950, height: 950 };
    expect(boardExtent(19)).toBe(950);
    expect(boardExtent(20)).toBe(1000);
    expect(pointToCell(10, 20, rect)).toBe(0);
    expect(pointToCell(59.9, 69.9, rect)).toBe(0);
    expect(pointToCell(60, 70, rect)).toBe(20);
    expect(pointToCell(959.9, 969.9, rect)).toBe(360);
    expect(pointToCell(960, 970, rect)).toBeNull();
    expect(pointToCell(9, 30, rect)).toBeNull();
    expect(pointToCell(30, 19, rect)).toBeNull();
  });
  it('레이아웃이 아직 없으면 선택하지 않는다', () => {
    expect(pointToCell(0, 0, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe('키보드와 포인터 의도', () => {
  it.each([
    [0, 'ArrowLeft', 0], [0, 'ArrowUp', 0], [18, 'ArrowRight', 18], [360, 'ArrowDown', 360],
    [19, 'ArrowLeft', 19], [18, 'ArrowDown', 37], [19, 'ArrowRight', 20], [20, 'ArrowUp', 1],
    [203, 'Home', 190], [203, 'End', 208], [203, 'Escape', 203],
  ])('교차점 %i 에서 %s → %i', (cell, key, expected) => { expect(keyboardCell(cell, key)).toBe(expected); });
  it('20×20 기록의 가장자리와 행 이동을 보존한다', () => {
    expect(keyboardCell(19, 'ArrowRight', 20)).toBe(19);
    expect(keyboardCell(399, 'ArrowDown', 20)).toBe(399);
    expect(keyboardCell(19, 'ArrowDown', 20)).toBe(39);
    expect(keyboardCell(213, 'Home', 20)).toBe(200);
    expect(keyboardCell(213, 'End', 20)).toBe(219);
    expect(actionAt('queen', null, 399, 20)).toEqual({ type: 'placeChess', kind: 'queen', at: 399 });
    expect(actionAt(null, 399, 379, 20)).toEqual({ type: 'moveChess', from: 399, to: 379 });
    expect(actionAt('soldier', null, 400, 20)).toBeNull();
  });
  it('스크롤과 드래그를 탭으로 처리하지 않는다', () => {
    expect(isTap(10, 10, 12, 13)).toBe(true);
    expect(isTap(10, 10, 18, 10)).toBe(false);
    expect(isTap(10, 10, 17, 17)).toBe(false);
    expect(isTap(10, 10, 10, 100)).toBe(false);
  });
  it('기물 선택은 원자적 요청 전의 행동 의도만 만든다', () => {
    expect(actionAt(null, null, 0)).toBeNull();
    expect(actionAt('soldier', null, 0)).toEqual({ type: 'placeSoldier', at: 0 });
    expect(actionAt('queen', null, 360)).toEqual({ type: 'placeChess', kind: 'queen', at: 360 });
    expect(actionAt(null, 10, 30)).toEqual({ type: 'moveChess', from: 10, to: 30 });
    expect(actionAt('soldier', null, -1)).toBeNull();
    expect(actionAt('soldier', null, 361)).toBeNull();
    expect(actionAt('queen', null, 399)).toBeNull();
    expect(actionAt(null, 361, 0)).toBeNull();
    expect(actionAt('soldier', null, 1.5)).toBeNull();
    expect(actionAt(null, -1, 0)).toBeNull();
  });
});

const horizontal = (start: number): Line => ({ start, dx: 1, dy: 0, cells: Array.from({ length: 5 }, (_, i) => start + i) });
describe('보호 구간 미리보기와 원자적 확정', () => {
  it('후보가 하나면 자동으로 선택한다', () => {
    const line = horizontal(0);
    expect(completeUniqueLines([line], [], 2)).toEqual([line]);
    expect(lineSelectionComplete([line], [line], 2)).toBe(true);
  });
  it('장목의 겹친 후보를 자동 선택하지 않는다', () => {
    const candidates = [horizontal(0), horizontal(1)];
    expect(completeUniqueLines(candidates, [], 2)).toEqual([]);
    expect(lineSelectionComplete(candidates, [], 2)).toBe(false);
    expect(remainingLines(candidates, [candidates[1]!])).toEqual([]);
  });
  it('다른 방향의 공유 기물을 허용하며 남은 단일 후보도 선택한다', () => {
    const a = horizontal(0), b: Line = { start: 0, dx: 0, dy: 1, cells: [0, 19, 38, 57, 76] };
    expect(completeUniqueLines([a, b], [a], 2)).toEqual([a, b]);
    expect(lineSelectionComplete([a, b], [a], 2)).toBe(false);
    expect(lineSelectionComplete([a, b], [a, b], 2)).toBe(true);
  });
  it('두 줄 승리에 필요한 선택을 채우면 멈춘다', () => {
    const a = horizontal(0), b = horizontal(19);
    expect(completeUniqueLines([a, b], [a], 1)).toEqual([a]);
    expect(lineSelectionComplete([a, b], [a], 1)).toBe(true);
  });
  it('10개 장목에서 중앙 선택과 양 끝 두 줄 선택을 구별한다', () => {
    const candidates = Array.from({ length: 6 }, (_, i) => horizontal(i));
    expect(completeUniqueLines(candidates, [horizontal(2)], 2)).toEqual([horizontal(2)]);
    expect(completeUniqueLines(candidates, [horizontal(0)], 2)).toEqual([horizontal(0), horizontal(5)]);
  });
  it('0,1,2,4,5 이후 3에 배치하고 1..5를 보호해도 확정 전 원본은 불변이다', () => {
    const game = createGame();
    for (const cell of [0, 1, 2, 4, 5]) game.board[cell] = { color: 'black', kind: 'soldier' };
    game.players.black.soldiersInReserve = 15;
    const before = JSON.stringify(game);
    const action = actionAt('soldier', null, 3);
    expect(action).not.toBeNull();
    if (!action) throw new Error('Action missing');
    const preview = previewAction(game, 'black', action);
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error(preview.code);
    expect(preview.candidates.map(lineKey)).toEqual(['0:1:0', '1:1:0']);
    expect(completeUniqueLines(preview.candidates, [], 2)).toEqual([]);
    const choice = preview.candidates.find(line => line.start === 1);
    if (!choice) throw new Error('Overline choice missing');
    const claims = completeUniqueLines(preview.candidates, [choice], 2);
    expect(lineSelectionComplete(preview.candidates, claims, 2)).toBe(true);
    expect(JSON.stringify(game)).toBe(before);
    const applied = applyAction(game, 'black', action, claims);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.code);
    expect(applied.state.completedLines.black[0]?.cells).toEqual([1, 2, 3, 4, 5]);
    expect(applied.state.players.black.soldiersInReserve).toBe(14);
    expect(game.board[3]).toBeNull();
  });
});
