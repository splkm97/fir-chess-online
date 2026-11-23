## Task 1 — 대국 컴포넌트 구조

### 범위
- 소유: src/web/App.tsx, Room.tsx, Match.tsx, MatchStatus.tsx, ActionPanel.tsx, Board.tsx, LinePicker.tsx; 신규 PlayerResources.tsx, PieceTray.tsx, PieceIcon.tsx.
- 읽기 전용: CSS·폰트·게임·프로토콜·useRoom·labels·서버·루트 설정.
- 선행: 본 문서의 계약 확정. Task 2와 동시에 수행 가능.

### 구현
고정 DOM에 따라 자원/배치와 선택/확정을 분리한다. 중복 자원·왕관 숫자 대신 완성 줄 진행률을 우선하되 보드 끝점 왕관은 유지한다. 게임 규칙과 전송 흐름은 보존한다. 단색 SVG piece/crown 아이콘을 생성하여 기존 serif chess glyph 의존을 제거한다. Board help를 disclosure로 바꾸고 zoom 상태를 data 속성으로 노출한다. 모든 caller를 직접 이관하고 obsolete markup을 제거한다.

### 완료 기준
- desktop/mobile이 같은 실제 조작 DOM을 사용한다.
- 명명된 class/접근성 이름/테스트 hook이 일치한다.
- 이관 후 `mise exec node@26.13.1 -- npm run typecheck` 통과. 실패하면 담당 파일만 수정하고 해당 검사 재실행.
- 보고서 `.outline/sdd/cockpit-structure-report.md`: 실제 변경/검사/미실행 브라우저 항목. 커밋은 조정자 담당.

