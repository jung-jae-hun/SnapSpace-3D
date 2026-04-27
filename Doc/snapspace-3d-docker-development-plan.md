# SnapSpace 3D Docker 기반 상세 개발 계획서

## 1. 문서 목적 및 기준
- 목적: `snapspace-3d-detailed-design.md`와 `snapspace-3d-full-spec.md`를 기준으로, 실제 개발/배포 가능한 Docker 중심 실행 계획을 정의한다.
- 제품 정의: 오브젝트 등록형 3D 배치 서비스 (배치 -> 자동 정리 -> 3D 미리보기 -> GLB 다운로드)
- 1차 산출물 목표(MVP):
  - Object Registry
  - Scene Editor(2D/2.5D)
  - Arrange 기본 규칙(snap/align/spacing)
  - 3D Preview
  - GLB Export
  - Save/Load

---

## 2. 개발 범위 정리

### 2.1 MVP 포함 범위
1. 사용자 인증 및 프로젝트/씬 관리
2. 오브젝트 정의 등록/조회/수정/삭제
3. 배치 오브젝트 CRUD + 벌크 업데이트
4. 자동 정리 API(align/space/snap/auto)
5. 3D 프리뷰(카메라 회전/줌/팬)
6. GLB Export Job 생성/조회/다운로드
7. 파일 저장소 연동(S3 compatible)

### 2.2 MVP 제외 범위
1. 실시간 협업 편집
2. 고급 메시/버텍스 편집
3. 물리 엔진 기반 시뮬레이션 편집
4. 고급 애니메이션/리깅
5. 복잡한 zone/socket 고도 규칙(Phase 3 이후)

---

## 3. Docker 중심 목표 아키텍처

## 3.1 서비스 구성
1. web: Next.js 기반 프론트엔드
2. api: NestJS 기반 메인 API 서버
3. worker: BullMQ 소비자(Export/Thumbnail/Optimize)
4. postgres: 메타데이터 저장
5. redis: 큐/캐시/락
6. minio: 에셋 및 export 파일 저장
7. nginx: 리버스 프록시(개발 후반/운영)

## 3.2 네트워크/볼륨 정책
1. 내부 Docker 네트워크: app_net
2. 영속 볼륨:
  - pg_data
  - redis_data (운영에서 필요 시)
  - minio_data
3. 업로드 파일은 로컬 경로가 아닌 MinIO 버킷 사용

## 3.3 환경 분리
1. dev: docker compose + hot reload
2. stage: production-like 이미지, 축소 리소스
3. prod: immutable image, read-only rootfs(가능 범위), 최소 권한 실행

## 3.4 Docker 실행 기준 경로 정책
1. Docker Home 기본 경로는 프로젝트 루트로 설정
2. Docker 관련 실행은 `scripts/docker-home-*.sh` 기준으로 수행
3. 실행 스크립트:
  - `bash scripts/docker-home-init.sh`
  - `bash scripts/docker-home-up.sh`
  - `bash scripts/docker-home-down.sh`

---

## 4. 권장 모노레포 구조

```text
snapspace-3d/
  apps/
    web/                 # Next.js
    api/                 # NestJS
    worker/              # BullMQ Worker
  packages/
    shared-types/        # API DTO, 도메인 타입
    scene-engine/        # arrange/generate 순수 로직
    config/              # eslint/tsconfig 공통
  infra/
    docker/
      web.Dockerfile
      api.Dockerfile
      worker.Dockerfile
      nginx.conf
    compose/
      docker-compose.dev.yml
      docker-compose.stage.yml
      docker-compose.prod.yml
  prisma/
    schema.prisma
    migrations/
  docs/
    api/
    adr/
```

---

## 5. 개발 단계(Phase)와 산출물

## 5.1 Phase 0: 프로젝트 부트스트랩 (1주)
1. 모노레포 초기화(pnpm workspace 또는 turborepo)
2. 앱 3종(web/api/worker) 기본 실행
3. Dockerfile 3종 + docker-compose.dev 구성
4. 코드 품질 체계(eslint, prettier, commitlint, husky)
5. CI 기본 파이프라인(빌드/테스트)

완료 기준(DoD)
1. `docker compose -f infra/compose/docker-compose.dev.yml up`으로 전체 서비스 기동
2. web/api healthcheck 통과
3. PR 시 lint/test/build 자동 수행

## 5.2 Phase 1: 인증/프로젝트/씬/오브젝트 등록 (2주)
1. Auth API(login/refresh/logout/me)
2. Project/Scene CRUD API
3. ObjectDefinition CRUD + 에셋 업로드
4. DB 스키마 1차(users/projects/scenes/object_definitions/asset_files)
5. web: 로그인/프로젝트 목록/오브젝트 카탈로그 화면

완료 기준(DoD)
1. API 문서(OpenAPI) 생성 및 엔드포인트 검증
2. 오브젝트 등록 후 목록 조회/필터 가능
3. 씬 생성/조회/삭제 정상 동작

## 5.3 Phase 2: 배치 편집 MVP (2주)
1. placed_objects CRUD + bulk API
2. web 2D/2.5D 캔버스(react-konva) 드래그/회전(90도)/삭제/복제/다중선택
3. 상태 관리(zustand) + 서버 동기화(TanStack Query)
4. 자동저장(디바운스) 및 복구

완료 기준(DoD)
1. 씬 저장/불러오기에서 배치 상태 일치
2. 50~100개 오브젝트 편집 시 UX 지연 허용 범위 내 유지

## 5.4 Phase 3: Arrange 엔진 1차 + 3D 미리보기 (2주)
1. Arrange API: align/space/snap/auto
2. 충돌 경고 1차(AABB 기반)
3. GeneratedObject 계산 파이프라인
4. web 3D preview(three.js + R3F) 카메라 제어

완료 기준(DoD)
1. 선택 오브젝트 기준 정렬/간격 조정 결과 재현 가능
2. 3D 미리보기에서 배치 결과 시각 확인 가능

## 5.5 Phase 4: Export 파이프라인(GLB 우선) (2주)
1. Export API 생성/조회/다운로드
2. Worker에서 GLB 생성 작업 처리
3. glTF Validator + 선택적 Draco 압축
4. Export 이력 관리(exports/export_files)

완료 기준(DoD)
1. 1개 씬에 대해 GLB 다운로드 성공
2. 실패 시 재시도/오류 메시지 제공
3. 다운로드 파일을 외부 툴(Blender 등)에서 열 수 있음

## 5.6 Phase 5: 운영 안정화/보안/관측성 (1~2주)
1. 업로드 파일 검증(MIME/확장자/사이즈)
2. 권한 검증 강화(프로젝트 단위 접근 제어)
3. 로그/메트릭/트레이싱(OpenTelemetry + Grafana/Loki 선택)
4. 장애 대응(runbook, timeout, retry, dead-letter)

완료 기준(DoD)
1. 주요 API 에러율/응답시간 대시보드 확보
2. 취약점 스캔 통과(이미지/의존성)
3. 운영 배포 절차 문서화 완료

---

## 6. Docker 구현 상세 계획

## 6.1 공통 Dockerfile 전략
1. 멀티스테이지 빌드 적용
2. 런타임 이미지는 slim/alpine 기반 최소화
3. non-root 사용자로 실행
4. healthcheck 내장
5. 빌드 캐시 최적화(package lock 선복사)

## 6.2 서비스별 Dockerfile 초안 정책
1. web:
  - 빌드: `next build`
  - 실행: `next start`
  - 포트: 3000
2. api:
  - 빌드: `nest build`
  - 실행: `node dist/main.js`
  - 포트: 8080
3. worker:
  - 빌드: api와 공유 패키지 포함
  - 실행: `node dist/worker.js`
  - 포트 외부 노출 없음

## 6.3 docker-compose.dev 핵심 구성
1. web/api/worker/postgres/redis/minio 동시 기동
2. api 의존성: postgres, redis, minio healthcheck 이후 시작
3. 로컬 소스 마운트 + node_modules 볼륨 분리
4. `.env.dev`로 환경 주입

## 6.4 배포 이미지 관리
1. GitHub Actions에서 web/api/worker 이미지 빌드
2. 이미지 태깅: `main-{sha}`, `release-{version}`
3. SBOM 생성 및 취약점 스캔(Trivy)

---

## 7. 데이터 모델 및 마이그레이션 계획

## 7.1 1차 테이블(필수)
1. users
2. projects
3. scenes
4. object_definitions
5. asset_files
6. placed_objects
7. exports
8. export_files

## 7.2 2차 테이블(확장)
1. generated_objects
2. object_definition_assets
3. audit_logs

## 7.3 마이그레이션 원칙
1. Prisma migration을 CI에서 검증
2. 파괴적 변경은 2-step migration(추가 -> 이관 -> 삭제)
3. 인덱스 우선순위:
  - scenes(project_id)
  - placed_objects(scene_id)
  - object_definitions(category, name)
  - exports(scene_id, created_at)

---

## 8. API 개발 우선순위(백로그)

## 8.1 Sprint A
1. `POST /api/v1/auth/login`
2. `GET /api/v1/me`
3. `POST /api/v1/projects`
4. `GET /api/v1/projects`
5. `POST /api/v1/projects/:projectId/scenes`

## 8.2 Sprint B
1. `POST /api/v1/object-definitions`
2. `GET /api/v1/object-definitions`
3. `POST /api/v1/assets/upload`
4. `POST /api/v1/scenes/:sceneId/placed-objects`
5. `PATCH /api/v1/scenes/:sceneId/placed-objects/:id`
6. `POST /api/v1/scenes/:sceneId/placed-objects/bulk`

## 8.3 Sprint C
1. `POST /api/v1/scenes/:sceneId/arrange`
2. `POST /api/v1/scenes/:sceneId/generate`
3. `POST /api/v1/scenes/:sceneId/exports`
4. `GET /api/v1/exports/:exportId`
5. `GET /api/v1/exports/:exportId/download`

---

## 9. 테스트 전략

## 9.1 자동화 테스트
1. unit: arrange 규칙, dto validation, helper 함수
2. integration: API + DB + Redis + MinIO 컨테이너 연동
3. e2e: 핵심 사용자 흐름(로그인 -> 배치 -> arrange -> export)

## 9.2 비기능 테스트
1. 성능: 씬 오브젝트 100/300/500 기준 편집/저장/미리보기 응답
2. 안정성: worker 재시작/큐 적체/파일 업로드 실패 복구
3. 보안: 인증 우회, 파일 업로드 공격 벡터, signed URL 만료

## 9.3 수용 기준(핵심)
1. P95 API 응답시간: 500ms 이하(읽기 API 기준)
2. export 성공률: 95% 이상(재시도 포함)
3. 치명 오류(데이터 손실/권한 누수): 0건

---

## 10. CI/CD 및 운영 계획

## 10.1 CI
1. lint -> typecheck -> unit/integration -> docker build
2. OpenAPI 스키마 변경 감지 및 artifact 저장
3. PR 코멘트로 테스트 요약 출력

## 10.2 CD
1. stage 자동 배포(main merge)
2. prod 수동 승인 배포(tag 기반)
3. 배포 후 smoke test:
  - `/health`
  - 로그인 API
  - 씬 조회 API

## 10.3 롤백
1. 이전 이미지 태그 재배포
2. DB 스키마 변경은 backward-compatible 기간 확보
3. export worker만 개별 롤백 가능한 구조 유지

---

## 11. 팀 구성 및 역할 권장
1. FE 1~2명: 편집기/카탈로그/3D 프리뷰 UI
2. BE 2명: API/인증/저장소/큐/권한
3. 3D/엔진 1명: arrange 규칙/GLB 파이프라인
4. DevOps 1명(part-time 가능): Docker/CI/CD/관측성
5. QA 1명(part-time 가능): 시나리오 테스트/회귀 점검

---

## 12. 예상 일정(10~11주)
1. 1주: Phase 0
2. 2~3주: Phase 1
3. 4~5주: Phase 2
4. 6~7주: Phase 3
5. 8~9주: Phase 4
6. 10~11주: Phase 5 + 안정화

---

## 13. 리스크 및 대응
1. 리스크: 3D 엔진/배치 규칙 복잡도 증가
   - 대응: scene-engine을 별도 패키지로 분리, 규칙 단위 테스트 우선
2. 리스크: export 처리 시간 급증
   - 대응: worker 수평 확장, job timeout/retry, 파일 최적화 단계 분리
3. 리스크: 업로드 에셋 품질 편차
   - 대응: 업로드 시 validator/preview 생성/가이드 제공
4. 리스크: 프론트 상태 동기화 난이도
   - 대응: 명확한 scene snapshot 스키마와 버전 정책 수립

---

## 14. 즉시 실행 가능한 첫 2주 액션 아이템
1. 모노레포/패키지 매니저/코딩 규칙 확정
2. Docker Compose dev 환경 구축(web/api/worker/postgres/redis/minio)
3. Prisma 스키마 1차 설계 및 마이그레이션
4. 인증 + 프로젝트/씬 최소 API 구현
5. 오브젝트 등록/조회 API 및 카탈로그 UI 초기 버전 구현
6. CI에서 lint/typecheck/test/docker build 연동

---

## 15. 최종 실행 요약
- 개발 전략: TypeScript 중심 단일 제품팀 + Docker 표준화 배포
- 아키텍처 전략: web/api/worker 분리 + postgres/redis/minio 기반
- 제품 전략: 쉬운 배치 UX와 규칙 기반 자동 정리, GLB 중심 내보내기
- 일정 전략: 10~11주 내 MVP -> 안정화까지 완주 가능한 단계형 계획
