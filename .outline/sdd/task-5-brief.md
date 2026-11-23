## Task 5 — 영속 방 저장소

### 범위와 의존성

- 선행: Task 4.
- 파일: `src/server/store.ts`, `src/server/schema.ts`, `tests/server/store.test.ts`, `tests/helpers/server.ts`.
- SQL은 `schema.ts`의 단일 상수로 정의한다. 별도 SQL 파일 복사 단계 없이 tsc가 운영 산출물에 포함하도록 한다.
- 관심사: SQLite의 실제 transaction·revision·idempotency 저장. 네트워크는 구현하지 않는다.

### 구현

§4 테이블·스키마 버전·WAL·foreign keys를 구현한다. 세션과 두 자리 예약, 조건부 revision 갱신, command receipt, 방 만료·보존기간 처리를 제공한다. 상태 변경과 receipt를 하나의 transaction으로 저장하고 SQLite 오류는 실패로 전파한다.

### 검증과 인수 기준

- 명령: `npm test -- tests/server/store.test.ts`.
- 독립 임시 DB에서 rollback 후 자원·revision·receipt가 모두 기존 값임을 확인한다.
- 두 join 시도 중 백 자리는 한 세션에만 주어진다. stale revision은 상태를 덮어쓰지 못한다.
- DB를 닫고 다시 열어 확정 상태와 영수증이 보존되며, active/paused 중단 변환이 완료 경기를 변경하지 않는다.

