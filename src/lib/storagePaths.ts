import fs from 'fs';
import path from 'path';

function resolveZoneDir(overrideEnvKey: string, subDir: string): string {
  const override = process.env[overrideEnvKey]?.trim();
  if (override) return path.resolve(override);
  const rootOverride = process.env.STORAGE_ROOT?.trim();
  if (rootOverride) return path.resolve(rootOverride, subDir);
  return path.resolve(process.cwd(), 'storage', subDir);
}

export const dbDir = resolveZoneDir('STORAGE_DB_DIR', 'db');
export const uploadsDir = resolveZoneDir('STORAGE_UPLOADS_DIR', 'uploads');
export const stickersStorageDir = resolveZoneDir('STORAGE_STICKERS_DIR', 'stickers');
export const avatarsDir = resolveZoneDir('STORAGE_AVATARS_DIR', 'avatars');
export const videoCacheDir = resolveZoneDir('STORAGE_CACHE_DIR', 'video-cache');
export const chunkStagingDir = resolveZoneDir('STORAGE_CHUNKS_DIR', 'chunks');
export const stickerStagingDir = resolveZoneDir('STORAGE_STAGING_DIR', 'sticker-staging');
export const legacyUploadsDir = path.resolve(process.cwd(), 'uploads');

export function ensureStorageZoneDirs(): void {
  for (const dir of [
    dbDir,
    uploadsDir,
    stickersStorageDir,
    avatarsDir,
    videoCacheDir,
    chunkStagingDir,
    stickerStagingDir,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
