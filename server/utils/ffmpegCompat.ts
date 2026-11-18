import { execFile, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ADMIN_PASSWORD,
  MAX_CHAT_FILES_BATCH,
  MAX_CHAT_FILE_SIZE_MB,
  MAX_P2P_FILE_SIZE_MB,
  MIN_DISK_FREE_MB,
  videoCacheDir,
} from '../config';
import { logActivity } from '../../src/lib/db';
import type { RuntimeStorageSummary } from '../../src/types/chat';
import { enforceCacheLruQuota, getRuntimeStorageReport } from './storageRuntime';

export interface FfmpegCapability {
  available: boolean;
  ffmpegBin: string | null;
  source: 'env' | 'system_path' | 'missing';
  version: string | null;
  errorDetail: string | null;
  checkedAt: number;
}

export interface EnvAuditItem {
  key: string;
  label: string;
  category: 'media' | 'security' | 'storage' | 'runtime';
  status: 'ok' | 'missing' | 'warning';
  valuePreview: string | null;
  hint: string;
}

export interface EnvDiagnosticLog {
  id: string;
  level: 'warning' | 'info';
  key: string;
  message: string;
  createdAt: number;
}

export interface ReadOnlyEnvStatusResponse {
  readOnly: true;
  ffmpeg: FfmpegCapability;
  runtime: RuntimeStorageSummary;
  missingCount: number;
  items: EnvAuditItem[];
  envLogs: EnvDiagnosticLog[];
}

let cachedCapability: FfmpegCapability | null = null;
let envDiagnosticLogs: EnvDiagnosticLog[] = [];
const inFlightTranscodes = new Map<string, Promise<string | null>>();
const inFlightThumbnails = new Map<string, Promise<string | null>>();

const MAX_FFMPEG_WORKERS = Math.min(4, Math.max(2, os.cpus().length));
let activeFfmpegWorkers = 0;
const ffmpegWaitQueue: Array<() => void> = [];

/** Bounds concurrent FFmpeg child processes to prevent blocking I/O / CPU exhaustion under bursts. */
async function runFfmpegTask<T>(task: () => Promise<T>): Promise<T> {
  if (activeFfmpegWorkers >= MAX_FFMPEG_WORKERS) {
    await new Promise<void>((resolve) => ffmpegWaitQueue.push(resolve));
  }
  activeFfmpegWorkers += 1;
  try {
    return await task();
  } finally {
    activeFfmpegWorkers = Math.max(0, activeFfmpegWorkers - 1);
    const next = ffmpegWaitQueue.shift();
    if (next) next();
  }
}

function tryProbeBinary(bin: string): { ok: boolean; version: string | null; err: string | null } {
  try {
    const out = execFileSync(bin, ['-version'], {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    const firstLine = (out || '').split(/\r?\n/)[0]?.trim() || 'ffmpeg detected';
    return { ok: true, version: firstLine.slice(0, 120), err: null };
  } catch (e: unknown) {
    return { ok: false, version: null, err: e instanceof Error ? e.message : 'Binary not executable' };
  }
}

export function probeFfmpegCapability(forceRefresh = false): FfmpegCapability {
  if (cachedCapability && !forceRefresh) return cachedCapability;

  const envBin = process.env.FFMPEG_PATH?.trim() || '';
  if (envBin) {
    const res = tryProbeBinary(envBin);
    if (res.ok) {
      cachedCapability = {
        available: true,
        ffmpegBin: envBin,
        source: 'env',
        version: res.version,
        errorDetail: null,
        checkedAt: Date.now(),
      };
      return cachedCapability;
    }
    cachedCapability = {
      available: false,
      ffmpegBin: null,
      source: 'missing',
      version: null,
      errorDetail: `FFMPEG_PATH="${envBin}" ไม่พร้อมใช้งาน (${res.err || 'invalid path'})`,
      checkedAt: Date.now(),
    };
    return cachedCapability;
  }

  const sysRes = tryProbeBinary('ffmpeg');
  if (sysRes.ok) {
    cachedCapability = {
      available: true,
      ffmpegBin: 'ffmpeg',
      source: 'system_path',
      version: sysRes.version,
      errorDetail: null,
      checkedAt: Date.now(),
    };
    return cachedCapability;
  }

  cachedCapability = {
    available: false,
    ffmpegBin: null,
    source: 'missing',
    version: null,
    errorDetail: null,
    checkedAt: Date.now(),
  };
  return cachedCapability;
}

export async function initializeEnvironmentDiagnostics(): Promise<FfmpegCapability> {
  const cap = probeFfmpegCapability(true);
  envDiagnosticLogs = [];
  if (!cap.available) {
    const msg =
      cap.errorDetail ||
      'ไม่พบ FFmpeg ใน .env (FFMPEG_PATH) หรือ System PATH — วิดีโอ Codec H.265/HEVC จะเล่นเฉพาะเสียงบนเบราว์เซอร์ที่ไม่รองรับจนกว่าจะติดตั้ง FFmpeg';
    envDiagnosticLogs.push({
      id: `env_missing_ffmpeg_${Date.now()}`,
      level: 'warning',
      key: 'FFMPEG_PATH',
      message: msg,
      createdAt: Date.now(),
    });
    await logActivity('ENV_CHECK_MISSING_FFMPEG', 'system', '127.0.0.1', msg).catch(() => {});
  }
  return cap;
}

export function clearEnvDiagnosticLogs(): ReadOnlyEnvStatusResponse {
  envDiagnosticLogs = [];
  return getReadOnlyEnvAudit();
}

export function getReadOnlyEnvAudit(): ReadOnlyEnvStatusResponse {
  const ffmpeg = probeFfmpegCapability();
  const runtime = getRuntimeStorageReport();
  const hasAdminPwd = Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length > 0);
  const hasMediaSecret = Boolean(process.env.MEDIA_SECRET && process.env.MEDIA_SECRET.trim().length > 0);
  const publicHost = process.env.PUBLIC_HOST?.trim() || null;
  const nodeEnv = process.env.NODE_ENV || 'development';
  const storageOk = runtime.zones.every((z) => z.writable);
  const diskLow = runtime.minDiskFreeMb > 0 && runtime.diskFreeMb < runtime.minDiskFreeMb;

  const items: EnvAuditItem[] = [
    {
      key: 'RUNTIME_MODE',
      label: 'Server Execution Mode & Platform',
      category: 'runtime',
      status: 'ok',
      valuePreview: `${runtime.platformLabel} | Node ${runtime.nodeVersion}`,
      hint:
        runtime.executionMode === 'docker'
          ? 'ตรวจจับ Docker Container อัตโนมัติ พร้อมตรวจสอบ Isolated Volumes'
          : 'รันแบบ Standalone บน OS โดยตรง (รองรับการย้าย Storage ผ่าน STORAGE_ROOT)',
    },
    {
      key: 'FFMPEG_PATH',
      label: 'FFmpeg Video Compatibility Transcoder',
      category: 'media',
      status: ffmpeg.available ? 'ok' : 'missing',
      valuePreview: ffmpeg.available
        ? `${ffmpeg.source === 'env' ? process.env.FFMPEG_PATH : 'System PATH (ffmpeg)'} — ${ffmpeg.version}`
        : null,
      hint: ffmpeg.available
        ? 'พร้อมแปลงพรีวิว H.265/HEVC -> H.264 อัตโนมัติ (คงไฟล์ต้นฉบับไว้เหมือนเดิม)'
        : ffmpeg.errorDetail ||
          'สำหรับ Windows: ติดตั้ง FFmpeg แล้วเพิ่มใน System PATH หรือกำหนด FFMPEG_PATH=... ในไฟล์ .env จากนั้นรีสตาร์ตเซิร์ฟเวอร์ (Linux Docker ติดตั้งใน Dockerfile ให้แล้ว)',
    },
    {
      key: 'ADMIN_PASSWORD',
      label: 'Admin Dashboard Password',
      category: 'security',
      status: hasAdminPwd ? 'ok' : 'missing',
      valuePreview: hasAdminPwd ? 'Configured (hidden)' : ADMIN_PASSWORD ? 'Dev fallback active' : null,
      hint: hasAdminPwd ? 'ตั้งค่าใน .env แล้ว' : 'แนะนำให้กำหนด ADMIN_PASSWORD ในไฟล์ .env ก่อนใช้งานจริง',
    },
    {
      key: 'MEDIA_SECRET',
      label: 'AES-256-GCM Media Token Secret',
      category: 'security',
      status: hasMediaSecret ? 'ok' : 'warning',
      valuePreview: hasMediaSecret ? 'Configured (hidden)' : null,
      hint: hasMediaSecret
        ? 'Token เข้ารหัสถาวรข้ามการรีสตาร์ต'
        : 'ยังไม่ตั้งใน .env — ระบบใช้คีย์ชั่วคราวต่อรอบ (ลิงก์เดิมจะหมดอายุเมื่อรีสตาร์ต)',
    },
    {
      key: 'STORAGE_ZONES',
      label: 'Segregated Storage & Disk Safety Guard',
      category: 'storage',
      status: !storageOk ? 'missing' : diskLow ? 'warning' : 'ok',
      valuePreview: storageOk
        ? `${runtime.zones.length} Zones OK (${runtime.isolatedVolumesCount} isolated mounts) | Free ${runtime.diskFreeMb} MB`
        : null,
      hint: diskLow
        ? `พื้นที่ว่างเหลือน้อยกว่าเกณฑ์ MIN_DISK_FREE_MB=${MIN_DISK_FREE_MB} MB ระบบจะหยุดรับอัปโหลดชั่วคราวจนกว่าจะล้างแคชหรือเพิ่มพื้นที่`
        : 'แยก 6 โซนจัดเก็บข้อมูล (db, uploads, stickers, avatars, cache, chunks) พร้อมระบบป้องกัน Disk เต็ม',
    },
    {
      key: 'RUNTIME_LIMITS',
      label: 'Runtime & Upload Quota (.env)',
      category: 'runtime',
      status: 'ok',
      valuePreview: `NODE_ENV=${nodeEnv} | ChatMax=${MAX_CHAT_FILE_SIZE_MB}MB (x${MAX_CHAT_FILES_BATCH}) | P2PMax=${MAX_P2P_FILE_SIZE_MB}MB | MinFree=${MIN_DISK_FREE_MB}MB${publicHost ? ` | Host=${publicHost}` : ''}`,
      hint: 'แก้ไขได้ในไฟล์ .env แล้วปิด-เปิดเซิร์ฟเวอร์ใหม่เท่านั้น',
    },
  ];

  const missingCount = items.filter((i) => i.status === 'missing').length;

  return {
    readOnly: true,
    ffmpeg,
    runtime,
    missingCount,
    items,
    envLogs: [...envDiagnosticLogs],
  };
}

export function getCompatVideoCachePath(storedName: string): string {
  const safeBase = path.basename(storedName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(videoCacheDir, `${safeBase}.h264.mp4`);
}

export function getMediaThumbnailPath(storedName: string): string {
  const safeBase = path.basename(storedName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(videoCacheDir, `${safeBase}.thumb.jpg`);
}

export function removeCompatVideoCache(storedName: string) {
  try {
    const cachePath = getCompatVideoCachePath(storedName);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  } catch {}
  try {
    const thumbPath = getMediaThumbnailPath(storedName);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  } catch {}
}

function execFfmpegToFile(
  ffmpegBin: string,
  args: string[],
  tmpPath: string,
  destPath: string,
  timeoutMs: number
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (!fs.existsSync(videoCacheDir)) fs.mkdirSync(videoCacheDir, { recursive: true });
    execFile(ffmpegBin, args, { timeout: timeoutMs }, (err) => {
      if (err) {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
        resolve(null);
        return;
      }
      try {
        if (fs.existsSync(tmpPath)) {
          const st = fs.statSync(tmpPath);
          if (st.size > 0) {
            enforceCacheLruQuota(st.size);
            fs.renameSync(tmpPath, destPath);
            resolve(destPath);
            return;
          }
          fs.unlinkSync(tmpPath);
        }
      } catch {}
      resolve(null);
    });
  });
}

/**
 * Generates an H.264 + AAC preview MP4 inside storage/video-cache without modifying
 * the original file in storage/uploads/. Returns null if FFmpeg is absent or fails.
 */
export async function getOrCreateCompatPreviewVideo(
  originalFilePath: string,
  storedName: string
): Promise<string | null> {
  const cap = probeFfmpegCapability();
  if (!cap.available || !cap.ffmpegBin) return null;

  const cachePath = getCompatVideoCachePath(storedName);
  if (fs.existsSync(cachePath)) {
    try {
      if (fs.statSync(cachePath).size > 0) return cachePath;
    } catch {}
  }

  if (inFlightTranscodes.has(cachePath)) {
    return inFlightTranscodes.get(cachePath)!;
  }

  const job = runFfmpegTask(async () => {
    const tmpPath = `${cachePath}.${Date.now()}.tmp.mp4`;
    const args = [
      '-y',
      '-i',
      originalFilePath,
      '-map',
      '0:v:0?',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      tmpPath,
    ];
    return execFfmpegToFile(cap.ffmpegBin!, args, tmpPath, cachePath, 120_000);
  }).finally(() => {
    inFlightTranscodes.delete(cachePath);
  });

  inFlightTranscodes.set(cachePath, job);
  return job;
}

/**
 * Extracts and caches a compact JPEG thumbnail (<= 360px wide) inside videoCacheDir.
 * Small images (<= 64 KB) bypass FFmpeg and return originalFilePath directly.
 */
export async function getOrCreateMediaThumbnail(
  originalFilePath: string,
  storedName: string,
  isVideo: boolean
): Promise<string | null> {
  try {
    if (!isVideo && fs.statSync(originalFilePath).size <= 65_536) {
      return originalFilePath;
    }
  } catch {
    return null;
  }

  const thumbPath = getMediaThumbnailPath(storedName);
  if (fs.existsSync(thumbPath)) {
    try {
      if (fs.statSync(thumbPath).size > 0) return thumbPath;
    } catch {}
  }

  const cap = probeFfmpegCapability();
  if (!cap.available || !cap.ffmpegBin) {
    return isVideo ? null : originalFilePath;
  }

  if (inFlightThumbnails.has(thumbPath)) {
    return inFlightThumbnails.get(thumbPath)!;
  }

  const job = runFfmpegTask(async () => {
    const nonce = `${Date.now()}-${Math.round(Math.random() * 1e5)}`;
    if (isVideo) {
      const tmpSeek = `${thumbPath}.${nonce}.tmp.jpg`;
      const firstTry = await execFfmpegToFile(
        cap.ffmpegBin!,
        ['-y', '-ss', '00:00:00.500', '-i', originalFilePath, '-frames:v', '1', '-vf', "scale='min(360,iw)':-2", '-q:v', '5', tmpSeek],
        tmpSeek,
        thumbPath,
        20_000
      );
      if (firstTry) return firstTry;

      const tmpZero = `${thumbPath}.${nonce}.z.tmp.jpg`;
      return execFfmpegToFile(
        cap.ffmpegBin!,
        ['-y', '-ss', '00:00:00', '-i', originalFilePath, '-frames:v', '1', '-vf', "scale='min(360,iw)':-2", '-q:v', '5', tmpZero],
        tmpZero,
        thumbPath,
        20_000
      );
    }

    const tmpImg = `${thumbPath}.${nonce}.img.tmp.jpg`;
    const resized = await execFfmpegToFile(
      cap.ffmpegBin!,
      ['-y', '-i', originalFilePath, '-frames:v', '1', '-vf', "scale='min(360,iw)':-2", '-q:v', '5', tmpImg],
      tmpImg,
      thumbPath,
      15_000
    );
    return resized || originalFilePath;
  }).finally(() => {
    inFlightThumbnails.delete(thumbPath);
  });

  inFlightThumbnails.set(thumbPath, job);
  return job;
}
