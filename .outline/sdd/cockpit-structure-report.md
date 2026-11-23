# Cockpit structure — DONE_WITH_CONCERNS

## Changes
- Modified `src/web/App.tsx`, `Room.tsx`, `Match.tsx`, `MatchStatus.tsx`, `ActionPanel.tsx`, `Board.tsx`.
- Added `src/web/PlayerResources.tsx`, `PieceTray.tsx`, `PieceIcon.tsx`.
- `LinePicker.tsx` needed no change: existing accessible heading, candidate selection, reset behavior and hooks are preserved inside the new command-content container.
- Fixed DOM contract implemented: resources/opponent-first, actual placement tray, board/disclosure help, single command status, selection/preview-derived food delta, conditional line picker, footer confirmation/cancel or terminal new-room action.
- Match now owns the sole 250ms elapsed timer, sharing elapsed with MatchStatus and resource reconnect budgets. Normal reconnect detail is collapsed; paused budgets remain visible.
- Room passes receivedAt/onLobby; room notices retain errors/retries. Command/revision/pending flow and game engine are unchanged.
- SVG icons replace board/tray chess glyphs and endpoint crowns. Existing piece classes retained; theme owner notified that crown descendants are SVG rather than text and use currentColor. No additional DOM classes beyond the fixed contract and existing classes.
- Own inventory is represented by the actual tray, not a second inventory card; terminal resources show static inventory without placement controls.

## Checks
- `mise exec node@26.13.1 -- npm run typecheck`: PASS (exit 0). First completion run found a JSX fragment closing typo in PlayerResources; corrected in scope and reran the same check successfully.
- LSP references attempted with relative and absolute file paths; unavailable (reported no configured server/project). Text caller search found only Room→Match/MatchStatus and Match→ActionPanel, migrated directly.
- No builds, browser runs, tests, formatters, commits, package changes or remote operations.
- Model selection unsupported by task tooling; no model override claimed.

## Unverified integration concerns
Layout remains visually unverified until parent integrates CSS. Parent must verify full-board fit/zoom, footer visibility with overline choices, SVG piece/crown contrast and recognizable silhouettes, mobile/native touch and keyboard navigation, result focus, reconnect/error notices, font loading and axe. Board gesture handlers, accessible labels, data-cell/test IDs/line keys, coordinates and protected-ring logic remain unchanged.
