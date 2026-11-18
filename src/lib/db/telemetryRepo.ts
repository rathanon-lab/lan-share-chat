import { dbAll, dbGet, dbRun } from './client';

function getLocalDayAndHour(ts = Date.now()): { dayKey: string; hour: number } {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { dayKey: `${y}-${m}-${day}`, hour: d.getHours() };
}

export async function recordOnlineTelemetry(onlineCount: number): Promise<void> {
  const now = Date.now();
  const { dayKey, hour } = getLocalDayAndHour(now);
  await dbRun('INSERT OR IGNORE INTO daily_telemetry (dayKey) VALUES (?)', [dayKey]);
  await dbRun('INSERT OR IGNORE INTO hourly_telemetry (dayKey, hour) VALUES (?, ?)', [dayKey, hour]);
  await dbRun(
    `UPDATE daily_telemetry
     SET peakOnline = ?, peakHour = ?, peakOnlineAt = ?
     WHERE dayKey = ? AND ? > COALESCE(peakOnline, 0)`,
    [onlineCount, hour, now, dayKey, onlineCount]
  );
  await dbRun(
    `UPDATE hourly_telemetry
     SET peakOnline = ?
     WHERE dayKey = ? AND hour = ? AND ? > COALESCE(peakOnline, 0)`,
    [onlineCount, dayKey, hour, onlineCount]
  );
}

export async function incrementTelemetryCounter(metric: 'message' | 'upload' | 'spam' | 'p2p'): Promise<void> {
  const { dayKey, hour } = getLocalDayAndHour();
  await dbRun('INSERT OR IGNORE INTO daily_telemetry (dayKey) VALUES (?)', [dayKey]);
  await dbRun('INSERT OR IGNORE INTO hourly_telemetry (dayKey, hour) VALUES (?, ?)', [dayKey, hour]);
  const colMap = {
    message: 'messageCount',
    upload: 'uploadCount',
    spam: 'spamBlockedCount',
    p2p: 'p2pBlockedCount',
  };
  const col = colMap[metric];
  await dbRun(`UPDATE daily_telemetry SET ${col} = COALESCE(${col}, 0) + 1 WHERE dayKey = ?`, [dayKey]);
  if (metric === 'message') {
    await dbRun(
      'UPDATE hourly_telemetry SET messageCount = COALESCE(messageCount, 0) + 1 WHERE dayKey = ? AND hour = ?',
      [dayKey, hour]
    );
  }
}

export async function getAdminOverviewStats(onlinePeersCount: number, serverStartedAt: number) {
  const { dayKey } = getLocalDayAndHour();
  await recordOnlineTelemetry(onlinePeersCount);
  const [
    devRow,
    msgRow,
    fileRow,
    alertRow,
    mutedRow,
    bannedDevRow,
    bannedIpRow,
    dailyRows,
    todayHourlyRows,
  ] = await Promise.all([
    dbGet<{ c: number }>('SELECT COUNT(*) AS c FROM devices'),
    dbGet<{ c: number }>('SELECT COUNT(*) AS c FROM messages WHERE COALESCE(isDeleted, 0) = 0'),
    dbGet<{ c: number; s: number }>('SELECT COUNT(*) AS c, COALESCE(SUM(fileSize), 0) AS s FROM uploaded_files'),
    dbGet<{ c: number }>('SELECT COUNT(*) AS c FROM admin_alerts WHERE status = "pending"'),
    dbGet<{ c: number }>('SELECT COUNT(*) AS c FROM devices WHERE COALESCE(mutedUntil, 0) > ?', [Date.now()]),
    dbGet<{ c: number }>('SELECT COUNT(*) AS c FROM devices WHERE COALESCE(isBanned, 0) = 1'),
    dbGet<{ c: number }>('SELECT COUNT(*) AS c FROM banned_ips'),
    dbAll<Record<string, unknown>>('SELECT * FROM daily_telemetry ORDER BY dayKey DESC LIMIT 14'),
    dbAll<Record<string, unknown>>('SELECT dayKey, hour, peakOnline, messageCount FROM hourly_telemetry WHERE dayKey = ? ORDER BY hour ASC', [dayKey]),
  ]);

  const todayRow = dailyRows.find((r) => r.dayKey === dayKey);
  return {
    serverStartedAt,
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - serverStartedAt) / 1000)),
    onlinePeersCount,
    totalDevices: Number(devRow?.c) || 0,
    totalMessages: Number(msgRow?.c) || 0,
    totalFiles: Number(fileRow?.c) || 0,
    totalFileBytes: Number(fileRow?.s) || 0,
    pendingAlerts: Number(alertRow?.c) || 0,
    mutedDevicesCount: Number(mutedRow?.c) || 0,
    bannedDevicesCount: Number(bannedDevRow?.c) || 0,
    bannedIpsCount: Number(bannedIpRow?.c) || 0,
    todayPeakOnline: Number(todayRow?.peakOnline) || onlinePeersCount,
    todayPeakHour: Number(todayRow?.peakHour) || new Date().getHours(),
    daily: dailyRows,
    todayHourly: todayHourlyRows,
  };
}

export async function clearAllTelemetry(): Promise<void> {
  await dbRun('DELETE FROM daily_telemetry');
  await dbRun('DELETE FROM hourly_telemetry');
  await dbRun('DELETE FROM banned_ips');
}
