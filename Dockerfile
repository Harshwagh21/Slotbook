# Multi-arch base image (works on Apple Silicon and x86_64).
FROM node:20-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.34.6

# Install dependencies first so this layer is cached between source changes.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000

# Runs migrations and the (idempotent) seed, then starts the app.
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
