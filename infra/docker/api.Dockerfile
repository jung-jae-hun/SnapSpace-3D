FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dev
RUN npm i -g pnpm
CMD ["sh", "-c", "pnpm install && pnpm --filter @snapspace/api dev"]

FROM base AS build
RUN npm i -g pnpm
COPY package.json pnpm-workspace.yaml ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm install && pnpm --filter @snapspace/api build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
USER app
COPY --from=build /app/apps/api/dist ./dist
EXPOSE 8080
CMD ["node", "dist/main.js"]
