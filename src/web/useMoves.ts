import { useEffect, useRef, useState } from 'react';
import type { MoveRecord } from '../protocol/records.ts';
import { api, caughtMessage } from './api.ts';

export function useMoves(code: string, count: number) {
  const cache = useRef<{ code: string; moves: MoveRecord[] }>({ code, moves: [] });
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (cache.current.code !== code) { cache.current = { code, moves: [] }; setMoves([]); }
    setError(null);
    async function load() {
      let collected = cache.current.moves.slice();
      while (collected.length < count) {
        const page = await api.moves(code, collected.length, controller.signal);
        if (controller.signal.aborted) return;
        const fresh = page.moves.filter(move => move.ply > collected.length);
        if (!fresh.length || fresh.some((move, i) => move.ply !== collected.length + i + 1)) throw new Error('Invalid move sequence');
        collected = collected.concat(fresh);
        cache.current = { code, moves: collected }; setMoves(collected);
      }
    }
    void load().catch(reason => { if (!controller.signal.aborted) setError(caughtMessage(reason)); });
    return () => controller.abort();
  }, [code, count, attempt]);
  return { moves: cache.current.code === code ? moves : [], error, ready: cache.current.code === code && moves.length >= count, retry: () => setAttempt(value => value + 1) };
}
