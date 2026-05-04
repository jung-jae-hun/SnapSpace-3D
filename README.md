# SnapSpace 3D Docker Home

이 폴더는 SnapSpace 3D Docker 실행 기준 폴더입니다.

- 기본 경로: 레포 루트(현재 클론된 SnapSpace 3D 경로)
- 이 폴더의 .env를 기준으로 Docker 실행

GitHub 신규 저장소 초기 설정 체크리스트는 아래 문서를 참고하세요.

- Doc/github-initial-setup-checklist.md

## 안정성 운영 규칙 (기능 동결)

현재 lifecycle/editor 영역은 안정화 구간으로 운영합니다.

- 신규 기능 추가 금지: `apps/web/app/scenes/[sceneId]/editor/page.tsx`와 lifecycle 관련 API/워크플로는 버그 수정/운영 안정화만 허용
- 필수 게이트 고정: 아래 3개가 모두 통과하지 않으면 머지하지 않음

```bash
pnpm --filter @snapspace/web typecheck
pnpm dev:docker:verify
pnpm smoke:lifecycle
```

- 의존성 드리프트 억제: 정기 검증은 `--frozen-lockfile` 기반 설치를 유지하고, 패키지 업그레이드는 별도 안정화 윈도우에서만 수행

브랜치 보호 규칙(필수 상태 체크)은 저장소 Settings에서 아래를 Required로 고정합니다.

- `lifecycle-smoke / smoke`
- `quality-gate`에서 제공하는 타입/검증 체크

실행 예시:

1. bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/docker-home-up.sh
1. bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/docker-home-down.sh

## 도커 기준 실행 (권장)

서버 시작/재시작 이슈를 줄이기 위해 아래 순서로 도커 기준 실행을 권장합니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:docker:init
pnpm dev:docker:up
pnpm dev:docker:verify
```

재시작이 필요할 때는 아래 명령 하나로 정리합니다.

```bash
pnpm dev:docker:restart
pnpm dev:docker:verify
```

## 로컬 직접 실행(호스트)

도커 스택과 분리해서 호스트에서 직접 실행할 때는 아래 스크립트를 사용하세요.

1. API 로컬 실행 (기본 포트: 8081)

```bash
bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/local-api-up.sh
```

1. API 로컬 dev(watch) 실행

```bash
bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/local-api-up.sh dev
```

1. API 로컬 smoke 실행 (기동 + health/login 검증 + 종료)

```bash
bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/local-api-up.sh smoke
```

1. Web 로컬 실행 (기본 포트: 3400)

```bash
bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/local-web-up.sh
```

## pnpm 스크립트 래퍼 (권장)

반복 명령을 줄이기 위해 루트에서 아래 명령으로 동일 작업을 실행할 수 있습니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:doctor
pnpm dev:api:local:smoke
pnpm dev:api:local
pnpm dev:web:local
pnpm dev:local
```

## API 실행 주의사항

아래 명령은 환경변수 미설정 시 실패할 수 있으므로 로컬 개발에서는 사용하지 마세요.

```bash
pnpm --filter @snapspace/api start
```

대신 레포 루트에서 아래 명령만 사용하세요.

```bash
pnpm dev:api:local
pnpm dev:api:local:smoke
```

## 도커 런타임 검증

도커 스택 기동 후 웹/헬스/로그인 경로를 한 번에 확인합니다.

```bash
bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/verify-runtime.sh
```

옵션 예시:

```bash
bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/verify-runtime.sh \
  --web-port 3300 \
  --api-port 8080 \
  --email owner@snapspace.io \
  --name "Snap Owner"
```

런타임 트러블슈팅(우선 순위):

- `pnpm dev:docker:verify`에서 `/api/auth/me`가 500으로 떨어지면, 코드 결함보다 Next.js Turbopack dev cache 손상 가능성을 먼저 의심합니다.
- 아래 순서로 복구 후 재검증합니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:docker:restart
pnpm dev:docker:verify
pnpm smoke:lifecycle
```

실패 판정 기준(운영 공통):

- `pnpm dev:docker:verify`
: `web-proxy(auth/me)=401`, `health=200`, `login=200`이 아니면 실패
- `pnpm smoke:lifecycle`
: 스크립트 종료 코드가 0이 아니거나 `.tmp/smoke-lifecycle/*.json` 리포트가 생성되지 않으면 실패
- 스케줄 CI 실패 이슈 승격
: 단발 실패(1회)는 경고 수준, 연속 실패(2회 이상)는 자동 승격 라벨과 함께 high severity로 처리

## AI Provider 실환경 튜닝

AI 생성 provider를 실제 키로 검증할 때는 아래 순서로 진행하세요.

- `AI_PROVIDER_MODE=mock`: 내부 모의 생성(기본값)
- `AI_PROVIDER_MODE=meshy`: 외부 상용 API 연동
- `AI_PROVIDER_MODE=local`: 무료 로컬 추론 서버 연동

1. 환경 변수 설정

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
set -a
source ./.env.example
set +a
export API_PORT=8081
export DATABASE_URL='postgresql://snapspace:snapspace@localhost:5432/snapspace?schema=public'
export REDIS_URL='redis://localhost:6379'
export MINIO_ENDPOINT='localhost'
export AI_PROVIDER_MODE='meshy'
export AI_PROVIDER_BASE_URL='https://YOUR_PROVIDER_HOST'
export AI_PROVIDER_API_KEY='YOUR_API_KEY'
export AI_PROVIDER_DEBUG='true'
```

무료 로컬 추론 서버를 사용할 때는 아래와 같이 설정합니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
set -a
source ./.env.example
set +a
export API_PORT=8081
export DATABASE_URL='postgresql://snapspace:snapspace@localhost:5432/snapspace?schema=public'
export REDIS_URL='redis://localhost:6379'
export MINIO_ENDPOINT='localhost'
export AI_PROVIDER_MODE='local'
export AI_PROVIDER_BASE_URL='http://localhost:7001'
export AI_PROVIDER_SUBMIT_PATH='/v1/image-to-3d/jobs'
export AI_PROVIDER_STATUS_PATH='/v1/image-to-3d/jobs/{jobId}'
export AI_PROVIDER_API_KEY=''
export AI_PROVIDER_SOURCE_IMAGE_URL_TEMPLATE='http://localhost:8081/api/v1/assets/object-proxy?key={assetId}'
export AI_PROVIDER_DEBUG='true'
```

`AI_PROVIDER_SOURCE_IMAGE_URL_TEMPLATE`는 로컬 추론 서버가 원본 이미지를 직접 읽어야 할 때 사용합니다.
로컬 서버가 `sourceImageRef`만 받아도 동작한다면 비워도 됩니다.

로컬 provider 단일 스모크 점검은 아래 명령으로 수행합니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:provider:local:verify
```

로컬 추론 서버가 아직 없으면, 무료 Stub 서버로 즉시 흐름 검증이 가능합니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:provider:local:verify:stub
```

Stub 서버만 따로 실행하려면 아래 명령을 사용합니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:provider:local:stub
```

Docker 스택에서 local provider(stub)를 함께 쓰려면 `.env` 또는 쉘 환경에 아래 값을 설정하세요.

```bash
AI_PROVIDER_MODE=local
AI_PROVIDER_BASE_URL=http://ai-provider-local:7001
AI_PROVIDER_SUBMIT_PATH=/v1/image-to-3d/jobs
AI_PROVIDER_STATUS_PATH=/v1/image-to-3d/jobs/{jobId}
```

그 다음 Docker를 재기동하고 런타임 검증을 수행합니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:docker:restart
pnpm dev:docker:verify
```

local provider 단독 API 흐름 검증은 호스트에서 아래 명령으로 확인할 수 있습니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:provider:local:verify
```

오픈소스 교체 경로는 `opensrc` 프로필로 어댑터 컨테이너를 올려 계약(health/submit/poll) 호환성을 먼저 검증할 수 있습니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:provider:opensrc:up
curl -fsS http://localhost:7002/health
```

실제 오픈소스 엔진과 연결하려면 `.env`에 아래 값을 추가하세요.

```bash
OPENSRC_ENGINE_MODE=proxy
OPENSRC_ENGINE_BASE_URL=http://your-opensrc-engine:port
OPENSRC_ENGINE_SUBMIT_PATH=/v1/image-to-3d/jobs
OPENSRC_ENGINE_STATUS_PATH=/v1/image-to-3d/jobs/{jobId}
OPENSRC_ENGINE_API_KEY=
```

이 설정 시 `ai-provider-opensrc`는 submit/poll 요청을 엔진으로 프록시합니다. 값이 비어 있거나 `OPENSRC_ENGINE_MODE=stub`이면 기존 어댑터(stub) 모드로 동작합니다.

opensrc 경로를 앱 전체로 검증하려면(웹 업로드 -> 생성 -> poll -> promote) 아래 명령으로 API/Worker를 opensrc 모드로 재기동한 뒤 E2E를 실행할 수 있습니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:provider:opensrc:e2e
```

이 명령은 내부적으로 런타임 검증(`pnpm dev:docker:verify`) 후 E2E를 실행하므로, 재기동 직후 readiness race를 줄일 수 있습니다.

어댑터 proxy 모드 체인을 포함해 검증하려면 아래 명령을 사용하세요(어댑터 -> local stub 엔진 프록시).

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:provider:opensrc:proxy:e2e
```

유료/무료 인식률 비교 벤치는 아래 명령으로 실행할 수 있습니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm bench:provider:compare
```

사전 준비:

- 비교 이미지 파일을 `benchmarks/images`에 넣습니다(`.png`, `.jpg`, `.jpeg`, `.webp`).
- 이미지와 같은 이름의 `.txt` 파일이 있으면 프롬프트로 사용합니다(예: `chair.png` + `chair.txt`).
- 유료(meshy)까지 같이 비교하려면 아래 환경변수를 같이 설정하세요.

```bash
export BENCH_MESHY_BASE_URL='https://your-meshy-endpoint'
export BENCH_MESHY_API_KEY='YOUR_API_KEY'
```

결과 파일:

- `benchmarks/results/benchmark-*.csv`: 샘플별 상태/지연
- `benchmarks/results/benchmark-*.json`: 요약 + 상세 행
- `benchmarks/results/benchmark-*.manual-review.md`: shape/detail/usability 수동 점수표
- `benchmarks/results/provider-compare-latest.md`: provider 비교 요약

필요 시 아래 환경변수로 검증 강도를 조정할 수 있습니다.

- `LOCAL_PROVIDER_VERIFY_SOURCE_IMAGE_REF`: submit 시 전달할 이미지 참조 키
- `LOCAL_PROVIDER_VERIFY_PROMPT`: submit 프롬프트
- `LOCAL_PROVIDER_VERIFY_QUALITY`: `low` 또는 `standard`
- `LOCAL_PROVIDER_VERIFY_POLL_MAX`: 폴링 최대 횟수
- `LOCAL_PROVIDER_VERIFY_POLL_DELAY`: 폴링 간격(초)
- `LOCAL_PROVIDER_VERIFY_CURL_MAX_TIME`: 요청당 curl timeout(초)

1. API 기동

```bash
pnpm --filter @snapspace/api dev
```

1. 웹에서 생성 요청 후 서버 로그 확인

- submit_response / submit_mapped / poll_response / poll_mapped 로그를 확인합니다.
- 응답 구조가 다르면 .env의 AI_PROVIDER_POLL_*_PATHS 값을 우선순위에 맞게 조정합니다.

1. 최소 검증 기준

- 상태가 ready로 전이되는지
- glbUrl 또는 glbAssetId가 매핑되는지
- previewImageUrl 또는 previewImageAssetId가 매핑되는지
