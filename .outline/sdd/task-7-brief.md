## Task 7 — 권위 경기와 시간 상태기계

### 범위와 의존성

- 선행: Task 3, Task 6. Task 6과 `tests/helpers/server.ts`를 공유하므로 동시에 편집하지 않는다.
- 파일: `src/server/match.ts`, `src/server/clock.ts`, `tests/server/match.test.ts`, `tests/helpers/server.ts`.
- 고위험: G11, G14–G18 및 §4 시간 계약. socket API에 의존하지 않는다.

### 구현

준비·연결·행동·마감 이벤트를 createMatchService로 처리한다. clock으로 현재 시각과 timer 예약을 주입한다. 기한 정산과 행동을 단일 서버 순서로 처리하고 DB 커밋 후 통지할 결과를 반환한다. 종료 이유를 `two-lines/no-legal-action/turn-timeout/disconnect-timeout`과 `server-interrupted/both-disconnected`로 구분한다.

### 검증과 인수 기준

- 명령: `npm test -- tests/server/match.test.ts`.
- 가짜 시계로 59,999/60,000ms, 끊김 예산 179,999/180,000ms 경계와 시간 초과 직전/직후 행동을 검증한다.
- 여러 차례 끊김을 합산하고 paused 중 턴 시간이 유지되며 복귀 후 남은 시간에서 재개된다. 양쪽 끊김·동일 시각 만료·늦은 timer도 정의된 결과를 낸다.
- duplicate ID·다른 payload 재사용·stale revision·DB 실패·종료 뒤 행동에 대해 보드와 비용이 한 번만 반영되거나 전혀 반영되지 않는다.

