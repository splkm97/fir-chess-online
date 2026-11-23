# 오목체스 온라인 — 서브에이전트 실행 계획

**결론:** 순수 TypeScript 규칙 엔진을 서버와 화면이 공유하되, 서버만 경기 상태·시간·승패를 확정한다. React 화면, Fastify HTTP/WebSocket 서버, SQLite 저장소를 단일 애플리케이션으로 구현한다. 아래 Task 1–15를 의존성 순서로 완료하고, 실제 두 브라우저 대전과 모바일 입력을 검증한다. 이번 산출물은 계획이며 구현·커밋·원격 게시·배포는 실행하지 않는다. [U1–U4, D1]

- 유형 / 등급: **Technical Plan / Execution**.
- 계획명: `omokchess-online`.
- 기준 확인일: 2026-11-23.
- 상태: 맥락 브리핑 승인됨. 구현 전.
- 실행 입력: 이 파일 전체. 태스크 발췌에는 해당 `Task N`과 `Global Constraints`, 필요한 인터페이스 절을 함께 전달한다.
- 근거 표기: `[U]` 사용자 요구·확정, `[E]` 도구로 관찰한 환경, `[R]` 외부 문서, `[S]` 실행 스킬, `[D]` 이 계획의 설계 결정. `[D]`의 수치·경로·명령은 구현할 계약이지 이미 관측된 성능이나 존재하는 코드가 아니다.

## 1. 조사 결과와 승인 범위

### 확인한 것

- **Sparse:** 저장소 루트가 비어 있다. `plans/`, 기존 구현, README, 테스트, 설정, 기존 진행 원장이 없다. 기존 관례를 보존할 대상이 없다. [E1]
- 프로젝트 메모리도 제공되지 않았다. 도메인 근거는 이번 대화의 원문과 질문 답변이다. [E2, U1–U3]
- 설치 환경: Node `25.9.0`, npm `11.12.1`, Git `2.54.0`, git-branchless `0.10.0`. Git 루트 조회는 경로를 반환하지 않았다. 실행 전에 로컬 저장소 초기화와 첫 기준 커밋이 필요하다. 이번 계획 단계에서는 하지 않는다. [E3]
- Node 25는 EOL이다. LTS `26.13.1`을 사용한다. `node:sqlite`는 확인한 문서에서 RC이므로 안정 의존성 `better-sqlite3`를 선택했다. [R1–R3, D1]
- 사용자는 단일 서버·SQLite·비회원 초대·서버 재시작 시 무승패 중단·원격 게시 분리·하네스 대체 절차를 포함한 맥락 브리핑을 승인했다. [U4]

### 포함

비회원 닉네임, 방 생성·코드/링크 입장, 준비와 시작, 20×20 보드, 모든 배치·이동·포획·오목 규칙, 장목 선택, 승패, 턴 시간, 재접속, 서버 권위 검증, 상태 보존, PC·모바일 입력, 운영 명령과 사용 문서, 자동화 검증. [U1–U4]

### 제외

회원가입, 계정 전적 화면, 랜덤 매칭, 랭킹, 관전, 채팅, AI 상대, 실행취소, 항복/무승부 협상, 재대국 전용 기능, 다중 서버·Redis, SSR, 네이티브 앱, 원격 저장소 생성·게시, 실제 외부 서버 배포. 다시 대전하려면 새 방을 만든다. 경기 결과 저장은 복구·판정 보존용이며 전적 제품 기능이 아니다. [U2, U4, D1]

로컬 두 세션 검증은 인터넷 공개 배포의 증거가 아니다. 산출물은 외부 호스트에서 실행 가능한 서버와 운영 지침까지이며, 공개 URL·TLS·도메인 설정은 별도 승인 작업이다. [U4, D1]

## 2. Global Constraints

이 절은 모든 구현자·리뷰어에게 원문 그대로 전달한다. 아래 번호는 테스트와 태스크의 추적 키다. [D1]

### 게임 규칙

- **G01 — 보드·소유권:** 20×20 교차점, 좌표 `x,y`는 정수 `0..19`. 빈 보드에서 흑 선공. 한 교차점에는 기물 하나만 존재한다. [U1, U3]
- **G02 — 공급:** 플레이어별 군사 20개, 룩·비숍·나이트·퀸 각 1개. 전체 48개. 시작 식량 0, 보유 범위 `0..5`. [U1, U2]
- **G03 — 군사 배치:** 공급처의 군사 하나를 빈 교차점에 놓고 `min(5, food + 1)`을 받는다. 식량이 이미 5여도 배치할 수 있다. 군사는 이동·공격할 수 없다. [U1, U3]
- **G04 — 체스 배치:** 식량 3개와 공급처에 해당 체스기물이 있어야 한다. 빈 교차점에 배치한다. 배치로 포획할 수 없다. [U1]
- **G05 — 체스 이동:** 식량 2개를 사용한다. 룩은 직선, 비숍은 대각선, 퀸은 둘 다, 나이트는 `(1,2)/(2,1)` 이동. 제자리 이동·아군 포획·보드 밖 이동 금지. 룩·비숍·퀸은 중간 기물을 넘지 못하고 나이트만 뛰어넘는다. 킹·폰·체크·승격·캐슬링 규칙은 없다. [U1, U3]
- **G06 — 포획:** 이동 목적지의 보호되지 않은 상대 기물을 제거하고 이동 기물이 그 자리를 차지한다. 군사는 원래 소유자의 공급처로 돌아간다. 체스기물은 영구 제외되어 다시 배치할 수 없다. 포획으로 식량을 추가 지급하지 않는다. [U1, D2]
- **G07 — 오목:** 같은 색의 군사·체스기물을 혼합할 수 있다. 가로·세로·두 대각선의 연속 5개를 한 줄로 센다. 완성 줄마다 왕관 2개, 두 줄이면 승리. 별도 금수는 없다. [U1–U3]
- **G08 — 장목:** 6개 이상 연결되면 행동한 플레이어가 보호할 연속 5개 구간을 선택한다. 선택도 해당 턴의 60초 안에 끝나야 한다. [U2, U3]
- **G09 — 줄 중복:** 다른 방향의 줄은 기물을 공유할 수 있고 기존 보호 기물도 새 줄에 포함할 수 있다. 같은 직선에서 겹치는 5개 구간은 별도 득점 불가. 동일 줄 재득점 금지. 같은 직선의 서로 겹치지 않는 두 5개 구간은 인정한다. [U2, U3]
- **G10 — 전체 보호:** 완성된 줄의 **다섯 기물 전체**는 이동 원점·포획 대상·공격 목적지가 될 수 없다. 양 끝점만 보호하는 구현은 결함이다. 나이트가 그 위를 뛰어넘는 것은 허용하며, 룩·비숍·퀸의 경로에서는 장애물이다. 보호는 줄에 속한 좌표의 합집합으로 계산한다. [U1, U3]
- **G11 — 종료 우선순위:** 유효한 행동의 식량·포획·줄 확정 후 행동자의 두 줄 승리를 먼저 판정한다. 미종료라면 상대 턴으로 넘긴 뒤 합법적 행동 존재 여부를 검사하고, 하나도 없으면 상대 패배. 패스는 없다. [U2, D2]
- **G12 — 자원 보존:** 각 색 군사의 `공급 + 보드 = 20`. 각 종류 체스기물은 `reserve/onBoard/captured` 중 정확히 한 상태. 식량은 항상 정수 `0..5`. 잘못된 요청은 자원·보드·줄을 변경하지 않는다. [U1, D2]

### 온라인·시간·권한

- **G13 — 대전:** 비회원 닉네임과 초대 링크/방 코드. 두 자리만 존재한다. 방 생성자는 흑, 두 번째 참가자는 백으로 정한다. 같은 세션이 두 자리를 차지할 수 없다. 양쪽 준비 완료와 유효 연결이 확인되면 서버가 시작한다. [U2, D3]
- **G14 — 턴:** 서버 기준 60,000ms. 마감 시각과 같거나 늦게 서버에 도달한 새 행동은 시간 초과로 패배한다. 클라이언트 시계·전송 시각은 판정 근거가 아니다. [U2, D3]
- **G15 — 연결:** 플레이어마다 경기 전체 누적 180,000ms의 연결 끊김 대기 예산. 서버가 끊김을 확인하면 경기를 멈추고 턴의 남은 시간을 보존한다. 복귀해도 사용한 예산은 복구하지 않는다. 둘 다 연결되어야 턴 시계가 재개된다. [U2, U3]
- **G16 — 재접속:** 동일한 비회원 세션만 기존 자리를 복구한다. 방 코드·닉네임은 인증 수단이 아니다. 새로고침·중복 탭·ACK 유실·이전 소켓의 늦은 close가 자리를 탈취하거나 이중 행동을 만들면 안 된다. [D3]
- **G17 — 원자성:** 인증, 마감 판정, revision 확인, 규칙 검증, 상태 저장, 명령 영수증 저장이 일관된 순서로 처리되어야 한다. DB 커밋 뒤에만 ACK·새 상태를 전파한다. 서버가 실패한 쓰기를 성공으로 알리지 않는다. [D3]
- **G18 — 복구:** 서버 재시작 시 이전 `active/paused` 경기는 `aborted/server-interrupted`로 종료하며 승자를 만들지 않는다. 기록과 마지막 확정 보드는 보존한다. 클라이언트 연결 끊김 패배와 구별한다. 자동 경기 재개를 구현하지 않는다. [U4]
- **G19 — 화면:** PC·모바일 모두 군사/체스 배치, 이동, 장목 선택, 상태 확인을 수행할 수 있다. 작은 화면은 확대·스크롤 이동·착수 확인을 제공한다. 제스처나 재접속이 의도치 않은 착수를 만들면 안 된다. [U1, U3, D4]
- **G20 — 실행 경계:** 이번 후속 구현은 로컬 코드·검증·승인된 로컬 기록까지. 푸시·`git-branchless submit`·배포는 자동 실행하지 않는다. 모델 지정 불가를 지정 성공으로 기록하지 않는다. [U4, E4]

## 3. 설계 선택과 기각한 대안

| 안 | 장점 | 위험·비용 | 판정 |
|---|---|---|---|
| 단일 Fastify 프로세스 + SQLite + WebSocket | 방별 명령 순서와 DB 커밋 지점을 한곳에서 통제; 외부 서비스 불필요 | 한 프로세스·단일 DB 파일 운영, 수평 확장 없음 | **선택** |
| 관리형 실시간 DB 중심 클라이언트 동기화 | 연결·호스팅 기능 활용 가능 | 별도 계정·배포·권한 규칙 필요, 서버 권위 게임 판정과 시간 계약을 따로 구현해야 함 | 현재 로컬 권한·범위에 부적합 |
| 브라우저 P2P / 호스트 권위 | 중앙 상태 저장 최소화 | 호스트 이탈, NAT 연결, 상대 신뢰 문제와 시간 조작 | 기각 |

이 비교는 제품 성능 측정이 아니라 요구·권한에 따른 설계 판단이다. 분산 큐, 이벤트 소싱 프레임워크, ORM, 범용 저장소 인터페이스를 추가하지 않는다. JSON 상태 스냅샷과 명령 영수증 테이블이면 이번 복구 계약을 충족한다. [U4, D1]

### 모듈과 공개 표면

아래는 구현할 계약 스케치다. 경로는 모두 새로 만들 예정이며 현재 존재하지 않는다. [E1, D2–D4]

```text
src/game/       순수 규칙·이동·줄 판정; DOM, DB, Date, socket import 금지
src/protocol/   요청/응답 런타임 스키마와 공유 wire 타입
src/server/     세션·방·시간·원자적 저장·HTTP/WebSocket
src/web/        React 화면·입력·미리보기·서버 상태 구독
```

- `createGame(): GameState`: 초기 공급과 흑 턴을 만든다.
- `previewAction(state, actor, action): PreviewResult`: 합법성, 잠정 보드, 선택할 줄 후보를 계산한다. 원본을 바꾸지 않는다.
- `applyAction(state, actor, action, claimedLines): GameResult`: 선택한 줄까지 검증해 다음 상태 또는 명명된 오류를 반환한다.
- `hasLegalAction(state, color): boolean`: 군사 배치·체스 배치·체스 이동을 실제 규칙으로 검사하고 하나를 찾으면 종료한다.
- `openStore(path)`: SQL 구현을 감추는 구체 저장소. 테스트도 임시 SQLite 파일을 사용한다.
- `createMatchService(store, clock)`: 명령 처리, 연결 상태 변경, 기한 만료, 공개 스냅샷 생성. `clock`은 운영 실제 시계와 테스트 가짜 시계의 유일한 시간 이음매다.
- `buildApp(config, store, matchService)`: HTTP/WS 구성. listen은 `main.ts`에서만 수행한다.
- 브라우저는 `previewAction`으로 안내할 수 있지만 서버가 같은 행동을 다시 검증한다. 서버 상태에 낙관적으로 기물을 확정하지 않는다.

### 데이터 계약

- `Color = 'black' | 'white'`; `PieceKind = 'soldier' | 'rook' | 'bishop' | 'knight' | 'queen'`.
- `Cell = y * 20 + x`, `board`는 400칸. `null` 또는 `{ color, kind }`. 좌표의 소수·NaN·무한대·범위 밖 값은 wire 경계에서 거부한다.
- `GameState`: `board`, 색별 `food`, `soldiersInReserve`, 체스종별 `reserve/onBoard/captured`, 색별 `completedLines`, 판별 union인 `playing { turn } | finished { winner, reason }`.
- `CompletedLine`: 정규화된 `start`, 방향 `dx,dy` (`1,0/0,1/1,1/1,-1`), 정확히 5개 좌표. 색은 소속 리스트로 정한다. 왕관 수·보호 마스크는 이 리스트에서 파생하며 별도 변경 가능한 점수로 저장하지 않는다.
- `Action`: `placeSoldier { at } | placeChess { kind, at } | moveChess { from, to }`. `kind`에 soldier를 허용하지 않는 별도 union을 사용한다.
- `RoomState`: `waiting | active | paused | finished | aborted` 판별 union, 방 코드·두 자리·ready·게임 상태·`revision`, 타이밍 값. `paused`는 중단 전 턴 잔여시간과 각자의 연결 끊김 예산/시작점을 보유한다.
- 공개 스냅샷에는 보드·자원·완성 줄·턴·결과·ready/연결상태·내 색·남은 시간만 포함한다. 쿠키·토큰 해시·내부 세션 ID는 내보내지 않는다.
- `revision`은 게임·자리·ready·연결/종료 상태가 실제로 바뀔 때만 증가한다. heartbeat나 단순 시계 표시 갱신으로 증가시키지 않는다.
- 테스트 fixture는 타입을 만족하는 생성 함수로 만들고 `as any`/불완전 객체 단언으로 우회하지 않는다.

### 장목 선택을 포함한 한 행동

1. 클라이언트에서 행동 후보를 고르면 잠정 보드를 미리보기한다. 아직 서버 보드·식량·포획은 변경되지 않는다.
2. 잠정 보드의 모든 방향에서 연속 5개 창을 열거한다. 기존 득점 줄과 동일하거나, 같은 직선에서 기존 득점 줄과 좌표를 공유하는 후보는 제외한다.
3. 후보가 유일하면 자동 선택한다. 겹치는 대안이 있으면 사용자가 보호할 구간을 고른다. 선택한 후보와 같은 직선에서 겹치는 다른 후보는 제거한다. 다른 방향의 공유는 제거하지 않는다.
4. 선택 후에도 함께 인정 가능한 후보가 남으면 선택을 계속한다. 두 줄 승리에 필요한 수를 채웠으면 종료한다. 따라서 득점을 일부러 전부 생략하거나 유효한 교차 줄을 누락한 제출은 거부한다.
5. `action + claimedLines + expectedRevision + commandId`를 한 요청으로 보낸다. 서버가 원본 상태에서 다시 계산하고 선택 집합의 유효성과 누락을 검사한다.
6. 식량·보드·포획·보호·승패를 함께 확정한다. 시간 초과나 stale revision이면 전부 미반영이며 화면은 최신 상태로 돌아간다.

**선택 의미를 명시하는 설계 기본값:** 장목의 구간 선택은 전략적 선택이다. 예를 들어 10개 연속에서 중앙 5개를 고르면 같은 직선의 나머지 후보가 모두 겹쳐 한 줄만 확정될 수 있다. 양 끝의 겹치지 않는 5개씩을 고르면 두 줄이다. 서버는 선택된 집합에 추가 가능한 줄의 누락은 금지하지만, 더 높은 점수를 얻는 다른 구간 선택을 강제하지 않는다. 이는 '사용자가 5개를 선택'한다는 결정을 유지하기 위한 상세화다. 구현자가 임의로 최대 득점 조합을 대신 선택하지 않는다. [U2, U3, D2]

서버에 별도 `awaiting-line-selection` 영속 상태를 두지 않는다. 선택 UI는 로컬 초안이고 턴 시간은 계속 흐른다. 새로고침하면 초안만 사라지며 확정 보드는 그대로다. 포획·줄 선택 중간 상태를 저장하는 더 복잡한 대안은 기각한다. [D2, D3]

## 4. 온라인 프로토콜·저장·시계

이 절의 세부 값은 구현 기본값이다. 검증 결과를 꾸며 적은 수치가 아니다. [D3]

### HTTP

- `POST /api/session { nickname }`: 1–20개 Unicode code point의 trim된 닉네임. 제어문자 거부. 세션이 없으면 32바이트 암호학적 난수 토큰을 발급한다. 닉네임은 HTML이 아닌 텍스트로 출력한다.
- `GET /api/session`: 유효한 세션의 닉네임과 복귀 가능한 방 코드만 반환. 미인증은 401.
- `POST /api/rooms {}`: 빈 방 생성, 생성자를 흑 자리에 묶고 초대 경로 반환.
- `POST /api/rooms/:code/join {}`: 원자적으로 백 자리 확보. 같은 세션의 재요청은 기존 자리 반환, 제3자는 `ROOM_FULL`.
- `GET /api/rooms/:code`: 구성원에게만 공개 스냅샷 반환. 유출 방지를 위해 코드 조회만으로 참가자 정보나 경기 내용을 반환하지 않는다.
- `GET /api/health`: 상태 코드·최소 준비 상태. 비밀 설정·전체 환경변수 출력 금지.
- 초대 경로는 `/room/:code`. 실제 좌석 인증 토큰은 링크에 넣지 않는다.

### WebSocket

- `GET /api/rooms/:code/socket`: 쿠키 세션과 방 소속, 허용 Origin을 검증한 뒤 upgrade. cookie 플러그인을 인증 hook보다, websocket 플러그인을 WS route보다 먼저 등록한다. message handler는 동기적으로 부착한다. [R5, R7]
- 클라이언트 명령: `ready`, `action`; 각 명령은 `protocolVersion: 1`, `commandId`, `expectedRevision`, payload를 가진다. `ready`는 true를 설정하는 멱등 명령이며 토글이 아니다.
- 서버 메시지: `snapshot`, `ack { commandId, appliedRevision }`, `error { commandId?, code, currentRevision? }`. unknown 필드·타입·프로토콜 버전은 거부한다.
- 초기 연결·재연결은 전체 스냅샷을 받는다. 400칸의 턴제 보드에서 델타 패치·이벤트 재생 프로토콜을 먼저 만들지 않는다.
- 클라이언트의 미확정 명령은 한 개만 허용한다. 전송 전에 sessionStorage에 ID와 내용을 보관하고 ACK/스냅샷으로 확인한 후 지운다. 재접속 시 같은 내용·같은 ID로만 재전송할 수 있다. 구 revision을 새 ID로 자동 재실행하지 않는다.
- 서버에서 `(room, session, commandId)`가 같고 요청 내용도 같으면 저장된 ACK를 반환한다. 같은 ID에 내용이 다르면 `COMMAND_ID_REUSED`. 중복 ACK 처리로 자원이 다시 차감되면 안 된다.
- 연결당 최대 프레임 16KiB, 잘못된 JSON·과대 payload·인증 없는 요청을 통제한다. HTTP 본문도 16KiB로 제한한다. 고정 창 카운터로 세션/실제 remoteAddress별 방 생성·입장 시도를 제한한다. 프록시 헤더를 무조건 신뢰하지 않는다.
- 서버가 감지한 느린 소비자에게 계속 메시지를 쌓지 않는다. bufferedAmount가 1MiB를 넘으면 연결을 닫고 정상 재접속 경로로 복구시킨다.

### 세션과 방 수명

- 토큰은 HttpOnly, SameSite=Lax, Path=/ cookie. 운영에서는 Secure 필수. DB에는 SHA-256 해시만 저장한다. 토큰은 URL·로그·JS 저장소에 넣지 않는다. 불투명한 난수 토큰의 DB 조회로 인증하며 별도 비밀번호나 서명 키를 발명하지 않는다.
- 세션은 7일간 유효하며 인증 요청으로 갱신한다. 활성 경기 중에는 서버가 유효성을 유지한다. 만료된 세션을 닉네임만으로 복원하지 않는다.
- 초대 코드는 12자리 Crockford Base32 난수. 충돌은 DB unique 제약 후 재생성한다.
- 한 세션은 동시에 한 개의 대기/진행 방만 점유한다. 대기 방은 생성 30분 후 만료, 진행 경기는 턴/재접속 규칙으로만 종료한다. 종료 기록과 명령 영수증은 종료 후 7일 보관한 뒤 함께 삭제한다.
- 같은 세션의 새 소켓이 오면 최신 연결을 사용하고 이전 연결은 닫는다. 연결 generation을 비교하여 이전 소켓의 close/message가 새 연결을 끊김 처리하거나 행동하지 못하게 한다.

### SQL·원자성

- 테이블: `sessions`, `rooms`, `command_receipts`. 스키마 버전은 `PRAGMA user_version`으로 관리한다.
- `rooms`는 방 코드, 자리 session 참조, status, revision, versioned JSON snapshot, 생성/종료 시각을 저장한다. 필요한 조회 열만 별도 컬럼으로 둔다.
- SQLite WAL, foreign keys, 준비된 statement, 짧은 transaction을 사용한다. DB를 네트워크 파일시스템에서 공유하거나 두 서버 프로세스로 동시에 열어 경기 소유권을 나누지 않는다.
- accepted command는 revision 비교 갱신과 receipt 삽입을 하나의 transaction으로 처리한다. DB가 source of truth이고 메모리에는 소켓·스케줄러만 둔다. 조회-검증-저장 사이에 비동기 await를 넣지 않는다.
- 처리 순서: 입력/인증 → 동일 ID 영수증 조회 → 현재 시각의 종료/끊김 기한 정산 → 방 상태/연결/revision 확인 → 게임 규칙 적용 → DB 커밋 → ACK/스냅샷 전파.
- 중복 영수증은 이미 확정된 결과를 설명한다. 그 뒤 새 스냅샷은 더 높은 revision일 수 있으며 클라이언트가 과거 ACK로 화면을 되돌리지 않는다.
- write 실패 시 상태를 적용하지 않고 `SERVER_ERROR`를 명시하며 같은 명령을 안전하게 재확인할 수 있게 한다. 예외를 삼키거나 빈 성공 응답을 반환하지 않는다.
- 서버가 시작할 때 이전 active/paused 경기를 한 번에 `aborted/server-interrupted`로 저장한다. 대기 방의 ready/연결은 초기화한다. 완료 경기는 바꾸지 않는다.

### 시간 계약과 경계

- `clock.nowMs()`는 운영에서 단조 시계, 테스트에서는 제어 가능한 숫자다. wall-clock은 기록 시각과 클라이언트 표시 보조로만 쓴다. 재시작 시 경기 중단 정책이므로 프로세스 간 단조 시계 복원을 시도하지 않는다.
- 활성 턴은 `deadlineMonoMs`, 중단 시 `turnRemainingMs`로 표현한다. 연결이 끊기기 전에 이미 턴이 만료되었으면 시간 초과 패배가 먼저다.
- 끊김 감지는 close/error 또는 heartbeat로 한다. 5초마다 ping, 응답 없이 10초 경과하면 끊김을 확인한다. 예산 시작점은 추정 네트워크 단절 시점이 아니라 서버 감지 시점이다.
- paused 중 연결 끊긴 각자의 예산은 독립적으로 계속 줄어든다. 한쪽이 복귀해도 상대가 끊겨 있으면 턴 시계는 멈춘다. 먼저 예산이 만료된 플레이어가 패배한다.
- 두 예산이 정확히 같은 시각에 만료되면 `aborted/both-disconnected`로 무승패 중단한다. 색·메시지 처리 순서로 임의 승자를 만들지 않는다. 이는 동시 이탈에 대한 운영 기본값이며 행동 불가 패배 규칙을 바꾸지 않는다.
- 마감 시각에 복귀하거나 행동하면 만료가 우선한다. 재접속 handshake만으로 차감 예산을 리셋하지 않는다.
- 가까운 다음 마감에 timer 하나를 예약하고 콜백에서 실제 now를 다시 검사한다. 콜백 실행 지연이 추가 턴 시간을 주지 않는다. 테스트에서 60/180초의 실제 sleep을 하지 않는다.
- 종료 상태는 흡수 상태다. 늦은 행동·close·timeout·ready가 결과를 뒤집지 않는다.

## 5. PC·모바일 사용자 흐름

아래 흐름과 치수는 검증할 제품 계약이다. 시각 디자인은 소박한 보드 중심으로 구현하며 외부 폰트·이미지 다운로드를 필수로 하지 않는다. [D4]

1. 닉네임 입력 → 방 만들기 또는 초대 코드 입장 → 양쪽 정보·색·초대 링크 → 준비 → 흑부터 시작.
2. 내 턴: 군사/사용 가능한 체스기물 선택 → 교차점 선택 → 미리보기 → 필요하면 장목 구간 선택 → `착수 확정`.
3. 이동: 내 보호되지 않은 체스기물 선택 → 합법 목적지와 비용 표시 → 목적지 선택 → 미리보기·구간 선택 → 확정.
4. 상대 턴에는 보드 탐색·확대는 가능하지만 행동 전송은 불가. 식량·공급·제외된 체스기물·완성 줄·턴 시간은 항상 확인 가능.
5. 연결 중단: 누구의 연결이 끊겼는지, 각자 남은 복귀 예산, 멈춘 턴 시간 표시. 재연결 후 최신 스냅샷으로 초안을 폐기/재검증하고 자동 착수하지 않는다.
6. 종료: 승자·이유 또는 서버 중단을 구분해서 표시. 결과 후 입력 잠금, 새 방 만들기로 이동 가능.

- 렌더링은 SVG 보드와 HTML 상태/조작 패널. 20×20의 교차점을 셀 중심과 혼동하지 않는다.
- 기본 전체 보기와 확대 보기를 제공한다. 확대 시 교차점 간격 44 CSS px 이상, 네이티브 scroll container로 상하좌우 이동한다. `확대/축소/전체 보기` 버튼은 44×44 CSS px 이상이다.
- 전체 보기의 조밀한 교차점 터치는 선택 미리보기일 뿐 즉시 착수가 아니다. 확인 버튼에서 좌표·행동·식량 비용을 다시 보여 준다. 핀치 전용 제스처는 필수로 만들지 않는다.
- 화면 전체의 가로 overflow는 금지하되 보드 내부 스크롤은 허용한다. 보드와 조작 패널은 360px 폭에서도 사용 가능해야 한다.
- 흑백 외에 기물 모양·문자, 보호 윤곽·왕관으로 상태를 구분한다. 왕관은 줄별 끝점 마커로 렌더링하므로 공유 끝점에도 줄 정보가 사라지지 않는다.
- 키보드 방향키로 교차점 이동, Enter/Space로 선택, Escape로 초안 취소. roving focus로 400개 tab stop을 만들지 않는다. 화면읽기에는 좌표·색·종류·보호 여부를 제공한다.
- 한국어 UI. 닉네임·오류를 raw HTML로 넣지 않는다. 오류에는 사용자가 취할 수 있는 동작과 현재 상태를 표시한다.

## 6. 기술 기준 세트

2026-11-23에 공식 릴리스/레지스트리를 조회했다. Node는 최신 안정 LTS, 나머지는 조회 시점 stable dist-tag를 기준으로 선택했다. 설치·실행 호환성을 이미 검증했다는 뜻은 아니며 Task 1에서 lockfile과 실제 기동으로 확인한다. npm 패키지의 고정 EOL은 조회 메타데이터에 없어 **미공표/미확인**으로 기록한다. 저장소의 기존 버전 제약은 없다. [E1, R1–R12]

| 항목 | 고정 버전 | 릴리스일 UTC | 출처 |
|---|---|---|---|
| Node.js | 26.13.1 LTS | 2026-11-11 | [공식 릴리스](https://nodejs.org/en/blog/release/v26.13.1) |
| npm | 12.2.3 | 2026-11-18 | [registry](https://registry.npmjs.org/npm) |
| TypeScript | 7.0.2 | 2026-07-08 | [registry](https://registry.npmjs.org/typescript) |
| React / react-dom | 19.3.1 / 19.3.1 | 2026-10-14 | [react](https://registry.npmjs.org/react), [react-dom](https://registry.npmjs.org/react-dom) |
| Vite | 8.3.8 | 2026-11-11 | [registry](https://registry.npmjs.org/vite) |
| @vitejs/plugin-react | 6.3.0 | 2026-11-09 | [registry](https://registry.npmjs.org/@vitejs%2fplugin-react) |
| Fastify | 5.12.8 | 2026-11-02 | [registry](https://registry.npmjs.org/fastify) |
| @fastify/websocket | 11.3.7 | 2026-11-04 | [registry](https://registry.npmjs.org/@fastify%2fwebsocket) |
| @fastify/static | 10.1.12 | 2026-11-19 | [registry](https://registry.npmjs.org/@fastify%2fstatic) |
| @fastify/cookie | 11.1.5 | 2026-10-27 | [registry](https://registry.npmjs.org/@fastify%2fcookie) |
| better-sqlite3 | 13.2.0 | 2026-11-14 | [registry](https://registry.npmjs.org/better-sqlite3) |
| Zod | 4.6.7 | 2026-10-12 | [registry](https://registry.npmjs.org/zod) |
| Vitest | 5.1.1 | 2026-11-18 | [registry](https://registry.npmjs.org/vitest) |
| @playwright/test | 1.65.1 | 2026-11-13 | [registry](https://registry.npmjs.org/@playwright%2ftest) |
| @types/node | 26.6.6 | 2026-10-28 | [registry](https://registry.npmjs.org/@types%2fnode) |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 | 2026-09-09 | [react](https://registry.npmjs.org/@types%2freact), [react-dom](https://registry.npmjs.org/@types%2freact-dom) |
| @types/ws | 8.18.2 | 2026-09-29 | [registry](https://registry.npmjs.org/@types%2fws) |
| @types/better-sqlite3 | 9.6.0 | 2026-08-01 | [registry](https://registry.npmjs.org/@types%2fbetter-sqlite3) |

- Node 26는 active support 종료 2027-10-27, security support 종료 2029-04-30으로 조회됐다. Node 27 alpha와 로컬의 EOL Node 25는 제외한다. [R1, R2]
- 내장 `node:sqlite` RC 대신 위 드라이버를 쓴다. SQLite 엔진 버전은 드라이버의 번들 버전에 맡기고 Task 1에서 `sqlite_version()` 결과를 기록한다. 별도 시스템 sqlite 버전을 가정하지 않는다. [R3, R4]
- ES modules, TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. 서버는 NodeNext, `.ts` 상대 import, 빌드 시 `rewriteRelativeImportExtensions`. 브라우저는 Vite의 bundler 해석을 사용한다. `enum`, runtime namespace, 경로 alias를 서버 런타임에 요구하지 않는다. [R10, R11, D1]
- 개발 서버는 Node의 stable type stripping으로 `node --watch src/server/main.ts` 실행, 브라우저 TSX는 Vite로 처리한다. 타입 제거는 타입 검사 대체가 아니므로 별도 typecheck를 유지한다. [R10]
- React Compiler·추가 Babel·선택적 Vite peer 패키지는 사용하지 않는다. 확인한 plugin-react의 해당 peer들은 optional이다. [E5]
- 운영은 Fastify가 `dist/web` 정적 파일과 `/api`를 같은 origin으로 제공한다. 개발만 Vite가 `/api` HTTP/WS를 서버로 proxy한다. [R6, D1]
- 테스트 브라우저는 Playwright 고정 패키지가 설치하는 Chromium·Firefox·WebKit. 모바일 emulation은 실제 iOS/Android 기기 검증을 대체했다고 주장하지 않는다. [R8, D4]

## 7. 파일 지도와 명령 계약

이 파일 지도는 파일 소유권을 정하기 위한 예정 구조다. 불필요한 빈 파일은 만들지 않는다. [D1]

```text
package.json / package-lock.json / .node-version / .gitignore / .env.example
 tsconfig.json / tsconfig.server.json / vite.config.ts / vitest.config.ts
 playwright.config.ts
scripts/dev.mjs
src/game/{types,moves,engine,lines}.ts
src/protocol/messages.ts
src/server/{config,main,app,store,session,lobby,match,clock,socket}.ts
src/server/schema.ts
src/web/{index.html,main.tsx,App.tsx,styles.css}
src/web/{api.ts,useRoom.ts,Lobby.tsx,Match.tsx,Board.tsx,ActionPanel.tsx,LinePicker.tsx}
src/web/board-input.ts
 tests/game/{actions,lines,invariants}.test.ts
 tests/protocol/messages.test.ts
 tests/server/{store,session,lobby,match,socket,recovery,security}.test.ts
 tests/web/board-input.test.ts
 tests/helpers/{game,server}.ts
 e2e/{invite,match,mobile,reconnect}.spec.ts
 README.md / CHANGELOG.md
```

- `npm run dev`: `scripts/dev.mjs`가 backend watch와 Vite를 실행하고 SIGINT/SIGTERM 때 둘 다 종료. 포트 충돌을 숨기지 않는다.
- `npm run typecheck`: `tsc --noEmit`.
- `npm run build`: 서버 TS를 `dist/server`, 공유 모듈을 `dist/game`, `dist/protocol`로 출력하고 Vite를 `dist/web`로 빌드. 출력 루트는 `dist`, 서버 rootDir은 `src`.
- `npm start`: `node dist/server/main.js`; 개발 서버·TS 소스 런타임에 의존하지 않는다.
- `npm test -- <paths...>`: `vitest run <paths...>`.
- `npm run test:e2e -- <paths...>`: `playwright test <paths...>`.
- `npm run check`: typecheck + 전체 Vitest + build. E2E는 별도 마지막 관문에서 실행해 중복 실행하지 않는다.
- 설정: `HOST`(기본 127.0.0.1), `PORT`(3000), `PUBLIC_ORIGIN`(개발 http://localhost:5173), `DATABASE_PATH`(data/omokchess.sqlite), `NODE_ENV`. 운영은 HTTPS PUBLIC_ORIGIN과 영속·쓰기 가능한 DB 경로가 필요하다. `trustProxy` 기본 false.
- 운영 정적 경로는 실행 모듈 기준으로 구하고 cwd에 의존하지 않는다. .env 파일·DB/WAL/SHM·브라우저 trace·테스트 임시 파일은 커밋에서 제외한다. `.env.example`에는 비밀값을 넣지 않는다.

## 8. 서브에이전트 실행 계약

### 원문 스킬과 현재 하네스의 차이

요청한 스킬은 ordered plan file, `Task N` 발췌, BASE 기록, 새 구현자, 새 리뷰어, 명시적 모델, 태스크 커밋, 원장, 최종 브랜치 리뷰, 원격 submit을 요구한다. 확인한 발췌 스크립트는 `## Task N`부터 다음 같은/상위 heading 직전까지를 추출한다. 본 파일은 그 형식을 따른다. [S1–S4]

현재 도구의 `task` 및 eval `agent`에는 `model` 인자가 없다. 현재 상위 실행 규칙은 단일 작업/작은 변경의 반복 위임을 금지하고, 충분히 큰 독립 영역 2개 이상일 때만 위임한다. 따라서 원문 절차와 동일하다고 주장하지 않는다. 아래 대체 경로는 브리핑에서 승인받았다. [E4, U4]

### 이번 환경에서 사용할 대체 경로

1. 조정자가 초기 환경·공유 계약과 작은 선행 작업을 직접 수행한다. 설치된 다른 작업이나 사용자 파일을 덮어쓰지 않는다.
2. 모델은 도구가 실제 제공한 정보만 기록한다. `요청 모델: 지정 불가 / 실제 모델: 런타임 제공값 또는 미노출`로 남긴다. 비용 등급이나 모델 이름을 지어내지 않는다.
3. 충분한 독립 범위가 생기면 **한 배치**로 두 구현 범위를 보낸다. 추천 병렬 범위는 **서버 Task 5–8**과 **보드 Task 9**다. 공유 선행 Task 1–4는 완료되어야 한다.
4. 서버 작업자는 `src/server/**`, `tests/server/**`, `tests/helpers/server.ts`; 보드 작업자는 `src/web/Board.tsx`, `src/web/board-input.ts`, `tests/web/board-input.test.ts`만 소유한다. 공유 config·protocol·game 수정이 필요하면 조정자에게 근거를 보내고 멋대로 수정하지 않는다.
5. 작업자는 할당 범위를 구현하는 도중 build/lint/test/formatter를 반복 실행하지 않는다. 구현을 끝낸 뒤 해당 범위를 증명하는 좁은 검증을 한 번 실행한다. 수정이 생기면 그 수정의 검증만 다시 수행한다.
6. 조정자는 반환된 결과와 실제 증거를 통합하고 scope별 코드·스펙 검토를 수행한다. 독립 리뷰 위임도 2개 이상의 충분한 독립 범위가 있을 때만 같은 배치로 실행한다. 작은 단일 수정은 직접 처리한다.
7. 각 태스크는 해당 검증 증거와 검토가 모두 해결되어야 DONE이다. 서버 묶음의 일부가 끝났다는 중간 메시지만으로 Task 5–8을 일괄 완료하지 않는다.
8. Task 10–12는 App·화면 파일을 공유하므로 순차 통합한다. Task 13과 Task 14의 테스트 작성은 독립 파일 범위로 병렬화 가능하나 각 runner·DB·포트는 격리한다.
9. Task 15의 최종 관문은 조정자가 소유한다. 원격 게시 없이 로컬 구현 완료를 보고한다.

### 원문 스킬을 지원하는 다른 하네스에서 실행할 때

- Task 1–15를 순서대로, 태스크당 신규 구현자와 신규 리뷰어를 사용한다. 각 dispatch에서 실제 사용 가능한 모델 ID를 명시한다.
- 복잡한 규칙·시간·동시성(Task 2, 3, 7, 8, 13)과 최종 리뷰에는 고역량 모델을 지정한다. 환경/문서 등 기계적 범위는 검증된 저비용 모델을 선택한다. 특정 vendor의 모델명을 계획만으로 사용 가능하다고 가정하지 않는다.
- 전체 suite를 매 태스크 반복하지 않는다. 태스크의 명명된 검사만 끝에서 한 번 실행하고 전체 관문은 Task 15에서 한 번 실행하도록 구현자 템플릿의 반복 검사 문구를 조정한다.
- `git-branchless submit`과 원격 게시는 이 계획의 G20에 의해 보류한다. 실행 스킬의 '게시 완료'와 이 계획의 '로컬 구현 완료'를 구분한다.

### 공통 진행 원장·브리프·리뷰

- 실행 시 `.outline/sdd/progress.md`: 태스크 번호, 상태, 담당, 모델 지정 지원 여부, BASE/HEAD, 범위, 검증 명령/결과, 브리프/보고서 경로, unresolved finding 기록.
- 처음 Git 저장소를 만든 뒤 기준 커밋을 기록한다. 없는 `main`이나 `HEAD~1`을 가정하지 않는다. 최종 비교 기준은 시작 때 기록한 BASE다.
- 커밋은 실행 하네스의 선택적 `eval commit` API를 사용한다. 사용자/다른 작업자 변경을 `git add .`로 끼워 넣지 않는다. 구현자 여러 명이 같은 HEAD를 동시에 변경하지 않도록 커밋은 조정자가 통합한다.
- 브리프 발췌: `bash "$SDD/scripts/task-brief" "$PLAN" N "$BRIEF"`. `$SDD`는 실행 시 읽은 subagent-driven 설치 디렉터리, `$PLAN`은 이 파일. 파일명은 run ID와 task 번호로 고유하게 만든다.
- 구현자 입력: 브리프 + Global Constraints 원문 + 참조하는 인터페이스 절 + 선행 태스크 실제 산출물 + 수정 허용 파일 + 검증 명령 + 금지 사항. 대화 기록을 알고 있다고 가정하지 않는다.
- 구현자 출력: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, 변경 파일, 검증의 실제 출력, 보고서 경로. 조정자는 미관찰 테스트를 PASS로 적지 않는다.
- 리뷰 입력: 같은 브리프, 구현 보고서, 기록한 BASE–HEAD diff, Global Constraints. 판정은 Spec Compliance와 Code Quality를 분리한다.
- Critical/Important는 수정 후 그 변경의 좁은 검증·재검토로 해소한다. Minor도 해결하거나 이유를 원장에 남긴다. `Cannot verify from diff`는 조정자가 명명된 증거로 해결하기 전 DONE 처리하지 않는다.
- BLOCKED에는 원인/시도/누락 입력을 적고 맥락 보충·범위 분할 등 조건을 바꾼 뒤 재시도한다. 같은 실패를 확인하려고 동일 검사를 다시 돌리지 않는다.
- 외부 스킬 파일·설정을 수정하지 않는다. 현재 계획의 실행 계약을 브리프에 덧붙인다.

## 9. 구현 순서와 체크포인트

- 순차 선행: **1 → 2 → 3 → 4**.
- 독립 범위: **5 → 6 → 7 → 8**인 서버 경로와 **9** 보드 경로. 서버 Task 6·7은 `tests/helpers/server.ts`를 함께 수정하므로 직렬화한다.
- 화면 통합: **6 + 9 → 10**, **8 + 9 + 10 → 11 → 12**.
- 검증: **8 → 13**, **12 → 14**, **13 + 14 → 15**.
- 모든 태스크 번호는 위상 정렬되어 있다. 병렬 실행은 파일 소유권이 겹치지 않는 경우에만 허용한다. [D1]

체크포인트는 CP1(Task 3: 규칙 확정), CP2(Task 6: 영속 초대 방), CP3(Task 9: 서버 대전+입력), CP4(Task 12: 실제 PC·모바일 게임), CP5(Task 15: 인수 완료)다. 고위험 규칙·시간 처리는 UI 마감보다 먼저 검증한다. [D1]

## Task 1 — 로컬 실행 기반

### 범위와 의존성

- 선행: 없음. 실행 전 조정자가 G20·Git 초기화·Node/npm 버전을 확인한다.
- 파일: `package.json`, `package-lock.json`, `.node-version`, `.gitignore`, `.env.example`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `scripts/dev.mjs`, `src/server/config.ts`, `src/server/main.ts`, `src/server/app.ts`, `src/web/index.html`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/styles.css`.
- 관심사: 고정 의존성과 실제 실행 경로. 로비·경기 API의 성공하는 가짜 endpoint는 만들지 않는다.

### 구현

기술 기준 세트와 명령 계약을 설정한다. health endpoint와 앱 제목·규칙 안내를 가진 실제 초기 화면을 제공한다. 개발 proxy와 운영 static serving을 연결한다. SPA fallback이 잘못된 `/api` 요청을 HTML 200으로 숨기지 않도록 한다. 시그널에서 서버와 dev 자식 프로세스를 정리한다.

### 검증과 인수 기준

- `npm run typecheck && npm run build` 후 `npm start`로 health와 실제 페이지를 확인한다.
- 개발 모드에서 브라우저로 페이지를 열고 `/api/health`가 동일 origin proxy로 작동함을 관찰한다.
- 잘못된 필수 운영 설정과 이미 사용 중인 포트는 명시적 오류로 종료한다.
- DB 드라이버를 임시 메모리 DB로 열어 `sqlite_version()`을 기록한다. 설치 버전·native binding 호환성 미확인 상태로 다음 태스크에 가지 않는다.

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

## Task 3 — 오목 선택과 승패 판정

### 범위와 의존성

- 선행: Task 2.
- 파일: `src/game/lines.ts`, `src/game/engine.ts`, `src/game/types.ts`, `tests/game/lines.test.ts`, `tests/game/invariants.test.ts`, `tests/helpers/game.ts`.
- 고위험: G07–G12. Task 2와 공유 파일이 있으므로 순차 수행한다.

### 구현

§3의 previewAction/applyAction을 완성한다. 모든 방향의 5개 후보를 정규화하고 기존 줄·같은 직선 중복을 제거한다. 선택 집합 검사, 보호 합집합, 두 줄 승리, 다음 플레이어의 행동 불가 패배를 통합한다. 줄 검출은 최대 400칸의 명시적 순회로 구현하고 무필요한 전체 조합 탐색은 하지 않는다.

### 검증과 인수 기준

- 명령: `npm test -- tests/game/lines.test.ts tests/game/invariants.test.ts`.
- 네 방향·모서리·혼합 기물·6개 중 임의 5개 선택·교차 두 줄 즉시 승리·같은 직선 중복 거부·10개에서 서로 다른 선택 결과를 검증한다.
- 기존 보호 줄을 가로지르는 새 줄을 인정하되 기존 줄을 다시 세지 않는다. 보호는 왕관 끝점이 아닌 전 구성원에 적용된다.
- 여러 합법 행동의 결정적 시퀀스에서 군사·체스 보존, 식량 범위, 보호 불변을 확인한다. 승리와 상대 행동 불가가 동시에 성립하면 두 줄 승리가 우선한다. **CP1**.

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

## Task 9 — 교차점 보드 입력

### 범위와 의존성

- 선행: Task 3, Task 4.
- 파일: `src/web/Board.tsx`, `src/web/board-input.ts`, `tests/web/board-input.test.ts`.
- 서버 Task 5–8과 파일 범위가 독립이다. App.tsx·공유 stylesheet는 여기서 편집하지 않는다.

### 구현

400개 교차점·기물·완성 줄·왕관·선택·합법 이동 안내를 표시하는 controlled SVG Board를 만든다. props는 공개 게임 상태와 선택 상태, onSelect로 제한한다. 점수·식량·소켓 상태를 Board 내부에서 변경하지 않는다. 좌표 변환과 키보드 이동은 순수 함수로 분리한다.

### 검증과 인수 기준

- 명령: `npm test -- tests/web/board-input.test.ts`.
- 축소/확대/스크롤 후 교차점 좌표 변환, 가장자리 범위, 키보드 이동을 확인한다. 셀 중앙으로 한 칸 어긋나면 실패다.
- 임시 브라우저 렌더링 harness로 실제 Board를 열어 흑백·네 체스기물·다섯 기물 보호·공유 끝점 왕관·focus를 관찰한다. harness는 증거 확보 후 제거한다.
- 포인터 선택은 의도만 반환하고 확정 행동을 전송하지 않는다. 서버 경로가 완료되면 **CP3**.

## Task 10 — 초대 로비 화면

### 범위와 의존성

- 선행: Task 6, Task 9.
- 파일: `src/web/api.ts`, `src/web/Lobby.tsx`, `src/web/App.tsx`, `src/web/styles.css`, `e2e/invite.spec.ts`.
- 관심사: session → room 생성/입장. 실제 API만 사용한다.

### 구현

닉네임·방 만들기·코드 입장·초대 링크 복사/수동 선택·자기 색과 상대 표시·새로고침 세션 복구를 구현한다. `/room/:code`로 직접 들어오면 세션 생성 후 참여하며, 이미 참가한 세션은 재입장한다. 아직 연결 전 ready를 성공 처리하지 않는다.

### 검증과 인수 기준

- 명령: `npm run test:e2e -- e2e/invite.spec.ts --project=chromium`.
- 두 격리 browser context로 생성/초대/입장하고 같은 cookie jar의 두 탭을 두 플레이어로 오인하지 않는다.
- 없는 코드·가득 찬 방·만료·서버 오류에서 명확한 메시지와 복구 동작을 제공한다.
- 새로고침 후 동일 좌석을 유지하며 초대 URL에 비밀 토큰이 없다.

## Task 11 — 실제 경기 화면 통합

### 범위와 의존성

- 선행: Task 8, Task 9, Task 10.
- 파일: `src/web/useRoom.ts`, `src/web/Match.tsx`, `src/web/ActionPanel.tsx`, `src/web/LinePicker.tsx`, `src/web/App.tsx`, `e2e/match.spec.ts`.
- 관심사: 준비부터 승리까지 실제 경기 흐름.

### 구현

프로토콜 구독, ready, 미확정 단일 명령, authoritative snapshot, 행동 preview와 LinePicker, 식량/공급/포획 상태, 시계/중단/결과 화면을 연결한다. 네트워크 재시도는 같은 명령을 식별하는 최소 연결 복구 범위로 한정한다. revision 변화 시 오래된 초안을 확정하지 않는다.

### 검증과 인수 기준

- 명령: `npm run test:e2e -- e2e/match.spec.ts --project=chromium`.
- 두 브라우저의 실제 UI로 ready → 군사 배치 → 식량 축적 → 체스 배치/이동/포획을 수행하고 양쪽 상태 일치를 확인한다.
- 합법 수열로 두 줄을 완성하여 동일한 승패를 보고 이후 입력이 막힌다. 브라우저 스크립트로 앱 state를 주입해 성공을 꾸미지 않는다.
- 장목 선택·보호 기물 비활성화·식량 부족·상대 턴·오래된 초안이 보이는 화면과 서버 판정에 일치한다.

## Task 12 — 모바일 조작과 접근성

### 범위와 의존성

- 선행: Task 11.
- 파일: `src/web/styles.css`, `src/web/Board.tsx`, `src/web/Match.tsx`, `src/web/ActionPanel.tsx`, `src/web/LinePicker.tsx`, `e2e/mobile.spec.ts`.
- Task 9–11과 공유 파일이 있으므로 해당 작업과 병렬 편집하지 않는다.

### 구현

§5의 360px 이상 반응형 화면, 확대/축소/전체 보기, 보드 내부 scroll, 착수 확인, focus/키보드/접근성 이름을 완성한다. 모바일 주소창/화면 회전에 조작 패널이 사라지지 않도록 한다. 터치 이동 후 실수로 선택·확정되지 않게 한다.

### 검증과 인수 기준

- 명령: `npm run test:e2e -- e2e/mobile.spec.ts --project=mobile-chromium --project=mobile-webkit`.
- 360/390/768px 화면에서 확대·스크롤·좌표 선택·장목 선택·확정이 동작한다. 페이지 전체 가로 overflow가 없고 보드 내부는 이동 가능하다.
- 실제 브라우저에서 1440px PC와 390px 모바일 screenshot을 확보한다. 보호 상태·식량·시간·확정 버튼이 가려지지 않는다.
- 키보드만으로 목적지 선택·취소·확정이 가능하고, 색만으로 상태를 구별하지 않는다. 모바일 emulation/실기기 증거를 구분한다. **CP4**.

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

## Task 14 — 재접속과 교차 브라우저 인수

### 범위와 의존성

- 선행: Task 12.
- 파일: `e2e/reconnect.spec.ts`, `e2e/match.spec.ts`, `e2e/mobile.spec.ts`, `playwright.config.ts`.
- UI 경계 시나리오 검증. Task 13과 테스트 파일 소유권이 독립이다.

### 구현

독립 두 context, 데스크톱/모바일 project, 클라이언트 네트워크 단절·새로고침·새 탭 연결, 장목 선택 도중 상대 끊김, 미확정 명령 복구를 실제 화면에서 검증한다. 테스트마다 고유 DB/포트/방/쿠키를 사용한다. browser clock만 앞당겨 서버 시간이 바뀌었다고 주장하지 않는다.

### 검증과 인수 기준

- 명령: `npm run test:e2e -- e2e/reconnect.spec.ts --project=chromium`.
- 실제 끊김 감지 후 화면이 paused로 바뀌고, 복귀하면 같은 좌석·보드·남은 시간으로 돌아온다. 초안은 자동 착수되지 않는다.
- 새 탭이 기존 연결을 대체해도 이전 close가 새 연결을 중단시키지 않는다. 대체된 탭은 상태를 분명히 표시하고 자동 소켓 탈환 루프를 만들지 않는다.
- Chromium/Firefox/WebKit 및 두 모바일 project를 최종 관문에서 실행할 수 있도록 모든 spec의 지원 project를 명시한다. 60/180초 경계 자체는 Task 7의 가짜 서버 시계 검증을 근거로 삼는다.

## Task 15 — 인수 관문과 운영 문서

### 범위와 의존성

- 선행: Task 13, Task 14 및 Task 1–12 모두.
- 파일: `README.md`, `CHANGELOG.md`, `.env.example`. 필요 시 명명된 결함 파일만 추가 승인한다.
- 조정자가 최종 통합과 실행 원장의 소유자다. 외부 게시·배포는 하지 않는다.

### 구현

설치·개발·빌드·운영·동일 LAN 두 기기 실행·초대·게임 규칙·서버 중단 정책·DB 보존·지원 브라우저·복구 제한을 문서화한다. LAN에서 접근할 때 HOST/PUBLIC_ORIGIN을 실제 주소로 맞추고 비보안 개발 HTTP는 신뢰 네트워크에만 사용하도록 명시한다. 운영 HTTPS reverse proxy의 WebSocket upgrade와 영속 DB 요구를 설명하되 특정 외부 서비스를 설정하지 않는다.

### 검증과 인수 기준

- 한 번의 최종 관문: `npm run check` 후 `npm run test:e2e`. 이미 실행한 검사를 이유 없이 다시 반복하지 않는다. 실패 후 수정된 경로만 재검증하고 결과를 분리 기록한다.
- production build를 `npm start`로 열어 두 context의 초대→착수→승패를 확인한다. 개발 proxy가 없으면 동작하지 않는 구현은 실패다.
- §10의 모든 요구가 증거에 연결되고 Critical/Important 검토 지적이 남아 있지 않다. 임시 harness와 throwaway script를 제거하고 테스트를 제거해 실패를 숨기지 않는다.
- README/CHANGELOG가 실제 동작·명령·제한과 일치하며 실제 관찰한 테스트/브라우저/미검증 실기기 범위를 보고한다. **CP5: 로컬 구현 완료**, 인터넷 배포 완료가 아님.

## 10. 요구사항 추적과 최종 인수 체크리스트

아래 표의 증거는 후속 실행에서 채울 대상이다. 이 계획 작성 시점에는 모두 **미실행**이다. [D1]

| 요구 | 구현 태스크 | 증거 |
|---|---|---|
| G01–G04 보드·공급·배치·식량 | 2, 9, 11 | actions.test + 실제 배치 E2E |
| G05–G06 이동·포획·군사 반환·체스 영구 제외 | 2, 11 | 네 기물 이동/포획 테스트 + UI 이동 |
| G07–G09 오목·장목 선택·줄 중복 | 3, 11 | lines.test + LinePicker E2E |
| G10 전체 5개 보호 | 2, 3, 9, 11 | 각 구성원의 이동/포획 거부 + 보호 표시 |
| G11–G12 승패·행동 불가·자원 보존 | 2, 3, 7 | invariants.test + 종료 후 입력 거부 |
| G13 초대·두 자리·시작 | 6, 8, 10 | lobby/socket tests + invite E2E |
| G14 60초 | 7, 11 | 경계 시계 테스트 + 화면 표시 |
| G15 누적 180초·턴 정지 | 7, 8, 14 | 누적·양쪽 끊김 테스트 + reconnect E2E |
| G16 인증·재접속·중복 탭 | 6, 8, 11, 13, 14 | 실제 소켓 세대/위조/재전송 검증 |
| G17 원자적 상태와 멱등성 | 5, 7, 8, 13 | transaction 실패·ACK 유실·동시 join |
| G18 서버 중단·보존 | 5, 13, 15 | 프로세스 재시작 및 DB 재열기 |
| G19 PC·모바일 | 9, 11, 12, 14 | viewport/입력/키보드 테스트와 screenshot |
| G20 로컬 권한·실행 보고 | 1–15 | 원장·실제 검증 로그·미게시 명시 |

- [ ] 유효한 모든 행동이 두 플레이어에게 같은 revision과 보드로 보인다.
- [ ] 잘못된/중복/오래된 행동으로 자원이 손실되거나 두 번 소비되지 않는다.
- [ ] 보호된 5개 중 어느 것도 이동·포획되지 않는다.
- [ ] 장목의 선택과 교차/동일 직선 줄 규칙이 사용자 결정과 일치한다.
- [ ] 두 줄 승리·행동 불가·시간 초과·이탈 패배·서버 중단의 이유가 구별된다.
- [ ] 새로고침과 재연결로 자리·식량·시간 예산이 리셋되지 않는다.
- [ ] PC·모바일에서 모든 행동과 장목 선택을 완료할 수 있다.
- [ ] 실제 production build, SQLite, 네트워크, 두 세션으로 검증했다.
- [ ] 자동 테스트·시각 증거·검토·문서가 연결되고 미검증 범위를 명시했다.
- [ ] 원격 게시/배포를 수행하지 않았거나 별도 명시 승인과 결과를 구분 기록했다.

## 11. 위험, 미해결 질문, 완료 경계

| 위험 | 방지·검증 | 소유 |
|---|---|---|
| 게임 규칙과 화면 안내가 달라짐 | 공용 순수 엔진; 서버 재검증; preview/apply 동일 시나리오 | Task 2, 3, 11 |
| 장목을 모두 자동 득점하거나 보호를 끝점에만 적용 | 선택 집합 명세·구성원 전체 테스트 | Task 3 |
| 시간/재접속/행동 경쟁 | 단조 시계·기한 우선 처리·종료 흡수 상태 | Task 7 |
| DB 반영 전 성공 전파 | receipt와 상태 원자 저장; ACK 유실 회귀 | Task 5, 8, 13 |
| 방 코드나 닉네임으로 자리 탈취 | HttpOnly 세션·DB 소속 확인·Origin 검사 | Task 6, 8, 13 |
| 모바일 20×20 오입력 | 확대/보드 스크롤/확정 버튼/실제 viewport 검증 | Task 9, 12 |
| native DB driver와 Node 호환 | Task 1 실제 install/open 증명; 실패 시 원인 기록 후 버전 변경 근거 재조사 | Task 1 |
| 동기 SQLite가 많은 방에서 지연 | 짧은 transaction·bounded 메시지·단일 프로세스; 미측정 처리량을 보장하지 않음 | Task 5, 8 |
| 워커의 공유 파일 충돌 | 공유 선행 작업 직접 수행, 서버/보드 파일 소유권 분리 | 조정자 |
| 스킬 모델·게시 요구와 하네스 제약 | 승인된 대체 절차·원문과 차이 기록·원격 승인 분리 | 조정자 |

### 남은 질문과 게이트

- **게임 규칙의 필수 사용자 질문:** 현재 없음. §3의 장목 선택 상세화와 §4의 동시 이탈 기본값은 명시된 설계 결정이며, 구현 전 사용자 재정의가 오면 영향을 받는 테스트·태스크를 함께 갱신한다.
- **원문 스킬의 완전한 동일 실행:** 현재 하네스에서는 모델 지정과 단일 작업 반복 위임을 충족할 수 없다. 승인된 대체 경로로 로컬 구현은 가능하나 원문 스킬 완전 준수로 보고하지 않는다.
- **외부 운영:** 배포 대상·도메인·TLS·공개 서비스 운영 규모는 미정. 로컬 구현을 막지 않으며 공개 배포 전에 별도 결정한다.
- **실제 성능·실기기:** 동시 방 수, p95 응답시간, 실제 iPhone/Android 사용성은 아직 측정하지 않았다. 본 계획에는 가짜 벤치마크나 실기기 PASS가 없다.
- **설치 검증:** 표의 버전은 채널 조회 근거이며 실제 설치 검증은 Task 1의 관문이다. 패키지의 미공표 EOL은 확인된 날짜처럼 적지 않는다.

이 계획의 완료는 사용자 승인 브리핑, 출처 있는 기술 기준, 발췌 가능한 태스크, 의존성·파일 경계·검증·인수 조건의 작성까지다. 애플리케이션 완성은 Task 15의 관문 통과로 별도 판정한다. [U4, S1, D1]

## 12. 근거와 참조

### 사용자·환경 근거

- **U1:** 이번 대화의 최초 사용자 요구. 20×20, 플레이어별 군사20/체스4, 세 가지 행동 비용, 두 줄 승리, 완성 줄 5개 전부 이동·제거·공격 금지.
- **U2:** askme 응답: `initial_food=0`, `line_members=mixed`, `overline=choose_five`, `line_overlap=allow`, `no_legal_action=lose`, `match_entry=guest_invite`, `disconnect=180_seconds`, `turn_clock=60_seconds`.
- **U3:** 후속 응답 `collinear_overlap=forbid`, `disconnect_budget=cumulative_per_player`와 재정의되지 않은 gated 규칙. 전체 보호는 에이전트가 만든 규칙이 아니라 U1 원문에 명시되어 있다.
- **U4:** 계획 요청과 브리핑 질문의 `briefing=approve`. 서버 재시작 무승패 중단·단일 서버·로컬 실행 경계·현재 하네스 대체 절차 포함.
- **E1:** 계획 단계 `read .` → `(empty directory)`. 앞선 명확화 단계도 동일 결과.
- **E2:** `read memory://root` → 프로젝트 메모리 없음.
- **E3:** 읽기 전용 환경 명령에서 node/npm/git/git-branchless 버전 확인. `git rev-parse --show-toplevel`은 경로 반환 없음.
- **E4:** 현재 task 도구 schema와 `xd://eval/agents` 문서: agent dispatch에 model 인자 없음. 상위 위임 제한은 현재 실행 지침.
- **E5:** npm packument의 dist-tags.latest, time[version], engines, deprecated 및 plugin-react peerDependenciesMeta를 2026-11-23 조회. 모든 선택 버전의 prerelease/deprecated 표시는 없음. 실제 install 검증은 아직 하지 않음.

### 공식 문서·레지스트리

- **R1:** Node 릴리스 정책·채널: https://nodejs.org/en/about/previous-releases
- **R2:** Node 26.13.1 공식 릴리스: https://nodejs.org/en/blog/release/v26.13.1 ; 지원 일정 보조 근거: https://endoflife.date/api/v1/products/nodejs/
- **R3:** 내장 SQLite RC 상태: https://nodejs.org/api/sqlite.html
- **R4:** better-sqlite3 설치·transaction·WAL: https://github.com/WiseLibs/better-sqlite3
- **R5:** Fastify WebSocket 등록·인증 hooks·동기 handler·오류 처리: https://github.com/fastify/fastify-websocket
- **R6:** Fastify static 호환성·SPA 파일 제공: https://github.com/fastify/fastify-static
- **R7:** Fastify cookie hook 순서·속성·호환성: https://github.com/fastify/fastify-cookie
- **R8:** Playwright 독립 browser context와 다중 사용자 검증: https://playwright.dev/docs/browser-contexts
- **R9:** Vite runtime/브라우저 기준·React TS 템플릿: https://vite.dev/guide/
- **R10:** Node 26 TypeScript type stripping과 .ts import: https://nodejs.org/docs/v26.13.1/api/typescript.html
- **R11:** TypeScript 상대 import 확장자 출력: https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html
- **R12:** §6 각 npm registry 링크. 패키지별 버전·릴리스 시각·engines를 조회한 원천.

### 실행 스킬

- **S1:** `skill://subagent-driven` — 태스크·커밋·리뷰·원장·게시 절차.
- **S2:** `skill://subagent-driven/scripts/task-brief` — `Task N` heading 기반 발췌 계약.
- **S3:** `skill://subagent-driven/references/implementer-prompt.md` — 브리프·보고서·상태 계약.
- **S4:** `skill://subagent-driven/references/task-reviewer-prompt.md` — 스펙/품질 분리 판정·중앙 해소 의무.
- **D1:** 승인된 단일 애플리케이션 구조·로컬 범위·작업 경계에 대한 본 계획의 결정.
- **D2:** 사용자 게임 규칙의 데이터 모델·순수 엔진·선택 원자성 상세화.
- **D3:** 서버 권위·인증·시간·재접속·영속화의 구현 기본값.
- **D4:** PC·모바일 입력·접근성·검증 화면의 구현 기본값.
