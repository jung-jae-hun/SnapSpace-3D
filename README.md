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

## 3. 로컬 Docker 개발 실행
1) 환경값 준비
- cp .env.example .env

2) 개발 컨테이너 실행
- docker compose -f infra/compose/docker-compose.dev.yml up --build

## 4. 순차 개발 체크리스트
- Doc/sequential-development-checklist.md
