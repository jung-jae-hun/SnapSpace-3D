# SnapSpace 3D Release and Rollback Runbook

원격 Git 연동과 무관하게 로컬/운영 검증 기준으로 릴리즈와 롤백을 수행하기 위한 절차 문서.

## 1. 릴리즈 전 체크리스트

1. 워킹트리 정리

```bash
git status --short --branch
```

2. 품질 게이트 실행

```bash
pnpm run ci:lint
pnpm run ci:typecheck
pnpm run ci:test
pnpm run ci:build
```

3. 런타임/흐름 검증

```bash
pnpm dev:docker:verify
pnpm smoke:lifecycle
```

4. 체크포인트 백업

```bash
git bundle create ../SnapSpace-3D-release-prep-$(date +%Y%m%d-%H%M%S).bundle --all
```

## 2. 릴리즈 노트 템플릿

```md
## Summary
- 변경 요약 3~5줄

## Scope
- API/Web/Worker/Infra 중 영향 범위

## Validation
- ci:lint/typecheck/test/build
- dev:docker:verify
- smoke:lifecycle

## Risk
- low/medium/high
- 주요 리스크 및 완화책

## Rollback
- 대상 커밋: <commit>
- 롤백 절차: 본 문서 3장 참조
```

## 3. 롤백 절차

1. 기준 커밋 확인

```bash
git log --oneline -n 20
```

2. 롤백 브랜치 생성

```bash
git switch -c rollback/<yyyymmdd>-<topic>
```

3. 문제 커밋 되돌리기

```bash
git revert <bad_commit_sha>
```

4. 검증 재실행

```bash
pnpm run ci:lint
pnpm run ci:typecheck
pnpm dev:docker:verify
pnpm smoke:lifecycle
```

5. 안전 백업 생성

```bash
git bundle create ../SnapSpace-3D-rollback-$(date +%Y%m%d-%H%M%S).bundle --all
```

## 4. 장애 대응 기본 규칙

1. 증상 분류
- build/test 실패
- runtime verify 실패
- lifecycle smoke 실패

2. 우선순위
- 서비스 기동 불가 > 로그인/인증 실패 > 기능 회귀

3. 공통 대응
- 최근 변경 커밋 범위 축소
- 재현 명령 단일화
- 원인 커밋 식별 후 revert 우선

## 5. 성공 기준

1. 릴리즈 후보 커밋에서 아래가 모두 통과
- `pnpm run ci:quality`
- `pnpm dev:docker:verify`
- `pnpm smoke:lifecycle`

2. 실패 시 즉시 롤백 브랜치에서 재검증 후 복구 경로 확정

## 6. 장기 회귀 워크플로 운영

1. 대상 워크플로
- .github/workflows/lifecycle-smoke.yml
- .github/workflows/smoke-flow-regression.yml

2. 운영 규칙
- lifecycle smoke는 일일 스케줄 기반 기본 감시로 유지
- smoke flow regression은 주간 스케줄 + 수동 실행으로 운영
- 장애 분석 시 workflow artifact와 로컬 재현 로그를 함께 기록

3. 수동 실행 시 권장 입력
- `runRuntimeVerify=true` (기본값 유지)
- `runAiLocalE2E=true` (AI 생성/alias promote 회귀까지 함께 점검할 때)
- `runAiLocalE2E=true`를 선택하면 워크플로에서 runtime verify가 자동 선행된다.

3-1. AI web proxy 라우트 회귀 점검
- `pnpm dev:web:ai-routes:verify`
- 점검 범위: generation GET, promote, cancel, Unauthorized(401), invalid action(404)

4. 현재 알려진 주의사항
- Next app/api에서 동적 세그먼트 하위 액션 라우트가 누락될 수 있으므로 AI generation 상세/액션은 단일 catch-all 경로(`app/api/ai/generations/[generationId]/[[...action]]/route.ts`)로 유지한다.
- Turbopack 캐시/컴파일 상태가 stale 하면 web proxy가 500으로 흔들릴 수 있다. 이 경우 `docker restart snapspace-web-dev` 후 `pnpm dev:docker:verify`를 재실행해 정상 상태를 확정한다.
- AI 회귀 검증은 `scripts/verify-ai-local-e2e.sh` 기준으로 수행하며, promote는 web proxy 경로(`/api/ai/generations/:id/promote`)를 기본 검증 경로로 사용한다.

## 7. 벤치마크 결과 운영 규칙

1. 결과 파일 생성/보관
- 산출물은 `benchmarks/results/`에 `benchmark-<timestamp>-<mode>.(json|csv|manual-review.md)` 형식으로 저장한다.
- 최신 포인터 문서는 `benchmarks/results/provider-compare-latest.md`를 단일 기준으로 유지한다.

2. 최신 포인터 갱신 규칙
- 신규 벤치 실행 후 `provider-compare-latest.md`에 최신 timestamp 결과 링크를 먼저 갱신한다.
- 수동 리뷰는 CSV 재파싱이 아닌 JSON rows 기준으로 작성한다.

3. 보관 주기
- 상세 결과(json/csv/manual)는 최근 10회 기준으로 유지하고 초과분은 아카이브 브랜치/스토리지로 이동한다.
- 릴리즈 기준선으로 사용한 결과는 삭제하지 않는다.

## 8. 릴리즈 체크리스트 잠금 (최종)

릴리즈 전 아래 명령을 순서대로 통과하지 못하면 배포하지 않는다.

```bash
pnpm run ci:quality
pnpm dev:docker:verify
pnpm dev:web:ai-routes:verify
pnpm smoke:lifecycle
```

선택 검증(권장): opensrc 경로 회귀

```bash
AI_PROVIDER_BASE_URL=http://localhost:7002 AI_PROVIDER_MODE=opensrc bash ./scripts/verify-local-provider.sh
pnpm dev:provider:opensrc:proxy:e2e
```

