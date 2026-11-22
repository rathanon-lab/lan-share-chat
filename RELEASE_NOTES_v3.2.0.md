# LAN Share Chat v3.2.0 — Release Notes

**Release Theme:** High-Concurrency Resilience, Dual-SQLite Bulkhead, Dynamic Media Queue, iPad/Mobile Memory Guard & macOS Gallery-Style Admin Preview

---

## Highlights & Engineering Upgrades

### 1. Dual-SQLite Bulkhead & In-Memory Control Plane Gate (`0.1ms`)
- Split persistent storage into two isolated WAL-mode SQLite databases with transparent query routing (`src/lib/db/client.ts`):
  - **Data Plane (`database.sqlite`):** `messages`, `message_edits`, `uploaded_files`, `admin_alerts`, `activity_log`, `daily_telemetry`, `hourly_telemetry`.
  - **Control Plane (`control_plane.sqlite`):** `system_settings`, `devices`, `deleted_devices`, `banned_ips`, `sticker_packs`, `stickers`.
- Automatic one-time zero-downtime migration from existing single-file v3.1 databases on startup (`migrated_from_legacy_v32`).
- Synchronous in-memory control gate (`patchFastControlGate` / `getCachedSystemSettings`) in `server/security.ts` ensures emergency controls (**Spotlight**, **Lock Public Chat**, **Privacy Blur**) take effect immediately even during heavy message/upload floods.

### 2. Dynamic Adaptive Media Worker Queue (`MEDIA_WORKER_CONCURRENCY=auto`)
- Replaced static FFmpeg worker caps with an adaptive cgroup v2/v1 + host CPU & RAM scheduler (`server/utils/mediaWorkerQueue.ts`).
- Automatically scales concurrent media/thumbnail/transcode tasks based on container resources (reserving CPU headroom and ~1.5 GB RAM/job), applies adaptive backpressure when free memory drops below `15%`, and supports explicit override via `.env` (`MEDIA_WORKER_CONCURRENCY`).
- Exposed live status for both `DUAL_SQLITE_BULKHEAD` and `MEDIA_WORKER_CONCURRENCY` in `/admin` → **`.env / ระบบ`**.

### 3. Unified Lossy WebP Poster, Bidirectional Viewport Gate & Auto-Dynamic LRU Cache
- Added server-side Lossy WebP static first-frame poster generation (`?poster=1` on `/api/stickers/asset/:packId/:fileName`, `<= 200px`, quality `75`).
- Upgraded `SecureImage`, `SecureVideo` (poster mode), `StickerVisual`, and `EmojiStickerPicker` with bidirectional `IntersectionObserver` viewport gating using persistent real-box wrappers (zero `display: contents` flicker, zero layout shift via height preservation).
- Added Auto-Dynamic Browser LRU Blob/Thumbnail Cache (`src/lib/secureMedia.tsx`) that automatically scales in-memory caps from `navigator.deviceMemory`, `hardwareConcurrency`, and iOS/iPadOS detection with `URL.revokeObjectURL()` eviction.

### 4. Admin-Configurable `.gif` Sticker Picker Mode (`stickerPickerGifMode`)
- Added toggle in `/admin` → **`ตั้งค่า`**:
  - **`live_viewport` (Default):** Animates `.gif` stickers only while visible inside the picker viewport and unmounts off-screen rows automatically.
  - **`static_poster`:** Renders compact Lossy WebP first-frame posters in the picker grid and plays live animation on hover/preview/chat.

### 5. Expanded Responsive Sticker Collage Stage
- Expanded the interactive collage canvas in `DockedStickerPreviewTray.tsx` (`max-w-[min(94%,640px)]`, `h-[248px] sm:h-[300px]`) to fill the docked dark preview tray cleanly while preserving exact layer percentage coordinates.

### 6. Auto Reverse Infinite Scroll, Discord-Style Unread Divider & Admin Flood Protection
- Replaced full-history dumps on socket connect and Admin Chat with cursor-paginated endpoints (`GET /api/messages/page`, `GET /api/admin/messages?limit=60&beforeId=...&search=...`).
- Built shared `useChatScrollPagination.ts` hook for both Main Chat (`/`) and Admin Chat (`/admin`):
  - **Auto Reverse Infinite Scroll** at the top edge with exact scroll-position anchoring (no manual "Load older" button).
  - **Non-intrusive live updates:** Never yanks scroll down when reading older history; persists `lastReadMessageId` in `localStorage` and displays a red **"ข้อความใหม่ตั้งแต่ตรงนี้"** divider + floating **`↓ ข้อความใหม่ N รายการ · ไปล่าสุด`** Jump-to-Present pill.
- Added **`300ms` coalesced Socket.IO batching** in `useAdminDashboard.ts` and one-click **`ปิดงานค้างทั้งหมด` (`POST /api/admin/alerts/resolve-all`)** in `AdminAlertsTab.tsx`.

### 7. macOS Finder Gallery-Style File Preview Modal
- Upgraded `UniversalFilePreviewModal` (`src/lib/filePreviewer.tsx`) with new `PreviewFilmstripBar.tsx`:
  - Floating **`<` / `>`** navigation arrows + keyboard **`←` / `→` / `Esc`** shortcuts.
  - **Collapsible bottom thumbnail filmstrip** with Up/Down toggle button (`พับแถบฟิล์ม` / `แสดงแถบฟิล์ม`) showing image/video thumbnails and file-type badges.
  - Wired into both **Admin Files (`ไฟล์อัปโหลด`)** and **Admin Chat (`ห้องแชท`)**.

### 8. Synchronous Atomic Anti-Spam / Anti-Bot Firewall & Server-Side `HTTP 423` Locks
- Refactored `server/security.ts` with a synchronous in-memory `fastMutedDevices` gate (`0.05ms`) evaluated **before** any SQLite `await`, eliminating concurrent race conditions and duplicate alert storms.
- Added **Bot Cadence Detection** (`>= 6` actions in `< 800ms`) and **Upload File-Count Burst Guard** (`uploadFileCount` weighted tracking so video/file-only floods with `Text = 0` are blocked automatically).
- Enforced server-side `HTTP 423 Locked` across `POST /api/upload`, `POST /api/upload/chunk`, `POST /api/upload/complete`, `PUT/DELETE /api/messages/:id`, and Socket.IO `send_message` whenever `chatLocked` or `chatBlurred` is active.

### 9. Surgical Admin Chat Cleanup (Time-Range, User-Group & Smart Bot/Spam Purge)
- Added `src/lib/db/moderationPurgeRepo.ts` and `src/features/admin/components/AdminChatPurgeModal.tsx` with three targeted cleanup tools directly in the Admin Chat toolbar:
  - **Time-Range Purge (`POST /api/admin/messages/purge-range`):** Quick presets (`15m`, `1h`, `Today`) or custom `Start -> End` DateTime range with live dry-run preview count and optional Admin message protection.
  - **User / Group Purge (`GET /api/admin/messages/senders`):** Searchable multi-select sender list (with optional time window) to delete specific troublemakers without touching other users.
  - **Smart Bot / Spam Auto-Purge (`GET /api/admin/messages/bot-suspects`, `POST /api/admin/messages/purge-bots`):** Combines `security_spam` alerts, mute/ban status, and sliding-window burst heuristics (`>= 8 msgs/5s` or `>= 25 msgs/60s`) to wipe ONLY bot/spam messages while preserving 100% of normal human conversation (with optional batch ban).

---

## Verified Benchmarks, Chaos & Multi-Viewport E2E Results (Production Docker on Photon OS)

### Live Stress, Chaos (Firewall OFF) & 100-User Atomic Firewall Tests

| Scenario | Before (v3.1) | After (v3.2.0) |
| :--- | :---: | :---: |
| **Case 1 (Firewall OFF, 32 Bots + MainPC Flood): Admin Chat / Lock Latency** | Stuck on Loading | **77.1 ms** Chat / **121.0 ms** Lock |
| **Case 1 (Direct API Bypass while Locked: `/api/upload`, `/api/upload/chunk`, `PUT /api/messages`)** | Chunk missed Blur | **100% Blocked `HTTP 423 Locked` (`25–31 ms`)** |
| **Case 2 (Video/File-Only Flood, `Text = 0`)** | Not blocked | **Blocked at Req #6 (`HTTP 403`)** |
| **Case 2 (100 Virtual Bots × 3,800+ Attempted Messages, Firewall ON)** | Thousands leaked + 360+ dup alerts | **100/100 Blocked in `2.12s` · Peak RAM `315 MB` (vs `3,636 MB`) · Only `149` saved · `0` dup alerts** |
| **Case 3 (Smart Bot Purge after 100-Bot Flood)** | Manual / Reset All | **Scanned in `19.5 ms` · Deleted `147/147` bot msgs · `2/2` normal human msgs preserved** |

### Headless Chromium Playwright Multi-Viewport E2E Verification (`0` Page Errors, `0` Image Flicker)
- `[PASS]` Main Chat (`/`) load + Zero Image Flicker (`12×100ms` probe: `drops = 0`) + Auto Reverse Infinite Scroll (`80 -> 140`) + Jump-to-Latest
- `[PASS]` Admin Chat pagination (`60` rows) + Zero Image Flicker (`drops = 0`) + Emergency Lock (`68 ms`) + Time-Range / User-Group / Smart Bot Purge Modals
- `[PASS]` Admin Files Grid (`24` cards) + Zero Image Flicker (`drops = 0`) + macOS Finder Gallery (`< / >`, `ArrowLeft`, collapsible bottom filmstrip, `Esc`)
- `[PASS]` Admin `.env / ระบบ` (`DUAL_SQLITE_BULKHEAD` & `MEDIA_WORKER_CONCURRENCY`) & Settings (`stickerPickerGifMode`)
- `[PASS]` Multi-Viewport Layout Verification: **Desktop (`1440×900`)**, **iPad (`1024×768`)**, and **Mobile (`390×844`)** — `0` horizontal overflow, `0` console/page errors

---

## Upgrade & Migration Notes

- **Zero breaking changes:** Existing v3.1 Docker volumes (`lan_chat_db`, `lan_chat_uploads`, `lan_chat_stickers`, `lan_chat_avatars`, `lan_chat_cache`, `lan_chat_chunks`) upgrade automatically on first boot.
- **Optional `.env` variable:** `MEDIA_WORKER_CONCURRENCY=auto` (default `auto`; set an integer `1..16` to pin manually).
- **Docker rebuild:**
  ```bash
  docker compose up -d --build
  ```
