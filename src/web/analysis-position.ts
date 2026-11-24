import type { AnalysisNode, AnalysisParent, MoveRecord } from '../protocol/records.ts';
import type { BoardSize } from '../game/types.ts';
import { replayMoves } from '../game/replay.ts';
import type { ReplayMove } from '../game/replay.ts';

export function analysisPosition(size: BoardSize, mainline: readonly MoveRecord[], nodes: readonly AnalysisNode[], parent: AnalysisParent) {
  const branch: AnalysisNode[] = [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visited = new Set<string>();
  let at = parent;
  while (at.type === 'variation') {
    const node = byId.get(at.nodeId);
    if (!node || visited.has(node.id)) throw new Error('저장된 분기의 부모를 확인할 수 없습니다.');
    visited.add(node.id); branch.push(node); at = node.parent;
  }
  if (!Number.isInteger(at.ply) || at.ply < 0 || at.ply > mainline.length) throw new Error('본선 수순을 확인할 수 없습니다.');
  const path: ReplayMove[] = mainline.slice(0, at.ply);
  path.push(...branch.reverse());
  return { game: replayMoves(size, path), lastAction: path.at(-1)?.action ?? null, rootPly: at.ply };
}
