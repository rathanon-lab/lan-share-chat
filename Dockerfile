# Cross-Platform Production Image for LAN Share Chat v2 (Linux/Windows Docker)
FROM node:24-bookworm-slim AS app

WORKDIR /app

# Build dependencies required for native SQLite3 compilation if prebuilt binary unavailable
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN mkdir -p public && npm ci && npm rebuild sqlite3 --build-from-source && node -e "require('sqlite3')"

# Remove build-only compiler packages, then install ffmpeg cleanly so npm/sqlite3 cache stays intact
RUN apt-get purge -y --auto-remove python3 make g++ \
  && apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY . .

# Ensure PDF.js worker is present in public/ and build production Next.js bundle
RUN node -e "try{require('fs').copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/pdf.worker.min.mjs')}catch{}" \
  && NODE_ENV=production npm run build

RUN mkdir -p /app/storage/db /app/storage/uploads /app/storage/video-cache /app/storage/certs /app/storage/avatars /app/storage/stickers /app/storage/chunks /app/storage/sticker-staging

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000
VOLUME ["/app/storage"]

CMD ["npm", "run", "start"]
