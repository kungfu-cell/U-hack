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
ARG VITE_API_URL=/api
ARG VITE_STUN_URL=stun:stun.l.google.com:19302
ARG VITE_TURN_URL=
ARG VITE_TURN_USERNAME=
ARG VITE_TURN_CREDENTIAL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_STUN_URL=$VITE_STUN_URL
ENV VITE_TURN_URL=$VITE_TURN_URL
ENV VITE_TURN_USERNAME=$VITE_TURN_USERNAME
ENV VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL
RUN --mount=type=cache,id=scamtrap-corepack,target=/root/.cache/node/corepack,sharing=locked \
  pnpm build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

