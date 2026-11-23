## Task 11 — 실제 경기 화면 통합

### 범위와 의존성

- 선행: Task 8, Task 9, Task 10.
- 파일: `src/web/useRoom.ts`, `src/web/Match.tsx`, `src/web/ActionPanel.tsx`, `src/web/LinePicker.tsx`, `src/web/App.tsx`, `e2e/match.spec.ts`.
- 관심사: 준비부터 승리까지 실제 경기 흐름.

### 구현

프로토콜 구독, ready, 미확정 단일 명령, authoritative snapshot, 행동 preview와 LinePicker, 식량/공급/포획 상태, 시계/중단/결과 화면을 연결한다. 네트워크 재시도는 같은 명령을 식별하는 최소 연결 복구 범위로 한정한다. revision 변화 시 오래된 초안을 확정하지 않는다.

### 검증과 인수 기준

- 명령: `npm run test:e2e -- e2e/match.spec.ts --project=chromium`.
- 두 브라우저의 실제 UI로 ready → 군사 배치 → 식량 축적 → 체스 배치/이동/포획을 수행하고 양쪽 상태 일치를 확인한다.
- 합법 수열로 두 줄을 완성하여 동일한 승패를 보고 이후 입력이 막힌다. 브라우저 스크립트로 앱 state를 주입해 성공을 꾸미지 않는다.
- 장목 선택·보호 기물 비활성화·식량 부족·상대 턴·오래된 초안이 보이는 화면과 서버 판정에 일치한다.

