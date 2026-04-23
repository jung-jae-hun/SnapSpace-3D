
# SnapSpace 3D - 오브젝트 기반 3D 자동 배치 웹 서비스 설계서

## 0. 문서 정보
- 문서명: SnapSpace 3D 상세 설계서
- 문서 목적: 오브젝트 등록형 3D 자동 배치 웹 서비스를 처음부터 다시 설계하고, 실제 개발이 가능한 수준으로 기술/아키텍처/API/데이터 모델을 정의한다.
- 대상 독자: 기획자, 프론트엔드 개발자, 백엔드 개발자, 3D/그래픽 개발자

---

## 1. 시스템 이름

### 추천 시스템 이름
**SnapSpace 3D**

### 이름 의미
- **Snap**: 사용자가 오브젝트를 쉽게 놓고, 시스템이 스냅/정렬/자동 보정한다는 의미
- **Space**: 단순 블록 편집이 아니라 공간을 완성하는 서비스라는 의미
- **3D**: 최종 결과물이 3D 장면(Scene)임을 명확히 표현

### 대체 이름 후보
- ObjectForge 3D
- SceneSnap Studio
- AutoLayout 3D
- SpaceBuilder Web

---

## 2. 제품 비전

본 시스템의 목표는 **3D 에디터를 잘 사용하지 못하는 사용자도 등록된 오브젝트를 선택하여 화면에 배치하고, 자동 정리/자동 보정 기능을 통해 완성도 높은 3D 장면을 빠르게 만들 수 있도록 지원하는 웹 서비스**를 구축하는 것이다.

핵심은 사용자가 3D 저작 도구처럼 세밀한 축/회전/스케일을 직접 조작하지 않아도,  
다음 흐름만으로 결과물을 만들 수 있게 하는 것이다.

1. 등록된 오브젝트 목록에서 선택
2. 화면에 배치
3. 자동 정리/자동 스케일/자동 연결 실행
4. 3D 결과 확인
5. 표준 형식으로 다운로드
6. 다른 3D 프로그램에서 재사용

---

## 3. 제품 목표

### 3.1 핵심 목표
- 오브젝트 등록형 3D 배치 시스템 구축
- 초보자도 사용 가능한 쉬운 배치 UX 제공
- 자동 정렬/자동 간격/자동 스케일/반복 생성 기능 제공
- 결과물을 **웹 표준 기반 3D 포맷으로 다운로드** 가능하게 설계
- 프론트엔드와 백엔드가 API로 통신하는 웹 서비스 구조 채택

### 3.2 비핵심 목표
초기 버전에서 아래는 우선순위를 낮게 둔다.
- 정밀 CAD 수준의 모델링
- 완전 자유형 메시 편집
- 고급 리깅/애니메이션 제작
- 실시간 멀티유저 협업
- 물리 시뮬레이션 기반 편집

---

## 4. 문제 정의

기존 접근이 어려워졌던 이유는 보통 다음과 같다.

- 3D 편집기의 자유도를 너무 높게 설계함
- 사용자가 직접 위치/회전/크기를 세밀하게 맞춰야 함
- 배치 단위와 최종 생성 결과가 분리되지 않음
- 오브젝트 메타데이터(기준점, 연결점, 배치 규칙)가 부족함
- 자동 정리를 범용 알고리즘 하나로 해결하려고 함

### 해결 방향
이번 재설계에서는 다음 원칙을 따른다.

- 사용자는 **등록된 오브젝트를 대략적으로 놓는 행위**만 수행
- 시스템은 **스냅/정렬/자동 보정/생성 규칙**으로 장면을 정리
- 사용자가 배치한 오브젝트와 최종 생성되는 3D 결과를 분리
- 자유 편집보다 **규칙 기반 편집**을 우선
- 결과물은 **glTF/GLB 중심**으로 내보내기

---

## 5. 핵심 개념

### 5.1 등록 오브젝트(Object Definition)
사용 가능한 오브젝트의 마스터 데이터다.  
예: 입구, 게이트, 플랫폼, 기둥, 계단, 통로, 벽체, 장식물 등

각 오브젝트는 단순 모델 파일이 아니라, 배치/정렬/생성에 필요한 메타데이터를 함께 가져야 한다.

### 5.2 배치 오브젝트(Placed Object)
사용자가 에디터 화면에 직접 올린 객체다.  
이 객체는 “배치 의도”를 표현한다.

### 5.3 생성 오브젝트(Generated Object)
규칙 엔진이 배치 오브젝트를 해석하여 생성한 실제 3D 씬 구성 요소다.  
예: 사용자는 `platform-zone` 하나를 놓지만, 시스템은 플랫폼 본체/도어/기둥/표지 등을 여러 개 생성할 수 있다.

### 5.4 스냅(Snap)
오브젝트를 임의 좌표가 아니라 가능한 위치/표면/앵커/소켓에 정렬하는 기능이다.

### 5.5 자동 정리(Auto Arrange)
선택된 오브젝트 또는 전체 장면에 대해 정렬, 간격, 정돈, 스케일, 반복 생성을 수행하는 기능이다.

### 5.6 표준 내보내기(Export)
완성된 3D 장면을 외부 3D 툴에서 재사용할 수 있는 형식으로 변환하는 기능이다.

---

## 6. 최종 제품 방향

### 권장 제품 정의
**오브젝트 등록형 웹 기반 3D 배치/자동 생성 서비스**

### 사용자 경험 원칙
- 사용자는 “정밀 3D 모델링”을 하지 않는다.
- 사용자는 “오브젝트를 선택하고 놓는다.”
- 시스템은 “자동 정리와 자동 스케일로 결과를 완성한다.”
- 3D 장면은 “보기 좋고 재사용 가능한 결과물”이어야 한다.

---

## 7. 전체 아키텍처

```text
[Web Client]
  ├─ Object Catalog UI
  ├─ 2D/2.5D Placement Editor
  ├─ 3D Preview Viewer
  ├─ Arrange Controls
  └─ Export UI
        │
        │ HTTP/JSON + File Upload
        ▼
[API Server]
  ├─ Auth / Project / Scene API
  ├─ Object Registry API
  ├─ Placement / Arrange API
  ├─ Export API
  ├─ Asset Storage API
  └─ Job / Queue API (optional)
        │
        ├─ PostgreSQL
        ├─ Object Storage (S3 compatible)
        └─ Worker (Export / Optimize / Thumbnail)
```

---

## 8. 기술 전략

### 8.1 프론트엔드 전략
- 웹 서비스 중심
- React 기반 UI
- 오브젝트 목록에서 선택 → 장면에 배치
- 2D 또는 2.5D 중심의 쉬운 편집 경험
- 3D는 최종 확인/미리보기 중심
- 상태 기반으로 서버 API와 동기화

### 8.2 백엔드 전략
- 프로젝트/장면/오브젝트/배치 상태 관리
- 자동 정리 규칙 처리
- 3D Export 생성
- 파일 업로드/다운로드 및 변환 작업 관리
- OpenAPI 기반 API 문서 자동화

### 8.3 내보내기 전략
- **기본 표준 포맷: glTF 2.0 / GLB**
- 옵션 포맷: OBJ, STL (보조 용도)
- 텍스처 포함, 재질 유지, 씬 단위 export
- 필요 시 Draco 압축 적용

---

## 9. 왜 glTF/GLB를 기본 표준으로 선택하는가

### 기본 결론
완성된 장면의 표준 다운로드 포맷은 **GLB(glTF binary)** 를 1순위로 선택한다.

### 이유
- 웹 친화적
- 장면(Scene) 단위 표현 가능
- 메쉬, 머티리얼, 텍스처, 카메라, 라이트 등 표현 가능
- 주요 3D 툴 및 엔진과 상호운용성이 높음
- 브라우저 및 WebGL/WebGPU 생태계와 잘 맞음
- 단일 파일(GLB)로 내보내기 쉬움

### 포맷 정책
- **Primary**: `.glb`
- **Secondary**: `.gltf + bin + textures`
- **Optional**: `.obj`, `.stl`
- **Not primary**: FBX (웹 표준 중심 관점에서는 우선순위 낮음)

---

## 10. 추천 기술 스택

## 10.1 프론트엔드

### 필수
- **TypeScript**
- **Next.js**
- **React**
- **Zustand** 또는 **Redux Toolkit**

### 2D/2.5D 편집
- **react-konva + Konva**
  - 오브젝트 선택
  - 드래그 앤 드롭
  - 정렬 가이드
  - 영역 표시
  - 다중 선택

### 3D 렌더링
- **three.js**
- **@react-three/fiber**
- **@react-three/drei**

### UI
- **Tailwind CSS**
- **shadcn/ui** 또는 **MUI**

### 폼/검증
- **react-hook-form**
- **zod**

### 통신
- **fetch**
- **axios**
- **TanStack Query**

### 기타
- **uuid**
- **immer**
- **lodash-es**

---

## 10.2 백엔드

### 추천 1순위
- **TypeScript + NestJS**

#### 이유
- 프론트/백 모두 TypeScript로 통일 가능
- 모듈 구조가 명확하여 프로젝트/씬/오브젝트/API 분리에 유리
- 대규모 구조화에 강함
- OpenAPI 문서화에 유리
- 권한/인증/파일/잡 처리 구조를 설계하기 좋음

### 대안
- **TypeScript + Fastify**
  - 더 가볍고 빠른 API 서버 구성이 가능
- **Python + FastAPI**
  - 자동 문서화가 강점
  - 추후 배치 최적화/규칙 엔진/AI 처리 연계 시 유리

### 권장 결론
- **서비스 주력 서버**: TypeScript + NestJS
- **향후 연산/변환 워커**: Python FastAPI 또는 독립 Python Worker 추가 가능

---

## 10.3 데이터 저장소
- **PostgreSQL**
- **Redis** (캐시/잡 큐/세션/비동기 작업)
- **S3 compatible object storage** (MinIO 포함 가능)

---

## 10.4 비동기/잡 처리
- **BullMQ** 또는 **RabbitMQ**
- 용도:
  - 내보내기 작업
  - 썸네일 생성
  - glTF 최적화/압축
  - 대용량 에셋 처리

---

## 10.5 인증/보안
- JWT 기반 인증
- OAuth 확장 가능
- 프로젝트 단위 권한 관리
- 파일 접근 권한 분리
- 업로드 검증 및 악성 파일 검사

---

## 11. 추천 오픈소스 / 라이브러리 정리

## 11.1 프론트엔드
- Next.js
- React
- TypeScript
- Zustand
- react-konva
- Konva
- three.js
- @react-three/fiber
- @react-three/drei
- TanStack Query
- Tailwind CSS
- shadcn/ui
- react-hook-form
- zod

## 11.2 백엔드
- NestJS
- Fastify
- FastAPI
- Pydantic (Python 선택 시)
- BullMQ
- Redis
- Prisma 또는 TypeORM

## 11.3 3D / Export / Asset 처리
- three.js GLTFExporter
- glTF Transform
- Draco
- glTF Validator
- meshoptimizer (선택)
- KTX2 / Basis Universal (선택)

## 11.4 저장소 / 인프라
- PostgreSQL
- Redis
- MinIO
- Docker
- Nginx
- GitHub Actions

---

## 12. 권장 개발 언어

### 프론트엔드
- **TypeScript**

### 백엔드
- **1순위: TypeScript**
- **보조/워커: Python**

### 이유
- 웹 서비스/API/씬 상태/UI가 TypeScript로 통일되면 생산성이 높음
- 3D 렌더링과 프론트 상태 관리가 TypeScript와 잘 맞음
- Python은 후속적으로 규칙 엔진 고도화/최적화/변환 작업에 유리

---

## 13. 시스템 핵심 기능

### 13.1 오브젝트 등록
- 관리자는 오브젝트를 등록할 수 있어야 한다.
- 등록 시 모델 파일과 메타데이터를 함께 저장한다.
- 카테고리, 태그, 썸네일, 미리보기, 크기 정보, 기본 방향, 배치 규칙을 관리한다.

### 13.2 오브젝트 목록 조회
- 사용자는 등록된 오브젝트 목록을 검색/필터링할 수 있어야 한다.
- 카테고리/태그/이름/최근 사용 기준으로 정렬할 수 있어야 한다.

### 13.3 장면 배치
- 사용자는 오브젝트 목록에서 선택한 오브젝트를 장면에 넣을 수 있어야 한다.
- 바닥면/영역/기준점/앵커에 스냅 가능해야 한다.
- 오브젝트 이동/삭제/복제/회전이 가능해야 한다.

### 13.4 자동 정리
- 선택 영역 또는 전체 장면 대상으로 실행 가능
- 정렬
- 간격 조정
- 소켓 연결
- Stretch/Repeat/Fit 규칙 적용
- 충돌 경고 또는 보정

### 13.5 3D 미리보기
- 결과를 실시간 또는 요청 기반으로 미리보기 가능
- 회전/줌/팬 지원
- 층별 보기 및 투명도 조절 가능

### 13.6 프로젝트 저장
- 프로젝트 / 씬 / 버전 저장
- 자동 저장
- 불러오기
- export 이력 확인

### 13.7 표준 다운로드
- GLB 다운로드
- glTF 다운로드
- 필요 시 OBJ/STL 보조 다운로드
- 서버에서 export 생성 후 파일 제공

---

## 14. 오브젝트 등록 모델 설계

```ts
type ObjectDefinition = {
  id: string
  code: string
  name: string
  category: string
  tags: string[]
  modelAssetId: string
  thumbnailAssetId?: string
  defaultSize: {
    width: number
    depth: number
    height: number
  }
  pivot: "center" | "bottom-center" | "front-bottom"
  allowedRotations: number[]
  sockets: SocketDefinition[]
  placementRules: PlacementRule[]
  scalable: {
    x: boolean
    y: boolean
    z: boolean
  }
  repeatable?: {
    enabled: boolean
    axis?: "x" | "z"
    minSpacing?: number
    recommendedSpacing?: number
  }
  createdAt: string
  updatedAt: string
}
```

### SocketDefinition

```ts
type SocketDefinition = {
  id: string
  name: string
  position: { x: number; y: number; z: number }
  direction: "north" | "south" | "east" | "west" | "up" | "down"
  accepts: string[]
}
```

### PlacementRule

```ts
type PlacementRule =
  | { type: "snap-to-grid" }
  | { type: "snap-to-surface" }
  | { type: "snap-to-socket" }
  | { type: "align-to-axis"; axis: "x" | "z" }
  | { type: "keep-spacing"; min: number; recommended?: number }
  | { type: "stretch-between-sockets" }
  | { type: "repeat-along-axis"; axis: "x" | "z"; spacing: number }
  | { type: "fit-inside-zone" }
```

---

## 15. 배치/생성 모델 설계

### 15.1 PlacedObject
```ts
type PlacedObject = {
  id: string
  sceneId: string
  objectDefinitionId: string
  name?: string
  position: { x: number; y: number; z: number }
  rotationY: number
  scale: { x: number; y: number; z: number }
  params?: Record<string, any>
  createdAt: string
  updatedAt: string
}
```

### 15.2 GeneratedObject
```ts
type GeneratedObject = {
  id: string
  sourcePlacedObjectId: string
  meshType: string
  assetId?: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  metadata?: Record<string, any>
}
```

### 15.3 Scene
```ts
type Scene = {
  id: string
  projectId: string
  name: string
  version: number
  unit: "m" | "cm"
  backgroundColor?: string
  placedObjects: PlacedObject[]
  generatedObjects?: GeneratedObject[]
  createdAt: string
  updatedAt: string
}
```

---

## 16. 편집 UX 설계 원칙

### 16.1 사용자는 다음만 쉽게 할 수 있어야 한다
- 오브젝트 검색
- 드래그하여 장면에 넣기
- 이동
- 삭제
- 회전(90도 단위 우선)
- 자동 정리 버튼 실행
- 3D 결과 확인
- 다운로드

### 16.2 초기에 제한해야 할 것
- 자유 축 회전
- 자유 축 스케일
- 버텍스/메시 편집
- 고급 머티리얼 편집
- 복잡한 트리 구조 편집

### 16.3 화면 구성
```text
┌───────────────────────────────────────────────┐
│ Top Bar: 프로젝트 / 저장 / 내보내기 / 실행   │
├───────────────┬───────────────────────────────┤
│ Object Panel  │ Placement Canvas / 3D View    │
│ - 검색         │                               │
│ - 카테고리      │                               │
│ - 썸네일 목록    │                               │
├───────────────┴───────────────────────────────┤
│ Bottom/Side Controls: 정렬 / 간격 / 스냅 / 속성 │
└───────────────────────────────────────────────┘
```

---

## 17. API 설계 원칙

### 17.1 통신 방식
- REST API + JSON
- 파일 업로드는 multipart/form-data
- 다운로드는 signed URL 또는 direct file response
- 추후 websocket은 장시간 export 상태 업데이트용으로 선택적 적용

### 17.2 표준
- OpenAPI 기반 문서 제공
- 명확한 versioning
- 인증 헤더 사용
- 에러 응답 표준화

---

## 18. API 엔드포인트 초안

## 18.1 인증
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`

## 18.2 오브젝트 등록/조회
- `POST /api/v1/object-definitions`
- `GET /api/v1/object-definitions`
- `GET /api/v1/object-definitions/:id`
- `PATCH /api/v1/object-definitions/:id`
- `DELETE /api/v1/object-definitions/:id`

### 오브젝트 등록 요청 예시
```json
{
  "code": "platform_gate_basic",
  "name": "Platform Gate Basic",
  "category": "gate",
  "tags": ["platform", "gate"],
  "defaultSize": {
    "width": 2.0,
    "depth": 0.8,
    "height": 2.2
  },
  "pivot": "bottom-center",
  "allowedRotations": [0, 90, 180, 270],
  "sockets": [],
  "placementRules": [
    { "type": "snap-to-surface" },
    { "type": "align-to-axis", "axis": "x" }
  ],
  "scalable": {
    "x": false,
    "y": false,
    "z": false
  }
}
```

## 18.3 에셋 업로드
- `POST /api/v1/assets/upload`
- `GET /api/v1/assets/:id`
- `DELETE /api/v1/assets/:id`

업로드 대상:
- glb/gltf
- png/jpg/webp thumbnail
- texture files
- metadata json

## 18.4 프로젝트/씬
- `POST /api/v1/projects`
- `GET /api/v1/projects`
- `GET /api/v1/projects/:id`
- `PATCH /api/v1/projects/:id`
- `DELETE /api/v1/projects/:id`

- `POST /api/v1/projects/:projectId/scenes`
- `GET /api/v1/projects/:projectId/scenes`
- `GET /api/v1/scenes/:sceneId`
- `PATCH /api/v1/scenes/:sceneId`
- `DELETE /api/v1/scenes/:sceneId`

## 18.5 배치 오브젝트
- `POST /api/v1/scenes/:sceneId/placed-objects`
- `GET /api/v1/scenes/:sceneId/placed-objects`
- `PATCH /api/v1/scenes/:sceneId/placed-objects/:id`
- `DELETE /api/v1/scenes/:sceneId/placed-objects/:id`
- `POST /api/v1/scenes/:sceneId/placed-objects/bulk`

## 18.6 자동 정리
- `POST /api/v1/scenes/:sceneId/arrange`
- `POST /api/v1/scenes/:sceneId/generate`
- `GET /api/v1/scenes/:sceneId/generated-objects`

### Arrange 요청 예시
```json
{
  "targetIds": ["obj-1", "obj-2", "obj-3"],
  "mode": "auto",
  "options": {
    "snap": true,
    "spacing": true,
    "fit": true,
    "repeat": true,
    "collisionCheck": true
  }
}
```

## 18.7 Export
- `POST /api/v1/scenes/:sceneId/exports`
- `GET /api/v1/scenes/:sceneId/exports`
- `GET /api/v1/exports/:exportId`
- `GET /api/v1/exports/:exportId/download`

### Export 요청 예시
```json
{
  "format": "glb",
  "options": {
    "embedTextures": true,
    "compressDraco": true,
    "includeLights": true,
    "includeCameras": false
  }
}
```

---

## 19. 자동 정리 엔진 설계

### 19.1 엔진 목표
- 사람이 대충 놓은 오브젝트를 사용 가능한 장면으로 정리
- 오브젝트 간 연결 관계를 이용해 위치/방향을 보정
- 필요한 경우 크기 또는 반복 개수를 조정

### 19.2 엔진 동작 단계
1. 입력 오브젝트 수집
2. 기준 표면/영역/격자 결정
3. Snap 후보 계산
4. Socket 연결 가능성 탐색
5. 충돌 검사
6. 정렬/간격/스케일/반복 규칙 적용
7. 결과 좌표 산출
8. GeneratedObject 생성

### 19.3 자동 정리 모드
- `align`: 축 정렬
- `space`: 간격 맞춤
- `fit`: 영역 내 맞춤
- `snap`: 연결점 정렬
- `repeat`: 반복 배치
- `auto`: 규칙 종합 적용

---

## 20. Export 파이프라인

```text
Scene Data
  ↓
Rule Engine / Generation
  ↓
Three.js Scene Graph
  ↓
GLTFExporter or server-side export pipeline
  ↓
glTF / GLB output
  ↓
Compression / Validation / Storage
  ↓
Download
```

### 권장 동작
- 클라이언트에서 즉시 내보내기 가능한 소규모 장면은 브라우저 export 가능
- 대형 장면이나 최적화/압축이 필요한 경우 서버 export 권장
- export 완료 후 파일 다운로드 URL 제공

---

## 21. 표준 포맷 정책

### 21.1 Primary: GLB
가장 우선 제공해야 하는 포맷

### 21.2 Secondary: glTF
텍스처와 파일 분리를 원하는 경우 제공

### 21.3 Optional
- OBJ: 메쉬 단순 전달용
- STL: 프린팅/단순 지오메트리 용도

### 21.4 권장하지 않는 기본 포맷
- 독점 포맷 중심 설계
- 특정 DCC 전용 포맷을 기본 표준으로 채택하는 것

---

## 22. 폴더 구조 예시

## 22.1 프론트엔드
```text
/apps/web
  /src
    /app
    /components
      /object-catalog
      /editor
      /viewer3d
      /export
    /features
      /projects
      /scenes
      /objects
      /arrange
    /store
    /lib
    /types
```

## 22.2 백엔드
```text
/apps/api
  /src
    /modules
      /auth
      /users
      /projects
      /scenes
      /object-definitions
      /placed-objects
      /assets
      /exports
      /arrange
    /common
    /config
```

## 22.3 워커
```text
/apps/worker
  /src
    /jobs
      /export
      /thumbnail
      /optimize
```

---

## 23. 데이터베이스 테이블 초안

- users
- projects
- scenes
- object_definitions
- object_definition_assets
- placed_objects
- generated_objects
- exports
- export_files
- asset_files
- audit_logs

---

## 24. 보안 및 운영 고려사항
- 업로드 파일 확장자/컨텐츠 검사
- 대용량 파일 업로드 제한
- signed URL 기반 파일 접근
- 프로젝트 권한 검증
- export job timeout
- 에셋 버전 관리
- 사용량 모니터링
- 장애 대비 재시도 정책

---

## 25. 개발 단계 제안

## Phase 1. 핵심 MVP
- 회원/프로젝트/씬 생성
- 오브젝트 등록
- 오브젝트 목록 조회
- 장면에 오브젝트 배치
- 이동/삭제/회전
- 3D 미리보기
- GLB export

## Phase 2. 자동 정리
- 스냅
- 간격 조정
- 축 정렬
- 최소 충돌 경고
- 자동 정리 버튼

## Phase 3. 고급 생성
- repeat/stretch/fit
- socket 연결
- zone 기반 생성
- export 최적화

## Phase 4. 운영 고도화
- 협업
- 권한 세분화
- 버전 비교
- 템플릿/프리셋
- 사용 분석

---

## 26. MVP 범위 권장안

### 꼭 포함
- Object Registry
- Scene Editor
- Arrange
- 3D Preview
- GLB Export
- Save/Load

### 제외 권장
- 실시간 협업
- 정밀 메시 편집
- 고급 애니메이션
- 물리 엔진 편집
- 수십 종 복잡한 생성 규칙

---

## 27. 최종 권장안

### 기술 선택
- **Frontend**: Next.js + React + TypeScript + react-konva + three.js + react-three-fiber + Zustand
- **Backend**: NestJS + TypeScript + PostgreSQL + Redis + S3 compatible storage
- **Worker**: BullMQ + optional Python worker
- **Export Standard**: GLB / glTF
- **Optimization**: Draco + glTF Transform + Validator

### 제품 방향
- 블록 에디터가 아니라 **오브젝트 등록형 배치 시스템**
- 자유형 3D 모델러가 아니라 **쉬운 배치 + 자동 정리 + 표준 export 서비스**
- 최종 목표는 “초보자도 재사용 가능한 3D 장면을 빠르게 제작”하는 것

---

## 28. 참고 설계 요약

한 문장으로 요약하면:

**SnapSpace 3D는 등록된 오브젝트를 웹에서 쉽게 배치하고, 자동 정리 및 규칙 기반 생성으로 완성된 3D 장면을 만들고, 이를 GLB/glTF 표준으로 다운로드할 수 있는 오브젝트 기반 3D 제작 서비스이다.**
