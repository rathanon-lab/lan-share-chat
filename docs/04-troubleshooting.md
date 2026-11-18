# Troubleshooting & Cross-Device Notes

Real-world diagnostics collected during testing of **LAN Share Chat v3.1.0** across **Windows (16:9 & Ultrawide)**, **iPadOS Safari**, **iOS Safari**, and **Android Chrome**.

---

## 7. Cross-Platform Filename Length & Mobile Back-Button Traps (`v3.1.0`)
- **Long / Unsafe Filenames (`> 112` chars, `:`, trailing `.`, or Windows reserved `CON`/`NUL`):** Enforced automatically before upload (`fileNameGuard.ts`) and on P2P signaling (`INVALID_FILENAME`) so downloads never fail on Windows NTFS or mobile filesystems. Users are guided to use concise filenames and include detailed context in the chat message caption.
- **Mobile Back-Button Loops:** Switching from `/admin` back to `/` replaces history (`<Link href="/" replace>`), overlays unwind one layer per gesture via `useModalHistoryStack`, and the root screen emits a non-bouncing top-level toast instead of redirecting back into `/admin`.

---

## 1. Large File Uploads Fail Behind a Custom Reverse Proxy (`HTTP 413`)
- **Symptom:** App settings show `1024 MB` (`1 GB`), upload starts, then fails with `413 Request Entity Too Large`.
- **Cause:** Standard standalone Nginx defaults `client_max_body_size` to `1m` (`1 MB`), whereas `lan-share-chat` uploads large files in **`2 MB` binary chunks** (`POST /api/upload/chunk`) and supports single-request uploads up to `2 MB` (and `100 MB` `.zip` sticker packs in `/admin`).
- **Fix:** If using **`Server-Lab-A2`** (Nginx Proxy Manager), `client_max_body_size 2000m` (`2 GB`) is already configured by default. If using a custom standalone Nginx/Caddy proxy, set `client_max_body_size 2000m;` (or `0` inside a trusted LAN) and reload the proxy.

---

## 2. Voice Microphone or Webcam Button Is Disabled
- **Symptom:** Mic icon appears faded with a tooltip explaining the plain HTTP restriction.
- **Cause:** Browser security policies restrict `navigator.mediaDevices.getUserMedia` to HTTPS Secure Contexts (`https://...` or `http://localhost`).
- **Fix:** Access the workspace via `https://chat.lab.lan` behind **`Server-Lab-A2`** (Nginx Proxy Manager with the `lab-root-ca.crt` Root CA trusted on your client device), or set `ENABLE_LOCAL_HTTPS=1` in `.env` when testing standalone without a reverse proxy.

---

## 3. H.265 / HEVC Video Plays Audio Only on Certain Browsers
- **Symptom:** An uploaded `.mov` or `.mp4` recorded in `H.265/HEVC` plays audio without video frames on browsers lacking native HEVC hardware decoding.
- **Cause:** FFmpeg is not installed on the standalone host (`videoTranscodeAvailable: false`).
- **Fix:**
  - When deployed via Docker (`Dockerfile`), `ffmpeg` is pre-installed and automatically transcodes a cached `H.264 + AAC` preview in `storage/video-cache/` on demand while preserving the original file untouched.
  - On standalone Windows/macOS/Linux, install `ffmpeg` on system `PATH` or set `FFMPEG_PATH=...` in `.env`, restart the server, and check `/admin` → **`.env / ระบบ`** to confirm `FFMPEG_PATH` shows `OK`.

---

## 4. iOS / iPadOS Safari Preloads Full HD Videos Slowly When Selecting Multiple Clips
- **Behavior:** Selecting large `.mov` / HEVC videos from Apple Photos shows Safari's native "Preparing..." sheet before passing the `File` objects to the browser.
- **Cause:** iOS/iPadOS fetches or prepares assets from local storage before firing `<input type="file">`'s `change` event. Wait until Safari finishes preparing; once staged in the composer tray, `2 MB` chunked uploads proceed smoothly with a live progress bar.

---

## 5. Pasting Screenshots on Android Gboard / Tablet Keyboard
- **Note:** Plain `<textarea>` fields on many Android keyboards strip clipboard image insertion. `lan-share-chat` uses `contentEditable="plaintext-only"` paired with `onPaste` image file extraction so screenshots copied to Android Gboard or Windows (`Win + V` / `Ctrl + V`) attach straight into the staging tray.

---

## 6. `sqlite3` Native Binary Error on Linux Docker
- **Symptom:** Container fails at startup with `invalid ELF header` or missing `node_sqlite3.node`.
- **Cause:** Host `node_modules/` was copied into the build context instead of compiling inside the Linux container.
- **Fix:** Confirm `.dockerignore` excludes `node_modules/`, `.next/`, and `storage/`, then rebuild cleanly with `docker compose up -d --build`.

---

## 7. Switching Between Full-Screen Sticker Preview and Docked Tray / Collage Mode
- **Note:** By default (or after a Factory Reset), `stickerPreviewMode` is set to **Mode 1 (`fullscreen_modal` — `แบบ 1: เต็มจอซูมได้`)**. To enable the non-blocking **Docked Overlay Tray above the input bar + Interactive Sticker Collage Studio (`แบบ 2: แถบเหนือช่องพิมพ์ + ผสม`)**, open `/admin` → **`ตั้งค่า` (Settings)** → select **`แบบ 2: แถบเหนือช่องพิมพ์ + ผสม`**. All connected browsers switch modes immediately via Socket.IO without reloading.
