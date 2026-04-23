# SnapSpace 3D

최신 트렌드 모노레포 구조 기반의 SnapSpace 3D 개발 저장소입니다.

## 1. 현재 구조
- apps/web: Next.js 프론트엔드
- apps/api: NestJS API 서버
- apps/worker: 비동기 작업 워커
- packages/shared-types: 공통 타입
- packages/scene-engine: Arrange/Generate 엔진 로직
- infra/compose: Docker Compose 설정
- infra/docker: Dockerfile 모음
- Doc: 제품/설계/개발 문서

## 2. 외부 라이브러리 한 번에 설치
1) pnpm 설치
2) 루트에서 실행
- pnpm run bootstrap

상세 내용은 아래 문서를 참고하세요.
- Doc/external-lib-install-guide.md

## 3. 로컬 Docker 개발 실행 (고정 실행 폴더)
Docker 실행 기준 폴더는 아래 경로를 사용합니다.
- /Volumes/MartinData/SERVER/SnapSpace-3D

1) Docker Home 초기화
- bash scripts/docker-home-init.sh

2) 개발 컨테이너 실행
- bash scripts/docker-home-up.sh

3) 개발 컨테이너 중지
- bash scripts/docker-home-down.sh

상세 정책은 아래 문서를 참고하세요.
- Doc/docker-home-policy.md

## 4. 순차 개발 체크리스트
- Doc/sequential-development-checklist.md

## 5. Web 빠른 실행
웹 앱은 Next.js App Router 기반이며, 브라우저가 직접 API를 호출하지 않고
`apps/web/app/api/*` 라우트를 통해 Nest API로 프록시합니다.

1) 기본 실행
- pnpm --filter @snapspace/web dev

2) API 주소 변경이 필요한 경우
- 환경 변수 `SNAPSPACE_API_BASE_URL` 설정
- 기본값: `http://localhost:8080/api/v1`

예시:
- SNAPSPACE_API_BASE_URL=http://localhost:8080/api/v1 pnpm --filter @snapspace/web dev

## 6. CI 품질게이트
Sprint 4 품질게이트는 아래 4단계를 고정 순서로 수행합니다.

1) Lint
- pnpm run ci:lint

2) Typecheck
- pnpm run ci:typecheck

3) Test
- pnpm run ci:test

4) Build
- pnpm run ci:build

전체를 한 번에 실행하려면:
- pnpm run ci:quality

GitHub Actions 워크플로 파일:
- .github/workflows/quality-gate.yml

## 7. 완료 정의 1번 스모크 검증
아래 명령은 완료 정의 1번 흐름을 자동 검증합니다.

- 로그인 -> 프로젝트 생성 -> 씬 생성 -> 배치
- arrange 실행 -> generate 실행 -> export job 생성
- export 완료 polling -> GLB 다운로드

실행:
- pnpm run smoke:flow

기본 API 주소:
- SNAPSPACE_API_BASE_URL=http://localhost:8080/api/v1

선택 환경 변수:
- SNAPSPACE_SMOKE_EMAIL
- SNAPSPACE_SMOKE_NAME
- SNAPSPACE_SMOKE_EXPORT_TIMEOUT_MS
- SNAPSPACE_SMOKE_POLL_MS
- SNAPSPACE_SMOKE_OUTPUT_DIR

결과 GLB 파일은 기본적으로 아래에 저장됩니다.
- .tmp/smoke
