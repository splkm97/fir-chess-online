import { useEffect, useState } from 'react';
import { roomCodeSchema } from '../protocol/messages.ts';
import type { SessionView } from '../protocol/messages.ts';
import { api, ApiError, caughtMessage } from './api.ts';
import Lobby from './Lobby.tsx';
import Room from './Room.tsx';

function invitationCode() {
  const match = /^\/room\/([^/]+)\/?$/.exec(location.pathname);
  return match?.[1]?.toUpperCase() ?? null;
}
export default function App() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [invitation, setInvitation] = useState(invitationCode);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigation, setNavigation] = useState(0);
  function enterRoom(next: string) {
    history.replaceState(null, '', `/room/${next}`);
    setCode(next); setInvitation(null); setError(null);
    setSession(current => current ? { ...current, roomCode: next } : current);
  }
  useEffect(() => {
    const onPopState = () => { setCode(null); setNavigation(value => value + 1); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true); setError(null);
    const invited = invitationCode(); setInvitation(invited);
    void api.session(controller.signal).then(async found => {
      if (!alive) return;
      setSession(found);
      if (invited) {
        const valid = roomCodeSchema.safeParse(invited);
        if (!valid.success) { setError('초대 링크의 방 코드가 올바르지 않습니다. 12자리 코드를 확인해 주세요.'); return; }
        const joined = await api.joinRoom(valid.data);
        if (alive) enterRoom(joined.code);
      } else if (found.roomCode) enterRoom(found.roomCode);
    }).catch(reason => {
      if (!alive) return;
      if (reason instanceof ApiError && reason.status === 401) setSession(null);
      else setError(caughtMessage(reason));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; controller.abort(); };
  }, [navigation]);
  async function start(nickname: string) {
    setBusy(true); setError(null);
    try {
      const found = await api.startSession(nickname); setSession(found);
      if (invitation) {
        const valid = roomCodeSchema.safeParse(invitation);
        if (!valid.success) { setError('초대 링크의 방 코드를 확인해 주세요.'); return; }
        enterRoom((await api.joinRoom(valid.data)).code);
      } else if (found.roomCode) enterRoom(found.roomCode);
    } catch (reason) { setError(caughtMessage(reason)); }
    finally { setBusy(false); }
  }
  async function openRoom(joinCode?: string) {
    setBusy(true); setError(null);
    try { enterRoom((await (joinCode ? api.joinRoom(joinCode) : api.createRoom())).code); }
    catch (reason) { setError(caughtMessage(reason)); }
    finally { setBusy(false); }
  }
  function lobby() {
    history.pushState(null, '', '/'); setCode(null); setInvitation(null); setError(null);
    setSession(current => current ? { ...current, roomCode: null } : current);
  }
  return <main className="app-shell">
    <header className={`app-header${code ? ' compact' : ''}`}><div><p className="eyebrow">OMOK / CHESS</p><h1>오목체스</h1></div><p>체스의 움직임으로,<br className="mobile-break" /> 오목의 두 줄을.</p></header>
    {loading ? <section className="panel loading-panel" aria-busy="true"><h2>자리를 확인하고 있습니다.</h2><p role="status">이 브라우저의 세션과 참가 중인 방을 불러옵니다.</p><div className="loading-placeholder" aria-hidden="true" /></section> : code ? <Room key={code} code={code} onLobby={lobby} /> : <Lobby session={session} busy={busy} error={error} invitation={invitation} onStart={nickname => { void start(nickname); }} onCreate={() => { void openRoom(); }} onJoin={next => { void openRoom(next); }} onResume={enterRoom} />}
    <footer className="app-footer"><span>군사 20 · 체스 4 · 승리까지 두 줄</span><span>서버 확정 방식 · 한 턴 60초</span></footer>
  </main>;
}
