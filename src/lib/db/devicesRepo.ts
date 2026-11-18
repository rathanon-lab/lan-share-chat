import {
  ANIMAL_AVATAR_PRESETS,
  isValidUserAvatarUrl,
  resolveFallbackAvatarForName,
} from '../avatars';
import { dbAll, dbGet, dbRun } from './client';

export interface DeviceProfileRow {
  deviceId: string;
  name: string;
  avatarUrl: string | null;
  os: string | null;
  browser: string | null;
  userAgent: string | null;
  lastIp: string | null;
  lastSeenAt: number | null;
  mutedUntil?: number;
  isBanned?: number;
  banReason?: string;
}

const DEVICE_SELECT = `
  SELECT deviceId, name, avatarUrl, os, browser, userAgent, lastIp, lastSeenAt,
         COALESCE(mutedUntil, 0) AS mutedUntil,
         COALESCE(isBanned, 0) AS isBanned,
         COALESCE(banReason, '') AS banReason
  FROM devices
`;

export async function pickUnusedAnimalPreset(): Promise<{ name: string; avatarUrl: string }> {
  const rows = await dbAll<{ avatarUrl: string | null }>('SELECT avatarUrl FROM devices');
  const usedUrls = new Set(rows.map((r) => r.avatarUrl).filter(Boolean) as string[]);
  const available = ANIMAL_AVATAR_PRESETS.filter((p) => !usedUrls.has(p.url));
  const pool = available.length > 0 ? available : ANIMAL_AVATAR_PRESETS;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const suffix = Math.floor(100 + Math.random() * 900);
  return { name: `${pick.name}_${suffix}`, avatarUrl: pick.url };
}

export async function getDeviceProfile(deviceId: string): Promise<DeviceProfileRow | null> {
  const row = await dbGet<DeviceProfileRow>(`${DEVICE_SELECT} WHERE deviceId = ?`, [deviceId]);
  return row || null;
}

export async function findExistingDeviceByIpAndOs(ip: string, os: string): Promise<DeviceProfileRow | null> {
  if (!ip) return null;
  const row = await dbGet<DeviceProfileRow>(
    `${DEVICE_SELECT}
     WHERE lastIp = ?
       AND COALESCE(os, '') = COALESCE(?, '')
       AND deviceId NOT IN (SELECT deviceId FROM deleted_devices)
     ORDER BY COALESCE(isBanned, 0) DESC, COALESCE(lastSeenAt, 0) DESC
     LIMIT 1`,
    [ip, os || '']
  );
  return row || null;
}

export async function getDeviceName(deviceId: string): Promise<string | null> {
  const row = await dbGet<{ name: string }>('SELECT name FROM devices WHERE deviceId = ?', [deviceId]);
  return row ? row.name : null;
}

export async function saveDeviceName(deviceId: string, name: string): Promise<{ lastID: number; changes: number }> {
  const existing = await getDeviceProfile(deviceId);
  if (existing) {
    return dbRun('UPDATE devices SET name = ? WHERE deviceId = ?', [name, deviceId]);
  }
  const avatarUrl = resolveFallbackAvatarForName(name);
  return dbRun('INSERT INTO devices (deviceId, name, avatarUrl) VALUES (?, ?, ?)', [deviceId, name, avatarUrl]);
}

export async function saveDeviceProfile(
  deviceId: string,
  updates: {
    name?: string;
    avatarUrl?: string;
    os?: string;
    browser?: string;
    userAgent?: string;
    lastIp?: string;
    lastSeenAt?: number;
  }
): Promise<DeviceProfileRow> {
  const existing = await getDeviceProfile(deviceId);
  const name = updates.name ?? existing?.name ?? (await pickUnusedAnimalPreset()).name;
  let avatarUrl = existing?.avatarUrl || resolveFallbackAvatarForName(name);
  if (updates.avatarUrl && isValidUserAvatarUrl(updates.avatarUrl)) {
    avatarUrl = updates.avatarUrl;
  }
  const os = updates.os ?? existing?.os ?? null;
  const browser = updates.browser ?? existing?.browser ?? null;
  const userAgent = updates.userAgent ?? existing?.userAgent ?? null;
  const lastIp = updates.lastIp ?? existing?.lastIp ?? null;
  const lastSeenAt = updates.lastSeenAt ?? existing?.lastSeenAt ?? Date.now();
  const mutedUntil = existing?.mutedUntil ?? 0;
  const isBanned = existing?.isBanned ?? 0;
  const banReason = existing?.banReason ?? '';

  await dbRun(
    `INSERT OR REPLACE INTO devices (deviceId, name, avatarUrl, os, browser, userAgent, lastIp, lastSeenAt, mutedUntil, isBanned, banReason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [deviceId, name, avatarUrl, os, browser, userAgent, lastIp, lastSeenAt, mutedUntil, isBanned, banReason]
  );
  return { deviceId, name, avatarUrl, os, browser, userAgent, lastIp, lastSeenAt, mutedUntil, isBanned, banReason };
}

export function getAllDevices(): Promise<DeviceProfileRow[]> {
  return dbAll<DeviceProfileRow>(`${DEVICE_SELECT} ORDER BY COALESCE(lastSeenAt, 0) DESC, name ASC`);
}

export async function clearAllDevices(): Promise<{ lastID: number; changes: number }> {
  await dbRun('DELETE FROM deleted_devices');
  return dbRun('DELETE FROM devices');
}

export async function deleteDevice(deviceId: string): Promise<DeviceProfileRow | null> {
  const existing = await getDeviceProfile(deviceId);
  if (!existing) return null;
  await dbRun('DELETE FROM devices WHERE deviceId = ?', [deviceId]);
  await dbRun('INSERT OR REPLACE INTO deleted_devices (deviceId, deletedAt) VALUES (?, ?)', [deviceId, Date.now()]);
  return existing;
}

export async function isDeviceDeleted(deviceId: string): Promise<boolean> {
  if (!deviceId) return false;
  const row = await dbGet<{ deviceId: string }>('SELECT deviceId FROM deleted_devices WHERE deviceId = ?', [deviceId]);
  return Boolean(row);
}

export async function setDeviceMute(deviceId: string, minutes: number, reason: string): Promise<number> {
  const mutedUntil = minutes > 0 ? Date.now() + minutes * 60 * 1000 : 0;
  await dbRun(
    'UPDATE devices SET mutedUntil = ?, banReason = CASE WHEN ? > 0 THEN ? ELSE banReason END WHERE deviceId = ?',
    [mutedUntil, minutes, reason, deviceId]
  );
  return mutedUntil;
}

export async function setDeviceBan(deviceId: string, isBanned: boolean, reason: string, banIpToo?: string | null): Promise<void> {
  await dbRun(
    'UPDATE devices SET isBanned = ?, banReason = ?, mutedUntil = CASE WHEN ? = 1 THEN 0 ELSE mutedUntil END WHERE deviceId = ?',
    [isBanned ? 1 : 0, isBanned ? reason : '', isBanned ? 1 : 0, deviceId]
  );
  if (isBanned && banIpToo) {
    await dbRun('INSERT OR REPLACE INTO banned_ips (ip, reason, bannedAt) VALUES (?, ?, ?)', [
      banIpToo,
      reason,
      Date.now(),
    ]);
  }
}

export async function unbanIp(ip: string): Promise<void> {
  await dbRun('DELETE FROM banned_ips WHERE ip = ?', [ip]);
}

export function getDevicesByIp(ip: string): Promise<Array<{ deviceId: string; isBanned: number; mutedUntil: number }>> {
  if (!ip) return Promise.resolve([]);
  return dbAll('SELECT deviceId, isBanned, mutedUntil FROM devices WHERE lastIp = ?', [ip]);
}

export function getBannedIps(): Promise<Array<{ ip: string; reason: string; bannedAt: number }>> {
  return dbAll('SELECT ip, reason, bannedAt FROM banned_ips ORDER BY bannedAt DESC');
}

export async function checkClientRestriction(
  deviceId: string,
  ip: string
): Promise<{ isBanned: boolean; isMuted: boolean; mutedUntil: number; reason: string }> {
  const ipRow = ip
    ? await dbGet<{ reason: string }>('SELECT reason FROM banned_ips WHERE ip = ?', [ip])
    : undefined;
  if (ipRow) {
    return { isBanned: true, isMuted: false, mutedUntil: 0, reason: ipRow.reason || 'IP ถูกระงับการใช้งานโดย Admin' };
  }
  if (deviceId) {
    const dev = await getDeviceProfile(deviceId);
    if (dev?.isBanned) {
      return { isBanned: true, isMuted: false, mutedUntil: 0, reason: dev.banReason || 'อุปกรณ์ถูกระงับการใช้งานโดย Admin' };
    }
    const now = Date.now();
    if (dev?.mutedUntil && dev.mutedUntil > now) {
      return {
        isBanned: false,
        isMuted: true,
        mutedUntil: dev.mutedUntil,
        reason: dev.banReason || 'ถูกระงับการส่งชั่วคราว',
      };
    }
  }
  return { isBanned: false, isMuted: false, mutedUntil: 0, reason: '' };
}
