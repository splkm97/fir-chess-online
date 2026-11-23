// Embedded so tsc's production output needs no source-tree or SQL-file copy.
export const SCHEMA_VERSION = 1;
export const SCHEMA_SQL = `
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  black_session TEXT NOT NULL REFERENCES sessions(id),
  white_session TEXT REFERENCES sessions(id),
  status TEXT NOT NULL CHECK(status IN ('waiting','active','paused','finished','aborted')),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  CHECK(black_session IS NOT white_session)
) STRICT;
CREATE INDEX rooms_black ON rooms(black_session);
CREATE INDEX rooms_white ON rooms(white_session);
CREATE INDEX rooms_expiry ON rooms(status, created_at, ended_at);
CREATE TABLE command_receipts (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  command_id TEXT NOT NULL,
  request TEXT NOT NULL,
  applied_revision INTEGER NOT NULL,
  PRIMARY KEY(room_code, session_id, command_id)
) STRICT;
`;
