import type { RoomSnapshot } from '../protocol/messages.ts';
import type { Color } from '../game/types.ts';
import { CHESS_KINDS } from '../game/types.ts';
import { colorName, pieceName } from './labels.ts';
interface Props { room: RoomSnapshot; color: Color; elapsed: number }
export default function PlayerResources({ room, color, elapsed }: Props) {
  const player = room.players[color], game = room.game, supply = game?.players[color];
  const own = color === room.you;
  const budget = Math.max(0, Math.ceil((room.disconnectRemainingMs[color] - (room.status === 'paused' && player && !player.connected ? elapsed : 0)) / 1000));
  return <article className={`player-status ${own ? 'own-status' : 'opponent-status'}${game?.status === 'playing' && game.turn === color ? ' current-player' : ''}`} aria-label={`${colorName[color]} 자원`}>
    <h2><span className={`seat-stone ${color}`} aria-hidden="true" />{colorName[color]} · {player?.nickname ?? '빈 자리'}{own && <span className="small"> (나)</span>}</h2>
    {game && supply && <>
      <dl className="resource-totals"><div><dt>식량</dt><dd>{supply.food} / 5</dd></div><div><dt>공급 군사</dt><dd>{supply.soldiersInReserve}</dd></div><div><dt>완성 줄</dt><dd>{game.completedLines[color].length} / 2</dd></div></dl>
      {(!own || room.status === 'finished' || room.status === 'aborted') && <p className="chess-inventory small">{CHESS_KINDS.map(kind => <span key={kind}>{pieceName[kind]} <strong>{supply.chess[kind] === 'reserve' ? '공급' : supply.chess[kind] === 'onBoard' ? '보드' : '제외'}</strong></span>)}</p>}
    </>}
    {room.status === 'paused' ? <p className="small muted">{player?.connected ? '연결됨' : '연결 끊김'} · 복귀 예산 {budget}초</p> : <details><summary className="small muted">연결 정보</summary><p className="small">{player?.connected ? '연결됨' : '연결 끊김'} · 복귀 예산 {budget}초</p></details>}
  </article>;
}
