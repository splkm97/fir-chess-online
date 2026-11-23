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

