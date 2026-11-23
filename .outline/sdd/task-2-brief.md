## Task 2 — 자원과 합법 행동 엔진

### 범위와 의존성

- 선행: Task 1.
- 파일: `src/game/types.ts`, `src/game/moves.ts`, `src/game/engine.ts`, `tests/game/actions.test.ts`, `tests/helpers/game.ts`.
- 고위험: G01–G06, G10, G12. 보드 위 보호 좌표를 입력 상태의 completedLines에서 읽어 이동에 반영한다.

### 구현

초기 게임, 세 가지 행동, 네 체스기물의 이동, 포획과 공급 복귀, hasLegalAction을 구현한다. 군사 수와 체스 reserve/onBoard/captured를 일관되게 관리한다. 원본 불변 상태에서 성공 결과를 계산하고 오류에는 명명된 코드만 반환한다. 빈 경로와 점유 경로를 같은 규칙으로 판단한다.

### 검증과 인수 기준

- 명령: `npm test -- tests/game/actions.test.ts`.
- 식량 0/1/2/3/5, 군사 공급 0/1/20, occupied/off-board/fractional 좌표의 유효·무효 행동을 검증한다.
- 네 기물의 이동과 경로 차단, 아군 포획 거부, 보호된 5개 각각의 원점·목적지 거부, 나이트의 보호 기물 뛰어넘기를 검증한다.
- 군사 포획은 피해 색 공급에 반환하고, 체스 포획은 영구 제외한다. 실패한 행동의 원본 state·자원이 바뀌지 않는다.

