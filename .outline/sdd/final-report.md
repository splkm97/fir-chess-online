# 오목체스 로컬 구현 인수 결과

판정: **완료 — 로컬 구현·검증 범위**. 외부 게시·배포는 수행하지 않았다. 승인 계획의 15개 태스크를 구현했으며, 스킬의 원문과 다른 하네스 제약은 원장에 기록했다.

## 구현

- 순수 TypeScript 규칙 엔진: 군사·체스 배치/이동/포획, 식량, 장목 선택, 교차 줄, 같은 직선 중복 방지, 다섯 기물 전체 보호, 두 줄/행동 불가 승패.
- Fastify + 실제 WebSocket + SQLite: 비회원 초대, 세션 인증, 서버 권위, 원자적 저장/명령 영수증, 60초 턴, 누적 180초 재접속, 소켓 교체, 서버 재시작 무승패 중단.
- React PC·모바일 화면: 보드 확대·이동·착수 확인, 키보드와 touch, 전체 보호와 왕관, 공급/제외/식량, 연결/결과 상태.
- README, CHANGELOG, 고정 lockfile, 실행 명령과 영속 원장.

## 관찰된 검증

| 범위 | 실제 결과 |
|---|---|
| 종합 관문 `npm run check` | typecheck + 12개 파일 107개 단위/통합 테스트 + production build 통과 |
| 최종 개발 proxy 회귀 | `tests/server/development.test.ts` 1개 추가 통과. 실제 Vite의 `/api.ts` 모듈 전달과 `/api/health` backend proxy 검증 |
| Chromium 최초 통합 | 7개 UI 시나리오 통과 |
| 확장 교차 브라우저 | 총 41개 유효 시나리오/브라우저 조합 검증. Chromium 8, Firefox 8, WebKit 8, mobile Chromium 9, mobile WebKit 8 |
| 전용 touch 사례 | CDP 네이티브 touch 스와이프는 mobile Chromium에서 실행. 나머지 4개 구성에서는 해당 단일 사례를 명시적으로 제외 |
| 실제 LAN HTTP | isSecureContext=false, crypto.randomUUID=undefined 환경에서 독립 PC/모바일 세션 준비·착수·상태 일치 확인. 모바일은 실제 touch 이벤트 사용 |
| 개발 경로 | npm ci 성공 후 npm run dev의 Vite 화면, HTTP proxy, WebSocket 연결, 방 생성 관찰 |
| 접근성 | axe-core 4.13.0: 로그인 0 violations/0 incomplete, 대국 0 violations. 좌표 라벨 40개의 color-contrast 수동 검토: 실제 fill rgb(35,53,45), 배경 rgb(233,212,165), 대비 8.9123:1로 AA 충족 |
| 시각 증거 | `.outline/sdd/evidence/lan-desktop.png`, `lan-mobile.png`; 실제 브라우저에서 확인 |

단위/통합은 종합 107개에 최종 proxy 회귀 1개를 더해 **108개**를 검증했다. 전체 108개를 한 번에 다시 실행했다고 주장하지 않는다. 브라우저도 실패 수정 후 영향받은 시나리오와 아직 실행하지 않은 브라우저 구성을 이어서 실행했으며, 성공한 전체 조합을 불필요하게 반복하지 않았다.

## 발견·수정한 결함

1. finished 게임 스냅샷에 playing의 turn 필드가 남는 문제: 종료 형태를 별도로 구성하고 strict protocol 회귀 통과.
2. static index:false로 운영 `/`가403을 반환: 기본 index.html 처리 복원, 실제 전체 E2E로 검증.
3. 연결 끊김 DB 저장 실패 시 이벤트 유실: 감지 시각 보존·저장 후 제거·기한 전 정산·재시도. 실제 소켓과 SQLite 실패 trigger 회귀 통과, 독립 ServerAudit 재검토 correct.
4. HTTP LAN의 secure-only UUID API: crypto.getRandomValues로 UUID v4 생성, 실제 insecure LAN 착수 성공.
5. 개발 `/api` proxy가 클라이언트 모듈 `/api.ts`까지 가로채는 문제: prefix `/api/`로 한정. 실제 개발 화면/WS 및 영속 회귀 테스트 통과.
6. 브라우저 테스트의 중복 텍스트 locator와 Firefox offline 자동 navigation 경쟁: 유일한 배너를 지정하고 네트워크 단절 상태에서 명시적으로 페이지를 비운 뒤 재진입. 실제 재접속 검증 통과.
7. 교차 브라우저 테스트의 DB·세션·요청 제한 간섭 예방: worker별 실제 서버/임시 DB/임시 포트 fixture. 애플리케이션 rate limit을 테스트용으로 완화하지 않았다.

## 독립 검토

- ServerAudit: G01–G18·원자성·인증·시간·복구 검토. P1 수정과 회귀 증거 후 **correct**, 추가 지적 없음.
- FrontendAudit: 화면/공통 규칙·pending 명령·ACK/revision·E2E 증거 검토. locator 수정과 추가 fault/touch/draft 검증 검토 후 **correct within targeted changes**, 추가 지적 없음.
- 두 검토 모두 읽기 전용이며 테스트를 중복 재실행하지 않았다. 상세: `review-findings.md`, 구현 보고서 및 diff 패키지.

## 실행 상태와 제한

- 로컬 브랜치: `feat/omokchess-online`.
- 개발 서버: `http://localhost:5173` (이번 세션에서 실행). 재실행: `mise exec node@26.13.1 -- npm run dev`.
- 원격 저장소·커밋 푸시·git-branchless submit·공개 서비스 배포 없음.
- iPhone/Android **실기기** 검증, 실서비스 부하·인터넷 지연 측정, 외부 HTTPS reverse proxy 운영은 미수행.
- touch 자동화는 Chromium emulation의 수직 스와이프. 모든 브라우저의 멀티터치/스크린리더 실기기 조합을 검증했다고 주장하지 않는다.
- 서버 재시작은 진행 경기 재개가 아니라 무승패 중단이다. 계정·랜덤 매칭·랭킹·관전·AI는 범위 밖.
- npm12는 optional fsevents와 better-sqlite3 install script를 정책상 차단하는 경고를 출력했다. prebuilt driver를 사용하는 실제 fresh npm ci 후 서버/SQLite 기동이 성공했으며 임의 스크립트 허용은 추가하지 않았다.
- 사용자 `.idea/**`는 보존했다. LSP 환경 인식 실패를 기록했고 타입 검사는 실제 tsc로 수행했다.

## 마지막 추가 파일의 타입 검증

개발 proxy 수정과 `tests/server/development.test.ts` 추가 뒤, 해당 테스트와 `vite.config.ts` 및 직접 import된 의존성을 프로젝트의 strict/정확한 optional/index 접근 옵션으로 좁혀 타입 검사했다. 종료 코드 0. 이미 통과한 107개 테스트·production build·41개 브라우저 조합은 같은 변경을 증명하지 않는 중복 검사로 다시 실행하지 않았다. 마지막 변경은 실제 개발 브라우저/HTTP/WS, 추가 회귀 테스트, 이 타입 검사로 검증했다.
