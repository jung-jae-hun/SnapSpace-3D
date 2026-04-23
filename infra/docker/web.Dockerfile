FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dev
RUN npm i -g pnpm
CMD ["sh", "-c", "pnpm install && pnpm --filter @snapspace/web dev"]

FROM base AS build
RUN npm i -g pnpm
COPY package.json pnpm-workspace.yaml ./
COPY apps/web ./apps/web
RUN pnpm install && pnpm --filter @snapspace/web build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
USER app
COPY --from=build /app/apps/web .
EXPOSE 3000
CMD ["node", "server.js"]
