#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed. Install with: npm i -g pnpm"
  exit 1
fi

# Root dev dependencies
pnpm add -Dw typescript@^5.9.3 @types/node eslint prettier

# Web dependencies
pnpm add -F @snapspace/web next react react-dom three @react-three/fiber @react-three/drei zustand @tanstack/react-query react-hook-form zod tailwindcss
pnpm add -F @snapspace/web -D @types/react @types/react-dom

# API dependencies
pnpm add -F @snapspace/api @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/swagger swagger-ui-express class-validator class-transformer reflect-metadata rxjs
pnpm add -F @snapspace/api @prisma/client@^6.7.0 ioredis bullmq minio
pnpm add -F @snapspace/api -D @nestjs/cli prisma@^6.7.0 ts-node ts-node-dev

# Worker dependencies
pnpm add -F @snapspace/worker bullmq ioredis minio
pnpm add -F @snapspace/worker -D ts-node ts-node-dev

# Shared packages
pnpm add -F @snapspace/shared-types zod
pnpm add -F @snapspace/scene-engine three zod lodash-es

echo "All dependencies installed successfully."
