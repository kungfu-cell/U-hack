FROM node:24-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
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
RUN pnpm build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

