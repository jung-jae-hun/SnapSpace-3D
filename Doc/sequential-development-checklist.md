# SnapSpace 3D 순차 개발 체크리스트 (최신 트렌드 구조)

## 1. 기반 세팅
1. 모노레포(pnpm workspace) 유지
2. apps/web, apps/api, apps/worker 분리
3. packages/shared-types, packages/scene-engine 공통화
4. Docker compose 기반 로컬 통합 실행
5. Docker Home 고정 경로 사용: `/Volumes/MartinData/SERVER/SnapSpace-3D`
6. Docker 실행은 `scripts/docker-home-*.sh` 스크립트로만 수행

## 2. Sprint 1 (환경/백엔드 최소 기능)
1. Prisma 스키마 초기화
2. Auth, Project, Scene API 기초 구현
3. MinIO 업로드 API 기초 구현
4. OpenAPI 문서 자동 생성 연결

## 3. Sprint 2 (오브젝트/배치)
1. object-definitions CRUD
2. placed-objects CRUD + bulk
3. 카탈로그/배치 캔버스 초기 UI
4. 자동저장 및 씬 로드

## 4. Sprint 3 (자동 정리/3D)
1. arrange align/space/snap/auto 구현
2. GeneratedObject 계산 경로 추가
3. 3D preview 연결(R3F)

## 5. Sprint 4 (Export/안정화)
1. export job + worker 처리
2. GLB 다운로드 경로 완성
3. 에러/재시도/timeout 정책 추가
4. CI 품질게이트(lint/typecheck/test/build)

## 6. 완료 정의
1. 배치 -> 자동정리 -> 3D 확인 -> GLB 다운로드 흐름이 단절 없이 동작
2. 신규 개발자는 bootstrap 1회로 개발 환경 재현 가능
