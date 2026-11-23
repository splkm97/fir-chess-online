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
