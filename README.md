# SnapSpace 3D Docker Home

이 폴더는 SnapSpace 3D Docker 실행 기준 폴더입니다.

- 기본 경로: 레포 루트(/Volumes/MartinData/dev-project/querensys/SnapSpace 3D)
- 이 폴더의 .env를 기준으로 Docker 실행

실행 예시:

1. bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/docker-home-up.sh
1. bash /Volumes/MartinData/dev-project/querensys/SnapSpace 3D/scripts/docker-home-down.sh

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
