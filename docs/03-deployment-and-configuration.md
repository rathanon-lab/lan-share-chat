# Deployment & Configuration Guide

Standalone and Reverse-Proxy setup instructions for **LAN Share Chat v3.1.0** using **Docker Compose**, **Node.js 24 LTS**, and **`Server-Lab-A2`**.

---

## 1. Environment Variables Reference (`.env`)

Copy `.env.example` to `.env` before running:

```env
# Runtime & Timezone
NODE_ENV=production
PORT=3000
TZ=Asia/Bangkok

# Reverse Proxy / Domain Integration (Recommended with Server-Lab-A2 Nginx Proxy Manager + Technitium DNS)
PUBLIC_HOST=chat.lab.lan
PUBLIC_HTTPS_URL=https://chat.lab.lan

# Optional Legacy Standalone Self-Signed HTTPS (default: disabled; let Reverse Proxy handle TLS)
# ENABLE_LOCAL_HTTPS=1
# HTTPS_PORT=3443

# Security (REQUIRED — replace both in production!)
ADMIN_PASSWORD=change_me_strong_admin_password
# Generate 64-char hex: openssl rand -hex 32
MEDIA_SECRET=replace_with_random_64_char_hex_secret

# Upload Caps, Disk Protection & Per-Zone Storage Quotas — Single Source of Truth
MAX_CHAT_FILE_SIZE_MB=1024
MAX_P2P_FILE_SIZE_MB=1024
MAX_CHAT_FILES_BATCH=10
MIN_DISK_FREE_MB=512
STORAGE_MAX_TOTAL_GB=30
STORAGE_MAX_UPLOADS_GB=20
STORAGE_MAX_STICKERS_MB=1024
STORAGE_MAX_CACHE_MB=4096
STORAGE_MAX_CHUNKS_MB=2048
STORAGE_MAX_AVATARS_MB=512
STORAGE_WARN_DB_MB=512

# Optional Standalone Storage Root (Windows/Linux without Docker)
# STORAGE_ROOT=D:\LanShareStorage

# Optional Docker Virtual Volume Overrides (default: named volumes lan_chat_*)
# STORAGE_DB_VOL=./storage/db
# STORAGE_UPLOADS_VOL=./storage/uploads
# STORAGE_STICKERS_VOL=./storage/stickers
# STORAGE_AVATARS_VOL=./storage/avatars
# STORAGE_CACHE_VOL=./storage/video-cache
# STORAGE_CHUNKS_VOL=./storage/chunks

# Allowed Dev Origins (Next.js dev mode only; comma-separated)
ALLOWED_DEV_ORIGINS=localhost,127.0.0.1

# Optional path to FFmpeg binary (used for browser-compatible H.264 preview of HEVC/H.265 videos).
# On Linux/Docker this is resolved automatically from system PATH.
# FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
```

---

## 2. Running with Docker Compose (Recommended)

`Dockerfile` uses a multi-stage `node:24-bookworm-slim` (Node.js 24 LTS) build, keeps compiled `sqlite3` bindings cleanly, strips dev/compiler toolchains in the final runner image, installs `ffmpeg` for H.265/HEVC video compatibility, bundles `pdf.worker.min.mjs`, and runs `tsx server.ts --prod`.

```bash
cp .env.example .env
docker compose up -d --build
```

### Segregated Docker Virtual Volume Layout (`6` Isolated Zones)
`docker-compose.yml` isolates storage into **6 dedicated Docker Virtual Volumes** by default (`lan_chat_db`, `lan_chat_uploads`, `lan_chat_stickers`, `lan_chat_avatars`, `lan_chat_cache`, `lan_chat_chunks`) so heavyweight uploads or video transcodes cannot bloat or corrupt SQLite metadata — and any zone can be pointed to a local directory (`./storage/...`) or a second physical/virtual disk (`/mnt/disk2/...`) via `.env` (`STORAGE_*_VOL`):
- **`lan_chat_db` → `/app/storage/db/database.sqlite`** — All 13 SQLite tables (chat history, edits, sticker packs, devices, deleted devices, IP bans, telemetry, settings, and audit logs)
- **`lan_chat_uploads` → `/app/storage/uploads/`** — AES-256-GCM encrypted media vault files
- **`lan_chat_chunks` → `/app/storage/chunks/`** — Temporary `.part` staging files during `2 MB` chunked uploads (safely moved across volumes with automatic `EXDEV` fallback and auto-purged if older than 2 hours on boot)
- **`lan_chat_cache` → `/app/storage/video-cache/`** — Lazily transcoded `H.264 + AAC` compatibility previews for `H.265/HEVC` videos (can be purged on-demand from `/admin` → `.env / ระบบ`)
- **`lan_chat_avatars` → `/app/storage/avatars/`** — Custom user-cropped and admin-uploaded circular avatars
- **`lan_chat_stickers` → `/app/storage/stickers/`** — Admin-imported custom sticker packs (preserved across container rebuilds; wiped back to `starter-office-animals` only when Admin triggers Factory Reset or Reset Stickers)

In addition, **`MIN_DISK_FREE_MB` (default `512` MB)** enforces an automatic pre-upload safety guard (`HTTP 507`) across `uploads`, `db`, and `chunks`, preventing uploads from exhausting disk space and locking SQLite. (`/admin` → `.env / ระบบ` automatically displays whether the server is running as a **Docker Container** or **Standalone Windows/Linux** with per-zone free/used stats.)

---

## 3. Running Directly with Node.js (No Docker)

Prerequisites: **Node.js 24 LTS** (or 22 LTS+) and optional system **FFmpeg**.

```bash
npm install
cp .env.example .env
npm run build
npm run start
```

For local development with hot reload, run `npm run dev` (`http://localhost:3000`).

### Windows / Standalone Portable Mode (Strip Dev Tools After Build)
Once `npm run build` completes, run:

```bash
npm run clean:portable
```

This trims `devDependencies` (`npm prune --omit=dev --ignore-scripts`) and removes transient `.next/dev`, `.next/cache`, `node_modules/.cache`, `video-cache`, and `chunks` files while preserving your `.env` and persistent `storage/{db,uploads,stickers,avatars}` data. Run `npm install` before performing a future `npm run build`.

---

## 4. Integration with `Server-Lab-A2` Reverse Proxy & Split-Horizon DNS (`https://chat.lab.lan`)

Modern browsers restrict `navigator.mediaDevices.getUserMedia` (Microphone Voice MP3 recording and Webcam capture) and clipboard image permissions on non-localhost plain HTTP (`http://192.168.x.x:3000`).

In our portfolio architecture, **[`Server-Lab-A2`](../../Server-Lab-A2)** provides a standalone Infrastructure-as-Code stack (Technitium DNS + Nginx Proxy Manager + 365-day wildcard `*.lab.lan` TLS + Uptime Kuma + Dozzle) that integrates with `lan-share-chat` over the LAN without bundling application code into the infrastructure repo:

1. **Run `lan-share-chat` in pure HTTP mode** on port `3000` (`PORT=3000`, `PUBLIC_HOST=chat.lab.lan`, `PUBLIC_HTTPS_URL=https://chat.lab.lan`).
2. **Split-Horizon DNS (`Technitium DNS :5380`):** Create an `A` record for `chat.lab.lan` (or wildcard `*.lab.lan`) pointing to the `Server-Lab-A2` host IP (`192.168.1.5`).
3. **Reverse Proxy (`Nginx Proxy Manager :81`):**
   - **Domain Name:** `chat.lab.lan`
   - **Scheme / Forward Host / Port:** `http` → `host.docker.internal` (if co-hosted on `192.168.1.5`) or `<LAN_HOST_IP>` → `3000`
   - **Websockets Support:** **Enabled** (required for `Socket.IO` real-time chat, read receipts, and WebRTC signaling)
   - **SSL Certificate:** Select the `365`-day `*.lab.lan` certificate generated by `Server-Lab-A2/scripts/gen-internal-ca.sh` and enable **Force SSL**.
   - **Large Upload Compatibility (`1 GB` / `1024 MB`):** NPM's built-in `/etc/nginx/nginx.conf` already sets `client_max_body_size 2000m` (`2 GB`), and `lan-share-chat` splits uploads `> 2 MB` into `2 MB` binary chunks (`POST /api/upload/chunk`), preventing `HTTP 413` errors out of the box.
