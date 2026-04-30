# SnapSpace 3D AI 생성 오브젝트 연계 계획 및 진행 현황 (2026-04-27)

## 1. 문서 목적
- 이미지 업로드 -> AI 3D 생성 -> 웹 3D 확인 -> 2D 배치 편집까지 연결되는 기능의 실행 계획을 정의한다.
- 현재 코드/런타임 기준으로 완료/진행/미완료 항목을 구분해 다음 작업 우선순위를 명확히 한다.

---

## 2. 현재 진행 현황 요약

### 2.1 완료된 항목
1. 웹 UI 전면 개편(홈/프로젝트/에디터) 반영
2. 3300 포트 Docker dev 경로 정렬 및 최신 소스 반영 확인
3. 로그인 500 이슈(호스트 해석 문제) 대응: web -> api base URL 오버라이드 적용
4. 2D 에디터 선택/드래그 분리 개선(의도치 않은 이동 완화)
5. 커밋 완료
   - fe74a98: feat(web): ship redesigned UI and stabilize 3300 dev runtime
   - c249a5e: chore(web): remove unused nav utility styles

### 2.2 현재 진행 중(워킹트리)
1. 에디터 화면 반영 확인용 배지 추가(커밋 전)
   - 변경 파일: apps/web/app/scenes/[sceneId]/editor/page.tsx

### 2.3 미착수/미완료
1. AI 모델 생성 파이프라인(업로드/작업큐/후처리/결과 연결)
2. 생성된 3D 오브젝트의 2D 배치용 표준 메타데이터 정의
3. 비용/품질/보안/정책 관점의 운영 룰

---

## 3. 목표 기능 정의 (이번 계획 범위)

### 3.1 사용자 플로우
1. 사용자가 이미지 업로드
2. AI 생성 요청(비동기 Job)
3. 생성 상태 확인(queued/running/succeeded/failed)
4. 완료 모델(GLB) 3D 뷰어에서 회전/확대 확인
5. 2D 배치도에 동일 오브젝트를 배치(풋프린트 기반)

### 3.2 구현 원칙
1. 생성 작업은 반드시 비동기(Job Queue)
2. 2D 배치는 원본 3D 직접 편집이 아닌 표준화된 placement 메타데이터 기반
3. 생성 결과는 후처리/검증 이후만 배치 가능 상태로 승격

---

## 4. 단계별 실행 계획

## Phase A. 데이터/도메인 준비 (우선)
1. 신규 도메인 정의
   - ai_generation_jobs
   - ai_generated_assets
   - object_footprints_2d
2. 상태 머신 정의
   - queued -> running -> post_processing -> ready
   - queued/running/post_processing -> failed
3. 공통 식별자 규칙
   - sceneId, objectDefinitionId, generationJobId 연계

산출물
1. DB 스키마 초안
2. API 계약서 초안
3. 에러 코드 표준(실패 사유 분류)

## Phase B. 생성 파이프라인 (MVP)
1. POST /api/v1/ai/generations
   - 입력: source image, prompt(선택), quality(low/standard)
2. GET /api/v1/ai/generations/:id
   - 출력: 상태, 진행률, 실패사유
3. Worker
   - 외부 AI 제공자 호출
   - 결과 polling
   - 결과 GLB 저장(MinIO)
4. 후처리
   - 단위/축/피벗 정규화
   - bounds 계산(X/Y/Z)
   - 썸네일 생성

산출물
1. Job 생성/조회 API
2. Worker 처리 루프
3. GLB 저장 및 접근 URL

## Phase C. 3D 결과 -> 2D 배치 연결
1. placement 메타데이터 생성
   - width, depth, height
   - pivotMode(center|bottom-center)
   - footprint(shape, points)
2. 카탈로그 반영
   - 생성 완료 오브젝트를 배치 가능한 항목으로 노출
3. 에디터 반영
   - 2D에서는 footprint로 충돌/스냅/이동
   - 3D 미리보기에서는 원본 GLB 연결

산출물
1. 2D 배치 스키마 확장
2. 배치/저장/로드 API 연동
3. 뷰어-배치 정합성 검증

## Phase D. 운영 안정화
1. 비용 제어
   - 사용자별 일일 quota
   - 중복 이미지 해시 캐시
2. 보안/정책
   - 업로드 MIME/용량 제한
   - 저작권/금칙어/부적절 이미지 필터
3. 품질 안정화
   - 실패 재시도(backoff)
   - 대체 경로(생성 실패 시 수동 배치)

산출물
1. 운영 정책 문서
2. 모니터링 대시보드 항목(성공률, 평균 생성 시간, 실패 코드 분포)

---

## 5. 기술 설계 포인트 (필수)
1. 좌표계 통일: 3D Y-up, 2D 편집면 X/Z 고정
2. 단위 통일: meter 단위 고정
3. 피벗 통일: bottom-center 권장
4. 2D 충돌 계산은 footprint 기준, 3D 렌더는 GLB 기준
5. 생성 완료 전에는 씬에 배치 불가(ready 상태만 허용)

---

## 6. API 초안 (MVP)
1. POST /api/v1/ai/generations
2. GET /api/v1/ai/generations/:generationId
3. POST /api/v1/object-definitions/from-generation/:generationId
4. GET /api/v1/object-definitions?source=ai

응답 공통 필드(예시)
- id
- status
- progress
- modelUrl
- previewImageUrl
- bounds { x, y, z }
- footprint { type, points }
- failureReason

---

## 7. DB 초안 (MVP)

### ai_generation_jobs
- id
- user_id
- project_id
- scene_id (nullable)
- provider
- status
- prompt
- source_image_asset_id
- error_code
- error_message
- created_at
- updated_at

### ai_generated_assets
- id
- generation_job_id
- glb_asset_id
- preview_image_asset_id
- bounds_json
- pivot_mode
- normalized_unit
- created_at

### object_footprints_2d
- id
- generated_asset_id
- shape_type (rect|polygon)
- points_json
- width
- depth
- created_at

---

## 8. 일정 제안 (실행 가능한 단위)
1. Week 1: 도메인/DB/API 계약 확정 + 마이그레이션
2. Week 2: Job API + Worker + 외부 AI 연동
3. Week 3: 후처리(bounds/footprint) + 카탈로그 연동
4. Week 4: 에디터 배치/저장/뷰어 정합성 + 운영 룰 최소 적용

---

## 9. 즉시 실행 To-do (다음 작업)
1. 이 문서 기준으로 DB 스키마 초안을 prisma/schema.prisma에 반영
2. /api/v1/ai/generations 생성/조회 엔드포인트 뼈대 구현
3. worker에 generation polling 루프 추가
4. 에디터에서 source=ai 카탈로그 필터 추가
5. 배치 가능 조건을 status=ready로 제한

---

## 10. 의사결정 필요사항
1. 외부 AI 제공자 1순위 확정(Meshy 단일 vs 멀티 벤더)
2. 비용 정책(무료 체험/유료 크레딧/프로젝트 단위 제한)
3. 실패 결과 노출 수준(사용자 메시지 상세도)
4. 생성 결과 보관 기간(예: 30일/90일/영구)

---

## 11. 결론
- 방향성은 타당하며, SnapSpace 3D의 핵심 흐름(2D 배치 중심 UX)과 충돌하지 않는다.
- 성공 포인트는 생성 품질 자체보다, 생성 결과를 2D 배치 가능한 표준 메타데이터로 정규화하는 파이프라인이다.
- 다음 구현은 Phase A/B부터 시작하고, ready 상태 자산만 배치 허용하는 정책을 우선 적용한다.

---

## 12. 오브젝트 추가 탭 기준 UX 반영 (신규)

### 12.1 탭 구조
오브젝트 추가 탭 내부에 아래 2개 하위 블록을 둔다.
1. 기존 카탈로그 등록 오브젝트
2. 이미지로 3D 생성

### 12.2 이미지로 3D 생성 사용자 플로우
1. 사용자가 이미지 업로드(PNG/JPG/WebP)
2. 선택 입력: 프롬프트(선택), 품질(low/standard), 출력 포맷(GLB 기본)
3. 생성 요청 -> Job ID 반환
4. 탭 내 상태 카드에서 queued/running/progress 확인
5. 완료 시 탭 내 3D 미리보기(회전/확대/이동)
6. GLB/OBJ 다운로드 버튼 노출
7. 오브젝트 등록 버튼 클릭 시 object_definition으로 승격

### 12.3 탭 내 상태 가시성 규칙
1. 생성 중: 취소/재시도 버튼 노출
2. 생성 실패: 실패 사유 + 재시도 버튼
3. 생성 완료: 미리보기 + 다운로드 + 오브젝트 등록 버튼
4. 등록 완료: 카탈로그 목록 즉시 반영(낙관적 UI 또는 refetch)

---

## 13. 진행 기준 (Stage Gate) (신규)

### Gate A: 계약/스키마 완료 기준
1. Prisma 마이그레이션 적용 가능
2. AI Job/Asset/Footprint 테이블 생성 및 인덱스 확정
3. API 계약(OpenAPI 초안)에서 필수 응답 필드 확정

완료 조건(DoD)
1. 마이그레이션 up/down 검증 성공
2. API 스키마 lint 통과
3. 필드 누락 없이 예시 응답 문서화

### Gate B: 생성 파이프라인 MVP 완료 기준
1. POST /api/v1/ai/generations 동작
2. GET /api/v1/ai/generations/:id 상태 조회 동작
3. Worker가 provider 결과를 polling 후 GLB 저장

완료 조건(DoD)
1. 성공 케이스: 3회 연속 GLB 생성 성공
2. 실패 케이스: timeout/provider error가 표준 에러 코드로 기록
3. 평균 생성시간/실패율 메트릭 수집 가능

### Gate C: 오브젝트 추가 탭 연동 완료 기준
1. 이미지 업로드 UI와 생성 상태 카드 제공
2. 완료 모델 3D 미리보기 동작
3. 다운로드(GLB/OBJ) 동작
4. 등록 버튼으로 object_definition 생성

완료 조건(DoD)
1. 업로드 -> 생성 -> 미리보기 -> 다운로드 -> 등록 E2E 1회 성공
2. 등록 후 카탈로그 목록에서 즉시 검색 가능
3. ready 상태가 아닌 자산은 등록 불가

### Gate D: 운영 안전성 기준
1. 업로드 용량/MIME 제한
2. 사용자별 quota 적용
3. 중복 이미지 해시 캐시

완료 조건(DoD)
1. 제한 초과/포맷 불일치 시 4xx 표준 응답
2. quota 초과 시 사용자 메시지/재시도 정책 확인
3. 비용 보호 룰(일일 상한) 적용

---

## 14. MVP 범위 확정안 (신규)
1. 외부 제공자: Meshy API 단일 벤더 우선
2. 입력: 이미지 1장 + 선택 프롬프트
3. 출력: GLB 필수, OBJ 선택
4. 뷰어: 기존 R3F 재사용
5. 등록 기준: status=ready + bounds/footprint 생성 완료

MVP 제외
1. 멀티 벤더 라우팅
2. FBX 출력
3. 고급 텍스처/PBR 편집
4. 비동기 대량 배치 생성

---

## 15. 즉시 착수 백로그 (신규)
1. DB
   - ai_generation_jobs, ai_generated_assets, object_footprints_2d 마이그레이션
2. API
   - POST/GET ai generation 엔드포인트
   - object-definition 승격 엔드포인트
3. Worker
   - provider polling + timeout/backoff + 표준 에러코드 매핑
4. Web(오브젝트 추가 탭)
   - 이미지 업로드 컴포넌트
   - 상태 카드(진행률/실패사유)
   - 3D 미리보기 + 다운로드 + 등록 버튼
5. 검증
   - E2E 시나리오 1개(업로드~등록)
   - 운영 제한(용량/쿼터) 테스트
