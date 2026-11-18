import fs from 'fs';
import path from 'path';
import {
  avatarsDir,
  chunkStagingDir,
  dbDir,
  ensureStorageZoneDirs,
  stickerStagingDir,
  stickersStorageDir,
  uploadsDir,
  videoCacheDir,
} from '../../src/lib/storagePaths';
import {
  MIN_DISK_FREE_MB,
  STORAGE_MAX_AVATARS_MB,
  STORAGE_MAX_CACHE_MB,
  STORAGE_MAX_CHUNKS_MB,
  STORAGE_MAX_STICKERS_MB,
  STORAGE_MAX_TOTAL_GB,
  STORAGE_MAX_UPLOADS_GB,
  STORAGE_WARN_DB_MB,
} from '../config';
import type { RuntimeStorageSummary, StorageZoneStatus } from '../../src/types/chat';

export interface DiskGuardResult {
  ok: boolean;
  freeMb: number;
  minRequiredMb: number;
  error?: string;
}

export interface CachePurgeResult {
  deletedFiles: number;
  freedBytes: number;
  freedMb: number;
}

const ZONE_DEFS: ReadonlyArray<{ id: StorageZoneStatus['id']; label: string; dir: string }> = [
  { id: 'db', label: 'SQLite Database & Logs', dir: dbDir },
  { id: 'uploads', label: 'Chat Uploads', dir: uploadsDir },
  { id: 'stickers', label: 'Custom Stickers', dir: stickersStorageDir },
  { id: 'avatars', label: 'User Avatars', dir: avatarsDir },
  { id: 'cache', label: 'Video Compat Cache', dir: videoCacheDir },
  { id: 'chunks', label: 'Chunk Staging', dir: chunkStagingDir },
];

export function detectRuntimeEnvironment(): {
  executionMode: 'docker' | 'standalone';
  platform: string;
  platformLabel: string;
  nodeVersion: string;
} {
  let isDocker = fs.existsSync('/.dockerenv');
  if (!isDocker && process.platform === 'linux') {
    try {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (/(docker|containerd|kubepods)/i.test(cgroup)) {
        isDocker = true;
      }
    } catch {
      // Non-Linux or restricted procfs
    }
  }

  const platform =
    process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
        ? 'macos'
        : process.platform;

  const executionMode: 'docker' | 'standalone' = isDocker ? 'docker' : 'standalone';
  const platformLabel = isDocker
    ? `Docker Container (${platform === 'linux' ? 'Linux' : platform})`
    : platform === 'windows'
      ? 'Standalone (Windows)'
      : platform === 'macos'
        ? 'Standalone (macOS)'
        : `Standalone (${platform})`;

  return {
    executionMode,
    platform,
    platformLabel,
    nodeVersion: process.version,
  };
}

function readLinuxMountPoints(): Set<string> {
  const mounts = new Set<string>();
  if (process.platform !== 'linux') return mounts;
  try {
    const raw = fs.readFileSync('/proc/mounts', 'utf8');
    for (const line of raw.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1]) {
        const cleanMount = parts[1].replace(/\\040/g, ' ');
        mounts.add(path.posix.normalize(cleanMount));
      }
    }
  } catch {
    // Ignore when /proc/mounts is unavailable
  }
  return mounts;
}

function statFsMetrics(targetDir: string): { freeMb: number; totalGb: number; usedPercent: number } {
  try {
    const s = fs.statfsSync(targetDir);
    const totalBytes = Number(s.bsize) * Number(s.blocks);
    const availBytes = Number(s.bsize) * Number(s.bavail);
    const rawFreeBytes = Number(s.bsize) * Number(s.bfree);
    const usedBytes = Math.max(0, totalBytes - rawFreeBytes);
    const freeMb = Math.round(availBytes / (1024 * 1024));
    const totalGb = Number((totalBytes / (1024 * 1024 * 1024)).toFixed(2));
    const usedPercent = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;
    return { freeMb, totalGb, usedPercent };
  } catch {
    return { freeMb: 0, totalGb: 0, usedPercent: 0 };
  }
}

function computeDirSizeBytes(dirPath: string, depth = 0): number {
  if (depth > 4) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += computeDirSizeBytes(fullPath, depth + 1);
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(fullPath).size;
        } catch {
          // Skip vanishing temp files
        }
      }
    }
  } catch {
    return 0;
  }
  return total;
}

function getRootDeviceId(): number | bigint | null {
  try {
    return fs.statSync(process.cwd()).dev;
  } catch {
    return null;
  }
}

function getZoneQuotaMb(id: StorageZoneStatus['id']): number {
  switch (id) {
    case 'uploads':
      return STORAGE_MAX_UPLOADS_GB > 0 ? Math.round(STORAGE_MAX_UPLOADS_GB * 1024) : 0;
    case 'stickers':
      return STORAGE_MAX_STICKERS_MB;
    case 'cache':
      return STORAGE_MAX_CACHE_MB;
    case 'chunks':
      return STORAGE_MAX_CHUNKS_MB;
    case 'avatars':
      return STORAGE_MAX_AVATARS_MB;
    case 'db':
      return STORAGE_WARN_DB_MB;
    default:
      return 0;
  }
}

export function getRuntimeStorageReport(): RuntimeStorageSummary {
  ensureStorageZoneDirs();
  const runtime = detectRuntimeEnvironment();
  const mountPoints = readLinuxMountPoints();
  const rootDev = getRootDeviceId();
  let totalUsedMbSum = 0;

  const zones: StorageZoneStatus[] = ZONE_DEFS.map((zone) => {
    let writable = false;
    try {
      fs.accessSync(zone.dir, fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }

    const fsInfo = statFsMetrics(zone.dir);
    const usedMb = Number((computeDirSizeBytes(zone.dir) / (1024 * 1024)).toFixed(2));
    totalUsedMbSum += usedMb;

    const quotaMb = getZoneQuotaMb(zone.id);
    const quotaPercent =
      quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : fsInfo.usedPercent;
    const quotaExceeded = quotaMb > 0 && usedMb >= quotaMb;

    let distinctMount = false;
    const normalizedPosix = zone.dir.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
    if (normalizedPosix !== '/' && mountPoints.has(normalizedPosix)) {
      distinctMount = true;
    } else if (rootDev !== null) {
      try {
        const zoneDev = fs.statSync(zone.dir).dev;
        if (zoneDev !== rootDev) distinctMount = true;
      } catch {
        distinctMount = false;
      }
    }

    return {
      id: zone.id,
      label: zone.label,
      path: zone.dir,
      writable,
      usedMb,
      freeMb: fsInfo.freeMb,
      totalGb: fsInfo.totalGb,
      distinctMount,
      quotaMb,
      quotaPercent,
      quotaExceeded,
    };
  });

  const primaryFs = statFsMetrics(uploadsDir);
  return {
    executionMode: runtime.executionMode,
    platform: runtime.platform,
    platformLabel: runtime.platformLabel,
    nodeVersion: runtime.nodeVersion,
    minDiskFreeMb: MIN_DISK_FREE_MB,
    diskFreeMb: primaryFs.freeMb,
    diskTotalGb: primaryFs.totalGb,
    diskUsedPercent: primaryFs.usedPercent,
    isolatedVolumesCount: zones.filter((z) => z.distinctMount).length,
    maxTotalGb: STORAGE_MAX_TOTAL_GB,
    totalUsedMb: Number(totalUsedMbSum.toFixed(2)),
    zones,
  };
}

export function enforceCacheLruQuota(incomingBytes = 0): void {
  if (STORAGE_MAX_CACHE_MB <= 0) return;
  try {
    ensureStorageZoneDirs();
    const limitBytes = STORAGE_MAX_CACHE_MB * 1024 * 1024;
    const entries = fs.readdirSync(videoCacheDir, { withFileTypes: true });
    const files: Array<{ fullPath: string; size: number; mtimeMs: number }> = [];
    let totalBytes = 0;

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.includes('.tmp.')) continue;
      const fullPath = path.join(videoCacheDir, entry.name);
      try {
        const st = fs.statSync(fullPath);
        totalBytes += st.size;
        files.push({ fullPath, size: st.size, mtimeMs: st.mtimeMs });
      } catch {}
    }

    if (totalBytes + incomingBytes <= limitBytes) return;
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const f of files) {
      if (totalBytes + incomingBytes <= limitBytes) break;
      try {
        fs.unlinkSync(f.fullPath);
        totalBytes -= f.size;
      } catch {}
    }
  } catch {}
}

export function checkUploadDiskGuard(
  incomingBytes = 0,
  targetZone: StorageZoneStatus['id'] = 'uploads'
): DiskGuardResult {
  ensureStorageZoneDirs();
  const safeIncomingBytes = Math.max(0, Number(incomingBytes) || 0);
  const incomingMb = safeIncomingBytes / (1024 * 1024);
  const zonesToCheck = [uploadsDir, dbDir, chunkStagingDir];
  let lowestFreeMb = Number.POSITIVE_INFINITY;

  for (const dir of zonesToCheck) {
    const metrics = statFsMetrics(dir);
    if (metrics.freeMb > 0 || fs.existsSync(dir)) {
      lowestFreeMb = Math.min(lowestFreeMb, metrics.freeMb);
    }
  }

  if (Number.isFinite(lowestFreeMb)) {
    const projectedFreeMb = lowestFreeMb - incomingMb;
    if (projectedFreeMb < MIN_DISK_FREE_MB) {
      return {
        ok: false,
        freeMb: Math.max(0, Math.round(lowestFreeMb)),
        minRequiredMb: MIN_DISK_FREE_MB,
        error: `พื้นที่ว่างบน Storage ไม่เพียงพอ (เหลือ ${Math.round(lowestFreeMb)} MB, ต้องการขั้นต่ำอย่างน้อย ${MIN_DISK_FREE_MB} MB)`,
      };
    }
  }

  const resolvedFreeMb = Number.isFinite(lowestFreeMb) ? Math.round(lowestFreeMb) : 0;

  if (STORAGE_MAX_TOTAL_GB > 0) {
    const maxTotalBytes = STORAGE_MAX_TOTAL_GB * 1024 * 1024 * 1024;
    const totalUsedBytes = ZONE_DEFS.reduce((sum, z) => sum + computeDirSizeBytes(z.dir), 0);
    if (totalUsedBytes + safeIncomingBytes > maxTotalBytes) {
      return {
        ok: false,
        freeMb: resolvedFreeMb,
        minRequiredMb: MIN_DISK_FREE_MB,
        error: `พื้นที่รวมทุกโซนเกินเพดาน STORAGE_MAX_TOTAL_GB=${STORAGE_MAX_TOTAL_GB} GB กรุณาลบไฟล์เก่าหรือเพิ่มเพดานใน .env`,
      };
    }
  }

  if (targetZone !== 'db' && targetZone !== 'cache') {
    const zoneQuotaMb = getZoneQuotaMb(targetZone);
    if (zoneQuotaMb > 0) {
      const zoneDef = ZONE_DEFS.find((z) => z.id === targetZone);
      if (zoneDef) {
        const zoneUsedBytes = computeDirSizeBytes(zoneDef.dir);
        const zoneLimitBytes = zoneQuotaMb * 1024 * 1024;
        if (zoneUsedBytes + safeIncomingBytes > zoneLimitBytes) {
          const usedMb = (zoneUsedBytes / (1024 * 1024)).toFixed(1);
          return {
            ok: false,
            freeMb: resolvedFreeMb,
            minRequiredMb: MIN_DISK_FREE_MB,
            error: `โควตาพื้นที่โซน ${zoneDef.label} เต็มแล้ว (ใช้ไป ${usedMb} / ${zoneQuotaMb} MB)`,
          };
        }
      }
    }
  }

  return {
    ok: true,
    freeMb: resolvedFreeMb,
    minRequiredMb: MIN_DISK_FREE_MB,
  };
}

function purgeDirEntries(
  dirPath: string,
  minAgeMs: number,
  nowMs: number,
  stats: { deletedFiles: number; freedBytes: number },
  removeSelf = false
): void {
  if (!fs.existsSync(dirPath)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      purgeDirEntries(fullPath, minAgeMs, nowMs, stats, true);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const st = fs.statSync(fullPath);
      if (minAgeMs > 0 && nowMs - st.mtimeMs < minAgeMs) continue;
      fs.unlinkSync(fullPath);
      stats.deletedFiles += 1;
      stats.freedBytes += st.size;
    } catch {
      // Ignore files locked by active streams
    }
  }

  if (removeSelf) {
    try {
      const remaining = fs.readdirSync(dirPath);
      if (remaining.length === 0) {
        fs.rmdirSync(dirPath);
      }
    } catch {
      // Ignore non-empty directory
    }
  }
}

export function purgeTransientCaches(maxChunkAgeMs = 5 * 60 * 1000): CachePurgeResult {
  ensureStorageZoneDirs();
  const nowMs = Date.now();
  const stats = { deletedFiles: 0, freedBytes: 0 };

  purgeDirEntries(videoCacheDir, 0, nowMs, stats, false);
  purgeDirEntries(chunkStagingDir, maxChunkAgeMs, nowMs, stats, false);
  purgeDirEntries(stickerStagingDir, maxChunkAgeMs, nowMs, stats, false);

  return {
    deletedFiles: stats.deletedFiles,
    freedBytes: stats.freedBytes,
    freedMb: Number((stats.freedBytes / (1024 * 1024)).toFixed(2)),
  };
}

/**
 * Moves a file between storage zones cleanly even when source and destination
 * reside on separate Docker Virtual Volumes or distinct physical mounts (EXDEV).
 */
export async function moveFileAcrossZones(srcPath: string, destPath: string): Promise<void> {
  try {
    await fs.promises.rename(srcPath, destPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code !== 'EXDEV') throw err;
    const tmpDest = `${destPath}.moving-${Date.now()}`;
    await fs.promises.copyFile(srcPath, tmpDest);
    await fs.promises.rename(tmpDest, destPath);
    await fs.promises.unlink(srcPath).catch(() => {});
  }
}
