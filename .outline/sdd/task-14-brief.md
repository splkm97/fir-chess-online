## Task 14 — 재접속과 교차 브라우저 인수

### 범위와 의존성

- 선행: Task 12.
- 파일: `e2e/reconnect.spec.ts`, `e2e/match.spec.ts`, `e2e/mobile.spec.ts`, `playwright.config.ts`.
- UI 경계 시나리오 검증. Task 13과 테스트 파일 소유권이 독립이다.

### 구현

독립 두 context, 데스크톱/모바일 project, 클라이언트 네트워크 단절·새로고침·새 탭 연결, 장목 선택 도중 상대 끊김, 미확정 명령 복구를 실제 화면에서 검증한다. 테스트마다 고유 DB/포트/방/쿠키를 사용한다. browser clock만 앞당겨 서버 시간이 바뀌었다고 주장하지 않는다.

### 검증과 인수 기준

- 명령: `npm run test:e2e -- e2e/reconnect.spec.ts --project=chromium`.
- 실제 끊김 감지 후 화면이 paused로 바뀌고, 복귀하면 같은 좌석·보드·남은 시간으로 돌아온다. 초안은 자동 착수되지 않는다.
- 새 탭이 기존 연결을 대체해도 이전 close가 새 연결을 중단시키지 않는다. 대체된 탭은 상태를 분명히 표시하고 자동 소켓 탈환 루프를 만들지 않는다.
- Chromium/Firefox/WebKit 및 두 모바일 project를 최종 관문에서 실행할 수 있도록 모든 spec의 지원 project를 명시한다. 60/180초 경계 자체는 Task 7의 가짜 서버 시계 검증을 근거로 삼는다.

