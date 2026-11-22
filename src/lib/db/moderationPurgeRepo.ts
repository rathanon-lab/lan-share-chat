import { dbAll } from './client';

export interface MessageSenderSummary {
  deviceId: string;
  sender: string;
  messageCount: number;
  lastAt: number;
  isAdmin: boolean;
}

export interface PurgeFilterParams {
  startMs?: number;
  endMs?: number;
  deviceIds?: string[];
  excludeAdmin?: boolean;
}

export interface PurgeFilterPreview {
  count: number;
  sampleSenders: Array<{ deviceId: string; sender: string; count: number }>;
}

export interface SuspectedBotSender {
  deviceId: string;
  sender: string;
  messageCount: number;
  maxBurst5s: number;
  maxBurst60s: number;
  reasons: string[];
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface BotSuspectsReport {
  suspects: SuspectedBotSender[];
  totalBotMessages: number;
  totalNormalMessages: number;
}

function buildFilterWhere(filter: PurgeFilterParams): { whereSql: string; params: unknown[]; hasConstraint: boolean } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let hasConstraint = false;

  if (typeof filter.startMs === 'number' && Number.isFinite(filter.startMs) && filter.startMs > 0) {
    parts.push('createdAt >= ?');
    params.push(Math.floor(filter.startMs));
    hasConstraint = true;
  }
  if (typeof filter.endMs === 'number' && Number.isFinite(filter.endMs) && filter.endMs > 0) {
    parts.push('createdAt <= ?');
    params.push(Math.floor(filter.endMs));
    hasConstraint = true;
  }
  const cleanDeviceIds = Array.isArray(filter.deviceIds)
    ? Array.from(new Set(filter.deviceIds.map((d) => String(d || '').trim()).filter(Boolean)))
    : [];
  if (cleanDeviceIds.length > 0) {
    parts.push(`senderDeviceId IN (${cleanDeviceIds.map(() => '?').join(', ')})`);
    params.push(...cleanDeviceIds);
    hasConstraint = true;
  }
  if (filter.excludeAdmin !== false) {
    parts.push('(isAdmin = 0 OR isAdmin IS NULL)');
  }

  return {
    whereSql: parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '',
    params,
    hasConstraint,
  };
}

export async function getMessageSendersSummary(): Promise<MessageSenderSummary[]> {
  const rows = await dbAll<{
    senderDeviceId: string;
    sender: string;
    messageCount: number;
    lastAt: number;
    isAdmin: number;
  }>(
    `SELECT senderDeviceId, MAX(sender) AS sender, COUNT(*) AS messageCount, MAX(createdAt) AS lastAt, MAX(COALESCE(isAdmin, 0)) AS isAdmin
     FROM messages
     WHERE senderDeviceId IS NOT NULL AND senderDeviceId != ''
     GROUP BY senderDeviceId
     ORDER BY messageCount DESC, lastAt DESC
     LIMIT 250`
  );
  return rows.map((r) => ({
    deviceId: String(r.senderDeviceId),
    sender: String(r.sender || r.senderDeviceId),
    messageCount: Number(r.messageCount) || 0,
    lastAt: Number(r.lastAt) || 0,
    isAdmin: Boolean(r.isAdmin),
  }));
}

export async function previewMessagesByFilter(filter: PurgeFilterParams): Promise<PurgeFilterPreview> {
  const { whereSql, params, hasConstraint } = buildFilterWhere(filter);
  if (!hasConstraint) {
    return { count: 0, sampleSenders: [] };
  }
  const grouped = await dbAll<{ senderDeviceId: string | null; sender: string | null; c: number }>(
    `SELECT senderDeviceId, MAX(sender) AS sender, COUNT(*) AS c
     FROM messages
     ${whereSql}
     GROUP BY senderDeviceId
     ORDER BY c DESC`,
    params
  );
  const count = grouped.reduce((sum, r) => sum + (Number(r.c) || 0), 0);
  const sampleSenders = grouped.slice(0, 30).map((r) => ({
    deviceId: String(r.senderDeviceId || 'unknown'),
    sender: String(r.sender || r.senderDeviceId || 'Unknown'),
    count: Number(r.c) || 0,
  }));
  return { count, sampleSenders };
}

export async function deleteMessagesByFilter(filter: PurgeFilterParams): Promise<number[]> {
  const { whereSql, params, hasConstraint } = buildFilterWhere(filter);
  if (!hasConstraint) return [];

  const rows = await dbAll<{ id: number }>(`SELECT id FROM messages ${whereSql}`, params);
  const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return [];

  // Delete in chunks of 400 to stay safely below SQLite's max variable limit (999)
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const batch = ids.slice(i, i + CHUNK_SIZE);
    const ph = batch.map(() => '?').join(', ');
    await dbAll(`DELETE FROM message_edits WHERE messageId IN (${ph})`, batch).catch(() => {});
    await dbAll(`DELETE FROM admin_alerts WHERE messageId IN (${ph})`, batch).catch(() => {});
    await dbAll(`DELETE FROM messages WHERE id IN (${ph})`, batch);
  }
  return ids;
}

function maxSlidingWindowCount(sortedTimestamps: number[], windowMs: number): number {
  let maxCount = 0;
  let left = 0;
  for (let right = 0; right < sortedTimestamps.length; right++) {
    while (sortedTimestamps[right] - sortedTimestamps[left] > windowMs) {
      left++;
    }
    const cur = right - left + 1;
    if (cur > maxCount) maxCount = cur;
  }
  return maxCount;
}

export async function detectSuspectedBotSenders(windowHours = 72): Promise<BotSuspectsReport> {
  const cutoffMs = Date.now() - Math.max(1, windowHours) * 60 * 60 * 1000;
  const now = Date.now();

  const [msgRows, spamAlertRows, deviceRows] = await Promise.all([
    dbAll<{ senderDeviceId: string | null; sender: string | null; createdAt: number; isAdmin: number | null }>(
      'SELECT senderDeviceId, sender, createdAt, isAdmin FROM messages WHERE createdAt >= ? ORDER BY createdAt ASC',
      [cutoffMs]
    ),
    dbAll<{ deviceId: string }>(
      "SELECT DISTINCT deviceId FROM admin_alerts WHERE alertType = 'security_spam' AND deviceId IS NOT NULL AND deviceId != ''"
    ),
    dbAll<{
      deviceId: string;
      name: string | null;
      isBanned: number | null;
      mutedUntil: number | null;
      browser: string | null;
    }>('SELECT deviceId, name, isBanned, mutedUntil, browser FROM devices'),
  ]);

  const spamAlertDevices = new Set(spamAlertRows.map((r) => String(r.deviceId)));
  const deviceMap = new Map<string, (typeof deviceRows)[number]>();
  for (const d of deviceRows) {
    if (d.deviceId) deviceMap.set(d.deviceId, d);
  }

  let totalNormalMessages = 0;
  const byDevice = new Map<string, { sender: string; timestamps: number[] }>();

  for (const row of msgRows) {
    if (row.isAdmin || row.senderDeviceId === 'admin' || !row.senderDeviceId) {
      totalNormalMessages += 1;
      continue;
    }
    const devId = String(row.senderDeviceId);
    let entry = byDevice.get(devId);
    if (!entry) {
      entry = { sender: String(row.sender || devId), timestamps: [] };
      byDevice.set(devId, entry);
    }
    if (row.sender) entry.sender = String(row.sender);
    entry.timestamps.push(Number(row.createdAt) || 0);
  }

  const suspects: SuspectedBotSender[] = [];
  let totalBotMessages = 0;

  for (const [deviceId, info] of byDevice.entries()) {
    const dev = deviceMap.get(deviceId);
    const maxBurst5s = maxSlidingWindowCount(info.timestamps, 5_000);
    const maxBurst60s = maxSlidingWindowCount(info.timestamps, 60_000);
    const reasons: string[] = [];

    if (spamAlertDevices.has(deviceId)) {
      reasons.push('ติดแจ้งเตือน Anti-Spam / Flood');
    }
    if (dev?.isBanned || (dev?.mutedUntil && dev.mutedUntil > now)) {
      reasons.push(dev.isBanned ? 'ถูกแบน' : 'ถูกระงับส่ง (Auto-Mute)');
    }
    if (deviceId.startsWith('loadgen_') || dev?.browser === 'LoadGenWorker') {
      reasons.push('Bot / LoadGen Signature');
    }
    if (maxBurst5s >= 8) {
      reasons.push(`ยิงถี่ ${maxBurst5s} ข้อความ/5 วิ`);
    } else if (maxBurst60s >= 25) {
      reasons.push(`ยิงต่อเนื่อง ${maxBurst60s} ข้อความ/นาที`);
    }

    if (reasons.length > 0) {
      totalBotMessages += info.timestamps.length;
      suspects.push({
        deviceId,
        sender: dev?.name || info.sender,
        messageCount: info.timestamps.length,
        maxBurst5s,
        maxBurst60s,
        reasons,
        firstSeenAt: info.timestamps[0] || 0,
        lastSeenAt: info.timestamps[info.timestamps.length - 1] || 0,
      });
    } else {
      totalNormalMessages += info.timestamps.length;
    }
  }

  suspects.sort((a, b) => b.messageCount - a.messageCount || b.maxBurst5s - a.maxBurst5s);
  return { suspects, totalBotMessages, totalNormalMessages };
}
