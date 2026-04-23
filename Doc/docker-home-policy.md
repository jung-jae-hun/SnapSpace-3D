# SnapSpace 3D Docker 실행 기준 폴더 정책

## 1. 목적
Docker 실행 관련 설정(.env)과 실행 기준 경로를 고정해서 운영 혼선을 줄인다.

## 2. 고정 경로
- Docker Home: `/Volumes/MartinData/SERVER/SnapSpace-3D`

## 3. 운영 원칙
1. Docker 실행은 항상 Docker Home 기준으로 수행한다.
2. 환경 변수 파일은 Docker Home의 `.env`를 사용한다.
3. 레포 루트에서 직접 `docker compose up`를 실행하지 않는다.

## 4. 실행 절차
1. 초기화
```bash
bash scripts/docker-home-init.sh
```

2. 기동
```bash
bash scripts/docker-home-up.sh
```

3. 중지
```bash
bash scripts/docker-home-down.sh
```

## 5. 선택 옵션
- 기본 경로 대신 다른 경로를 쓰고 싶으면 환경변수로 지정:
```bash
SNAPSPACE_DOCKER_HOME=/my/custom/path bash scripts/docker-home-up.sh
```
