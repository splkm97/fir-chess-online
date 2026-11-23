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

