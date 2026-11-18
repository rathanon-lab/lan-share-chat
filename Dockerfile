# Multi-Stage Production Image for LAN Share Chat v3.0 (Node.js 24 LTS)
FROM node:24-bookworm-slim AS deps

WORKDIR /app

# Build toolchain kept in deps stage only so sqlite3 compiles cleanly against Debian Bookworm GLIBC
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN mkdir -p public \
  && npm_config_build_from_source=true npm ci \
  && node -e "require('sqlite3')"

FROM node:24-bookworm-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build production Next.js bundle, copy PDF.js worker, and prune devDependencies without re-running install scripts
RUN node -e "try{require('fs').copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/pdf.worker.min.mjs')}catch{}" \
  && NODE_ENV=production npm run build \
  && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runner

WORKDIR /app

# Runtime dependencies only (ca-certificates + ffmpeg for optional H.265/HEVC compatibility preview caching)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN node -e "require('sqlite3')" \
  && mkdir -p /app/storage/db /app/storage/uploads /app/storage/video-cache /app/storage/certs /app/storage/avatars /app/storage/stickers /app/storage/chunks /app/storage/sticker-staging \
  && chmod -R 775 /app/storage

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000
VOLUME ["/app/storage/db", "/app/storage/uploads", "/app/storage/stickers", "/app/storage/avatars", "/app/storage/video-cache", "/app/storage/chunks"]

CMD ["npm", "run", "start"]
