# SnapSpace 3D Docker Home

이 폴더는 SnapSpace 3D Docker 실행 기준 폴더입니다.

- 기본 경로: 레포 루트(/Volumes/MartinData/dev-project/querensys/SnapSpace 3D)
- 이 폴더의 .env를 기준으로 Docker 실행

실행 예시:

1. bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/docker-home-up.sh
1. bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/docker-home-down.sh

### 도커 기준 실행 (권장)

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

### pnpm 스크립트 래퍼 (권장)

반복 명령을 줄이기 위해 루트에서 아래 명령으로 동일 작업을 실행할 수 있습니다.

```bash
cd /Volumes/MartinData/dev-project/querensys/SnapSpace 3D
pnpm dev:doctor
pnpm dev:api:local:smoke
pnpm dev:api:local
pnpm dev:web:local
pnpm dev:local
```

### API 실행 주의사항

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

## AI Provider 실환경 튜닝

AI 생성 provider를 실제 키로 검증할 때는 아래 순서로 진행하세요.

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

2. API 기동

```bash
pnpm --filter @snapspace/api dev
```

3. 웹에서 생성 요청 후 서버 로그 확인
- submit_response / submit_mapped / poll_response / poll_mapped 로그를 확인합니다.
- 응답 구조가 다르면 .env의 AI_PROVIDER_POLL_*_PATHS 값을 우선순위에 맞게 조정합니다.

4. 최소 검증 기준
- 상태가 ready로 전이되는지
- glbUrl 또는 glbAssetId가 매핑되는지
- previewImageUrl 또는 previewImageAssetId가 매핑되는지
