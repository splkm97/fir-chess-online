// Embedded so tsc's production output needs no source-tree or SQL-file copy.
export const SCHEMA_VERSION = 2;
export const RECORDS_SQL = `
CREATE TABLE match_moves (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  ply INTEGER NOT NULL CHECK(ply > 0),
  applied_revision INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  PRIMARY KEY(room_code, ply),
  UNIQUE(room_code, applied_revision)
) STRICT;
CREATE TABLE analysis_nodes (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  owner_session TEXT NOT NULL REFERENCES sessions(id),
  node_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  parent_node TEXT,
  parent_ply INTEGER,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  PRIMARY KEY(room_code, owner_session, node_id),
  UNIQUE(room_code, owner_session, sequence),
  FOREIGN KEY(room_code, owner_session, parent_node) REFERENCES analysis_nodes(room_code, owner_session, node_id),
  CHECK((parent_node IS NULL AND parent_ply IS NOT NULL AND parent_ply >= 0) OR (parent_node IS NOT NULL AND parent_ply IS NULL))
) STRICT;
CREATE INDEX rooms_records_black ON rooms(black_session, ended_at DESC, code DESC);
CREATE INDEX rooms_records_white ON rooms(white_session, ended_at DESC, code DESC);
`;
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
${RECORDS_SQL}`;
