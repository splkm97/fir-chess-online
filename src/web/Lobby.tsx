import { useState } from 'react';
import type { FormEvent } from 'react';
import { nicknameSchema, roomCodeSchema, timeControlInputSchema } from '../protocol/messages.ts';
import type { SessionView, TimeControlInput } from '../protocol/messages.ts';
interface Props {
  session: SessionView | null;
  busy: boolean;
  error: string | null;
  invitation: string | null;
  onStart: (nickname: string) => void;
  onCreate: (control: TimeControlInput) => void;
  onJoin: (code: string) => void;
  onResume: (code: string) => void;
}
export default function Lobby({ session, busy, error, invitation, onStart, onCreate, onJoin, onResume }: Props) {
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState(invitation ?? '');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [minutes, setMinutes] = useState('10');
  const [seconds, setSeconds] = useState('0');
  const [increment, setIncrement] = useState('5');
  function create(event: FormEvent) {
    event.preventDefault();
    const parsed = timeControlInputSchema.safeParse({ baseMs: (Number(minutes) * 60 + Number(seconds)) * 1000, incrementMs: Number(increment) * 1000 });
    if (!parsed.success) { setInvalid('기본 시간은 1초–180분, 수당 증가는 0–180초로 설정하세요.'); return; }
    setInvalid(null); onCreate(parsed.data);
  }
  function start(event: FormEvent) {
    event.preventDefault(); const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) { setInvalid('닉네임은 제어문자 없이 1–20자로 입력하세요.'); return; }
    setInvalid(null); onStart(parsed.data);
  }
  function join(event: FormEvent) {
    event.preventDefault(); const parsed = roomCodeSchema.safeParse(code.trim().toUpperCase());
    if (!parsed.success) { setInvalid('초대받은 12자리 영문·숫자 방 코드를 입력해 주세요.'); return; }
    setInvalid(null); onJoin(parsed.data);
  }
  return <div className="lobby-layout">
    <section className="panel lobby-panel" aria-busy={busy} aria-labelledby="lobby-title">
      <p className="eyebrow">친구와 두는 한 판</p>
      <h2 id="lobby-title">{session ? `${session.nickname}님, 어디서 시작할까요?` : '먼저, 이름을 알려 주세요.'}</h2>
      {invitation && <p className="invitation-note">초대받은 방 <strong>{invitation}</strong>{session ? '에 입장할 수 있습니다.' : '으로 이어집니다.'}</p>}
      {!session ? <form onSubmit={start}>
        <label htmlFor="nickname">닉네임</label>
        <input id="nickname" name="nickname" value={nickname} onChange={event => setNickname(event.target.value)} autoComplete="nickname" autoFocus required disabled={busy} aria-describedby="nickname-help" />
        <p id="nickname-help" className="small muted">1–20자. 로그인 없이 이 브라우저에서 자리를 기억합니다.</p>
        <button className="primary wide" type="submit" disabled={busy}>시작하기</button>
      </form> : <>
        {session.roomCode && <button className="wide" type="button" disabled={busy} onClick={() => onResume(session.roomCode!)}>참가 중인 방으로 돌아가기</button>}
        <form onSubmit={create}>
          <fieldset className="time-control"><legend>피셔 시간 설정</legend>
            <label>기본 분<input type="number" min="0" max="180" step="1" required value={minutes} onChange={event => setMinutes(event.target.value)} disabled={busy} /></label>
            <label>기본 초<input type="number" min="0" max="59" step="1" required value={seconds} onChange={event => setSeconds(event.target.value)} disabled={busy} /></label>
            <label>수당 증가 초<input type="number" min="0" max="180" step="1" required value={increment} onChange={event => setIncrement(event.target.value)} disabled={busy} /></label>
          </fieldset>
          <p className="small muted">각자의 남은 시간을 이어 쓰며, 확정한 수마다 증가 시간이 더해집니다.</p>
          <button className="primary wide" type="submit" disabled={busy}>방 만들기</button>
        </form>
        <a className="records-link" href="/records">내 기보</a>
        <div className="form-divider">또는 초대받은 방으로</div>
        <form onSubmit={join}>
          <label htmlFor="room-code">방 코드</label>
          <input id="room-code" name="room-code" className="code-input" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" autoComplete="off" spellCheck={false} required disabled={busy} />
          <button className="wide" type="submit" disabled={busy}>입장하기</button>
        </form>
      </>}
      {busy && <p role="status" className="loading-line">서버에서 확인하고 있습니다…</p>}
      {(invalid || error) && <p className="error-message" role="alert">{invalid ?? error}</p>}
    </section>
    <aside className="lobby-rules" aria-labelledby="rules-title">
      <h2 id="rules-title">다섯을 지키고,<br />두 줄을 완성하세요.</h2>
      <ol className="rules-list"><li><strong>군사로 식량을 모으세요.</strong><span>군사 배치마다 식량 +1. 최대 5개까지 모을 수 있습니다.</span></li><li><strong>체스로 길을 만드세요.</strong><span>배치에 식량 3, 이동에 2. 보호되지 않은 상대 기물을 잡을 수 있습니다.</span></li><li><strong>완성한 줄은 안전합니다.</strong><span>군사와 체스를 섞어 다섯을 잇고, 두 줄을 만들면 승리합니다.</span></li></ol>
      <p className="small muted">19 × 19 · 피셔 시계 · 흑 선공 · 2인 대전<br />연결이 끊기면 시계가 멈추며, 각자 누적 3분 안에 돌아와야 합니다.</p>
    </aside>
  </div>;
}
