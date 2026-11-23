## Task 4 — 외부 메시지 계약

### 범위와 의존성

- 선행: Task 3.
- 파일: `src/protocol/messages.ts`, `tests/protocol/messages.test.ts`.
- 관심사: §4 wire 계약과 타입의 단일 정의. 서버·클라이언트 구현을 이 태스크에 넣지 않는다.

### 구현

Zod strict schemas로 HTTP payload, ready/action envelope, public snapshot, ACK/error, 상태별 필드를 정의한다. 타입은 schema에서 추론하고 도메인 타입과 결합한다. action·line 좌표·revision·commandId·protocolVersion의 범위를 제한한다. 내부 GameState를 통째로 serialize하지 않고 공개 스냅샷 계약을 별도로 정의한다.

### 검증과 인수 기준

- 명령: `npm test -- tests/protocol/messages.test.ts`.
- 잘못된 union, extra field, 소수 좌표, 음수 revision, 과다 line 좌표, unsupported version을 실제 parse 결과로 거부한다.
- 합법 ready/action과 finished/aborted/paused 스냅샷이 왕복 직렬화된다.
- 공개 메시지에 세션 토큰·해시·내부 식별자가 포함된 객체는 strict schema를 통과하지 못한다.

