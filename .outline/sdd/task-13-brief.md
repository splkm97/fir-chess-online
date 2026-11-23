## Task 13 — 경계·복구 회귀 검증

### 범위와 의존성

- 선행: Task 8.
- 파일: `tests/server/recovery.test.ts`, `tests/server/security.test.ts`, `tests/helpers/server.ts`.
- 발견된 결함 수정은 조정자가 근거를 확인하고 해당 소유 파일 범위를 명시적으로 추가한 뒤 수행한다. 무관한 리팩터링은 금지한다.

### 구현

서버 재시작, DB commit/ACK 사이 연결 종료, stale/duplicate 요청, 타인 좌석 위조, 동일 세션 다중 연결, 교차 Origin, payload 한도, public snapshot 비밀 유출을 실제 DB/전송으로 검증한다. 기존 Task 5–8 테스트와 같은 경우를 다시 복제하지 않고 경계를 가로지르는 시나리오만 추가한다.

### 검증과 인수 기준

- 명령: `npm test -- tests/server/recovery.test.ts tests/server/security.test.ts`.
- child server를 종료/재기동하여 active/paused가 무승패 중단되고 완료 결과는 유지됨을 확인한다.
- 저장 성공/ACK 유실 시 재전송이 한 번만 적용되고, 다른 payload ID 재사용은 거부된다.
- 외부 입력·세션·Origin 검증을 우회해 상대 기물·시간·승자를 바꿀 수 없고 인증 자료가 응답/로그에 노출되지 않는다.

