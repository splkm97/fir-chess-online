## Task 6 — 비회원 세션과 초대 방

### 범위와 의존성

- 선행: Task 5.
- 파일: `src/server/session.ts`, `src/server/lobby.ts`, `src/server/app.ts`, `tests/server/session.test.ts`, `tests/server/lobby.test.ts`, `tests/helpers/server.ts`.
- 관심사: HTTP 입장 흐름. 조정자 또는 서버 범위 소유자가 app.ts의 유일한 편집자다.

### 구현

§4 HTTP API·쿠키·닉네임·방 코드·좌석 소유권·같은 origin을 구현한다. 익명 사용자가 입력한 playerId/color를 인증으로 쓰지 않는다. 이미 방에 있는 사용자의 중복 생성/입장은 기존 위치를 안내한다. 잘못된 코드·만료·방 가득 참을 구분한다.

### 검증과 인수 기준

- 명령: `npm test -- tests/server/session.test.ts tests/server/lobby.test.ts`.
- 두 독립 cookie jar로 방 생성·입장·조회가 되고 제3자가 자리나 스냅샷을 얻지 못한다.
- 같은 닉네임의 다른 세션은 자리를 복구하지 못하고, 동일 세션의 재요청은 자리를 늘리지 않는다.
- 쿠키 속성·원문 토큰 미저장·교차 Origin 변경 거부·외부 텍스트 안전 처리를 확인한다. **CP2**.

