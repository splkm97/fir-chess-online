import { useEffect, useRef } from 'react';
import type { RoomSnapshot } from '../protocol/messages.ts';
import { colorName, resultReason } from './labels.ts';
interface Props { room: RoomSnapshot; elapsed: number }
const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
export default function MatchStatus({ room, elapsed }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (room.status === 'finished' || room.status === 'aborted') heading.current?.focus({ preventScroll: true });
  }, [room.status]);
  const turn = seconds(room.turnRemainingMs - (room.status === 'active' ? elapsed : 0));
  const game = room.game;
  let title = '경기 준비 중';
  if (room.status === 'aborted') title = '경기 중단 · 승패 없음';
  else if (game?.status === 'finished') title = `${colorName[game.winner]} 승리`;
  else if (game?.status === 'playing') title = `${colorName[game.turn]}의 차례`;
  return <section className="match-status" aria-label="경기 상태">
    <div className="turn-heading"><div><p className="eyebrow">방 {room.code} · 나는 {colorName[room.you]}</p><h2 ref={heading} tabIndex={-1} aria-live="polite">{title}</h2></div>{game?.status === 'playing' && room.status !== 'aborted' && <div className={`turn-clock${turn <= 10 ? ' urgent' : ''}`} role="timer" aria-label={`남은 턴 시간 ${turn}초`}><strong>{turn}</strong><span>초{room.status === 'paused' ? ' · 일시 정지' : ''}</span></div>}</div>
    {game?.status === 'finished' && room.status !== 'aborted' && <p className="result-message" role="status">{resultReason[game.reason]}</p>}
    {room.status === 'aborted' && <p className="error-message" role="status">{room.abortReason === 'server-interrupted' ? '서버가 재시작되어 경기를 중단했습니다. 마지막 확정 보드는 보존되며 승자는 없습니다.' : '두 사람의 재접속 대기 시간이 동시에 끝났습니다. 승자 없이 경기를 중단했습니다.'}</p>}
    {room.status === 'paused' && <p className="pause-message" role="status">연결 끊김으로 경기 일시 정지. 턴 시간은 멈춰 있습니다. 두 사람이 모두 돌아오면 이어집니다.</p>}
  </section>;
}
