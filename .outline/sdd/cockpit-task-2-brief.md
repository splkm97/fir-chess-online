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

