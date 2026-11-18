# Architecture & Security Model

Technical breakdown of **LAN Share Chat v3.0** modular internals and cross-repository integration.

---

## 1. Modular Custom Server + Next.js Feature Architecture

A single Node.js entrypoint (`server.ts`) mounts Next.js 16.2 App Router alongside modular server routers (`server/routes/`), security guards (`server/security.ts`), and Socket.IO handlers (`server/socket/`):

```text
lan-share-chat/
├── server.ts                               # Node HTTP (+ optional HTTPS) + Next.js + Socket.IO bootstrapper
├── server/
│   ├── config.ts                           # .env limits (1024 MB default), storage paths & Multer instances
│   ├── security.ts                         # Chat/Sticker/Collage/P2P flood guards, Ban/Mute & 429 rate limits
│   ├── state.ts                            # Connected peers map, single-session admin token & IP normalization
│   ├── routes/
│   │   ├── adminRoutes.ts                  # /api/admin/* settings, overview, backup, reset & password-gated log clear
│   │   ├── adminModerationRoutes.ts        # /api/admin/device/* mute/ban/IP-ban/rename & alert resolution
│   │   ├── adminStickersRoutes.ts          # /api/admin/stickers/* import, batch visibility/delete & image replace
│   │   ├── mediaRoutes.ts                  # AES-256-GCM Vault, HTTP 206 streaming & 2 MB chunked upload assembly
│   │   ├── mediaZipRoutes.ts               # Streaming multi-file ZIP archive tickets & downloads
│   │   └── userRoutes.ts                   # /api/config, /api/stickers, /api/profile/avatar, /api/messages/*
│   ├── socket/
│   │   └── registerHandlers.ts             # Session policy, capacity guard, chat, collages, read receipts & WebRTC
│   └── utils/
│       ├── ffmpegCompat.ts                 # Read-only .env/FFmpeg probe & lazy H.265 -> H.264 preview cache
│       ├── storageRuntime.ts               # Docker vs Standalone detection, 6-zone probe, ENOSPC disk guard & EXDEV move
│       └── zipStream.ts                    # On-the-fly ZIP stream builder
├── tools/
│   └── loadgen-docker/                     # Companion Docker Load Generator & Stress-Test Studio (port 3099)
├── public/
│   ├── avatars/                            # 20 animal WebPs + admin-special.webp
│   ├── emoji/twemoji/                      # Self-hosted Twemoji SVG glyphs (CC-BY 4.0)
│   └── stickers/starter-office-animals/    # 16 built-in Thai animal stickers + manifest.json
└── src/
    ├── types/chat.ts                       # Shared domain TypeScript interfaces (9 AdminTab types, Collage layers)
    ├── app/
    │   ├── layout.tsx & globals.css        # viewportFit: 'cover', .ultrawide-shell / .ultrawide-card rules
    │   ├── page.tsx                        # Workspace orchestrator (/) + Dark Mode & Ban/Session overlays
    │   └── admin/page.tsx                  # 9-Tab Admin Console orchestrator (/admin)
    ├── features/
    │   ├── chat/                           # ChatSidebar, ChatMessageList, ChatComposer, AlbumGalleryModal, CustomVideoPlayer
    │   ├── stickers/                       # EmojiStickerPicker, DockedStickerPreviewTray, StickerPreviewModals, StickerVisual
    │   ├── p2p/                            # useWebRTCTransfer hook, P2PSendModal, P2PReceiveModal
    │   └── admin/                          # LoginScreen, AdminOverviewTab, AdminChatTab, StickerManagerTab, StickerItemEditModal, AdminEnvTab, AdminSettingsTab
    ├── components/                         # ZoomableMediaStage, UserAvatar, ProfileModal, AvatarCropModal
    └── lib/                                # db/* (modular SQLite repos), crypto.ts, storagePaths.ts, stickerStore.ts, stickerMeta.ts, secureMedia.tsx, filePreviewer.tsx
```

---

## 2. Cross-Repository Integration with `Server-Lab-A2`

`LAN Share Chat v3.0` is architected to decouple application logic from edge network infrastructure:
- **[`Server-Lab-A2`](../../Server-Lab-A2)** is a standalone Infrastructure-as-Code (IaC) repository (Technitium DNS Server, Nginx Proxy Manager, MariaDB, Uptime Kuma, Dozzle, and Internal Root CA scripts) that does **not** bundle or build `lan-share-chat` source code.
- Over the LAN (`192.168.1.0/24`), **Technitium DNS** resolves `chat.lab.lan` (and optional `bot.lab.lan`) to the `Server-Lab-A2` host (`192.168.1.5`).
- **Nginx Proxy Manager** terminates `365`-day wildcard HTTPS (`*.lab.lan`), enables WebSocket upgrades (`Upgrade: websocket`) for Socket.IO, applies a built-in `client_max_body_size 2000m` (`2 GB`) ceiling that accommodates `lan-share-chat`'s `1 GB` (`1024 MB`) chunked uploads (`2 MB` per chunk), and forwards requests to `http://host.docker.internal:3000` (or `http://<LAN_IP>:3000`).
- The optional companion stress-test container (`tools/loadgen-docker`, container `lan-chat-loadgen:3099`) attaches to both `lan-share-chat_default` and `lab_a2_backend_net` as external Docker networks.

---

## 3. Single Source of Truth Configuration (`GET /api/config`)

Upload caps, sticker bounds, and governance settings are driven from `.env` + SQLite and fetched via `GET /api/config`:
- `maxChatFileSizeMb` (default `1024`) / `maxChatFileBytes` (`1,073,741,824` bytes)
- `maxP2pFileSizeMb` (default `1024`) / `maxP2pFileBytes`
- `maxChatFilesBatch` (`10` files per message; files `> 2 MB` or multi-file batches upload via `2 MB` binary chunks to `POST /api/upload/chunk` + `POST /api/upload/chunk-complete`)
- `minStickersPerPack` (`1`), `recommendedStickersPerPack` (`16`), `maxStickersPerPack` (`40`)
- `videoTranscodeAvailable` (boolean probed from FFmpeg)
- `settings` (including `stickerPreviewMode`, `stickerCollageEnabled`, `sessionPolicy`, `maxConcurrentUsers`, `chatLocked`, `chatBlurred`, `adminHoldActive`, and anti-spam thresholds)

---

## 4. AES-256-GCM Encrypted Media Vault & FFmpeg Compatibility Cache

Raw files in `storage/uploads/` are isolated outside Next.js `public/` static directories. Direct HTTP requests to `/uploads/*` are blocked with **`HTTP 403`**.

1. **Opaque AES-256-GCM Tokens (`src/lib/crypto.ts`):** Derived via `crypto.scryptSync(secret, 'lan-share-salt-v2', 32)` and formatted as `base64url(iv [12B] + authTag [16B] + ciphertext)`.
2. **Images, Documents & Archives:** Client sends `POST /api/media/fetch` with `mediaToken`. Server authenticates the GCM tag, verifies path containment inside `uploadsDir`, and streams the decrypted file reference.
3. **HTML5 Video & Audio (`HTTP 206` Byte-Range + Lazy H.264 Transcode):** `<SecureVideo>` and `<SecureAudio>` obtain a 15-minute ticket via `POST /api/media/stream-ticket` and stream from `GET /api/media/stream?t=...` with `Range: bytes=...` (`HTTP 206 Partial Content`). When `compat=1` is requested for an `H.265/HEVC` video and FFmpeg is available, `server/utils/ffmpegCompat.ts` lazily transcodes an `H.264 + AAC` preview copy into `storage/video-cache/` without altering the original file in `storage/uploads/`.

---

## 5. Admin Privilege Boundaries, Session Governance & Anti-Spam

- **Single-Session Admin Token & HTTP `429` Brute-Force Protection:** `/api/admin/login` rate-limits failed attempts per IP (`HTTP 429` after 10 attempts in 5 minutes) and issues a dynamic `adm_sess_*` session token (`server/state.ts`). Logging in from a new browser tab revokes the prior token and emits `admin_session_kicked`. Clearing Activity Logs (`POST /api/admin/logs/clear`) requires re-entering `ADMIN_PASSWORD`.
- **Session Conflict Policy & Room Capacity (`server/socket/registerHandlers.ts`):**
  - Enforces `maxConcurrentUsers` (`0` = unlimited, default `100`) on non-Admin Socket.IO connections.
  - Enforces `sessionPolicy` (`takeover` kicks older tabs on the same IP+OS via `session_conflict`; `block` rejects duplicate tabs; `multi_allow` permits concurrent tabs for testing/development).
- **Anti-Spam, Sticker/Collage Flood & Zero-Content P2P Privacy (`server/security.ts`):**
  - `enforceChatGuard` tracks sliding-window message bursts and consecutive duplicate keys (`buildStickerDedupeKey` in `src/lib/stickerMeta.ts` hashes both single stickers and multi-layer collages).
  - `enforceP2pGuard` counts only `offer` / `relay_header` events per 15-second window while enforcing a `256 KB` ceiling on `relay_chunk` payloads and logging **zero** P2P filenames or contents.
- **XSS & Magic-Byte Upload Validation:** Active web markup (`.html`, `.svg`) is never rendered executable in previews, and `src/lib/stickerStore.ts` validates binary magic headers (`RIFF..WEBP`, `PNG`, `GIF87a/89a`, `FF D8 FF`) + sanitizes collage layer coordinates (`src/lib/stickerMeta.ts`).

---

## 6. Complete SQLite3 Schema (`src/lib/db/client.ts` — 13 Tables)

Database file: `storage/db/database.sqlite` (with automatic non-destructive column migrations via `migrateColumn`):

| # | Table Name | Primary Key | Purpose & Key Columns |
| :--- | :--- | :--- | :--- |
| 1 | `messages` | `id` | Chat messages (`sender`, `senderDeviceId`, `text`, `type`, `attachments`, `stickerMeta` JSON with optional `layers`, `isRead`, `readAt`, `isDeleted`, `isAdmin`) |
| 2 | `message_edits` | `id` | Full revision history (`messageId`, `previousText`, `newText`, `editedByDeviceId`, `editedAt`) |
| 3 | `sticker_packs` | `packId` | Built-in (`starter-office-animals`) & uploaded sticker packs (`name`, `source`, `enabled`, `sortOrder`) |
| 4 | `stickers` | `id` | Individual sticker items (`packId`, `stickerId`, `fileName`, `url`, `alt`, `keywords`, `sortOrder`) |
| 5 | `admin_alerts` | `id` | `@admin` mentions, post-window `delete_request`, and `security_spam` alerts (`status`, `resolvedAt`) |
| 6 | `system_settings` | `key` | Persistent governance & UI settings (`stickerPreviewMode`, `stickerCollageEnabled`, `sessionPolicy`, `maxConcurrentUsers`, etc.) |
| 7 | `devices` | `deviceId` | Device inventory (`name`, `avatarUrl`, `os`, `browser`, `lastIp`, `lastSeenAt`, `mutedUntil`, `isBanned`, `banReason`) |
| 8 | `deleted_devices` | `deviceId` | Tracks Admin-deleted devices (`deletedAt`) so old messages display `ถูกลบออกจากระบบ` |
| 9 | `banned_ips` | `ip` | Network-level IP bans (`reason`, `bannedAt`) |
| 10 | `daily_telemetry` | `dayKey` | Anonymous daily peak concurrency & counters (`peakOnline`, `peakHour`, `messageCount`, `uploadCount`, `spamBlockedCount`, `p2pBlockedCount`) |
| 11 | `hourly_telemetry` | `(dayKey, hour)` | Anonymous 24-hour concurrency & message distribution (`peakOnline`, `messageCount`) |
| 12 | `uploaded_files` | `id` | Encrypted media vault index (`sender`, `deviceId`, `senderIp`, `originalName`, `storedName`, `mimeType`, `fileSize`, `uploadedAt`) |
| 13 | `activity_log` | `id` | 90-day security & administrative audit trail (`action`, `actor`, `actorIp`, `details`, `timestamp`) |

---

## 7. Companion Load Generator (`tools/loadgen-docker/`)

For stress-testing concurrency, chunked uploads, and anti-spam thresholds on the LAN, `tools/loadgen-docker/` provides a standalone Dockerized load-testing controller (`lan-chat-loadgen` on port `3099`):
- Supports a real media sample pool up to **`500` files** (`MAX_SAMPLE_FILES = 500`) with live `fs.statfsSync` container disk-space checks (`MIN_DISK_SAFETY_MB = 150`), unconstrained individual file upload sizes, and unconstrained batch probing (`filesPerBatch = 0`).
- Streams live CPU and memory metrics of the `lan-share-chat` container via `/var/run/docker.sock:ro`.
