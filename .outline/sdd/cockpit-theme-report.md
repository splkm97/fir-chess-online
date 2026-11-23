# Cockpit theme report

Status: DONE_WITH_CONCERNS (integrated browser verification belongs to parent).
Model selection: unsupported by task tool; no model selection claimed.

## Owned changes

- `src/web/styles.css`: dark-neutral OKLCH tokens before components; dedicated light-board ink, board selection and crown colors; 400/600 typography; 4/8/12/16/24/32/48/64 spacing; radius and shadow tokens; selected-property 120ms transitions with one easing and reduced-motion 0ms.
- Removed obsolete two-column match layout, duplicated status-card layout, and font chess-glyph styling. Existing lobby/waiting styles now consume the same semantic tokens.
- At width >=1200 and height >=640, only an active match locks the shell to 100dvh. Header/notices consume real flex space; notices are bounded and scrollable. Remaining grid has resource, board and command columns. The board size container computes a square from both available width and height minus toolbar/disclosure controls. Zoomed SVG inline width remains authoritative and scrolls inside that square.
- Command content scrolls independently; footer is nonshrinking outside that scroll area. Resource column has overflow protection for unusually long names, expanded disclosures or reconnect content. Narrow/low-height layouts return to document flow using the same DOM.
- `src/web/fonts.css`, `src/web/assets/fonts/*.woff2`, `src/web/assets/fonts/OFL.txt` added.

## Official font provenance

Source: https://registry.npmjs.org/@ibm/plex-sans-kr/-/plex-sans-kr-1.1.0.tgz
Metadata inspected: `@ibm/plex-sans-kr` version `1.1.0`, repository https://github.com/ibm/plex.git, license OFL-1.1, gitHead `1da12f02587b630c07e92692d21492d722f53614`.
Copyright: IBM Corp., reserved font name Plex; original OFL copied without alteration.

Downloaded tarball directly and inspected members/package metadata/license. No npm install, dependency changes, package scripts, telemetry, or postinstall execution. Only unmodified static hinted split WOFF2 Regular (400) and SemiBold (600) files were copied. All 94 upstream language subsets per selected weight are retained rather than freezing coverage to today's UI strings; unicode-range makes the browser request only matching subsets. No complete fonts, other weights, WOFF, package scripts, or runtime remote font URLs were vendored. Original unicode ranges preserved; URLs localized, local() removed to make self-hosting deterministic, font-display swap added.

- WOFF2 files: 188
- WOFF2 bytes: 1,844,160
- OFL bytes: 4,456
- fonts.css bytes: 97,142
- Weights: exactly 400 and 600

## Narrow verification performed once after implementation

`mise exec node@26.13.1 -- node --input-type=module` with existing PostCSS and Node assertions:

- Both CSS files parsed successfully.
- All CSS variable references resolve to declarations.
- 188 font-face declarations have unicode-range, swap, and local relative asset URLs.
- Every referenced asset exists and has WOFF2 magic.
- Declared weight set is exactly 400/600.
- OFL file contains SIL OFL 1.1.
- No transition:all.

No build, lint, tests, formatter, browser, or server verification run.

## CSS assumptions and pending integrated checks

Fixed plan DOM/classes consumed unchanged. Board's default SVG has width 100% and natural square aspect; zoom uses existing inline width >=880px. Piece SVGs retain `.piece-glyph.black/.white` classes and currentColor fill. The command footer must remain a sibling of `.command-content`, not inside it. Board toolbar and collapsed utility each reserve a 44px row with 8px gaps.

Parent must verify actual fitted board/confirm/core-resource visibility at 1280×720, 1366×768, 1440×900 and 1920×1080; long line candidates; reconnect/error banners; 360/390/768px overflow and touch; disclosure/popover focus and scrolling; real font requests/rendered family; SVG icon contrast and protected/crown markers; axe and computed contrast. PostCSS parsing is syntax/reference evidence, not browser-layout or accessibility proof. Very long/expanded resource content intentionally scrolls in its column; normal core-resource visibility still requires the integrated real-font check.
