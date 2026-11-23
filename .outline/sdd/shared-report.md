# 공통 기반 구현 보고서

## 범위
Task 1–4. 로컬 실행 기반, 순수 규칙 엔진, 외부 메시지 스키마. 현재까지 실제 수행한 검증만 기록한다.

## 변경과 검증
- Node 26.13.1 설치(mise), npm 12.2.3, package.json의 고정 의존성 설치.
- 최초 typecheck가 CSS side-effect import 선언 누락으로 실패. Vite client declaration을 src/web/vite-env.d.ts에 추가하고 typecheck/build 통과.
- 실제 better-sqlite3 메모리 DB를 열어 SQLite 3.54.1 확인. 잘못된 PORT와 운영 HTTP origin 거부 확인.
- build 후 npm start 실제 HTTP 서버 실행 및 browser tab omokchess에서 제목·규칙 화면 관찰/screenshot. 이후 smoke 서버 종료.
- `npm test -- tests/game`: 3개 파일, 27개 테스트 통과. 자원·네 가지 이동·포획·전체 보호·장목·교차/중복 줄·승리·행동 불가.
- strict protocol을 붙이면서 finished state에 이전 turn 필드가 남는 것을 수정. `npm run typecheck`와 `npm test -- tests/game/lines.test.ts tests/protocol/messages.test.ts`: 2개 파일 14개 테스트 통과.
- 외부 command/room/game schemas, nickname 입력, 공개 스냅샷 비밀 필드 거부.

## 커밋
- f693cd0127: 승인 계획·초기 원장·gitignore.
- 61dd3173d5: 실행 가능한 웹/서버 기반.
- f79651f1e3: 규칙·메시지 계약.

## 알려진 제한 / 아직 실행하지 않은 것
- 전체 앱·실시간 두 세션·개발 proxy·모바일·재접속 검증은 서버/화면 통합 후 수행한다. 현재 완료 증거로 주장하지 않는다.
- 독립 최종 리뷰는 병렬 구현 결과 수신 후 진행한다.
- LSP가 존재하는 root tsconfig를 찾지 못해 report_issue에 기록. 타입 검사는 실제 tsc로 수행.
- optional fsevents 설치 스크립트가 npm12 정책으로 차단되었으나 build와 SQLite native binding은 정상. 스크립트 권한 확대하지 않음.
- .idea/**는 사용자 파일로 보존.
