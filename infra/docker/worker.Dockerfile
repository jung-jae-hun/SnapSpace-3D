FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dev
RUN npm i -g pnpm
CMD ["sh", "-c", "pnpm install && pnpm --filter @snapspace/worker dev"]

FROM base AS build
RUN npm i -g pnpm
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker ./apps/worker
COPY packages ./packages
RUN pnpm install && pnpm --filter @snapspace/worker build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
USER app
COPY --from=build /app/apps/worker/dist ./dist
CMD ["node", "dist/index.js"]
