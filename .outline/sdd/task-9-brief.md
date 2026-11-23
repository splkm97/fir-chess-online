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

