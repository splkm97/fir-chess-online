import { useCallback, useEffect, useRef, useState } from 'react';
import { commandSchema, serverMessageSchema } from '../protocol/messages.ts';
import type { Command, RoomSnapshot } from '../protocol/messages.ts';
import type { Action, Line } from '../game/types.ts';
import { api, caughtMessage } from './api.ts';
import { errorText } from './labels.ts';
import { commandId } from './command-id.ts';


type Connection = 'connecting' | 'connected' | 'reconnecting' | 'replaced' | 'closed' | 'finished';
type Intent = { type: 'ready' } | { type: 'action'; action: Action; claimedLines: Line[] };
export const isTerminal = (room: RoomSnapshot) => room.status === 'finished' || room.status === 'aborted';
export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [pending, setPending] = useState<Command | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const current = useRef<RoomSnapshot | null>(null);
  const pendingRef = useRef<Command | null>(null);
  const ackRevision = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const synced = useRef(false);
  const key = `omokchess:pending:${code}`;
  const clearPending = useCallback(() => {
    try { sessionStorage.removeItem(key); } catch { setError('요청은 확인됐지만 임시 기록을 지우지 못했습니다. 브라우저 저장 설정을 확인해 주세요.'); }
    pendingRef.current = null; ackRevision.current = null; setPending(null);
  }, [key]);
  useEffect(() => {
    let alive = true, stopped = false, reconnects = 0;
    let timer: number | undefined;
    const controller = new AbortController();
    current.current = null; synced.current = false; ackRevision.current = null;
    setRoom(null); setConnection('connecting'); setError(null);
    try {
      const raw = sessionStorage.getItem(key);
      const parsed = raw ? commandSchema.safeParse(JSON.parse(raw)) : null;
      pendingRef.current = parsed?.success ? parsed.data : null;
      setPending(pendingRef.current);
      if (raw && !parsed?.success) { sessionStorage.removeItem(key); setError('미확정 요청 기록이 손상되어 전송하지 않았습니다. 최신 보드를 확인해 주세요.'); }
    } catch { pendingRef.current = null; setPending(null); setError(errorText('STORAGE_ERROR')); }
    function accept(next: RoomSnapshot) {
      if (!alive || next.code !== code || (current.current && next.revision < current.current.revision)) return;
      current.current = next; setRoom(next); setReceivedAt(performance.now());
      if (ackRevision.current !== null && next.revision >= ackRevision.current) clearPending();
      if (isTerminal(next)) {
        stopped = true; synced.current = false; clearPending(); setConnection('finished');
        socketRef.current?.close(1000, 'FINISHED');
      }
    }
    function resend(socket: WebSocket) {
      const command = pendingRef.current;
      if (command && socket.readyState === WebSocket.OPEN && ackRevision.current === null) socket.send(JSON.stringify(command));
    }
    function connect() {
      if (!alive || stopped) return;
      synced.current = false;
      setConnection(reconnects ? 'reconnecting' : 'connecting');
      const url = new URL(`/api/rooms/${encodeURIComponent(code)}/socket`, location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url); socketRef.current = socket;
      socket.onmessage = event => {
        if (!alive || socketRef.current !== socket || stopped) return;
        let message: unknown;
        try { message = JSON.parse(String(event.data)); } catch { setError(errorText('INVALID_MESSAGE')); stopped = true; socket.close(1002); return; }
        const parsed = serverMessageSchema.safeParse(message);
        if (!parsed.success) { setError(errorText('INVALID_MESSAGE')); stopped = true; socket.close(1002); return; }
        const value = parsed.data;
        if (value.type === 'snapshot') {
          accept(value.room);
          if (!stopped) { const first = !synced.current; synced.current = true; reconnects = 0; setConnection('connected'); if (first) resend(socket); }
        } else if (value.type === 'ack') {
          if (value.commandId !== pendingRef.current?.commandId) return;
          ackRevision.current = value.appliedRevision;
          if (current.current && current.current.revision >= value.appliedRevision) clearPending();
        } else {
          setError(errorText(value.code));
          if (value.commandId && value.commandId === pendingRef.current?.commandId && value.code !== 'SERVER_ERROR') {
            clearPending(); synced.current = false; setConnection('connecting');
            void api.room(code, controller.signal).then(next => {
              accept(next);
              if (alive && !stopped && socketRef.current === socket && socket.readyState === WebSocket.OPEN) { synced.current = true; setConnection('connected'); }
            }).catch(reason => { if (alive) { setError(caughtMessage(reason)); socket.close(4000, 'RESYNC'); } });
          }
        }
      };
      socket.onerror = () => { if (alive && !stopped) setConnection('reconnecting'); };
      socket.onclose = event => {
        if (!alive || socketRef.current !== socket) return;
        synced.current = false;
        if (event.code === 4001) { stopped = true; setConnection('replaced'); return; }
        if (stopped || event.code === 1000) { stopped = true; setConnection(current.current && isTerminal(current.current) ? 'finished' : 'closed'); return; }
        setConnection('reconnecting');
        timer = window.setTimeout(connect, Math.min(1000 * 2 ** reconnects++, 10000));
      };
    }
    void api.room(code, controller.signal).then(next => { if (!alive) return; accept(next); if (!stopped) connect(); }).catch(reason => {
      if (alive) { setError(caughtMessage(reason)); setConnection('closed'); }
    });
    return () => { alive = false; stopped = true; controller.abort(); clearTimeout(timer); socketRef.current?.close(1000, 'LEAVING'); socketRef.current = null; };
  }, [code, key, clearPending, attempt]);
  function send(intent: Intent, expectedRevision: number): boolean {
    const latest = current.current, socket = socketRef.current;
    if (!latest || !synced.current || !socket || socket.readyState !== WebSocket.OPEN || pendingRef.current || isTerminal(latest)) return false;
    if (latest.revision !== expectedRevision) { setError(errorText('STALE_REVISION')); return false; }
    if (intent.type === 'ready' ? latest.status !== 'waiting' : latest.status !== 'active' || latest.game?.status !== 'playing' || latest.game.turn !== latest.you) return false;
    let command: Command;
    try {
      command = { ...intent, protocolVersion: 2, commandId: commandId(), expectedRevision: latest.revision };
      sessionStorage.setItem(key, JSON.stringify(command));
    } catch { setError(errorText('STORAGE_ERROR')); return false; }
    pendingRef.current = command; ackRevision.current = null; setPending(command); setError(null);
    try { socket.send(JSON.stringify(command)); } catch { setError('전송이 끊겼습니다. 재연결하면 같은 요청을 확인합니다.'); socket.close(4000, 'RETRY'); }
    return true;
  }
  function retryPending() {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && synced.current && pendingRef.current) {
      setError(null);
      try { socket.send(JSON.stringify(pendingRef.current)); } catch { socket.close(4000, 'RETRY'); }
    }
  }
  return { room, receivedAt, connection, pending, error, send, retryPending, retryConnection: () => setAttempt(value => value + 1) };
}
