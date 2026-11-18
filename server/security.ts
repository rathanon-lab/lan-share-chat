import {
  checkClientRestriction,
  createAdminAlert,
  getSystemSettings,
  incrementTelemetryCounter,
  logActivity,
  setDeviceMute,
  type SystemSettings,
} from '../src/lib/db';
import { clients, getIoRef } from './state';

interface SlidingBucket {
  hits: number[];
  strikes: number;
  lastText?: string;
  repeatCount?: number;
  lastUpdated: number;
}

const chatBuckets = new Map<string, SlidingBucket>();
const p2pBuckets = new Map<string, SlidingBucket>();
const httpBuckets = new Map<string, SlidingBucket>();

// Periodically prune stale buckets every 5 minutes to prevent memory growth
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const map of [chatBuckets, p2pBuckets, httpBuckets]) {
    for (const [k, b] of map.entries()) {
      if (b.lastUpdated < cutoff) map.delete(k);
    }
  }
}, 5 * 60 * 1000).unref();

function recordHit(
  map: Map<string, SlidingBucket>,
  key: string,
  windowMs: number,
  text?: string
): { count: number; repeatCount: number; bucket: SlidingBucket } {
  const now = Date.now();
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { hits: [], strikes: 0, lastUpdated: now };
    map.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((ts) => now - ts < windowMs);
  bucket.hits.push(now);
  bucket.lastUpdated = now;

  if (text && text.length > 0) {
    if (bucket.lastText === text) {
      bucket.repeatCount = (bucket.repeatCount || 1) + 1;
    } else {
      bucket.lastText = text;
      bucket.repeatCount = 1;
    }
  }
  return { count: bucket.hits.length, repeatCount: bucket.repeatCount || 1, bucket };
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

export async function enforceChatGuard(params: {
  deviceId: string;
  ip: string;
  senderName: string;
  text?: string;
  dedupeKey?: string;
  settings?: SystemSettings;
}): Promise<GuardResult> {
  const settings = params.settings || (await getSystemSettings());

  if (settings.chatLocked || settings.chatBlurred) {
    return {
      allowed: false,
      code: 'CHAT_LOCKED',
      message: 'ขณะนี้ Admin ปิดการส่งข้อความชั่วคราวเพื่อตรวจสอบระบบ',
    };
  }

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
      message: `คุณถูกระงับการส่งชั่วคราว (เหลืออีก ~${remainMin} นาที): ${restriction.reason}`,
    };
  }

  if (params.text && params.text.length > MAX_TEXT_LENGTH) {
    return {
      allowed: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: `ข้อความยาวเกิน ${MAX_TEXT_LENGTH.toLocaleString()} ตัวอักษร`,
    };
  }

  if (!settings.antiSpamEnabled) return { allowed: true };

  const windowMs = settings.spamWindowSeconds * 1000;
  const maxMsgs = settings.spamMaxMessages;
  const normalizedText = String(params.text || '').trim().toLowerCase();
  const dedupeToken = params.dedupeKey ? params.dedupeKey.trim().toLowerCase() : normalizedText;

  const devStat = recordHit(chatBuckets, `dev:${params.deviceId}`, windowMs, dedupeToken);
  const ipStat = recordHit(chatBuckets, `ip:${params.ip}`, Math.max(windowMs, 10000));

  const dupThreshold = settings.spamMaxDuplicates ?? 5;
  const isBurst = devStat.count > maxMsgs || ipStat.count > maxMsgs * 3;
  const isDuplicateFlood = dupThreshold > 0 && dedupeToken.length >= 2 && devStat.repeatCount >= dupThreshold;

  if (isBurst || isDuplicateFlood) {
    devStat.bucket.strikes += 1;
    incrementTelemetryCounter('spam').catch(() => {});

    if (devStat.bucket.strikes >= 2 || devStat.count >= maxMsgs + 3 || (isDuplicateFlood && devStat.repeatCount >= dupThreshold)) {
      const reason = isDuplicateFlood
        ? `ส่งข้อความหรือสติกเกอร์ซ้ำรัวเกิน ${dupThreshold} ครั้ง (Auto-Spam)`
        : `ส่งข้อความถี่เกิน ${maxMsgs} ครั้ง/${settings.spamWindowSeconds} วิ`;
      const mutedUntil = await setDeviceMute(params.deviceId, settings.spamMuteMinutes, reason);
      devStat.bucket.strikes = 0;

      await logActivity(
        'AUTO_MUTE_SPAM',
        params.senderName || params.deviceId,
        params.ip,
        JSON.stringify({ deviceId: params.deviceId, ip: params.ip, minutes: settings.spamMuteMinutes, reason })
      );
      const alert = await createAdminAlert({
        alertType: 'security_spam',
        sender: params.senderName || params.deviceId,
        deviceId: params.deviceId,
        previewText: reason,
        reason: `ระบบระงับสิทธิ์อัตโนมัติ ${settings.spamMuteMinutes} นาที`,
      });
      const io = getIoRef();
      if (io && alert) io.emit('admin_alert', alert);
      pushRestrictionState(params.deviceId, undefined, { mutedUntil, reason });

      return {
        allowed: false,
        code: 'MUTED',
        mutedUntil,
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

  if (devStat.count > maxOffers || ipStat.count > maxOffers * 3) {
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
