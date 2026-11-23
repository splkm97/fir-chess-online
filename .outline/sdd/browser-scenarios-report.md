# 브라우저 인수 시나리오 준비

대상: e2e/helpers.ts, invite.spec.ts, match.spec.ts, mobile.spec.ts, reconnect.spec.ts.

- 실제 UI를 통한 독립 두 세션의 초대/준비/군사/룩/포획/두 줄 승리/장목 선택/모바일 확대·키보드/재접속/다중 탭 교체 시나리오 작성.
- 게임 상태 주입 없음. 서버 상태 조회는 인증된 GET /api/rooms/:code를 통한 관찰만 사용.
- Playwright Chromium/Firefox/WebKit 설치 완료.
- TypeScript 7은 파일을 명시할 때 tsconfig를 무시하려면 --ignoreConfig가 필요하여 최초 별도 타입 검사 명령이 TS5112로 종료됨. 해당 옵션을 추가한 정확한 E2E 범위 타입 검사 통과.
- 실제 E2E 실행은 서버·화면 구현 통합 후 수행한다. 현재는 브라우저 동작 PASS를 주장하지 않는다.
