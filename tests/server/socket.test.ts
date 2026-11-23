import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { httpFixture, peer, readyPeer, roomWithTwo } from '../helpers/server.ts';
import type { HttpFixture, Peer } from '../helpers/server.ts';
import type { Command } from '../../src/protocol/messages.ts';

let fixture: HttpFixture | undefined;
const peers: Peer[] = [];
afterEach(async () => { for (const client of peers) await client.close(); peers.length = 0; await fixture?.close(); fixture = undefined; });
async function setup(start = true) {
  fixture = await httpFixture(); const f = fixture;
  const address = await f.app.listen({ port: 0, host: '127.0.0.1' });
  const room = await roomWithTwo(f.app);
  const black = await peer(address, room.code, room.black), white = await peer(address, room.code, room.white);
  peers.push(black, white);
  await black.next(message => message.type === 'snapshot' && !!message.room.players.white?.connected);
  if (start) {
    await readyPeer(black, f.store.room(room.code)!.revision);
    await readyPeer(white, f.store.room(room.code)!.revision);
    await black.next(message => message.type === 'snapshot' && message.room.status === 'active');
  }
  return { f, address, room, black, white };
}
function soldier(revision: number, at = 0): Extract<Command, { type: 'action' }> {
  return { protocolVersion: 1, commandId: randomUUID(), expectedRevision: revision, type: 'action', action: { type: 'placeSoldier', at }, claimedLines: [] };
}
describe('real WebSocket transport', () => {
  it('starts two ready peers and broadcasts an authoritative committed action', async () => {
    const { f, room, black, white } = await setup();
    const command = soldier(f.store.room(room.code)!.revision);
    black.send(command);
    const ack = await black.next(message => message.type === 'ack' && message.commandId === command.commandId);
    expect(ack).toMatchObject({ appliedRevision: command.expectedRevision + 1 });
    const snapshot = await white.next(message => message.type === 'snapshot' && message.room.game?.board[0]?.color === 'black');
    expect(snapshot).toMatchObject({ room: { game: { turn: 'white', players: { black: { food: 1, soldiersInReserve: 19 } } } } });
    expect(f.store.receipt(room.code, f.store.room(room.code)!.players.black.sessionId, command.commandId)).toBeDefined();
  });
  it('replaces a connection with 4001 and makes late old close/message inert', async () => {
    const { f, room, address, black } = await setup();
    const revision = f.store.room(room.code)!.revision;
    // Hold the old connection's close frame so it can send a real late frame.
    black.socket.pause();
    const closed = once(black.socket, 'close');
    const replacement = await peer(address, room.code, room.black); peers.push(replacement);
    black.send(soldier(revision, 7));
    black.socket.resume();
    const [code, reason] = await closed;
    expect(code).toBe(4001); expect(String(reason)).toBe('REPLACED');
    expect(f.store.room(room.code)).toMatchObject({ status: 'active', revision, players: { black: { connected: true } } });
    expect(f.store.room(room.code)?.game?.board[7]).toBeNull();
    const command = soldier(revision); replacement.send(command);
    await replacement.next(message => message.type === 'ack' && message.commandId === command.commandId);
    expect(f.store.room(room.code)?.game?.players.black.food).toBe(1);
  });
  it('replays a committed command after ACK loss and rejects changed payload reuse', async () => {
    const { f, room, address, black, white } = await setup();
    const command = soldier(f.store.room(room.code)!.revision);
    const serverBlack = [...f.app.websocketServer.clients][0];
    if (!serverBlack) throw new Error('Black connection missing');
    // A post-commit listener drops the actual server socket before command() returns its ACK.
    const unsubscribe = f.match.subscribe(code => {
      if (code === room.code && f.store.room(code)?.game?.board[0]?.color === 'black') serverBlack.terminate();
    });
    const disconnected = once(black.socket, 'close');
    const committed = white.next(message => message.type === 'snapshot' && message.room.game?.board[0]?.color === 'black');
    black.send(command); await committed; await disconnected; unsubscribe();
    expect(black.messages.some(message => message.type === 'ack' && message.commandId === command.commandId)).toBe(false);
    const replacement = await peer(address, room.code, room.black); peers.push(replacement);
    replacement.send(command);
    expect(await replacement.next(message => message.type === 'ack' && message.commandId === command.commandId)).toMatchObject({ appliedRevision: command.expectedRevision + 1 });
    replacement.send({ ...command, action: { type: 'placeSoldier', at: 1 } });
    expect(await replacement.next(message => message.type === 'error' && message.commandId === command.commandId)).toMatchObject({ code: 'COMMAND_ID_REUSED' });
    expect(f.store.room(room.code)?.game?.players.black.food).toBe(1);
    expect(f.store.room(room.code)?.game?.board[1]).toBeNull();
  });
  it('returns SERVER_ERROR rather than ACK and permits retry after a failed DB commit', async () => {
    const { f, room, black } = await setup();
    const db = new Database(join(f.directory, 'game.sqlite'));
    db.exec("CREATE TRIGGER fail_command BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(FAIL, 'receipt rejected'); END");
    const before = f.store.room(room.code), command = soldier(before!.revision);
    black.send(command);
    expect(await black.next(message => message.type === 'error' && message.commandId === command.commandId)).toMatchObject({ code: 'SERVER_ERROR' });
    expect(black.messages.some(message => message.type === 'ack' && message.commandId === command.commandId)).toBe(false);
    expect(f.store.room(room.code)).toEqual(before);
    db.exec('DROP TRIGGER fail_command'); db.close();
    black.send(command); await black.next(message => message.type === 'ack' && message.commandId === command.commandId);
    expect(f.store.room(room.code)?.game?.players.black.food).toBe(1);
  });
  it('rejects malformed JSON, unknown fields and oversized frames', async () => {
    const { f, room, black } = await setup();
    const revision = f.store.room(room.code)!.revision;
    black.socket.send('{broken');
    expect(await black.next(message => message.type === 'error')).toMatchObject({ code: 'INVALID_JSON' });
    black.socket.send(JSON.stringify({ ...soldier(revision), winner: 'black' }));
    expect(await black.next(message => message.type === 'error')).toMatchObject({ code: 'INVALID_COMMAND' });
    black.socket.send(Buffer.from('{}'));
    expect(await black.next(message => message.type === 'error')).toMatchObject({ code: 'INVALID_MESSAGE' });
    const closed = once(black.socket, 'close'); black.socket.send('x'.repeat(16_385));
    expect((await closed)[0]).toBe(1009);
    expect(f.store.room(room.code)?.game?.board.every(cell => cell === null)).toBe(true);
  });
  it('detects missing pong at 10 seconds and starts budget at server detection', async () => {
    const { f, room, address, black } = await setup();
    const oldClosed = once(black.socket, 'close');
    const silent = await peer(address, room.code, room.black, 'http://localhost', false); peers.push(silent); await oldClosed;
    const healthyServer = [...f.app.websocketServer.clients][0];
    if (!healthyServer) throw new Error('Healthy connection missing');
    const ping = once(silent.socket, 'ping'), pong = once(healthyServer, 'pong');
    f.clock.advance(5000);
    await Promise.all([ping, pong]);
    const closed = once(silent.socket, 'close'); f.clock.advance(5000); await closed;
    expect(f.store.room(room.code)).toMatchObject({ status: 'paused', disconnectedSince: { black: 10_000 }, disconnectRemainingMs: { black: 180_000 } });
  });
  it('bounds backpressure with a real paused consumer', async () => {
    const { f, room, black } = await setup();
    black.socket.pause();
    for (let count = 0; count < 10_000 && f.store.room(room.code)?.players.black.connected; count++) f.match.notify(room.code);
    expect(f.store.room(room.code)?.players.black.connected).toBe(false);
    expect(f.store.room(room.code)?.status).toBe('paused');
    black.socket.resume();
  });
  it('closes every socket and scheduled handle during shutdown', async () => {
    const { f, black, white } = await setup();
    const closes = [once(black.socket, 'close'), once(white.socket, 'close')];
    await f.app.close(); await Promise.all(closes);
    expect(f.clock.timerCount).toBe(0);
  });
});
