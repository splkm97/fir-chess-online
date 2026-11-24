import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGame, applyAction, previewAction } from '../../src/game/engine.ts';
import type { GameState } from '../../src/game/types.ts';
import { openStore } from '../../src/server/store.ts';
import { migrateV1 } from '../../src/server/migrations.ts';
import { createRecordsService } from '../../src/server/records.ts';
import { FakeClock } from '../helpers/server.ts';

const directories: string[] = [];
afterEach(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); directories.length = 0; });
const v1SQL = `
CREATE TABLE sessions(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL, expires_at INTEGER NOT NULL) STRICT;
CREATE TABLE rooms(code TEXT PRIMARY KEY, black_session TEXT NOT NULL REFERENCES sessions(id), white_session TEXT REFERENCES sessions(id), status TEXT NOT NULL CHECK(status IN ('waiting','active','paused','finished','aborted')), revision INTEGER NOT NULL CHECK(revision>=0), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), created_at INTEGER NOT NULL, ended_at INTEGER, CHECK(black_session IS NOT white_session)) STRICT;
CREATE INDEX rooms_black ON rooms(black_session); CREATE INDEX rooms_white ON rooms(white_session); CREATE INDEX rooms_expiry ON rooms(status,created_at,ended_at);
CREATE TABLE command_receipts(room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id), command_id TEXT NOT NULL, request TEXT NOT NULL, applied_revision INTEGER NOT NULL, PRIMARY KEY(room_code,session_id,command_id)) STRICT;
PRAGMA user_version=1;`;
function legacyFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'omokchess-v1-')); directories.push(directory);
  const path = join(directory, 'fixture.sqlite'), db = new Database(path), clock = new FakeClock();
  db.pragma('foreign_keys = ON'); db.exec(v1SQL);
  for (const id of ['black', 'white']) db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(id, id, id, clock.wallMs() + 604_800_000);
  return { db, path, clock };
}
function seed(db: Database.Database, status: 'waiting' | 'active' | 'paused' | 'finished' | 'aborted', code = '000000000001') {
  let game: GameState = createGame(20);
  const receipts: { session: string; id: string; request: string; revision: number }[] = [];
  let revision = 7;
  if (status !== 'waiting') {
    for (const at of [399, 300, 0, 302, 1, 304, 2, 306, 3, 308, 4]) {
      if (game.status !== 'playing') throw new Error('Premature fixture result');
      const actor = game.turn, action = { type: 'placeSoldier' as const, at }, preview = previewAction(game, actor, action);
      if (!preview.ok) throw new Error(preview.code);
      const result = applyAction(game, actor, action, preview.candidates);
      if (!result.ok) throw new Error(result.code);
      const id = randomUUID();
      revision += 3;
      receipts.push({ session: actor, id, revision, request: JSON.stringify({ protocolVersion: 1, type: 'action', commandId: id, expectedRevision: revision - 1, action, claimedLines: preview.candidates }) });
      game = result.state;
    }
  }
  if (status === 'finished') game = { boardSize: game.boardSize, board: game.board, players: game.players, completedLines: game.completedLines, status: 'finished', winner: 'black', reason: 'turn-timeout' };
  const { boardSize: _size, ...legacyGame } = game;
  const room = {
    version: 1, code, revision, status,
    players: { black: { sessionId: 'black', nickname: '흑', ready: true, connected: true }, white: { sessionId: 'white', nickname: '백', ready: true, connected: true } },
    game: status === 'waiting' ? null : legacyGame, deadlineMonoMs: 987654, turnRemainingMs: 43210,
    disconnectRemainingMs: { black: 170000, white: 180000 }, disconnectedSince: { black: status === 'paused' ? 123 : null, white: null },
    abortReason: status === 'aborted' ? 'both-disconnected' : null,
    createdAt: 1_799_999_900_000, endedAt: status === 'finished' || status === 'aborted' ? 1_800_000_000_000 : null,
  };
  db.prepare('INSERT INTO rooms VALUES(?,?,?,?,?,?,?,?)').run(code, 'black', 'white', status, revision, JSON.stringify(room), room.createdAt, room.endedAt);
  const readyId = randomUUID();
  db.prepare('INSERT INTO command_receipts VALUES(?,?,?,?,?)').run(code, 'black', readyId, JSON.stringify({ type: 'ready', protocolVersion: 1, commandId: readyId, expectedRevision: 1 }), 2);
  for (const receipt of receipts) db.prepare('INSERT INTO command_receipts VALUES(?,?,?,?,?)').run(code, receipt.session, receipt.id, receipt.request, receipt.revision);
  return { room, receipts, game };
}

describe('transactional v1 to v2 migration', () => {
  it.each(['active', 'paused', 'finished', 'aborted'] as const)('preserves %s legacy board, resources, protected lines, ownership and raw receipts', status => {
    const { db, path, clock } = legacyFixture(), original = seed(db, status);
    const raw = db.prepare('SELECT * FROM command_receipts ORDER BY applied_revision').all();
    migrateV1(db, clock.wallMs());
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(db.prepare('SELECT * FROM command_receipts ORDER BY applied_revision').all()).toEqual(raw);
    const migrated = db.prepare('SELECT * FROM rooms').all();
    migrateV1(db, clock.wallMs() + 1000);
    expect(db.prepare('SELECT * FROM rooms').all()).toEqual(migrated);
    db.close();
    const store = openStore(path), room = store.room(original.room.code)!;
    expect(room.game).toEqual(original.game);
    expect(room.game?.board[399]).toEqual({ color: 'black', kind: 'soldier' });
    expect(room.game?.completedLines.black).toHaveLength(1);
    expect(room).toMatchObject({ version: 2, historyStatus: 'reconstructed', historyError: null, moveCount: 11, clockAccuracy: 'unknown', clockRemainingMs: null, timeControl: { kind: 'legacy-turn', turnMs: 60000 }, players: { black: { sessionId: 'black' }, white: { sessionId: 'white' } } });
    if (status === 'active' || status === 'paused') expect(room).toMatchObject({ status: 'aborted', abortReason: 'server-interrupted', endedAt: clock.wallMs(), deadlineMonoMs: null });
    else expect(room).toMatchObject({ status, endedAt: original.room.endedAt, abortReason: original.room.abortReason });
    expect(store.moves(room.code, 0, 200)).toHaveLength(11);
    for (const move of store.moves(room.code, 0, 200)) expect(move).toMatchObject({ recordedAt: null, elapsedMs: null, clockAfterMs: null });
    const records = createRecordsService(store, clock);
    expect(records.append(room.code, 'white', { id: randomUUID(), parent: { type: 'mainline', ply: 1 }, action: { type: 'placeSoldier', at: 398 }, claimedLines: [] }).node.actor).toBe('white');
    store.close();
    const reopened = openStore(path); expect(reopened.room(room.code)).toEqual(room); reopened.close();
  });
  it('resets waiting rooms to default 19-board Fischer policy without treating ready receipts as moves', () => {
    const { db, path, clock } = legacyFixture(), original = seed(db, 'waiting');
    migrateV1(db, clock.wallMs()); db.close();
    const store = openStore(path), room = store.room(original.room.code)!;
    expect(room).toMatchObject({ status: 'waiting', game: null, timeControl: { kind: 'fischer', baseMs: 600000, incrementMs: 5000 }, clockRemainingMs: { black: 600000, white: 600000 }, historyStatus: 'native', moveCount: 0, lastMove: null, players: { black: { ready: false, connected: false }, white: { ready: false, connected: false } } });
    expect(store.moves(room.code, 0, 200)).toEqual([]); store.close();
  });
  it.each(['malformed', 'missing'] as const)('marks %s histories unavailable without erasing final board or receipts', corruption => {
    const { db, path, clock } = legacyFixture(), original = seed(db, 'finished');
    const last = original.receipts.at(-1)!;
    if (corruption === 'malformed') db.prepare('UPDATE command_receipts SET request=? WHERE command_id=?').run('{broken', last.id);
    else db.prepare('DELETE FROM command_receipts WHERE command_id=?').run(last.id);
    const raw = db.prepare('SELECT * FROM command_receipts ORDER BY applied_revision').all();
    migrateV1(db, clock.wallMs());
    expect(db.prepare('SELECT * FROM command_receipts ORDER BY applied_revision').all()).toEqual(raw); db.close();
    const store = openStore(path), room = store.room(original.room.code)!;
    expect(room.game).toEqual(original.game); expect(room.historyStatus).toBe('unavailable'); expect(room.historyError).toBeTruthy();
    expect(store.moves(room.code, 0, 200)).toEqual([]);
    const records = createRecordsService(store, clock);
    expect(records.download(room.code, 'black')).toMatchObject({ detail: { historyStatus: 'unavailable', finalState: original.game }, moves: [] });
    expect(() => records.moves(room.code, 'black', {})).toThrow('HISTORY_UNAVAILABLE');
    expect(() => records.append(room.code, 'black', { id: randomUUID(), parent: { type: 'mainline', ply: 0 }, action: { type: 'placeSoldier', at: 0 }, claimedLines: [] })).toThrow('HISTORY_UNAVAILABLE');
    store.close();
  });
  it('rolls schema, snapshots and version back on migration failure then allows a clean retry', () => {
    const { db, path, clock } = legacyFixture(); seed(db, 'active'); seed(db, 'finished', '000000000002');
    const original = db.prepare('SELECT * FROM rooms ORDER BY code').all();
    db.exec("CREATE TRIGGER reject_migration BEFORE UPDATE ON rooms WHEN NEW.code='000000000002' BEGIN SELECT RAISE(FAIL,'migration rejected'); END");
    expect(() => migrateV1(db, clock.wallMs())).toThrow('migration rejected');
    expect(() => openStore(path)).toThrow('migration rejected');
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(db.prepare('SELECT * FROM rooms ORDER BY code').all()).toEqual(original);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='match_moves'").get()).toBeUndefined();
    db.exec('DROP TRIGGER reject_migration'); migrateV1(db, clock.wallMs()); db.close();
    const store = openStore(path); expect(store.rooms()).toHaveLength(2); store.close();
  });
});
