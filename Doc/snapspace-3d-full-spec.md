
# SnapSpace 3D - 통합 설계 문서 (상세 + MVP + DB 설계)

## 1. 개요
본 문서는 SnapSpace 3D의 전체 설계 + MVP 범위 + DB 구조까지 포함한 개발용 통합 문서이다.

---

## 2. 시스템 개요
SnapSpace 3D는 **오브젝트 등록 기반 3D 자동 배치 웹 서비스**이다.

사용자는:
- 오브젝트 선택
- 배치
- 자동 정리
- 3D 결과 확인
- GLB 다운로드

---

## 3. MVP 기능 명세

### 3.1 필수 기능

#### 오브젝트
- 오브젝트 등록 (관리자)
- 오브젝트 목록 조회
- 카테고리 필터

#### 씬 편집
- 오브젝트 배치
- 이동 / 삭제 / 회전
- 다중 선택

#### 자동 정리
- 가로 정렬
- 세로 정렬
- 간격 맞춤
- 스냅

#### 3D
- 3D 미리보기
- 카메라 회전/줌

#### Export
- GLB 다운로드

#### 저장
- 프로젝트 생성
- 씬 저장/불러오기

---

## 4. DB 설계

### users
- id
- email
- password
- created_at

### projects
- id
- user_id
- name
- created_at

### scenes
- id
- project_id
- name
- created_at

### object_definitions
- id
- name
- category
- size_json
- model_asset_id

### placed_objects
- id
- scene_id
- object_definition_id
- position_json
- rotation
- scale_json

### exports
- id
- scene_id
- file_url
- format
- created_at

---

## 5. API 요약

### Object
GET /objects
POST /objects

### Scene
POST /scenes
GET /scenes/:id

### Placement
POST /placements
PATCH /placements/:id

### Arrange
POST /arrange

### Export
POST /export
GET /export/:id

---

## 6. 기술 스택

### Frontend
- Next.js
- React
- TypeScript
- Zustand
- react-konva
- three.js / R3F

### Backend
- NestJS
- PostgreSQL
- Redis

### Export
- GLTFExporter
- GLB

---

## 7. 개발 단계

1. 2D 배치
2. 오브젝트 등록
3. 자동 정렬
4. 3D 미리보기
5. Export

---

## 8. 결론

SnapSpace 3D는  
"오브젝트 기반 배치 → 자동 정리 → 3D 생성 → GLB 다운로드"  
구조로 개발한다.
