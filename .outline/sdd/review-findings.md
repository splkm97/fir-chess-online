# 독립 검토 결과와 해소

## ServerAudit
- 원본 verdict: Important P1. socket disconnect DB 쓰기 실패 시 연결 정보만 삭제되고 감지 사건을 잃어, 턴 정지 대신 시간 초과로 패배할 수 있음.
- 수정: match 서비스가 원래 감지 시각의 pendingDisconnects를 보존한다. settle이 기한 판정 전 순서대로 반영하고 성공한 DB 저장 뒤 제거한다. 실패 시 기존 턴 timer를 재정산 retry로 교체한다. 명령·조회·연결도 같은 정산 경로.
- 증거: 실제 socket 종료 + SQLite UPDATE 실패 trigger 회귀 추가. match/socket 24개 테스트와 서버 tsc 통과.
- 재검토 verdict: correct, confidence 0.97. 원래 감지 시각/정산 순서/저장 후 제거를 확인. 추가 지적 없음. 리뷰어가 테스트를 재실행하지 않음.
- 실제 E2E에서 GET /가403으로 실패: @fastify/static의 index:false가 directory 응답을403으로 만들었다. 기본 index.html serving으로 수정. Chromium 7개 E2E 통과로 런타임 확인.

## FrontendAudit
- Important P2: e2e/reconnect.spec.ts의 넓은 text 정규식이 교체 배너와 설명 문단을 동시에 매칭. 실제 교체 배너 .connection-banner.replaced로 한정하여 수정. Chromium takeover E2E 통과.
- 프로덕션 코드의 추가 결함은 입증되지 않음. pending-command ID/ACK/revision, 전체 기물 보호, 줄 선택, terminal 잠금을 확인.
- 확인 공백: 실제 touch swipe, 미확정 명령 ACK 유실 복구, draft 무효화, 보호 접근성 표시, 더 넓은 browser/terminal 시나리오. 부모가 추가 인수 시나리오와 cross-browser 검증으로 해소 중. 서버 단위 검증과 브라우저 검증을 혼동하지 않음.

## 부모 통합 수정
- LAN HTTP에서는 crypto.randomUUID가 제공되지 않는 것을 MDN 문서와 실제 browser isSecureContext=false/typeof randomUUID=undefined로 확인. commandId 생성은 crypto.getRandomValues 기반 UUID v4로 교체. 사용자 쿠키나 페이지 state를 주입하지 않고 실제 LAN 대전 증거를 이어서 수집한다.
- 렌더링상 종료 입력을 제거한 계약에 맞춰 E2E가 비활성 버튼의 존재를 요구하지 않도록 변경. 승패·보드 일치·이후 입력 불가라는 소비자 계약은 유지.
