import {
  checkClientRestriction,
  createAdminAlert,
  getCachedSystemSettings,
  getSystemSettings,
  incrementTelemetryCounter,
  logActivity,
  setDeviceMute,
  type SystemSettings,
} from '../src/lib/db';
import { clients, getIoRef } from './state';

interface SlidingBucket {
  hits: number[];
  fileHits: number[];
  strikes: number;
  lastText?: string;
  repeatCount?: number;
  lastUpdated: number;
}

const chatBuckets = new Map<string, SlidingBucket>();
const p2pBuckets = new Map<string, SlidingBucket>();
const httpBuckets = new Map<string, SlidingBucket>();
// Synchronous in-memory mute gate to eliminate async SQLite race conditions during high-RPS floods
const fastMutedDevices = new Map<string, { until: number; reason: string }>();

// Periodically prune stale buckets every 5 minutes to prevent memory growth
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 10 * 60 * 1000;
  for (const map of [chatBuckets, p2pBuckets, httpBuckets]) {
    for (const [k, b] of map.entries()) {
      if (b.lastUpdated < cutoff) map.delete(k);
    }
  }
  for (const [devId, m] of fastMutedDevices.entries()) {
    if (m.until <= now) fastMutedDevices.delete(devId);
  }
}, 5 * 60 * 1000).unref();

export function syncFastDeviceMute(deviceId: string, mutedUntil: number, reason = '') {
  if (!deviceId) return;
  if (mutedUntil > Date.now()) {
    fastMutedDevices.set(deviceId, { until: mutedUntil, reason });
  } else {
    fastMutedDevices.delete(deviceId);
  }
}

export function getFastDeviceMute(deviceId: string): { until: number; reason: string } | null {
  if (!deviceId) return null;
  const cur = fastMutedDevices.get(deviceId);
  if (!cur) return null;
  if (cur.until <= Date.now()) {
    fastMutedDevices.delete(deviceId);
    return null;
  }
  return cur;
}

function recordHit(
  map: Map<string, SlidingBucket>,
  key: string,
  windowMs: number,
  text?: string,
  uploadFileCount = 0
): { count: number; fileCount: number; repeatCount: number; rapidBotCadence: boolean; bucket: SlidingBucket } {
  const now = Date.now();
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { hits: [], fileHits: [], strikes: 0, lastUpdated: now };
    map.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((ts) => now - ts < windowMs);
  bucket.hits.push(now);

  bucket.fileHits = bucket.fileHits.filter((ts) => now - ts < windowMs);
  const addedFiles = Math.max(0, Math.min(20, Math.floor(uploadFileCount || 0)));
  for (let i = 0; i < addedFiles; i++) {
    bucket.fileHits.push(now);
  }

  bucket.lastUpdated = now;

  if (text && text.length > 0) {
    if (bucket.lastText === text) {
      bucket.repeatCount = (bucket.repeatCount || 1) + 1;
    } else {
      bucket.lastText = text;
      bucket.repeatCount = 1;
    }
  }

  // Detect inhuman scripted cadence: >= 6 actions within 800ms (e.g. bot blasting every 1-50ms)
  const rapidBotCadence =
    bucket.hits.length >= 6 && now - bucket.hits[bucket.hits.length - 6] <= 800;

  return {
    count: bucket.hits.length,
    fileCount: bucket.fileHits.length,
    repeatCount: bucket.repeatCount || 1,
    rapidBotCadence,
    bucket,
  };
}

export function clearSecurityBuckets() {
  chatBuckets.clear();
  p2pBuckets.clear();
  httpBuckets.clear();
  fastMutedDevices.clear();
}

const pendingBanDisconnects = new Map<string, NodeJS.Timeout>();

export function pushRestrictionState(
  deviceId: string,
  ip: string | undefined,
  payload: { banned?: boolean; mutedUntil?: number; reason: string }
) {
  const io = getIoRef();
  if (!io) return;
  for (const [sockId, client] of clients.entries()) {
    const matchDev = Boolean(deviceId && client.deviceId === deviceId);
    const matchIp = Boolean(ip && client.ip === ip);
    if (!matchDev && !matchIp) continue;

    const existingTimer = pendingBanDisconnects.get(sockId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingBanDisconnects.delete(sockId);
    }

    io.to(sockId).emit('client_restricted', payload);
    if (payload.banned) {
      const timer = setTimeout(async () => {
        pendingBanDisconnects.delete(sockId);
        const latest = await checkClientRestriction(client.deviceId, client.ip).catch(() => null);
        if (!latest || latest.isBanned) {
          io.sockets.sockets.get(sockId)?.disconnect(true);
        }
      }, 250);
      pendingBanDisconnects.set(sockId, timer);
    }
  }
}

export interface GuardResult {
  allowed: boolean;
  code?: 'CHAT_LOCKED' | 'BANNED' | 'MUTED' | 'RATE_LIMIT' | 'PAYLOAD_TOO_LARGE';
  message?: string;
  mutedUntil?: number;
  retryAfterSec?: number;
}

export const MAX_TEXT_LENGTH = 4000;

export async function precheckChatWriteGate(deviceId: string, ip: string): Promise<GuardResult> {
  const fastGate = getCachedSystemSettings();
  if (fastGate && (fastGate.chatLocked || fastGate.chatBlurred)) {
    return {
      allowed: false,
      code: 'CHAT_LOCKED',
      message: 'ขณะนี้ Admin ปิดการส่งข้อความและไฟล์ชั่วคราวเพื่อตรวจสอบระบบ',
    };
  }
  const fastMute = getFastDeviceMute(deviceId);
  if (fastMute) {
    const remainMin = Math.max(1, Math.ceil((fastMute.until - Date.now()) / 60000));
    return {
      allowed: false,
      code: 'MUTED',
      mutedUntil: fastMute.until,
      message: `คุณถูกระงับการส่งชั่วคราว (เหลืออีก ~${remainMin} นาที): ${fastMute.reason}`,
    };
  }
  const settings = fastGate || (await getSystemSettings());
  if (settings.chatLocked || settings.chatBlurred) {
    return {
      allowed: false,
      code: 'CHAT_LOCKED',
      message: 'ขณะนี้ Admin ปิดการส่งข้อความและไฟล์ชั่วคราวเพื่อตรวจสอบระบบ',
    };
  }
  const restriction = await checkClientRestriction(deviceId, ip);
  if (restriction.isBanned) {
    return { allowed: false, code: 'BANNED', message: restriction.reason };
  }
  if (restriction.isMuted) {
    syncFastDeviceMute(deviceId, restriction.mutedUntil, restriction.reason);
    const remainMin = Math.max(1, Math.ceil((restriction.mutedUntil - Date.now()) / 60000));
    return {
      allowed: false,
      code: 'MUTED',
      mutedUntil: restriction.mutedUntil,
      message: `คุณถูกระงับการส่งชั่วคราว (เหลืออีก ~${remainMin} นาที): ${restriction.reason}`,
    };
  }
  return { allowed: true };
}

export async function enforceChatGuard(params: {
  deviceId: string;
  ip: string;
  senderName: string;
  text?: string;
  dedupeKey?: string;
  uploadFileCount?: number;
  settings?: SystemSettings;
}): Promise<GuardResult> {
  // 1. 0.1ms synchronous In-Memory Emergency Gate check before touching any DB
  const fastGate = getCachedSystemSettings();
  if (fastGate && (fastGate.chatLocked || fastGate.chatBlurred)) {
    return {
      allowed: false,
      code: 'CHAT_LOCKED',
      message: 'ขณะนี้ Admin ปิดการส่งข้อความชั่วคราวเพื่อตรวจสอบระบบ',
    };
  }

  // 2. 0.1ms synchronous Fast-Mute check (blocks packet #12..#1000 immediately with zero SQLite race)
  const fastMute = getFastDeviceMute(params.deviceId);
  if (fastMute) {
    const remainMin = Math.max(1, Math.ceil((fastMute.until - Date.now()) / 60000));
    return {
      allowed: false,
      code: 'MUTED',
      mutedUntil: fastMute.until,
      message: `คุณถูกระงับการส่งชั่วคราว (เหลืออีก ~${remainMin} นาที): ${fastMute.reason}`,
    };
  }

  if (params.text && params.text.length > MAX_TEXT_LENGTH) {
    return {
      allowed: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: `ข้อความยาวเกิน ${MAX_TEXT_LENGTH.toLocaleString()} ตัวอักษร`,
    };
  }

  const settings = params.settings || fastGate || (await getSystemSettings());

  if (settings.chatLocked || settings.chatBlurred) {
    return {
      allowed: false,
      code: 'CHAT_LOCKED',
      message: 'ขณะนี้ Admin ปิดการส่งข้อความชั่วคราวเพื่อตรวจสอบระบบ',
    };
  }

  // 3. Atomic synchronous Anti-Spam / Bot-Cadence / Upload-File-Burst evaluation BEFORE any DB await
  if (settings.antiSpamEnabled) {
    const windowMs = settings.spamWindowSeconds * 1000;
    const maxMsgs = settings.spamMaxMessages;
    const maxFilesInWindow = Math.max(maxMsgs + 2, 12);
    const normalizedText = String(params.text || '').trim().toLowerCase();
    const dedupeToken = params.dedupeKey ? params.dedupeKey.trim().toLowerCase() : normalizedText;

    const devStat = recordHit(chatBuckets, `dev:${params.deviceId}`, windowMs, dedupeToken, params.uploadFileCount || 0);
    const ipStat = recordHit(chatBuckets, `ip:${params.ip}`, Math.max(windowMs, 10000), undefined, params.uploadFileCount || 0);

    const dupThreshold = settings.spamMaxDuplicates ?? 5;
    const isDevBurst = devStat.count > maxMsgs;
    const isUploadFileFlood = devStat.fileCount > maxFilesInWindow;
    const isBotCadence = devStat.rapidBotCadence;
    const isIpOnlyBurst = !isDevBurst && !isUploadFileFlood && !isBotCadence && ipStat.count > maxMsgs * 3;
    const isDuplicateFlood = dupThreshold > 0 && dedupeToken.length >= 2 && devStat.repeatCount >= dupThreshold;

    if (isIpOnlyBurst && !isDuplicateFlood) {
      incrementTelemetryCounter('spam').catch(() => {});
      return {
        allowed: false,
        code: 'RATE_LIMIT',
        retryAfterSec: settings.spamWindowSeconds,
        message: `เครือข่ายเดียวกันส่งข้อความถี่เกินกำหนด กรุณารอสักครู่`,
      };
    }

    if (isDevBurst || isUploadFileFlood || isBotCadence || isDuplicateFlood) {
      devStat.bucket.strikes += 1;
      incrementTelemetryCounter('spam').catch(() => {});

      const shouldAutoMute =
        isBotCadence ||
        isUploadFileFlood ||
        devStat.bucket.strikes >= 2 ||
        devStat.count >= maxMsgs + 3 ||
        (isDuplicateFlood && devStat.repeatCount >= dupThreshold);

      if (shouldAutoMute) {
        const reason = isBotCadence
          ? `ตรวจพบพฤติกรรมบอท/สคริปต์ยิงข้อความถี่ผิดปกติ (>=6 ครั้งใน <0.8 วิ)`
          : isUploadFileFlood
            ? `อัปโหลดไฟล์/วิดีโอถี่เกิน ${maxFilesInWindow} ไฟล์/${settings.spamWindowSeconds} วิ`
            : isDuplicateFlood
              ? `ส่งข้อความหรือสติกเกอร์ซ้ำรัวเกิน ${dupThreshold} ครั้ง (Auto-Spam)`
              : `ส่งข้อความถี่เกิน ${maxMsgs} ครั้ง/${settings.spamWindowSeconds} วิ`;

        // CRITICAL: Mark muted synchronously in RAM BEFORE awaiting SQLite so concurrent packets
        // from the same bot never slip through or generate duplicate Admin Alerts!
        const muteMs = Math.max(1, settings.spamMuteMinutes) * 60 * 1000;
        const fastUntil = Date.now() + muteMs;
        syncFastDeviceMute(params.deviceId, fastUntil, reason);
        devStat.bucket.strikes = 0;

        // Persist mute + single alert + notify client (non-blocking race-safe)
        setDeviceMute(params.deviceId, settings.spamMuteMinutes, reason)
          .then((persistedUntil) => {
            syncFastDeviceMute(params.deviceId, persistedUntil, reason);
            pushRestrictionState(params.deviceId, undefined, { mutedUntil: persistedUntil, reason });
          })
          .catch(() => {
            pushRestrictionState(params.deviceId, undefined, { mutedUntil: fastUntil, reason });
          });

        logActivity(
          'AUTO_MUTE_SPAM',
          params.senderName || params.deviceId,
          params.ip,
          JSON.stringify({ deviceId: params.deviceId, ip: params.ip, minutes: settings.spamMuteMinutes, reason })
        ).catch(() => {});

        createAdminAlert({
          alertType: 'security_spam',
          sender: params.senderName || params.deviceId,
          deviceId: params.deviceId,
          previewText: reason,
          reason: `ระบบระงับสิทธิ์อัตโนมัติ ${settings.spamMuteMinutes} นาที`,
        })
          .then((alert) => {
            const io = getIoRef();
            if (io && alert) io.emit('admin_alert', alert);
          })
          .catch(() => {});

        return {
          allowed: false,
          code: 'MUTED',
          mutedUntil: fastUntil,
          message: `ตรวจพบการสแปม! ระบบระงับการส่งชั่วคราว ${settings.spamMuteMinutes} นาที (${reason})`,
        };
      }

      return {
        allowed: false,
        code: 'RATE_LIMIT',
        retryAfterSec: settings.spamWindowSeconds,
        message: `ส่งข้อความเร็วเกินไป กรุณารอสักครู่ (${maxMsgs} ข้อความ/${settings.spamWindowSeconds} วิ)`,
      };
    }

    // Decay strikes on normal traffic
    if (devStat.count <= 2 && devStat.bucket.strikes > 0) {
      devStat.bucket.strikes = 0;
    }
  }

  // 4. Check persistent DB bans / IP bans / pre-existing mutes (Control Plane SQLite)
  const restriction = await checkClientRestriction(params.deviceId, params.ip);
  if (restriction.isBanned) {
    return { allowed: false, code: 'BANNED', message: restriction.reason };
  }
  if (restriction.isMuted) {
    syncFastDeviceMute(params.deviceId, restriction.mutedUntil, restriction.reason);
    const remainMin = Math.max(1, Math.ceil((restriction.mutedUntil - Date.now()) / 60000));
    return {
      allowed: false,
      code: 'MUTED',
      mutedUntil: restriction.mutedUntil,
      message: `คุณถูกระงับการส่งชั่วคราว (เหลืออีก ~${remainMin} นาที): ${restriction.reason}`,
    };
  }

  return { allowed: true };
}

export async function enforceP2pGuard(params: {
  deviceId: string;
  ip: string;
  senderName: string;
  kind: 'offer' | 'relay_header' | 'relay_chunk' | 'signal_other';
  chunkBytes?: number;
}): Promise<GuardResult> {
  const settings = await getSystemSettings();
  const restriction = await checkClientRestriction(params.deviceId, params.ip);
  if (restriction.isBanned) {
    return { allowed: false, code: 'BANNED', message: restriction.reason };
  }
  if (restriction.isMuted) {
    const remainMin = Math.max(1, Math.ceil((restriction.mutedUntil - Date.now()) / 60000));
    return {
      allowed: false,
      code: 'MUTED',
      mutedUntil: restriction.mutedUntil,
      message: `คุณถูกระงับสิทธิ์การส่งชั่วคราว (~${remainMin} นาที): ${restriction.reason}`,
    };
  }

  if (params.kind === 'relay_chunk') {
    if (typeof params.chunkBytes === 'number' && params.chunkBytes > 256 * 1024) {
      return { allowed: false, code: 'PAYLOAD_TOO_LARGE', message: 'Chunk exceeds maximum permitted size' };
    }
    return { allowed: true };
  }

  if (params.kind === 'signal_other' || !settings.antiSpamEnabled) {
    return { allowed: true };
  }

  // Rate-limit ONLY P2P session initiation (offers / file_header) - zero file names logged!
  const windowMs = 15 * 1000;
  const maxOffers = settings.p2pMaxOffersPerWindow;
  const devStat = recordHit(p2pBuckets, `p2p-dev:${params.deviceId}`, windowMs);
  const ipStat = recordHit(p2pBuckets, `p2p-ip:${params.ip}`, windowMs);

  const isDevP2pBurst = devStat.count > maxOffers;
  if (!isDevP2pBurst && ipStat.count > maxOffers * 3) {
    incrementTelemetryCounter('p2p').catch(() => {});
    return {
      allowed: false,
      code: 'RATE_LIMIT',
      retryAfterSec: 15,
      message: `เครือข่ายเดียวกันส่งคำขอ P2P ถี่เกินไป กรุณารอสักครู่`,
    };
  }

  if (isDevP2pBurst) {
    devStat.bucket.strikes += 1;
    incrementTelemetryCounter('p2p').catch(() => {});

    if (devStat.bucket.strikes >= 2 || devStat.count >= maxOffers + 3) {
      const reason = `ส่งคำขอ P2P ถี่ผิดปกติ (> ${maxOffers} ครั้ง/15 วิ)`;
      const mutedUntil = await setDeviceMute(params.deviceId, settings.spamMuteMinutes, reason);
      devStat.bucket.strikes = 0;

      // Privacy-preserving Security Log: logs device & IP count ONLY (zero file names/contents)
      await logActivity(
        'P2P_SPAM_BLOCKED',
        params.senderName || params.deviceId,
        params.ip,
        JSON.stringify({ deviceId: params.deviceId, ip: params.ip, offersIn15s: devStat.count, muteMinutes: settings.spamMuteMinutes })
      );
      const alert = await createAdminAlert({
        alertType: 'security_spam',
        sender: params.senderName || params.deviceId,
        deviceId: params.deviceId,
        previewText: reason,
        reason: `ตรวจพบสแปมส่ง P2P — ระบบระงับสิทธิ์ทั้งแชทและ P2P เป็นเวลา ${settings.spamMuteMinutes} นาที`,
      });
      const io = getIoRef();
      if (io && alert) io.emit('admin_alert', alert);
      pushRestrictionState(params.deviceId, undefined, { mutedUntil, reason });

      return {
        allowed: false,
        code: 'MUTED',
        mutedUntil,
        message: `ส่งคำขอ P2P ถี่เกินกำหนด! ระงับสิทธิ์การส่ง ${settings.spamMuteMinutes} นาที`,
      };
    }

    return {
      allowed: false,
      code: 'RATE_LIMIT',
      retryAfterSec: 15,
      message: `ส่งคำขอ P2P ถี่เกินไป (สูงสุด ${maxOffers} ครั้ง/15 วิ)`,
    };
  }

  return { allowed: true };
}

export function checkHttpRateLimit(params: {
  ip: string;
  bucketName: string;
  maxHits: number;
  windowMs: number;
}): { allowed: boolean; count: number } {
  const key = `${params.bucketName}:${params.ip}`;
  const { count } = recordHit(httpBuckets, key, params.windowMs);
  return { allowed: count <= params.maxHits, count };
}
