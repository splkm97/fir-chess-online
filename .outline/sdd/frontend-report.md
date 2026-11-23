# Frontend implementation report

Status: DONE_WITH_CONCERNS — Tasks 9–12 implementation is present; browser, integration and accessibility acceptance remains for the parent. No commits, dependency changes, root configuration edits, or changes to server/game/protocol files.

Requested model selection: unsupported by dispatch tool. No explicitly selected model or cost claim.

## Files

- Updated `src/web/App.tsx`, `src/web/styles.css`.
- Added `src/web/Board.tsx`, `board-input.ts`, `api.ts`, `useRoom.ts`, `labels.ts`, `Lobby.tsx`, `WaitingRoom.tsx`, `Room.tsx`, `Match.tsx`, `MatchStatus.tsx`, `ActionPanel.tsx`, `LinePicker.tsx`.
- Added `tests/web/board-input.test.ts` (27 cases).

## Implemented behavior

- Runtime-validated same-origin HTTP session creation/restoration; create/join/code/deep-link flows; real loading and errors; escaped React nickname text; live connected/ready seats; clipboard copy with selectable-link fallback.
- Controlled 400-intersection SVG board, all five piece kinds, coordinate/ownership/protection accessible names, complete protected-piece outlines, per-line crown endpoint markers and textual line inventory. Shared endpoints retain independent crown markers.
- Board-local scroll and full/zoom controls; first zoom gives 44 CSS px intersection spacing. Pointer displacement, scroll, multitouch and pointer cancellation prevent drag selection. One roving board tab stop; arrows/Home/End, Enter/Space and Escape.
- Supply, captured chess status, food, crowns/lines, turn, server-relative countdown, paused turn clock, individual cumulative disconnect budgets, winner/reason and both abort reasons.
- Selection → shared `previewAction` → shared line filtering and overline selection → `applyAction` validation → explicit atomic confirm. No optimistic committed board. Revision changes discard local drafts; sending additionally compares the draft's rendered revision to the hook's latest revision to prevent a render-race rebase.
- `useRoom` parses `serverMessageSchema`, guards revisions, stores exactly one full command before sending, retains action plus line claims through uncertainty, restores and replays only the same command ID/content after reconnect, and waits for ACK plus applicable snapshot before clearing. Server errors keep the command for explicit same-request confirmation. Storage-write failure prevents send.
- Reconnect uses cookie-based same-origin WebSocket and bounded backoff. Close 4001 stops reconnect and explicitly identifies replacement. Normal close and terminal snapshots stop automatic reconnect. Terminal result locks action controls. No credentials in local storage or URLs.
- Existing wood/green tokens retained with a small matching extension; mobile-first layout and 768/1024 breakpoints; no external assets or dependencies.

## Public selectors and labels

- Inputs by label: `닉네임`, `방 코드`, `초대 링크`.
- Buttons: `시작하기`, `방 만들기`, `입장하기`, `준비 완료` → disabled `준비됨`, `초대 링크 복사`.
- Actual board scroll container: `[data-testid="board"]`; actual SVG intersection groups: `[data-cell="0"]` through `[data-cell="399"]`, `role="button"`, `tabindex` 0/-1.
- Board accessible label: `오목체스 보드, 방향키로 이동하고 Enter로 선택`. Intersection labels include e.g. `A1, 흑 군사, 보호됨`.
- Buttons: `군사 배치`, `룩 배치`, `비숍 배치`, `나이트 배치`, `퀸 배치`, `착수 확정`, `선택 취소`, `확대`, `축소`, `전체 보기`.
- Actual line selection panel: `[data-testid="line-picker"]`; actual option buttons: `[data-line-key="${lineKey(line)}"]`. For the 0,1,2,4,5 then 3 overline, `[data-line-key="1:1:0"]` chooses cells 1–5. Selected line cells are also printed in the panel.
- Status strings include `흑의 차례`, `백의 차례`, `흑 승리`, `백 승리`, `연결 중`, `재접속 중`, `경기 일시 정지`, `경기 중단 · 승패 없음`.
- Recovery buttons: `같은 요청 다시 확인`, `다시 연결`, `로비로`; terminal button: `새 방 만들기로 이동`.
- Resource sections: accessible labels `흑 자원` and `백 자원`.

## Actual verification

Command: `mise exec node@26.13.1 -- npm test -- tests/web`.

1. Initial run: 26 passed, 1 failed. Exact boundary returned JavaScript negative zero from `Math.round(-0.5)`.
2. Corrected nearest-intersection calculation to floor(normalized + 0.5), preserving the same hit regions without negative zero.
3. Focused rerun: **1 test file passed; 27 tests passed** (75ms reported).

Coverage: all 400 intersections at widths 328/358/720/880/1120; translated/scrolled bounds; edge/outside/zero-layout input; keyboard edge clamping; drag threshold; placement/movement intent; unique, overlapping, crossing, ten-cell and two-line completion; the requested overline branch with immutable original and exact 1–5 protection after atomic apply.

## Unrun acceptance / concerns

Per assignment, no typecheck, build, formatter, lint, browser launch, E2E, screenshot, console scan, axe scan, or physical-device test was run by this worker. Parent owns those checks after integration.

In particular, no claim is made yet for observed 360/390/768/1440 rendering, horizontal overflow absence in real engines, actual clipboard permissions, SVG focus/pointer behavior across Chromium/Firefox/WebKit, live two-browser victory, ACK-loss/reconnect transport tests, or browser screen-reader output. The implementation and public hooks are ready for those checks. No known implementation blocker remains.
