import { describe, expect, it } from 'vitest';
import { displayClock, timeControlLabel } from '../../src/web/clock-display.ts';

describe('피셔 시계 표시', () => {
  it.each([
    [null, '기록 없음'], [-1, '0:00'], [0, '0:00'], [1, '0:01'],
    [999, '0:01'], [1000, '0:01'], [1001, '0:02'], [59000, '0:59'],
    [59001, '1:00'], [60000, '1:00'], [10800000, '180:00'],
  ])('%s ms를 %s로 표시한다', (ms, text) => {
    expect(displayClock(ms)).toBe(text);
  });
  it('기본 시간을 넘는 증가 시간을 잘라내지 않는다', () => {
    expect(displayClock(605000)).toBe('10:05');
  });
  it('과거 턴 시계와 커스텀 피셔 설정을 구분한다', () => {
    expect(timeControlLabel({ kind: 'fischer', baseMs: 65000, incrementMs: 3000 })).toBe('피셔 1:05 + 3초');
    expect(timeControlLabel({ kind: 'legacy-turn', turnMs: 60000 })).toBe('과거 기록 · 턴당 60초');
  });
});
