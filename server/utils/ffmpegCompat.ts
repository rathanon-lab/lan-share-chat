import { execFile, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  ADMIN_PASSWORD,
  MAX_CHAT_FILE_SIZE_MB,
  MAX_P2P_FILE_SIZE_MB,
  avatarsDir,
  stickersStorageDir,
  uploadsDir,
  videoCacheDir,
} from '../config';
import { logActivity } from '../../src/lib/db';

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
  missingCount: number;
  items: EnvAuditItem[];
  envLogs: EnvDiagnosticLog[];
}

let cachedCapability: FfmpegCapability | null = null;
let envDiagnosticLogs: EnvDiagnosticLog[] = [];
const inFlightTranscodes = new Map<string, Promise<string | null>>();

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

function checkDirWritable(dirPath: string): boolean {
  try {
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function getReadOnlyEnvAudit(): ReadOnlyEnvStatusResponse {
  const ffmpeg = probeFfmpegCapability();
  const hasAdminPwd = Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length > 0);
  const hasMediaSecret = Boolean(process.env.MEDIA_SECRET && process.env.MEDIA_SECRET.trim().length > 0);
  const publicHost = process.env.PUBLIC_HOST?.trim() || null;
  const nodeEnv = process.env.NODE_ENV || 'development';
  const storageOk =
    checkDirWritable(uploadsDir) &&
    checkDirWritable(videoCacheDir) &&
    checkDirWritable(avatarsDir) &&
    checkDirWritable(stickersStorageDir);

  const items: EnvAuditItem[] = [
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
      key: 'STORAGE_DIRS',
      label: 'Persistent Storage & Preview Cache',
      category: 'storage',
      status: storageOk ? 'ok' : 'missing',
      valuePreview: storageOk ? 'uploads, video-cache, avatars, stickers OK' : null,
      hint: 'โฟลเดอร์จัดเก็บข้อมูลต้องอ่าน/เขียนได้',
    },
    {
      key: 'RUNTIME_LIMITS',
      label: 'Runtime & Upload Quota (.env)',
      category: 'runtime',
      status: 'ok',
      valuePreview: `NODE_ENV=${nodeEnv} | ChatMax=${MAX_CHAT_FILE_SIZE_MB}MB | P2PMax=${MAX_P2P_FILE_SIZE_MB}MB${publicHost ? ` | Host=${publicHost}` : ''}`,
      hint: 'แก้ไขได้ในไฟล์ .env แล้วปิด-เปิดเซิร์ฟเวอร์ใหม่เท่านั้น',
    },
  ];

  const missingCount = items.filter((i) => i.status === 'missing').length;

  return {
    readOnly: true,
    ffmpeg,
    missingCount,
    items,
    envLogs: [...envDiagnosticLogs],
  };
}

export function getCompatVideoCachePath(storedName: string): string {
  const safeBase = path.basename(storedName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(videoCacheDir, `${safeBase}.h264.mp4`);
}

export function removeCompatVideoCache(storedName: string) {
  try {
    const cachePath = getCompatVideoCachePath(storedName);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  } catch {}
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

  const job = new Promise<string | null>((resolve) => {
    if (!fs.existsSync(videoCacheDir)) fs.mkdirSync(videoCacheDir, { recursive: true });
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

    execFile(cap.ffmpegBin!, args, { timeout: 120_000 }, (err) => {
      if (err) {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
        resolve(null);
        return;
      }
      try {
        if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 0) {
          fs.renameSync(tmpPath, cachePath);
          resolve(cachePath);
          return;
        }
      } catch {}
      resolve(null);
    });
  }).finally(() => {
    inFlightTranscodes.delete(cachePath);
  });

  inFlightTranscodes.set(cachePath, job);
  return job;
}
