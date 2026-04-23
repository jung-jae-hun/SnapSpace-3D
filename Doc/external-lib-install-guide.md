# SnapSpace 3D 외부 라이브러리 설치 가이드

## 1. 목적
- 외부 라이브러리를 분산 설치하지 않고, 한 번에 설치한다.
- 팀원이 동일한 버전/명령으로 개발 환경을 맞춘다.

## 2. 사전 설치
1. Node.js 20.11+
2. pnpm 10+

설치 예시:
```bash
npm i -g pnpm
```

## 3. 일괄 설치 명령
루트에서 아래 명령 1회 실행:
```bash
pnpm run bootstrap
```

실제 실행 스크립트:
- scripts/install-all-libs.sh

## 4. 설치되는 라이브러리 그룹
1. 공통: TypeScript, ESLint, Prettier
2. Web: Next.js, React, R3F, Zustand, TanStack Query, RHF, Zod, Tailwind
3. API: NestJS, Swagger, Prisma, BullMQ, Redis, MinIO
4. Worker: BullMQ, Redis, MinIO, ts-node-dev
5. Shared: 도메인 타입 및 scene-engine 유틸

## 5. 설치 후 검증
```bash
pnpm -r list --depth 0
```

## 6. 운영 규칙
1. 신규 라이브러리는 개별 설치 후 반드시 scripts/install-all-libs.sh에 반영
2. 변경 시 이 문서에 목적과 영향 범위를 함께 기록
3. major 업그레이드는 별도 브랜치에서 호환성 점검 후 반영
