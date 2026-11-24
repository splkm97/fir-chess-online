import { useRef, useState } from 'react';
import type { RoomSnapshot } from '../protocol/messages.ts';
import { COLORS } from '../game/types.ts';
import { colorName } from './labels.ts';
import { timeControlLabel } from './clock-display.ts';
interface Props { room: RoomSnapshot; canReady: boolean; pending: boolean; onReady: () => void }
export default function WaitingRoom({ room, canReady, pending, onReady }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const link = `${location.origin}/room/${room.code}`;
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); linkInput.current?.focus(); linkInput.current?.select(); }
  }
  const ready = room.players[room.you]?.ready ?? false;
  return <section className="panel waiting-room" aria-labelledby="waiting-title">
    <p className="eyebrow">방 {room.code}</p><h2 id="waiting-title">한 사람을 기다리는 자리</h2>
    <p>나는 <strong>{colorName[room.you]}</strong>입니다. 두 사람 모두 연결한 뒤 준비를 마치면 시작합니다.</p>
    <p className="time-control-summary">19 × 19 · {timeControlLabel(room.timeControl)} · 시작 후 변경할 수 없습니다.</p>
    <div className="seat-list">{COLORS.map(color => {
      const player = room.players[color];
      return <article className="seat" key={color} aria-label={`${colorName[color]} 자리`}><span className={`seat-stone ${color}`} aria-hidden="true" /><div><h3>{colorName[color]} · {player?.nickname ?? '상대 기다리는 중'}{color === room.you && <span className="small muted"> (나)</span>}</h3><p>{player ? `${player.connected ? '연결됨' : '연결 끊김'} · ${player.ready ? '준비됨' : '준비 전'}` : '초대 링크로 친구를 불러 주세요.'}</p></div></article>;
    })}</div>
    <label htmlFor="invite-link">초대 링크</label><div className="invite-control"><input ref={linkInput} id="invite-link" value={link} readOnly onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copy()}>초대 링크 복사</button></div>
    <p className="small muted" role="status">{copyError ? '자동 복사를 사용할 수 없습니다. 선택된 링크를 직접 복사해 주세요.' : copied ? '초대 링크를 복사했습니다.' : '방 코드만 전달해도 입장할 수 있습니다. 같은 브라우저의 다른 탭은 같은 자리입니다.'}</p>
    <button className="primary" type="button" disabled={!canReady || ready || pending} onClick={onReady}>{ready ? '준비됨' : '준비 완료'}</button>
    {pending && <p className="small" role="status">서버에서 준비 요청을 확인하고 있습니다.</p>}
  </section>;
}
