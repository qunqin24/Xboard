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

# One image serves the API and the built React app (APP_WEB_DIR); HTTPS is
# terminated by the operator's reverse proxy.
FROM node:24-trixie-slim AS app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client-17 age && rm -rf /var/lib/apt/lists/*
# Only /data is writable by the runtime user; the code stays root-owned so a
# compromised process cannot rewrite it.
RUN install -d -o node -g node -m 700 /data/secrets
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules node_modules
COPY --from=build /out/prisma prisma
COPY --from=build /workspace/apps/api/dist dist
COPY --from=build /workspace/apps/user/dist web
# Set by the image workflow: the release version ("1.2.3", or "edge" for
# main) and the commit, shown in the admin console next to the update check.
ARG APP_VERSION=""
ARG APP_COMMIT=""
ENV APP_VERSION=${APP_VERSION} APP_COMMIT=${APP_COMMIT}
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001 APP_DATA_DIR=/data APP_WEB_DIR=/app/web
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
