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

