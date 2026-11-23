# Server Tasks 5–8, 13 report

Status: DONE_WITH_CONCERNS — assigned implementation and focused tests complete; parent-owned typecheck/build/browser integration remains unverified here.

## Scope and implementation

Changed `src/server/app.ts`; added `src/server/{clock,schema,store,session,lobby,match,socket}.ts`, `tests/helpers/server.ts`, and `tests/server/{store,session,lobby,match,socket,recovery,security}.test.ts`. Existing config/main entry points remain compatible. No dependencies, shared game/protocol/web files, root config, or commits changed.

- Concrete SQLite store: WAL, FK constraints, schema version 1, prepared statements, versioned JSON validation, CAS revision updates and receipt insert in one transaction. Actual SQLite failure triggers prove rollback.
- SQL is embedded only in `schema.ts`; tsc emits the constant with server code. No runtime source lookup or SQL asset copying required. Parent approved this packaging decision.
- 32-byte opaque cookies, SHA-256-only DB storage, HttpOnly/SameSite=Lax/Path=/ and production Secure, seven-day renewable sessions, active-match retention, strict nickname and request validation.
- Twelve-character Crockford invitations, two seats, member-only snapshots, idempotent create/join/readiness, single ongoing room membership, 30-minute waiting expiration and seven-day result/receipt cleanup.
- Server-authoritative engine commands and full schema-valid snapshots; monotonic 60-second deadlines, cumulative independent 180-second disconnect budgets, preserved paused turn time, earliest-deadline priority and simultaneous-expiry abort.
- Authenticated/Origin-checked real WebSockets; 16KiB frame/body limits, 1MiB backpressure cutoff, 5-second ping/10-second missing-pong detection, generation-safe 4001/REPLACED handling, persisted receipts before ACK, shutdown socket/timer/DB cleanup.
- Startup recovery atomically aborts active/paused games without winner, preserves final results/boards/receipts and clears waiting connectivity/readiness. Built-module-relative static hosting keeps production independent of cwd.
- Fixed-window limits: 30 room mutation attempts/session/minute, 120 POST attempts/actual-IP/minute, 30 session creation attempts/actual-IP/minute. Forwarded IP headers are not trusted.

## Actual verification

1. `mise exec node@26.13.1 -- npm test -- tests/server`
   - **7 files passed, 48 tests passed**, duration 673ms, successful command completion.
   - Real temporary SQLite files; real ephemeral-port sockets; fake clock exact boundaries and no 60/180-second sleeps; isolated child process SIGKILL/restart/SIGTERM recovery; no lingering runner handles observed.
2. Tightened two transport tests afterward to avoid overstating race evidence: an old client holds the replacement close frame and sends an actual late frame; a post-commit listener terminates the actual server socket before ACK dispatch rather than merely leaving an ACK unread.
   - `mise exec node@26.13.1 -- npm test -- tests/server/socket.test.ts -t 'replaces a connection|replays a committed command'`
   - **2 passed, 6 skipped**, duration 211ms. Server implementation did not change after the first full suite verification.
3. Final acceptance after every source/test edit: `mise exec node@26.13.1 -- npm test -- tests/server`
   - **7 files passed, 48 tests passed**, duration 636ms, successful command completion.

Evidence covers 59,999/60,000/60,001ms turn boundaries, 179,999/180,000ms and cumulative disconnect boundaries, wall-clock jumps, delayed callbacks, both-disconnected abort, real two-line victory, duplicate/reused/stale IDs, failed commit/no ACK, actual commit-before-ACK connection loss, old-generation late frame/close, malformed/binary/oversized messages, real paused-consumer backpressure, missing heartbeat, cookie secrecy, unauthorized upgrade/member forgery/Origin checks, expiry and proxy-spoof rate limits.

## Remaining integration proof / concerns

- Parent must run the coordinated TypeScript check, built production startup/static hosting, full integration and browser/E2E acceptance. None claimed passed here.
- LSP references for `buildApp` were attempted; tool reported no recognized TS workspace/server despite repository config. No LSP-backed refactor claimed.
- No shared wire gap identified; fixed HTTP and WS schemas are used unchanged.
- Model selection is unsupported by dispatch API. No explicit model selection or cost claim was made; runtime reports `openai-codex/gpt-6-astra`.
