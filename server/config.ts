import fs from 'fs';
import path from 'path';
import multer from 'multer';

if (process.argv.includes('--prod')) {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
}

// Load .env file cleanly once on boot
try {
  const envFile = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch {}

export const isDevMode = process.env.NODE_ENV !== 'production';
export const port = parseInt(process.env.PORT || '3000', 10);

export const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length > 0
    ? process.env.ADMIN_PASSWORD.trim()
    : isDevMode
      ? 'admin-dev-only'
      : '';

if (!process.env.ADMIN_PASSWORD && isDevMode) {
  console.warn('[Config] ADMIN_PASSWORD not set; using development-only fallback. Set ADMIN_PASSWORD in .env.');
}

// ─── Storage Directories ───────────────────────────────────────
export const uploadsDir = path.resolve(process.cwd(), 'storage', 'uploads');
export const videoCacheDir = path.resolve(process.cwd(), 'storage', 'video-cache');
export const chunkStagingDir = path.resolve(process.cwd(), 'storage', 'chunks');
export const avatarsDir = path.resolve(process.cwd(), 'storage', 'avatars');
export const stickersStorageDir = path.resolve(process.cwd(), 'storage', 'stickers');
export const stickerStagingDir = path.resolve(process.cwd(), 'storage', 'sticker-staging');
export const legacyUploadsDir = path.resolve(process.cwd(), 'uploads');

for (const dir of [uploadsDir, videoCacheDir, chunkStagingDir, avatarsDir, stickersStorageDir, stickerStagingDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Purge stale temporary chunks/staging files older than 2 hours on boot
for (const tmpDir of [chunkStagingDir, stickerStagingDir]) {
  try {
    const cutoffMs = Date.now() - 2 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(tmpDir)) {
      const full = path.join(tmpDir, entry);
      const st = fs.statSync(full);
      if (st.mtimeMs < cutoffMs) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
  } catch {}
}

// ─── Upload & Feature Limits (Single Source of Truth from .env) ─
export const MAX_CHAT_FILE_SIZE_MB = Math.max(1, parseInt(process.env.MAX_CHAT_FILE_SIZE_MB || '1024', 10) || 1024);
export const MAX_CHAT_FILE_BYTES = MAX_CHAT_FILE_SIZE_MB * 1024 * 1024;
export const MAX_P2P_FILE_SIZE_MB = Math.max(
  1,
  parseInt(process.env.MAX_P2P_FILE_SIZE_MB || String(MAX_CHAT_FILE_SIZE_MB), 10) || MAX_CHAT_FILE_SIZE_MB
);
export const MAX_CHAT_FILES_BATCH = 10;

// ─── Multer Uploaders ──────────────────────────────────────────
export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: {
    fileSize: MAX_CHAT_FILE_BYTES,
    files: MAX_CHAT_FILES_BATCH,
  },
});

export const stickerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, stickerStagingDir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: {
    fileSize: 105 * 1024 * 1024, // Supports up to 100MB ZIP or up to 48 sticker files
    files: 48,
  },
});
