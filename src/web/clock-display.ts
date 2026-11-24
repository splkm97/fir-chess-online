import type { RoomSnapshot } from '../protocol/messages.ts';

export function displayClock(ms: number | null): string {
  if (ms === null) return '기록 없음';
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function timeControlLabel(control: RoomSnapshot['timeControl']): string {
  return control.kind === 'fischer'
    ? `피셔 ${displayClock(control.baseMs)} + ${control.incrementMs / 1000}초`
    : '과거 기록 · 턴당 60초';
}
