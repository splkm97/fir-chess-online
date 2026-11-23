## Task 8 — WebSocket 실시간 대전 전송

### 범위와 의존성

- 선행: Task 6, Task 7.
- 파일: `src/server/socket.ts`, `src/server/app.ts`, `src/server/main.ts`, `tests/server/socket.test.ts`, `tests/helpers/server.ts`.
- 고위험: 세션 인증·연결 generation·메시지 유실·G16/G17.

### 구현

§4 upgrade 인증, 메시지 handler, 전체 snapshot, ACK/error, heartbeat, 소켓 교체, payload/backpressure 제한을 연결한다. 실제 socket lifecycle을 matchService 이벤트로 번역한다. shutdown에서 모든 소켓과 timer·DB를 정리한다. HTTP error handler가 WS message 처리 오류까지 잡는다고 가정하지 않는다. [R5]

### 검증과 인수 기준

- 명령: `npm test -- tests/server/socket.test.ts`.
- 임시 포트의 실제 서버와 두 WebSocket 클라이언트로 ready → start → 군사 배치 → 상대 snapshot까지 확인한다.
- 새 연결 뒤 old socket close/message가 연결 상태나 보드를 바꾸지 않는다.
- ACK 직전 연결 종료 후 같은 commandId 재전송 시 비용·행동이 중복되지 않는다. 인증 없는 upgrade·다른 Origin·과대/손상 프레임을 거부한다.

