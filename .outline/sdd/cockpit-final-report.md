# PC 전술석 구현 인수

상태: **완료 — 로컬 UI 구현·검증 범위**. 원격 게시·배포 없음.

## 승인된 방향과 실제 적용

전술석 3열 / 핵심 정보 우선 / 120ms / IBM Plex Sans KR.
- 왼쪽: 상대·내 자원, 실제 배치 선택. 중복 내 기물 목록 제거.
- 가운데: 가용 너비·높이에 맞춘 전체 보드. 확대에서만 내부 스크롤, 키보드 조작과 보호 줄 안내 disclosure.
- 오른쪽: 단일 턴·시계, 선택 수·비용, 장목 선택, viewport 안에 유지되는 확정/취소.
- 정상 연결·브랜드 정보는 작게, 실패·재접속·미확정 요청은 숨기지 않는다. pending retry를 command 영역으로 옮겨 요청 중 보드가 흔들리는 문제를 없앴다.
- 커스텀 OKLCH 다크 중립색·밝은 보드·명명된 타입/간격/반경/그림자/모션 토큰. 단색 SVG 기물·왕관. legacy font glyph mapping 삭제.
- 단일 DOM의 작은 화면/낮은 창 fallback. 게임 엔진·서버·프로토콜·useRoom 수정 없음.

## 실행·검증 근거

- BASE: `1d69e4242d2bc6a4951d142591c77230fbcb230d`.
- 주 구현 커밋: `5deae63e0aaa414c2797c1973c10e94c709c7d14`.
- 통합 TypeScript 검사와 production Vite build 통과.
- PC 새 시나리오: Chromium3 + Firefox3 + WebKit3 = 9개 통과. 1280×720/1366×768/1440×900/1920×1080에서 전체 보드·모든 배치 버튼·확정의 viewport fit. 장목과 실제 서버 응답 보류 상태에서도 footer/board 위치 유지.
- 기존 PC gameplay/reconnect Chromium6개 통과.
- 기존 mobile gameplay/reconnect/zoom/keyboard/native-touch: 15개 통과, WebKit에서 CDP 전용 touch1개 제외.
- 검토에서 발견한 ready ACK 유실 복구 회귀: Chromium/mobile-WebKit 2개 통과. 실제 서버 연결을 유지한 채 ACK만 차단하고 게임 시작 후 같은 ID를 재전송하여 다음 착수까지 검증.
- 따라서 이번 변경과 관련된 유효 E2E **32개**를 검증했다. 수정된 경로만 재검증했으며 이전 게임의 서버 전체 suite를 반복하지 않았다.

## 실제 화면 증거

- `.outline/sdd/evidence/cockpit-before.png`: 원래 화면, 1366×768에서 문서 높이1304px·보드 높이866px로 전체 판이 한 화면에 들어가지 않음. 실제 착수 뒤의 스크롤 상태로 캡처했으므로 화면상 top 좌표는 비교하지 않는다.
- `.outline/sdd/evidence/cockpit-after.png`: 최종 다크 전술석, 실제 두 세션에서 군사·룩 배치와 이동 미리보기를 수행한 화면. viewport1366×768, document1366×768.
- `.outline/sdd/evidence/cockpit-mobile.png`: 최종390px 문서 흐름. document width390px 확인.
- 별도 실제 대국에서 모든 체스기물의 흑/백 SVG, 완성된 다섯 기물과 왕관, 나이트 이동 미리보기를 관찰했다. page state를 주입하지 않고 UI로 실제 수를 진행했다.
- desktop zoom: 가시영역544×544px, 확대 보드880×880px, 문서 높이768px 유지. 전체 보기로 복귀.
- 키보드 Enter로 조작·보호 줄 disclosure 열기/닫기. 열린 내용 top644/bottom712로 viewport768 안에 위치.
- 낮은1366×600 창에서는 문서 흐름으로 복귀하며 스크롤 후 footer button top531.98/bottom575.98로 조작 가능. 가로 overflow 없음.
- reduced-motion 환경을 실제로 바꿔 transition `0.12s` → `0s` 확인.

## 접근성

실제 새 대국 화면에서 axe-core4.13.0 **violations0**. 재배치 직후 h1→h3였던 heading-order를 자원/배치 h2로 교정했다. 종료 화면의 결과 제목 focus(`백 승리`)도 관찰했다.

axe가 짧은 SVG 축 문자40개에 자동 대비 판정을 보류하므로 실제 토큰을 sRGB로 변환해 수동 확인했다. 숨기거나 검사에서 제외하지 않았다.

| 역할 | 측정 대비 |
|---|---:|
| 본문 / 배경 | 15.20:1 |
| 보조 문자 / 배경 | 8.17:1 |
| 보드 좌표 / 보드 | 8.04:1 |
| 일반 조작 경계 / 패널 | 3.35:1 |
| 주요 버튼 문자 / 강조 | 9.26:1 |
| 보드 focus·선택 윤곽 / 보드 | 4.79:1 |
| 보호·왕관 / 보드 | 4.67:1 |
| 기물 내부 SVG / 기물 | 16.32:1 |

일반 조작 경계는 초기2.28:1을 발견해 border 명도0.47→0.56으로 올렸고 최종3.3456:1을 실측했다. 반투명 이동/줄 채움은 보조 장식이며, 상태는 불투명 윤곽·기물·왕관·접근성 이름으로도 전달한다. OS 실기기 스크린리더 전체 인증을 주장하지 않는다.

## 폰트와 배포

- 공식 `@ibm/plex-sans-kr`1.1.0 tarball에서 unmodified static WOFF2만 추출.400/600 두 weight, 각94개 Unicode subset, 총188개·1,844,160bytes. 현재 화면에 필요한 subset만 요청한다.
- 실제 브라우저 font face 로드 및 same-origin 요청 확인. font-family는 IBM Plex Sans KR. runtime 외부 font CDN 요청·npm dependency·telemetry/postinstall 실행 없음.
- 폰트 OFL은 `src/web/public/licenses/IBM-Plex-OFL.txt`에 보관해 Vite가 배포 산출물에도 포함한다. 원본/산출물 cmp 일치, 실제 `/licenses/IBM-Plex-OFL.txt` HTTP200 확인.
- README는 폰트 라이선스와 미지정 앱 라이선스를 구분한다.

## 독립 검토

- CockpitInteractionReview: P2 하나 발견. 두 번째 ready가 경기를 시작시킨 뒤 첫 ready ACK가 유실되면 retry가 사라지는 회귀. 모든 pending variant에 명령 패널 retry를 제공하도록 수정하고 실제 ACK 차단 회귀를 추가했다. targeted re-review: correct, confidence0.98.
- CockpitVisualReview: 구조·token·font·CSS 범위의 초기 결함 없음. 부모 runtime 결과와 h2/border/public-license 최종 교정 확인 후 correct, confidence0.95.
- 중요한 미해결 지적 없음. 모든 검토는 읽기 전용; 중복 테스트 미실행.

## 범위와 제한

- 모바일은 실제 휴대전화가 아니라 브라우저 emulation/touch 입력으로 검증했다.
- 선택한 디자인만 적용했으며 게임 규칙/시간 정책/서버권위는 그대로다.
- 사용자 파일은 보존했다. 모델 지정 API 부재와 LSP 프로젝트 인식 실패를 기록했다.
- 원문 subagent-driven의 원격 submit 대신 승인된 로컬 병렬 대체 절차를 사용했다. 원격 push/게시/배포 없음.

## 최종 기록

- `87423bfb8a`: 경기 시작 이후 준비 요청 재확인.
- `09485d6c57`: 올바른 제목 계층, 조작 경계 대비, 쓰이지 않는 font-glyph mapping 제거.
- `104cffa062`: 폰트 라이선스를 실제 웹 배포에 포함.
- 마지막 UI 소스 변경 뒤 `npm run typecheck` 종료 코드0 확인. 스타일/heading/asset 변경은 실제 최종 브라우저와 배포 파일로 검증했으며 서버 전체 suite는 실행하지 않았다.
