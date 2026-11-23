import { useRoom, isTerminal } from './useRoom.ts';
import { actionLabel } from './labels.ts';
import { cellLabel } from '../game/types.ts';
import WaitingRoom from './WaitingRoom.tsx';
import MatchStatus from './MatchStatus.tsx';
import Match from './Match.tsx';
interface Props { code: string; onLobby: () => void }
export default function Room({ code, onLobby }: Props) {
  const { room, receivedAt, connection, pending, error, send, retryPending, retryConnection } = useRoom(code);
  const connectionLabel = { connecting: '연결 중', connected: '실시간 연결됨', reconnecting: '재접속 중 · 마지막 확정 상태 표시', replaced: '다른 탭에서 연결했습니다. 이 탭의 자동 재접속을 중지했습니다.', closed: '연결이 종료되었습니다.', finished: '경기가 종료되었습니다.' }[connection];
  return <>
    <div className={`connection-banner ${connection}`} role="status"><span className="connection-dot" aria-hidden="true" />{connectionLabel}</div>
    {connection === 'replaced' && <p className="pause-message">이 브라우저의 다른 탭에서 계속하세요. 이 탭은 같은 자리를 빼앗기 위해 자동으로 연결하지 않습니다.</p>}
    {error && <div className="error-message" role="alert"><p>{error}</p></div>}
    {pending && connection === 'connected' && <button type="button" onClick={retryPending}>같은 요청 다시 확인</button>}
    {connection === 'closed' && <div className="button-row"><button type="button" onClick={retryConnection}>다시 연결</button><button type="button" onClick={onLobby}>로비로</button></div>}
    {!room && <section className="panel loading-panel" aria-busy={connection === 'connecting' || connection === 'reconnecting'}><h2>방 {code}</h2><p>{connection === 'closed' ? '방 정보를 불러오지 못했습니다. 연결을 다시 시도하거나 방 코드를 확인하세요.' : '서버에서 참가자와 마지막 보드를 불러오고 있습니다.'}</p><div className="loading-placeholder" aria-hidden="true" /></section>}
    {room?.status === 'waiting' && <WaitingRoom room={room} canReady={connection === 'connected'} pending={Boolean(pending)} onReady={() => { send({ type: 'ready' }, room.revision); }} />}
    {room && room.status !== 'waiting' && <>
      <MatchStatus room={room} receivedAt={receivedAt} />
      {pending?.type === 'action' && <div className="pending-summary" role="status"><strong>확인 중: {actionLabel(pending.action)}</strong>{pending.claimedLines.length > 0 && <p>보호 구간: {pending.claimedLines.map(line => line.cells.map(cellLabel).join(' · ')).join(' / ')}</p>}<p className="small">응답이 오거나 최신 상태를 확인할 때까지 이 요청을 보관합니다.</p></div>}
      <Match room={room} enabled={connection === 'connected'} pending={pending} onAction={(action, claimedLines) => send({ type: 'action', action, claimedLines }, room.revision)} />
      {isTerminal(room) && <section className="result-actions"><p>이 보드는 마지막 확정 기록입니다. 새 방에서 다시 만날 수 있습니다.</p><button type="button" className="primary" onClick={onLobby}>새 방 만들기로 이동</button></section>}
    </>}
  </>;
}
