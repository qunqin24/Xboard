FROM node:24-trixie-slim AS build
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
# The API with production dependencies only (Express, Prisma, nodemailer…).
RUN pnpm --filter @xboard/api deploy --prod --legacy /out \
    && cd /out && node_modules/.bin/prisma generate

FROM node:24-trixie-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client-17 age && rm -rf /var/lib/apt/lists/*
RUN install -d -o node -g node -m 700 /data/secrets
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules node_modules
COPY --from=build --chown=node:node /out/prisma prisma
COPY --from=build --chown=node:node /workspace/apps/api/dist dist
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001 APP_DATA_DIR=/data
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]

FROM caddy:2-alpine AS web
COPY --from=build /workspace/apps/user/dist /srv
COPY ops/Caddyfile /etc/caddy/Caddyfile
