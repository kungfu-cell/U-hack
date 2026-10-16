FROM node:24-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
ENV PNPM_CONFIG_FETCH_TIMEOUT=300000 COREPACK_HOME=/root/.cache/node/corepack
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY packages/analysis-core/package.json ./packages/analysis-core/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
RUN --mount=type=cache,id=scamtrap-corepack,target=/root/.cache/node/corepack,sharing=locked \
  --mount=type=cache,id=scamtrap-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=scamtrap-corepack,target=/root/.cache/node/corepack,sharing=locked \
  pnpm db:generate
RUN --mount=type=cache,id=scamtrap-corepack,target=/root/.cache/node/corepack,sharing=locked \
  pnpm build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/packages ./packages
EXPOSE 3001
CMD ["sh", "-c", "node packages/database/node_modules/prisma/build/index.js migrate deploy --schema packages/database/prisma/schema.prisma && node backend/dist/server.js"]

