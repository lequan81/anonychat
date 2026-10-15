# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/anonychat-fe

COPY anonychat-fe/package.json anonychat-fe/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY anonychat-fe/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server-deps
WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --non-interactive --production=true --cache-folder /usr/local/share/.cache/yarn

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=server-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src/ ./src/
COPY --from=frontend-build --chown=node:node /build/public ./public

RUN mkdir -p /app/logs && chown node:node /app/logs

USER node
EXPOSE 3000
VOLUME ["/app/logs"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/index.js"]
