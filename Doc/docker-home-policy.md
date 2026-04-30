# SnapSpace 3D Docker 실행 기준 폴더 정책

## 1. 목적

Docker 실행 관련 설정(.env)과 실행 기준 경로를 고정해서 운영 혼선을 줄인다.

## 2. 기본 경로

- Docker Home 기본값: 프로젝트 루트
- 필요 시 `SNAPSPACE_DOCKER_HOME`으로 다른 경로를 지정할 수 있다.

## 3. 운영 원칙

1. Docker 실행은 항상 Docker Home 기준으로 수행한다.
2. 환경 변수 파일은 Docker Home의 `.env`를 사용한다.
3. 실행 일관성을 위해 `scripts/docker-home-*.sh` 스크립트를 우선 사용한다.
4. 로컬 기본 실행은 Docker 네트워크 기준으로 고정한다.
5. `pnpm --filter @snapspace/api start` 같은 호스트 직접 실행은 기본 경로가 아니다.

### 3.1 호스트 직접 실행 관련 주의

- `.env.example`의 기본 연결값은 Docker 서비스명(`postgres`, `redis`) 기준이다.
- 따라서 호스트에서 API를 직접 실행하면 DB/Redis DNS 해석 실패가 발생할 수 있다.
- 호스트 실행이 필요한 경우에만 아래 값을 로컬 주소로 오버라이드한다.
  - `DATABASE_URL` (예: localhost:5432)
  - `REDIS_URL` (예: localhost:6379)
  - `S3_ENDPOINT` (예: localhost:9000)

### 3.2 호스트 직접 실행 표준 스크립트

- API 직접 실행은 `scripts/local-api-up.sh`를 사용한다.
- API 상태를 즉시 검증할 때는 `scripts/local-api-up.sh smoke`를 사용한다.
- Web 직접 실행은 `scripts/local-web-up.sh`를 사용한다.
- Docker API(8080)가 실행 중이면 로컬 API는 기본 8081로 실행해 포트 충돌을 피한다.

## 4. 실행 절차

1. 초기화

```bash
bash scripts/docker-home-init.sh
```

1. 기동

```bash
bash scripts/docker-home-up.sh
```

1. 중지

```bash
bash scripts/docker-home-down.sh
```

## 5. 선택 옵션

- 기본 경로 대신 다른 경로를 쓰고 싶으면 환경변수로 지정:

```bash
SNAPSPACE_DOCKER_HOME=/my/custom/path bash scripts/docker-home-up.sh
```
