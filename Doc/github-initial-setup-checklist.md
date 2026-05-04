# SnapSpace 3D GitHub 초기 설정 체크리스트

폴더 이동 이후 신규 원격 저장소에 안전하게 연결/운영하기 위한 최소 기준입니다.

## 1) 코드 유실 방지 기준

- 로컬에서 백업 번들 생성 후 진행
- 원격 상태 확인 후 최초 업로드
- 최초 업로드는 `main` 1회만 수행

참고 명령:

```bash
git bundle create ../SnapSpace-3D-backup-$(date +%Y%m%d-%H%M%S).bundle --all
git remote set-url origin git@martin-personal:jung-jae-hun/SnapSpace-3D.git
git remote -v
git ls-remote origin
```

원격이 비어 있을 때 최초 업로드:

```bash
git push -u origin main
```

## 2) 브랜치 보호 규칙 (main)

GitHub Settings > Branches > Add branch protection rule

- Branch name pattern: `main`
- Require a pull request before merging: ON
- Require approvals: 1 이상
- Dismiss stale pull request approvals when new commits are pushed: ON
- Require status checks to pass before merging: ON
- Require branches to be up to date before merging: ON

권장 Required checks:

- `quality-gate / quality`

운영 모니터링 체크(필수 권장 아님):

- `lifecycle-smoke / smoke`

주의:

- `lifecycle-smoke`는 현재 스케줄/수동 실행 중심 워크플로우라, PR 필수 체크로 강제하면 머지가 막힐 수 있습니다.

## 3) 태그/릴리즈 전략

추천 규칙:

- 태그 포맷: `vMAJOR.MINOR.PATCH` (예: `v0.1.0`)
- 초기 릴리즈는 `v0.1.0`부터 시작
- 태그는 `main`의 검증 완료 커밋에만 생성

로컬 태그 생성 예시:

```bash
git tag -a v0.1.0 -m "릴리즈 v0.1.0"
```

원격 업로드(사용자 실행):

```bash
git push origin v0.1.0
```

## 4) 최초 릴리즈 노트 템플릿

- 변경 요약
- 안정성/제약 사항
- 검증 명령 및 결과
- 알려진 이슈

간단 템플릿:

```md
## 변경 요약
- Docker 개발 런타임 안정화
- lifecycle smoke/quality gate 정비

## 검증
- pnpm dev:docker:verify
- pnpm smoke:lifecycle
- pnpm run ci:build

## 알려진 이슈
- 로컬 환경에서 초기 기동 시 의존 서비스 준비 시간 필요
```

## 5) 사고 복구 (유실 대비)

백업 번들에서 복구:

```bash
git clone ../SnapSpace-3D-backup-YYYYMMDD-HHMMSS.bundle snapspace-3d-recovery
cd snapspace-3d-recovery
git log --oneline --decorate -n 20
```

## 6) 릴리즈 전 최종 게이트 (잠금)

아래 명령을 모두 통과한 커밋만 `main` 릴리즈 기준으로 사용합니다.

```bash
pnpm run ci:quality
pnpm dev:docker:verify
pnpm dev:web:ai-routes:verify
pnpm smoke:lifecycle
```
