# PC 전술석 구현

승인된 방향: 전술석 3열, 핵심 정보 우선, 120ms 피드백, IBM Plex Sans KR. 기존 대국 기능을 보존하면서 PC의 보드·자원·착수 확정을 한 화면에 배치한다. 사용자 디자인 선택과 이어진 구현 요청에 따른 로컬 실행 계획이다.

BASE: `1d69e4242d2bc6a4951d142591c77230fbcb230d`.
기존 작업 트리: 깨끗함. 이전 원장의 최초 게임 구현 Task 1–15는 완료 상태이며 다시 수행하지 않는다.
권한: 로컬 UI·테스트·문서·선택적 커밋. 서버·규칙·통신·원격 게시·배포 변경 금지.
모델 지정: 현재 도구에 model 인자가 없어 지정 불가. 기존 승인된 대체 절차를 유지하며 지정 성공을 주장하지 않는다.

## Global Constraints

1. PC 기준 1366×768, 1440×900, 1920×1080. 1200px 이상이며 높이 640px 이상에서 3열 적용. 낮거나 좁은 화면에서는 문서 흐름으로 복귀해 잘림을 방지한다.
2. 기본 보기에서는 20×20 SVG 전체, 양측 핵심 자원, 선택 수, 확정 버튼이 viewport 안에 들어온다. 보드는 너비와 가용 높이 중 작은 값에 맞춘 정사각형. 확대했을 때만 보드 내부 스크롤을 허용한다.
3. 왼쪽: 상대 식량/공급 군사/완성 줄/체스 상태 → 내 식량/공급 군사/완성 줄 → 내 배치 선택. 동일 재고를 별도 카드와 선택 버튼에 반복하지 않는다.
4. 가운데: 기존 SVG Board, 확대 제어, 접힌 조작·보호 줄 안내. 좌표·pointer·keyboard·preview·protected ring·crown·line selection은 유지한다.
5. 오른쪽: 턴/시간, 연결 중단·승패 이유, 선택 수와 비용, 조건부 장목 선택, 고정된 하단의 확정/취소. 장목 후보만 내부 스크롤 가능. 확정 버튼은 후보 개수 때문에 viewport 밖으로 밀리지 않는다.
6. 정상 연결 상태·방 정보는 작은 상단 표시. reconnect/error는 숨기지 않고 최대 높이를 가진 notices 영역에서 읽고 조작할 수 있게 한다. 대국의 브랜드 문구·일반 푸터는 주 공간에서 제외한다.
7. `흑의 차례`, `백의 차례`, `흑 승리`, `백 승리`, 군사/룩/비숍/나이트/퀸 배치, 착수 확정, 선택 취소, 확대/축소/전체 보기의 접근 가능한 이름은 보존한다. 실제 data-cell, data-testid=board/line-picker, data-line-key도 보존한다.
8. 하나의 실제 조작 DOM만 둔다. desktop/mobile 숨김 복제 컨트롤 금지. mobile 360/390/768px에서 기능·키보드·touch·overflow 회귀 금지.
9. 상태 관리·서버 판정·pending command·revision·재접속 정책 변경 금지. 로컬 UI 계산은 현재 previewAction/applyAction을 사용한다. 종료 후 행동 입력을 제공하지 않는다.
10. 색상 전략: 절제형 다크 뉴트럴 UI + 밝은 보드. 선택 accent는 약10% 이하. 커스텀 OKLCH 토큰, 보드용 어두운 잉크 별도. 일반 본문 대비4.5:1, 큰 글자/비텍스트3:1 이상을 검증한다.
11. 타입: IBM Plex Sans KR 400/600을 self-host. 외부 font CDN runtime 요청·새 npm dependency·postinstall 실행 금지. 공식 배포의 static font 및 OFL license만 vendor한다. 원본 패키지 @ibm/plex-sans-kr 1.1.0 tarball: https://registry.npmjs.org/@ibm/plex-sans-kr/-/plex-sans-kr-1.1.0.tgz . 이 패키지는 postinstall telemetry가 있으므로 설치하지 않는다.
12. 모든 색/타입/간격/반경/그림자/모션은 CSS 변수. PC 간격4/8/12/16/24, 기존 다른 표면의32/48/64도 정본 스케일로 유지 가능. 레이아웃 폭·SVG 좌표·44px 조작 크기는 spacing과 구별한다. 서체를 아이콘으로 사용하지 않고 체스/왕관은 의미가 구별되는 단색 SVG로 옮긴다.
13. 모션120ms, cubic-bezier(0.2,0.8,0.2,1), opacity/background-color/border-color 등 필요한 속성만. 위치/레이아웃 애니메이션과 transition:all 금지. reduced-motion에서0ms. 숫자는 tabular-nums.
14. 모든 구현자는 중간 build/lint/test/formatter 실행을 건너뛰고 할당 구현을 끝낸 뒤 좁은 검사 한 번. 조정자가 통합 build/실제 브라우저 검증을 수행한다. 다른 작업자 파일·서버·프로토콜·게임 엔진·package manifest는 수정하지 않는다.

## 고정 DOM 계약

다음 class 이름은 두 구현 범위 사이의 공유 계약이다. 구조 담당자는 이 class를 생산하고 스타일 담당자는 이를 소비한다.

```text
main.app-shell.has-room                # App: room code가 있을 때
  header.app-header.compact
  div.room-shell                       # Room 전체 wrapper
    div.room-notices                    # 기존 connection-banner, 오류, retry 제어
    div.match-cockpit                   # Match, 3열 root
      aside.cockpit-resources           # 왼쪽
        article.player-status.opponent-status  aria-label="백 자원" 등
        article.player-status.own-status       aria-label="흑 자원" 등
        section.piece-tray
          div.piece-options            # 기존 다섯 배치 버튼
      div.cockpit-board                 # 가운데, size container 사용 가능
        section.board-section
          div.board-toolbar
          div.board-scroll data-testid="board" data-zoomed="false|true"
            svg.game-board
          div.board-utility
            details.board-help
              summary                  # 조작·보호 줄
              div.board-help-popover   # 긴 설명/line-legend
      aside.cockpit-command             # 오른쪽 flex column
        section.match-status           # 턴·시계·pause/result; 자원 카드 없음
        div.command-content            # 선택 요약·오류·pending·장목; overflow 가능
          section.action-panel         # 선택 요약만; PieceTray와 분리
            div.confirmation
          section.line-picker          # 필요할 때만
          details.command-help         # 평상시 긴 규칙 설명은 접음
        div.command-footer             # margin-top:auto; 항상 viewport 내
          div.confirm-buttons          # 실제 착수 확정/선택 취소
          section.result-actions       # 종료 시에는 새 방으로 이동
  footer.app-footer                    # 활성 cockpit에서는 숨김
```

- Match는 기존 draft/preview/selection 처리 소유권을 유지한다. 상호작용 state를 CSS 담당자나 상위 App으로 이동하지 않는다.
- Room은 `receivedAt`, `onLobby`를 Match에 전달한다. MatchStatus는 오른쪽에서 한 번만 렌더링한다.
- 시간 경과 interval은 한곳에서 소유하여 MatchStatus와 자원 예산 표시가 같은 elapsed를 사용한다. 재접속 예산은 paused에만 펼쳐 보이고 정상 연결에서는 상세 영역에 둔다.
- App의 room class는 상태 전달을 위한 단순 class다. 대국 전용 viewport 잠금은 CSS `.app-shell.has-room:has(.match-cockpit)`에 한정해 대기실/로비를 자르지 않는다.
- 작은 화면에서 순서는 자원 → 보드 → 명령. 필요하면 CSS grid areas로 시계 우선 배치 가능하나 화면읽기 순서와 중복 DOM을 주의한다.
- 장목 선택·상태 변경에도 footer가 밀리지 않게 command-content에 min-height:0와 overflow:auto를 적용한다. 오류나 재접속 시 root notices 공간만큼 나머지 가용 높이가 줄어들게 한다.
- 기본 board 크기는 CSS size container의 가용 width/height와 toolbar/utility 높이에서 도출할 수 있다. 고정 width로 max-height만 자르는 기존 방식은 제거한다.

## Task 1 — 대국 컴포넌트 구조

### 범위
- 소유: src/web/App.tsx, Room.tsx, Match.tsx, MatchStatus.tsx, ActionPanel.tsx, Board.tsx, LinePicker.tsx; 신규 PlayerResources.tsx, PieceTray.tsx, PieceIcon.tsx.
- 읽기 전용: CSS·폰트·게임·프로토콜·useRoom·labels·서버·루트 설정.
- 선행: 본 문서의 계약 확정. Task 2와 동시에 수행 가능.

### 구현
고정 DOM에 따라 자원/배치와 선택/확정을 분리한다. 중복 자원·왕관 숫자 대신 완성 줄 진행률을 우선하되 보드 끝점 왕관은 유지한다. 게임 규칙과 전송 흐름은 보존한다. 단색 SVG piece/crown 아이콘을 생성하여 기존 serif chess glyph 의존을 제거한다. Board help를 disclosure로 바꾸고 zoom 상태를 data 속성으로 노출한다. 모든 caller를 직접 이관하고 obsolete markup을 제거한다.

### 완료 기준
- desktop/mobile이 같은 실제 조작 DOM을 사용한다.
- 명명된 class/접근성 이름/테스트 hook이 일치한다.
- 이관 후 `mise exec node@26.13.1 -- npm run typecheck` 통과. 실패하면 담당 파일만 수정하고 해당 검사 재실행.
- 보고서 `.outline/sdd/cockpit-structure-report.md`: 실제 변경/검사/미실행 브라우저 항목. 커밋은 조정자 담당.

## Task 2 — 전술석 토큰·폰트·레이아웃

### 범위
- 소유: src/web/styles.css; 신규 src/web/fonts.css, src/web/assets/fonts/** (static font), src/web/public/licenses/IBM-Plex-OFL.txt (배포에 포함할 OFL).
- 읽기 전용: 모든 TS/TSX·게임·서버·루트 설정·package.json. Task 1과 동시에 수행 가능.
- 이전 상태: styles.css는 BASE에 존재; 다른 소유 파일은 신규.

### 구현
기존 스타일을 새 토큰으로 일관되게 이관한다. 고정 DOM 계약에 맞춰 PC 3열, 높이 적응형 전체 보드, 고정 confirm/footer, 작은 화면 fallback을 구현한다. default framework 팔레트/그라디언트/글래스/균일 shadow 금지. @import로 로컬 fonts.css를 연결하며 static font는400/600에 필요한 WOFF2 subset만 포함하고 unicode-range를 보존한다. 공식 tarball 메타데이터·라이선스를 확인하고 다운로드하며 스크립트는 실행하지 않는다. JS font-loader나 새 runtime dependency를 추가하지 않는다.

팔레트 방향: surface oklch(0.20 0.016 240), panel(0.26 0.018 240), ink(0.94 0.014 90), board(0.70 0.035 90), accent(0.78 0.10 140), muted(0.70 0.02 240). 대비/기물 가독성을 위해 역할별 L값을 조정할 수 있으나 색상 방향은 유지한다. board ink, on-accent, error, warning, crown은 별도 semantic 토큰으로 정의한다.

### 완료 기준
- CSS 토큰6계열을 적용하고1280×720/1366×768/1440×900에서 full-board와footer가 viewport에 들어갈 수 있는 구조.
- 확대 시 기존880px 이상 보드와 내부 스크롤, 축소 후 다시 fit 보존.
- 폰트·라이선스 self-host 및 remote runtime font 요청 없음. 지정 폰트2weight만 포함.
- 작업 종료 후 CSS syntax/font 자산 참조의 좁은 검증만 수행; 통합 Vite/build/browser는 조정자 담당.
- 보고서 `.outline/sdd/cockpit-theme-report.md`: 자산 출처·파일 수/크기·토큰·검증/미실행 증거. 커밋은 조정자 담당.

## Task 3 — 통합·실제 화면·검토

### 범위
조정자 소유: e2e/desktop.spec.ts, 관련 기존 E2E의 소비자 계약 수정, README.md, CHANGELOG.md, 본 계획과 .outline/sdd/cockpit-* 산출물 및 progress.md. 통합 발견을 고칠 때는 구현자 완료 이후 해당 UI 파일을 좁혀 수정한다.

### 완료 기준
- build 성공 후 실제 두 사용자 UI 대전으로 PC1280×720,1366×768,1440×900,1920×1080의 board/confirm/자원 visibility와 document overflow 검증. 20×20 전체 보기에서 SVG와 scroll viewport 크기 비교.
- 실제 장목 후보가 나타나도 confirm 위치 유지, 다섯 보호 기물 접근성 이름·표시 보존.
- 기존 gameplay/재접속·mobile390 및 native touch 회귀. 스타일 변경이므로 서버 전체 suite는 반복하지 않는다.
- 실제 로그인/대국 screenshot, axe 검사와 수동 판정 필요 항목의 대비 근거. 실제 로드된 IBM Plex 폰트 확인.
- DOM/UX와 CSS/접근성의 독립 읽기 전용 검토를 병렬 수행하고 Important/Critical 해소.
- 변경 범위만 selective commit; 원격 submit/배포 없음. 기존 사용자 변경 보존.
