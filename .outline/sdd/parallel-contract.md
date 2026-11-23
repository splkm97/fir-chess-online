# 병렬 구현 계약

기준 계획: plans/technical-plan-omokchess-online.md. Global Constraints와 §§3–5가 동작 기준. 공유 src/game/**, src/protocol/messages.ts는 구현·typecheck·테스트 완료됨. 변경은 조정자에게 요청한다.

## 공통
- `mise exec node@26.13.1 -- <command>`로 실행. npm 12.2.3 설치됨. 의존성 추가/버전 변경 금지.
- 기존 .idea/**는 사용자 파일. 수정 금지. 현재 BASE는 디스패치 메시지에 기록.
- 기존 파일 변경은 edit, 새 파일은 write. LSP references 사용을 시도했으나 workspace root 인식 오류로 불가했음; 타입 검사로 교차 계약 검증.
- 모델 인자 지정은 현재 도구가 제공하지 않음. 지정 성공/비용 절감을 주장하지 않는다.
- 맡은 전체 구현 중간에는 build/lint/tests/formatter 실행하지 말고 끝에서 담당 범위 검사 한 번. 수정 후 해당 검사만 재실행 가능.
- git commit 하지 않는다. 조정자가 selective commit으로 통합. git reset/clean/restore 금지.
- 상태/오류/결과를 실제 구현한다. fake fallback, TODO, mocks, 구현 누락/스펙 축소 금지.
- Task 완료 기준은 본문 구현만 아니라 실제 검증. 브라우저와 최종 통합 검사는 조정자가 수행하므로 미실행 항목을 명시한다.

## 고정 HTTP 계약
POST /api/session {nickname} -> SessionView {nickname,roomCode:string|null} + HttpOnly cookie.
GET /api/session -> SessionView. POST /api/rooms {} -> {code}. POST /api/rooms/:code/join {} -> {code}.
GET /api/rooms/:code -> RoomSnapshot. 인증/오류 응답 {code,message?}, 성공은 JSON. 프런트는 credentials same-origin.
GET /api/rooms/:code/socket -> WebSocket, cookie/Origin 인증. serverMessageSchema 그대로 사용: snapshot {room}, ack {commandId,appliedRevision}, error {code,commandId?,currentRevision?}.
commandSchema 그대로 사용. action payload의 at/from/to는 0..399 cell 정수이며 x=cell%20,y=floor(cell/20). claimedLines는 Line[]이며 빈 배열도 명시.
RoomSnapshot.you 는 세션 색. serverTime은 Date.now() ms. 시간 표시 경과는 수신 시점 performance.now() 기준. reconnect는 새 snapshot으로 다시 기준 설정.
finished game은 gameSchema의 status='finished'. aborted는 room.abortReason 표시. 모든 snapshot은 runtime schema 검증 가능해야 함.
소켓 교체 close code 4001/reason REPLACED. 교체된 UI는 재연결하지 않아야 함. 정상 종료 시 재연결 금지.

## 화면의 테스트 가능한 조작 계약
- 최초 닉네임 label '닉네임', 제출 button '시작하기'. 세션 확보 후 button '방 만들기', 입장 input label '방 코드', button '입장하기'. 초대 경로 /room/:code.
- 방 대기에서 button '준비 완료'. 성공하면 '준비됨' 표시/비활성. 두 플레이어 ready + connected 시 경기.
- Board의 실제 교차점마다 data-cell={0..399}; 보드 컨테이너 data-testid='board'. SVG 화면에 실재하는 노드이며 테스트 전용 가짜 요소 금지.
- 행동 버튼 '군사 배치', '룩 배치', '비숍 배치', '나이트 배치', '퀸 배치'; 이동은 보드 위 아군 체스기물 선택으로 시작. 실제 좌표 클릭은 초안만 생성.
- 최종 button '착수 확정'; 취소 button '선택 취소'; 확대 버튼 '확대', '축소', '전체 보기'.
- 명확한 턴 문구 '흑의 차례'/'백의 차례', 결과 '흑 승리'/'백 승리'. 연결 시 '연결 중'과 재접속/대기/중단 문구 구분.
- 토큰 체계는 기존 src/web/styles.css :root. 이를 읽고 부족한 토큰만 같은 체계로 추가. 기존 보드 중심 muted wood/green 스타일을 유지. 외부 자산 불필요.

## 병렬 소유권
서버 구현자: src/server/**, tests/server/**, tests/helpers/server.ts. Task 5→6→7→8 및 13을 내부 순서로 구현. app.ts/config.ts/main.ts 변경 허용. 게임/프로토콜/웹/루트 설정 변경 금지.
화면 구현자: src/web/**, tests/web/**. Task 9→10→11→12. 브라우저/E2E 검사는 서버 통합 후 조정자가 수행. 서버/게임/프로토콜/루트 설정 변경 금지.
조정자: 공유 계약, tests/game/**, tests/protocol/**, e2e/**, playwright.config.ts, 원장/보고서, README/CHANGELOG. 서버와 UI 내부 변경은 소유자가 완료한 후에만 통합.

사전 상태: src/server/config.ts/main.ts/app.ts 및 src/web 기본 화면은 커밋되어 있고 되돌리기 기준 존재. 다른 허용 파일은 신규. 무관한 파일 삭제·쓰기 금지.
