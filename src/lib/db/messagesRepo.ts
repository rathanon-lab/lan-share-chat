import path from 'path';
import { encryptMediaToken } from '../crypto';
import { resolveFallbackAvatarForName } from '../avatars';
import { dbAll, dbGet, dbRun } from './client';
import { getSystemSettings } from './settingsRepo';

export interface SaveMessageInput {
  sender: string;
  senderDeviceId?: string | null;
  text?: string;
  type?: string;
  fileName?: string | null;
  fileSize?: number | null;
  filePath?: string | null;
  mimeType?: string | null;
  mediaToken?: string | null;
  attachments?: unknown;
  stickerMeta?: unknown;
  time: string;
  createdAt?: number;
  mentionAdmin?: number | boolean;
  status?: string;
  isAdmin?: number | boolean;
}

export async function saveMessage(msg: SaveMessageInput): Promise<number> {
  const {
    sender,
    senderDeviceId,
    text,
    type,
    fileName,
    fileSize,
    filePath,
    mimeType,
    mediaToken,
    attachments,
    stickerMeta,
    time,
    createdAt,
    mentionAdmin,
    status,
    isAdmin,
  } = msg;

  const attachmentsJson = attachments
    ? typeof attachments === 'string'
      ? attachments
      : JSON.stringify(attachments)
    : null;
  const stickerMetaJson = stickerMeta
    ? typeof stickerMeta === 'string'
      ? stickerMeta
      : JSON.stringify(stickerMeta)
    : null;

  const { lastID } = await dbRun(
    `INSERT INTO messages (
      sender, senderDeviceId, text, type, fileName, fileSize, filePath, mimeType, mediaToken,
      attachments, stickerMeta, time, createdAt, mentionAdmin, status, isAdmin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sender,
      senderDeviceId || null,
      text || '',
      type || 'text',
      fileName || null,
      fileSize || null,
      filePath || null,
      mimeType || null,
      mediaToken || null,
      attachmentsJson,
      stickerMetaJson,
      time,
      createdAt || Date.now(),
      mentionAdmin ? 1 : 0,
      status || 'delivered',
      isAdmin ? 1 : 0,
    ]
  );
  return lastID;
}

/**
 * Sanitizes message row before sending to client:
 * - Parses `attachments` JSON array
 * - Masks deleted content for public chat clients while retaining Admin audit details if requested
 * - Converts any legacy `filePath` into an encrypted `mediaToken`
 * - Strips raw `filePath` so server paths are NEVER exposed to clients
 */
export interface MessageRowRecord {
  id?: number;
  sender?: string;
  senderDeviceId?: string | null;
  text?: string;
  type?: string;
  fileName?: string | null;
  fileSize?: number | null;
  filePath?: string | null;
  mimeType?: string | null;
  mediaToken?: string | null;
  attachments?: unknown;
  stickerMeta?: unknown;
  time?: string;
  createdAt?: number;
  editedAt?: number | null;
  editCount?: number;
  isDeleted?: number;
  deletedAt?: number | null;
  deletedBy?: string | null;
  mentionAdmin?: number;
  status?: string;
  isAdmin?: number;
  isRead?: number;
  readAt?: number | null;
  senderAvatarUrl?: string;
  senderOs?: string;
  senderStatus?: string;
  editHistory?: Record<string, unknown>[];
  [key: string]: unknown;
}

export function sanitizeMessageForClient(
  row: MessageRowRecord,
  opts?: { includeDeletedAudit?: boolean; editHistory?: Record<string, unknown>[] }
): MessageRowRecord {
  const out: MessageRowRecord = { ...row };
  let parsedAttachments: Record<string, unknown>[] = [];

  if (out.attachments) {
    try {
      parsedAttachments =
        typeof out.attachments === 'string'
          ? (JSON.parse(out.attachments) as Record<string, unknown>[])
          : (out.attachments as Record<string, unknown>[]);
    } catch {
      parsedAttachments = [];
    }
  }

  // Legacy single-file fallback migration
  if (parsedAttachments.length === 0 && (out.mediaToken || out.filePath)) {
    let token = typeof out.mediaToken === 'string' ? out.mediaToken : '';
    if (!token && out.filePath) {
      const storedName = path.basename(String(out.filePath));
      token = encryptMediaToken({
        storedName,
        originalName: String(out.fileName || storedName),
        mimeType: String(out.mimeType || 'application/octet-stream'),
      });
    }
    if (token) {
      parsedAttachments = [
        {
          fileName: out.fileName || 'attachment',
          fileSize: Number(out.fileSize) || 0,
          mimeType: out.mimeType || 'application/octet-stream',
          mediaToken: token,
        },
      ];
      out.mediaToken = token;
    }
  }

  let parsedStickerMeta: Record<string, unknown> | null = null;
  if (out.stickerMeta) {
    try {
      parsedStickerMeta =
        typeof out.stickerMeta === 'string'
          ? (JSON.parse(out.stickerMeta) as Record<string, unknown>)
          : (out.stickerMeta as Record<string, unknown>);
    } catch {
      parsedStickerMeta = null;
    }
  }

  if (out.isDeleted && !opts?.includeDeletedAudit) {
    out.text = '';
    out.attachments = [];
    out.stickerMeta = null;
    out.mediaToken = null;
    out.fileName = null;
    out.fileSize = null;
    out.mimeType = null;
  } else {
    out.attachments = parsedAttachments;
    out.stickerMeta = parsedStickerMeta;
  }

  if (opts?.editHistory) {
    out.editHistory = opts.editHistory;
  } else if (!Array.isArray(out.editHistory)) {
    out.editHistory = [];
  }

  delete out.filePath;
  return out;
}

export async function getMessageById(id: number): Promise<MessageRowRecord | undefined> {
  return dbGet<MessageRowRecord>('SELECT * FROM messages WHERE id = ?', [id]);
}

export async function getMessageEdits(messageId: number): Promise<MessageRowRecord[]> {
  return dbAll<MessageRowRecord>(
    'SELECT id, messageId, previousText, newText, editedBy, editedByDeviceId, editedAt FROM message_edits WHERE messageId = ? ORDER BY editedAt ASC, id ASC',
    [messageId]
  );
}

export async function recordMessageEdit(params: {
  messageId: number;
  previousText: string;
  newText: string;
  editedBy: string;
  editedByDeviceId: string;
}): Promise<{ editedAt: number; editCount: number; editHistory: MessageRowRecord[] }> {
  const editedAt = Date.now();
  await dbRun(
    'INSERT INTO message_edits (messageId, previousText, newText, editedBy, editedByDeviceId, editedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [params.messageId, params.previousText, params.newText, params.editedBy, params.editedByDeviceId, editedAt]
  );
  await dbRun(
    'UPDATE messages SET text = ?, editedAt = ?, editCount = COALESCE(editCount, 0) + 1 WHERE id = ?',
    [params.newText, editedAt, params.messageId]
  );
  const updated = await getMessageById(params.messageId);
  const editHistory = await getMessageEdits(params.messageId);
  return {
    editedAt,
    editCount: Number(updated?.editCount) || editHistory.length,
    editHistory,
  };
}

export async function softDeleteMessage(id: number, deletedBy: string): Promise<number> {
  const deletedAt = Date.now();
  await dbRun('UPDATE messages SET isDeleted = 1, deletedAt = ?, deletedBy = ? WHERE id = ?', [
    deletedAt,
    deletedBy,
    id,
  ]);
  return deletedAt;
}

export async function getAllMessages(opts?: { includeDeletedAudit?: boolean }): Promise<MessageRowRecord[]> {
  const [rows, edits, devices, bannedIpRows, settings] = await Promise.all([
    dbAll<MessageRowRecord>('SELECT * FROM messages ORDER BY id ASC'),
    dbAll<MessageRowRecord>(
      'SELECT id, messageId, previousText, newText, editedBy, editedByDeviceId, editedAt FROM message_edits ORDER BY editedAt ASC, id ASC'
    ),
    dbAll<{
      deviceId: string;
      avatarUrl: string | null;
      os: string | null;
      lastIp: string | null;
      isBanned: number | null;
      mutedUntil: number | null;
    }>('SELECT deviceId, avatarUrl, os, lastIp, isBanned, mutedUntil FROM devices'),
    dbAll<{ ip: string }>('SELECT ip FROM banned_ips'),
    getSystemSettings(),
  ]);

  const deviceById = new Map<string, (typeof devices)[number]>();
  for (const d of devices) {
    if (d.deviceId) deviceById.set(d.deviceId, d);
  }
  const bannedIpSet = new Set(bannedIpRows.map((b) => b.ip));
  const now = Date.now();
  const editsByMsg = new Map<number, MessageRowRecord[]>();
  for (const e of edits) {
    const msgId = Number(e.messageId);
    if (!editsByMsg.has(msgId)) editsByMsg.set(msgId, []);
    editsByMsg.get(msgId)!.push(e);
  }

  return rows.map((row) => {
    const clean = sanitizeMessageForClient(row, {
      includeDeletedAudit: opts?.includeDeletedAudit,
      editHistory: editsByMsg.get(Number(row.id)) || [],
    });
    if (row.isAdmin || row.senderDeviceId === 'admin') {
      clean.senderAvatarUrl = settings.adminAvatarUrl;
      clean.senderOs = 'Admin';
      clean.senderStatus = 'active';
      return clean;
    }

    const dev = row.senderDeviceId ? deviceById.get(String(row.senderDeviceId)) : undefined;
    if (row.senderDeviceId && !dev) {
      clean.senderStatus = 'deleted';
      clean.senderAvatarUrl = '';
      clean.senderOs = undefined;
      return clean;
    }

    const ipBanned = Boolean(dev?.lastIp && bannedIpSet.has(dev.lastIp));
    const devBanned = Boolean(dev?.isBanned);
    const devMuted = Boolean(dev?.mutedUntil && dev.mutedUntil > now);
    clean.senderStatus = ipBanned ? 'ip_banned' : devBanned ? 'banned' : devMuted ? 'muted' : 'active';
    clean.senderAvatarUrl = dev?.avatarUrl || resolveFallbackAvatarForName(String(row.sender || ''));
    clean.senderOs = dev?.os && dev.os !== 'Unknown' ? dev.os : undefined;
    return clean;
  });
}

export async function deleteMessage(id: number): Promise<void> {
  await dbRun('DELETE FROM message_edits WHERE messageId = ?', [id]);
  await dbRun('DELETE FROM admin_alerts WHERE messageId = ?', [id]);
  await dbRun('DELETE FROM messages WHERE id = ?', [id]);
}

export async function deleteMessagesBatch(ids: number[]): Promise<number[]> {
  const cleanIds = Array.from(new Set(ids.map((n) => Math.floor(Number(n))).filter((n) => Number.isInteger(n) && n > 0)));
  if (cleanIds.length === 0) return [];
  const placeholders = cleanIds.map(() => '?').join(', ');
  const existing = await dbAll<{ id: number }>(`SELECT id FROM messages WHERE id IN (${placeholders})`, cleanIds);
  const existingIds = existing.map((r) => r.id);
  if (existingIds.length === 0) return [];
  const p2 = existingIds.map(() => '?').join(', ');
  await dbRun(`DELETE FROM message_edits WHERE messageId IN (${p2})`, existingIds);
  await dbRun(`DELETE FROM admin_alerts WHERE messageId IN (${p2})`, existingIds);
  await dbRun(`DELETE FROM messages WHERE id IN (${p2})`, existingIds);
  return existingIds;
}

export async function deleteMessagesByDevice(deviceId: string, windowMinutes?: number): Promise<number[]> {
  if (!deviceId) return [];
  const rows =
    typeof windowMinutes === 'number' && windowMinutes > 0
      ? await dbAll<{ id: number }>(
          'SELECT id FROM messages WHERE senderDeviceId = ? AND createdAt >= ? AND COALESCE(isAdmin, 0) = 0',
          [deviceId, Date.now() - windowMinutes * 60 * 1000]
        )
      : await dbAll<{ id: number }>(
          'SELECT id FROM messages WHERE senderDeviceId = ? AND COALESCE(isAdmin, 0) = 0',
          [deviceId]
        );
  return deleteMessagesBatch(rows.map((r) => r.id));
}

export async function deleteAllMessages(): Promise<void> {
  await dbRun('DELETE FROM message_edits');
  await dbRun('DELETE FROM admin_alerts');
  await dbRun('DELETE FROM messages');
}

export async function markMessagesReadUpTo(
  upToId: number,
  readerDeviceId: string
): Promise<{ changed: number; readAt: number; upToId: number }> {
  const readAt = Date.now();
  const cleanId = Math.floor(Number(upToId) || 0);
  if (cleanId <= 0 || !readerDeviceId) return { changed: 0, readAt, upToId: cleanId };
  const res = await dbRun(
    `UPDATE messages
     SET isRead = 1, readAt = ?
     WHERE id <= ? AND COALESCE(isRead, 0) = 0 AND COALESCE(isDeleted, 0) = 0 AND COALESCE(senderDeviceId, '') != ?`,
    [readAt, cleanId, readerDeviceId]
  );
  return { changed: res.changes || 0, readAt, upToId: cleanId };
}
