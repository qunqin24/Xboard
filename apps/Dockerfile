FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.0.3
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api apps/api
COPY apps/user apps/user
COPY packages packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @xboard/api exec prisma generate
RUN pnpm build

FROM build AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/src/main.js"]

FROM caddy:2-alpine AS web
COPY --from=build /workspace/apps/user/dist /srv
COPY ops/Caddyfile /etc/caddy/Caddyfile
