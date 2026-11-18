import { dbAll, dbGet, dbRun } from './client';

export type AdminAlertRow = Record<string, unknown>;
export type ActivityLogRow = Record<string, unknown>;

export async function createAdminAlert(params: {
  alertType: 'mention_admin' | 'delete_request' | 'security_spam';
  messageId?: number | null;
  sender: string;
  deviceId: string;
  previewText: string;
  reason?: string;
}): Promise<AdminAlertRow | undefined> {
  const createdAt = Date.now();
  const { lastID } = await dbRun(
    `INSERT INTO admin_alerts (alertType, messageId, sender, deviceId, previewText, reason, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      params.alertType,
      params.messageId ?? null,
      params.sender,
      params.deviceId,
      params.previewText,
      params.reason || '',
      createdAt,
    ]
  );
  return dbGet<AdminAlertRow>('SELECT * FROM admin_alerts WHERE id = ?', [lastID]);
}

export function getAdminAlerts(limit = 100): Promise<AdminAlertRow[]> {
  return dbAll<AdminAlertRow>(
    'SELECT * FROM admin_alerts ORDER BY CASE WHEN status = "pending" THEN 0 ELSE 1 END, id DESC LIMIT ?',
    [limit]
  );
}

export async function resolveAdminAlert(
  id: number,
  status: 'resolved' | 'approved' | 'rejected'
): Promise<AdminAlertRow | undefined> {
  const resolvedAt = Date.now();
  await dbRun('UPDATE admin_alerts SET status = ?, resolvedAt = ? WHERE id = ?', [status, resolvedAt, id]);
  return dbGet<AdminAlertRow>('SELECT * FROM admin_alerts WHERE id = ?', [id]);
}

export function clearAdminAlerts(): Promise<{ lastID: number; changes: number }> {
  return dbRun('DELETE FROM admin_alerts');
}

export function logActivity(
  action: string,
  actor: string,
  actorIp: string,
  details: string
): Promise<{ lastID: number; changes: number }> {
  const timestamp = new Date().toISOString();
  return dbRun(
    'INSERT INTO activity_log (action, actor, actorIp, details, timestamp) VALUES (?, ?, ?, ?, ?)',
    [action, actor, actorIp, details, timestamp]
  );
}

export function getRecentLogs(limit = 200): Promise<ActivityLogRow[]> {
  return dbAll<ActivityLogRow>('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?', [limit]);
}

export function clearActivityLogs(): Promise<{ lastID: number; changes: number }> {
  return dbRun('DELETE FROM activity_log');
}
