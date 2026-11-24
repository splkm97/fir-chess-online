import { describe, expect, it } from 'vitest';
import { analysisPosition } from '../../src/web/analysis-position.ts';
import type { AnalysisNode, AnalysisParent, MoveRecord } from '../../src/protocol/records.ts';
import type { Color } from '../../src/game/types.ts';

const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
function move(ply: number, actor: Color, at: number): MoveRecord {
  return { ply, actor, action: { type: 'placeSoldier', at }, claimedLines: [], recordedAt: null, elapsedMs: null, clockAfterMs: null, captured: null };
}
function node(id: string, sequence: number, parent: AnalysisParent, actor: Color, at: number): AnalysisNode {
  return { id, sequence, parent, actor, action: { type: 'placeSoldier', at }, claimedLines: [], createdAt: 1234 };
}

describe('개인 분석 위치 복원', () => {
  it('본선 시작과 특정 수순까지만 재생한다', () => {
    const mainline = [move(1, 'black', 0), move(2, 'white', 360), move(3, 'black', 1)];
    const initial = analysisPosition(19, mainline, [], { type: 'mainline', ply: 0 });
    expect(initial.game.board).toHaveLength(361);
    expect(initial.game.board.every(piece => piece === null)).toBe(true);
    expect(initial.game.players.black.soldiersInReserve).toBe(20);
    expect(initial.lastAction).toBeNull();
    expect(initial.rootPly).toBe(0);
    const first = analysisPosition(19, mainline, [], { type: 'mainline', ply: 1 });
    expect(first.game.board[0]).toEqual({ color: 'black', kind: 'soldier' });
    expect(first.game.board[360]).toBeNull();
    expect(first.game.board[1]).toBeNull();
    expect(first.lastAction).toEqual(mainline[0]!.action);
    expect(first.rootPly).toBe(1);
  });

  it('저장 순서와 무관하게 중첩 부모를 따라가고 본선과 형제 분기를 변경하지 않는다', () => {
    const mainline = [move(1, 'black', 0), move(2, 'white', 360), move(3, 'black', 1)];
    const first = node(firstId, 1, { type: 'mainline', ply: 1 }, 'white', 180);
    const second = node(secondId, 2, { type: 'variation', nodeId: firstId }, 'black', 181);
    const sibling = node('00000000-0000-4000-8000-000000000003', 3, { type: 'mainline', ply: 1 }, 'white', 200);
    const nodes = [second, sibling, first];
    const before = structuredClone({ mainline, nodes });
    const result = analysisPosition(19, mainline, nodes, { type: 'variation', nodeId: secondId });
    expect(result.rootPly).toBe(1);
    expect(result.lastAction).toEqual(second.action);
    expect(result.game).toMatchObject({ status: 'playing', turn: 'white' });
    expect(result.game.board[0]).toEqual({ color: 'black', kind: 'soldier' });
    expect(result.game.board[180]).toEqual({ color: 'white', kind: 'soldier' });
    expect(result.game.board[181]).toEqual({ color: 'black', kind: 'soldier' });
    for (const cell of [1, 200, 360]) expect(result.game.board[cell]).toBeNull();
    expect({ mainline, nodes }).toEqual(before);
    const original = analysisPosition(19, mainline, nodes, { type: 'mainline', ply: 3 });
    expect(original.game.board[360]).toEqual({ color: 'white', kind: 'soldier' });
    expect(original.game.board[180]).toBeNull();
    expect(original.game.board[181]).toBeNull();
  });

  it('과거 20×20 기록과 그 분기의 마지막 행을 보존한다', () => {
    const mainline = [move(1, 'black', 399)];
    const branch = node(firstId, 1, { type: 'mainline', ply: 1 }, 'white', 380);
    const result = analysisPosition(20, mainline, [branch], { type: 'variation', nodeId: firstId });
    expect(result.game.boardSize).toBe(20);
    expect(result.game.board).toHaveLength(400);
    expect(result.game.board[399]).toEqual({ color: 'black', kind: 'soldier' });
    expect(result.game.board[380]).toEqual({ color: 'white', kind: 'soldier' });
    expect(() => analysisPosition(19, mainline, [branch], { type: 'variation', nodeId: firstId })).toThrow();
  });

  it.each([-1, 0.5, 2])('본선 범위 밖 수순 %s를 거부한다', ply => {
    expect(() => analysisPosition(19, [move(1, 'black', 0)], [], { type: 'mainline', ply })).toThrow('본선 수순');
  });

  it('존재하지 않는 부모와 순환 부모를 거부한다', () => {
    expect(() => analysisPosition(19, [], [], { type: 'variation', nodeId: firstId })).toThrow('분기의 부모');
    const first = node(firstId, 1, { type: 'variation', nodeId: secondId }, 'black', 0);
    const second = node(secondId, 2, { type: 'variation', nodeId: firstId }, 'white', 1);
    expect(() => analysisPosition(19, [], [first, second], { type: 'variation', nodeId: firstId })).toThrow('분기의 부모');
    expect(() => analysisPosition(19, [], [first], { type: 'variation', nodeId: firstId })).toThrow('분기의 부모');
  });

  it('저장된 분기의 차례와 점유 교차점도 실제 규칙으로 검증한다', () => {
    const mainline = [move(1, 'black', 0)];
    for (const branch of [
      node(firstId, 1, { type: 'mainline', ply: 1 }, 'black', 1),
      node(firstId, 1, { type: 'mainline', ply: 1 }, 'white', 0),
    ]) expect(() => analysisPosition(19, mainline, [branch], { type: 'variation', nodeId: firstId })).toThrow();
  });
});
