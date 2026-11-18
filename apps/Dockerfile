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
# The API with production dependencies only (Express, Prisma, nodemailer…).
RUN pnpm --filter @xboard/api deploy --prod --legacy /out \
    && cd /out && node_modules/.bin/prisma generate

FROM node:24-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules node_modules
COPY --from=build /out/prisma prisma
COPY --from=build /workspace/apps/api/dist dist
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]

FROM caddy:2-alpine AS web
COPY --from=build /workspace/apps/user/dist /srv
COPY ops/Caddyfile /etc/caddy/Caddyfile
