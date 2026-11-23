## Task 10 — 초대 로비 화면

### 범위와 의존성

- 선행: Task 6, Task 9.
- 파일: `src/web/api.ts`, `src/web/Lobby.tsx`, `src/web/App.tsx`, `src/web/styles.css`, `e2e/invite.spec.ts`.
- 관심사: session → room 생성/입장. 실제 API만 사용한다.

### 구현

닉네임·방 만들기·코드 입장·초대 링크 복사/수동 선택·자기 색과 상대 표시·새로고침 세션 복구를 구현한다. `/room/:code`로 직접 들어오면 세션 생성 후 참여하며, 이미 참가한 세션은 재입장한다. 아직 연결 전 ready를 성공 처리하지 않는다.

### 검증과 인수 기준

- 명령: `npm run test:e2e -- e2e/invite.spec.ts --project=chromium`.
- 두 격리 browser context로 생성/초대/입장하고 같은 cookie jar의 두 탭을 두 플레이어로 오인하지 않는다.
- 없는 코드·가득 찬 방·만료·서버 오류에서 명확한 메시지와 복구 동작을 제공한다.
- 새로고침 후 동일 좌석을 유지하며 초대 URL에 비밀 토큰이 없다.

