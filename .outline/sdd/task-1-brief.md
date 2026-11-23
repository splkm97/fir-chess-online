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

