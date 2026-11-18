import fs from 'fs';
import path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import { ADMIN_PASSWORD, legacyUploadsDir, uploadsDir } from '../config';
import {
  clearActivityLogs,
  clearAdminAlerts,
  clearAllDevices,
  clearAllTelemetry,
  deleteAllMessages,
  deleteAllUploadedFiles,
  deleteMessage,
  deleteMessagesBatch,
  deleteMessagesByDevice,
  deleteUploadedFile,
  deleteUploadedFilesBatch,
  getAdminOverviewStats,
  getAllMessages,
  getAllUploadedFiles,
  getBannedIps,
  getRecentLogs,
  getSystemSettings,
  logActivity,
  resetSystemSettings,
  sanitizeMessageForClient,
  saveMessage,
  updateSystemSettings,
} from '../../src/lib/db';
import {
  SERVER_STARTED_AT,
  clearActiveAdminSession,
  clients,
  getGroupedPeers,
  getIoRef,
  getPresenceMap,
  isAuthorizedAdminToken,
  isRevokedAdminToken,
  issueAdminSessionToken,
  jsonErr,
  jsonOk,
  parseJsonBody,
  resolveClientIp,
  saveBase64AvatarToStorage,
  timingSafeEqualStr,
} from '../state';
import { checkHttpRateLimit, clearSecurityBuckets } from '../security';
import { ADMIN_DEFAULT_AVATAR_URL } from '../../src/lib/avatars';
import { sanitizeStickerMeta } from '../../src/lib/stickerMeta';
import { buildStickerTemplateZip, cleanupOrphanedStickerDirs, resetStickerPacksToDefaults } from '../../src/lib/stickerStore';
import { processMultiUpload } from './mediaRoutes';
import { handleAdminStickerRoutes } from './adminStickersRoutes';
import { handleAdminModerationRoutes } from './adminModerationRoutes';
import {
  clearEnvDiagnosticLogs,
  getReadOnlyEnvAudit,
  removeCompatVideoCache,
} from '../utils/ffmpegCompat';
import { purgeTransientCaches } from '../utils/storageRuntime';

function unlinkStoredFiles(rows: Array<{ storedName: string }>) {
  for (const row of rows) {
    removeCompatVideoCache(row.storedName);
    for (const dir of [uploadsDir, legacyUploadsDir]) {
      const filePath = path.join(dir, path.basename(row.storedName));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
}

export async function handleAdminApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, x-device-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!ADMIN_PASSWORD) {
      return jsonErr(res, 503, 'ADMIN_PASSWORD is not configured on the server'), true;
    }
    const loginIp = resolveClientIp(req);
    const rl = checkHttpRateLimit({ ip: loginIp, bucketName: 'admin-login', maxHits: 8, windowMs: 5 * 60 * 1000 });
    if (!rl.allowed) {
      await logActivity('ADMIN_LOGIN_RATE_LIMIT', 'unknown', loginIp, JSON.stringify({ attempts: rl.count, windowMin: 5 }));
      return jsonErr(res, 429, 'พยายามเข้าสู่ระบบผิดพลาดบ่อยเกินไป กรุณารอ 5 นาที'), true;
    }
    const body = await parseJsonBody(req);
    if (typeof body.password === 'string' && timingSafeEqualStr(body.password, ADMIN_PASSWORD)) {
      const issuedToken = issueAdminSessionToken({
        clientId: body.clientId,
        deviceId: body.deviceId || (req.headers['x-device-id'] as string),
        ip: loginIp,
      });
      await logActivity('ADMIN_LOGIN_SUCCESS', 'admin', loginIp, JSON.stringify({ clientId: body.clientId || 'api', deviceId: body.deviceId || '' }));
      return jsonOk(res, { success: true, token: issuedToken, callerIp: loginIp }), true;
    }
    await logActivity('ADMIN_LOGIN_FAILED', 'unknown', loginIp, 'Invalid admin password attempt');
    return jsonErr(res, 401, 'รหัสผ่านไม่ถูกต้อง'), true;
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const hdrToken = req.headers['x-admin-token'] as string;
    clearActiveAdminSession(hdrToken);
    return jsonOk(res, { success: true }), true;
  }

  // Allow template download via header token OR query token for direct browser download links
  if (pathname === '/api/admin/stickers/template' && req.method === 'GET') {
    const qToken = new URL(req.url || '/', 'http://localhost').searchParams.get('token') || '';
    const hdrToken = req.headers['x-admin-token'] as string;
    if (!isAuthorizedAdminToken(hdrToken || qToken)) {
      return jsonErr(res, 401, 'Unauthorized'), true;
    }
    const buf = await buildStickerTemplateZip();
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="sticker-pack-template.zip"',
      'Content-Length': buf.length,
    });
    res.end(buf);
    return true;
  }

  const token = req.headers['x-admin-token'] as string;
  if (!isAuthorizedAdminToken(token)) {
    if (isRevokedAdminToken(token)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'เซสชันผู้ดูแลระบบถูกเข้าใช้งานจากอุปกรณ์อื่น (ดีดออกอัตโนมัติ)',
          code: 'ADMIN_SESSION_REPLACED',
        })
      );
      return true;
    }
    return jsonErr(res, 401, 'Unauthorized'), true;
  }

  const ioRef = getIoRef();
  const clientIp = resolveClientIp(req);

  if (await handleAdminStickerRoutes(req, res, pathname, clientIp)) return true;
  if (await handleAdminModerationRoutes(req, res, pathname, clientIp)) return true;

  if (pathname === '/api/admin/messages' && req.method === 'GET') {
    return jsonOk(res, await getAllMessages({ includeDeletedAudit: true })), true;
  }

  const msgDeleteMatch = pathname.match(/^\/api\/admin\/message\/(\d+)$/);
  if (msgDeleteMatch && req.method === 'DELETE') {
    const id = parseInt(msgDeleteMatch[1], 10);
    await deleteMessage(id);
    await logActivity('DELETE_MESSAGE', 'admin', clientIp, `Deleted message id=${id}`);
    if (ioRef) ioRef.emit('message_deleted', { id });
    return jsonOk(res, { success: true }), true;
  }

  if (pathname === '/api/admin/messages/batch-delete' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const deletedIds = await deleteMessagesBatch(ids);
    if (deletedIds.length > 0) {
      await logActivity('BATCH_DELETE_MESSAGES', 'admin', clientIp, JSON.stringify({ count: deletedIds.length, ids: deletedIds }));
      if (ioRef) ioRef.emit('messages_batch_deleted', { ids: deletedIds });
    }
    return jsonOk(res, { success: true, deletedIds }), true;
  }

  if (pathname === '/api/admin/messages/purge-device' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) return jsonErr(res, 400, 'Missing deviceId'), true;
    const windowMinutes =
      typeof body.windowMinutes === 'number' && body.windowMinutes > 0 ? Math.min(1440, body.windowMinutes) : undefined;
    const deletedIds = await deleteMessagesByDevice(deviceId, windowMinutes);
    if (deletedIds.length > 0) {
      await logActivity(
        'PURGE_DEVICE_MESSAGES',
        'admin',
        clientIp,
        JSON.stringify({ deviceId, windowMinutes: windowMinutes ?? 'all', count: deletedIds.length })
      );
      if (ioRef) ioRef.emit('messages_batch_deleted', { ids: deletedIds });
    }
    return jsonOk(res, { success: true, deletedIds }), true;
  }

  if (pathname === '/api/admin/files' && req.method === 'GET') {
    return jsonOk(res, await getAllUploadedFiles()), true;
  }

  if (pathname === '/api/admin/files/batch-delete' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const deletedRows = await deleteUploadedFilesBatch(ids);
    unlinkStoredFiles(deletedRows);
    if (deletedRows.length > 0) {
      await logActivity(
        'BATCH_DELETE_FILES',
        'admin',
        clientIp,
        JSON.stringify({
          count: deletedRows.length,
          ids: deletedRows.map((r) => r.id),
          files: deletedRows.map((r) => r.originalName || r.storedName),
        })
      );
    }
    return jsonOk(res, { success: true, deletedCount: deletedRows.length, deletedIds: deletedRows.map((r) => r.id) }), true;
  }

  const fileDeleteMatch = pathname.match(/^\/api\/admin\/file\/(\d+)$/);
  if (fileDeleteMatch && req.method === 'DELETE') {
    const id = parseInt(fileDeleteMatch[1], 10);
    const row = await deleteUploadedFile(id);
    if (row) {
      unlinkStoredFiles([row]);
      await logActivity('DELETE_FILE', 'admin', clientIp, JSON.stringify({ id, originalName: row.originalName, storedName: row.storedName }));
    }
    return jsonOk(res, { success: true }), true;
  }

  if (pathname === '/api/admin/overview' && req.method === 'GET') {
    const onlinePeersCount = getGroupedPeers(clients).length;
    const [stats, bannedIps] = await Promise.all([
      getAdminOverviewStats(onlinePeersCount, SERVER_STARTED_AT),
      getBannedIps(),
    ]);
    return jsonOk(res, { ...stats, bannedIps }), true;
  }

  if (pathname === '/api/admin/settings' && req.method === 'GET') {
    return jsonOk(res, await getSystemSettings()), true;
  }

  if (pathname === '/api/admin/settings' && req.method === 'PUT') {
    const body = await parseJsonBody(req);
    const nextSettings = await updateSystemSettings({
      voiceMessageEnabled: typeof body.voiceMessageEnabled === 'boolean' ? body.voiceMessageEnabled : undefined,
      deletePolicy: body.deletePolicy,
      editWindowMinutes: typeof body.editWindowMinutes === 'number' ? body.editWindowMinutes : undefined,
      adminRingColor: typeof body.adminRingColor === 'string' ? body.adminRingColor : undefined,
      adminAvatarUrl: typeof body.adminAvatarUrl === 'string' ? body.adminAvatarUrl : undefined,
      adminHoldActive: typeof body.adminHoldActive === 'boolean' ? body.adminHoldActive : undefined,
      chatLocked: typeof body.chatLocked === 'boolean' ? body.chatLocked : undefined,
      chatBlurred: typeof body.chatBlurred === 'boolean' ? body.chatBlurred : undefined,
      antiSpamEnabled: typeof body.antiSpamEnabled === 'boolean' ? body.antiSpamEnabled : undefined,
      spamMaxMessages: typeof body.spamMaxMessages === 'number' ? body.spamMaxMessages : undefined,
      spamMaxDuplicates: typeof body.spamMaxDuplicates === 'number' ? body.spamMaxDuplicates : undefined,
      spamWindowSeconds: typeof body.spamWindowSeconds === 'number' ? body.spamWindowSeconds : undefined,
      spamMuteMinutes: typeof body.spamMuteMinutes === 'number' ? body.spamMuteMinutes : undefined,
      p2pMaxOffersPerWindow: typeof body.p2pMaxOffersPerWindow === 'number' ? body.p2pMaxOffersPerWindow : undefined,
      sessionPolicy: body.sessionPolicy,
      maxConcurrentUsers: typeof body.maxConcurrentUsers === 'number' ? body.maxConcurrentUsers : undefined,
      stickerPreviewMode: body.stickerPreviewMode,
      stickerCollageEnabled: typeof body.stickerCollageEnabled === 'boolean' ? body.stickerCollageEnabled : undefined,
    });
    if (ioRef) ioRef.emit('settings_update', nextSettings);
    await logActivity('UPDATE_SETTINGS', 'admin', clientIp, JSON.stringify(nextSettings));
    return jsonOk(res, nextSettings), true;
  }

  if (pathname === '/api/admin/avatar' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    let nextAvatarUrl = ADMIN_DEFAULT_AVATAR_URL;
    if (!body.reset && body.imageDataUrl) {
      try {
        nextAvatarUrl = saveBase64AvatarToStorage('admin_avatar', body.imageDataUrl);
      } catch (err: unknown) {
        return jsonErr(res, 400, err instanceof Error ? err.message : 'Invalid admin avatar'), true;
      }
    }
    const nextSettings = await updateSystemSettings({ adminAvatarUrl: nextAvatarUrl });
    if (ioRef) ioRef.emit('settings_update', nextSettings);
    await logActivity(
      'UPDATE_ADMIN_AVATAR',
      'admin',
      clientIp,
      body.reset ? 'Reset admin avatar to default mascot' : `Updated admin avatar -> ${nextAvatarUrl}`
    );
    return jsonOk(res, { success: true, settings: nextSettings }), true;
  }

  if (pathname === '/api/admin/backup' && req.method === 'GET') {
    const [msgs, files] = await Promise.all([getAllMessages(), getAllUploadedFiles()]);
    const backup = { exportedAt: new Date().toISOString(), messages: msgs, files };
    await logActivity('BACKUP', 'admin', clientIp, `Exported ${msgs.length} messages, ${files.length} files`);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="backup-${Date.now()}.json"`,
    });
    return res.end(JSON.stringify(backup, null, 2)), true;
  }

  if (pathname === '/api/admin/reset' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const isFullReset = Boolean(
      body.resetMessages && body.resetFiles && body.resetDevices && body.resetAlerts && body.resetSettings
    );
    if (body.resetMessages) {
      await deleteAllMessages();
      await cleanupOrphanedStickerDirs();
      if (ioRef) ioRef.emit('chat_reset', {});
      await logActivity('RESET_MESSAGES', 'admin', clientIp, 'Deleted all messages');
    }
    if (body.resetFiles) {
      const deleted = await deleteAllUploadedFiles();
      unlinkStoredFiles(deleted);
      await logActivity('RESET_FILES', 'admin', clientIp, `Deleted ${deleted.length} uploaded files`);
    }
    if (body.resetDevices) {
      await clearAllDevices();
      await logActivity('RESET_DEVICES', 'admin', clientIp, 'Cleared all saved device aliases');
    }
    if (body.resetSettings) {
      const def = await resetSystemSettings();
      if (ioRef) ioRef.emit('settings_update', def);
      await logActivity('RESET_SETTINGS', 'admin', clientIp, 'Reset system settings to defaults');
    }
    if (body.resetAlerts) {
      await clearAdminAlerts();
      if (ioRef) ioRef.emit('admin_alerts_cleared', {});
      await logActivity('RESET_ALERTS', 'admin', clientIp, 'Cleared admin alert queue');
    }
    if (body.resetTelemetry || isFullReset) {
      await clearAllTelemetry();
      clearSecurityBuckets();
      await logActivity('RESET_TELEMETRY', 'admin', clientIp, 'Cleared daily/hourly telemetry stats and banned IPs');
    } else if (body.resetDevices) {
      clearSecurityBuckets();
    }
    if (body.resetStickers || isFullReset) {
      const defaultPacks = await resetStickerPacksToDefaults({
        purgeFiles: Boolean(body.resetMessages || isFullReset),
      });
      if (ioRef) ioRef.emit('sticker_packs_update', defaultPacks);
      await logActivity('RESET_STICKERS', 'admin', clientIp, 'Reset sticker packs to built-in default');
    }
    if (body.resetLogs) {
      if (typeof body.confirmPassword !== 'string' || !timingSafeEqualStr(body.confirmPassword, ADMIN_PASSWORD)) {
        return jsonErr(res, 403, 'รหัสผ่าน Admin ไม่ถูกต้อง (กรุณายืนยันรหัสผ่านก่อนล้าง Activity Log)'), true;
      }
      await clearActivityLogs();
    }
    return jsonOk(res, { success: true }), true;
  }

  if (pathname === '/api/admin/presence' && req.method === 'GET') {
    return jsonOk(res, getPresenceMap(clients)), true;
  }

  if (pathname === '/api/admin/logs' && req.method === 'GET') {
    return jsonOk(res, await getRecentLogs(500)), true;
  }

  if (pathname === '/api/admin/env-status' && req.method === 'GET') {
    return jsonOk(res, getReadOnlyEnvAudit()), true;
  }

  if (pathname === '/api/admin/env-logs' && req.method === 'DELETE') {
    const nextStatus = clearEnvDiagnosticLogs();
    await logActivity('CLEAR_ENV_LOGS', 'admin', clientIp, 'Cleared environment diagnostic boot notice');
    return jsonOk(res, nextStatus), true;
  }

  if (pathname === '/api/admin/env-clear-cache' && req.method === 'POST') {
    const purged = purgeTransientCaches();
    await logActivity(
      'PURGE_VIDEO_CACHE',
      'admin',
      clientIp,
      `Purged ${purged.deletedFiles} cached files (${purged.freedMb} MB freed)`
    );
    return jsonOk(res, { ...getReadOnlyEnvAudit(), purged }), true;
  }

  if (pathname === '/api/admin/send_message' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const text = body.text?.trim();
    const msgType = body.type === 'sticker' ? 'sticker' : 'text';
    const stickerMeta = msgType === 'sticker' ? sanitizeStickerMeta(body.stickerMeta) : null;
    if (!text && !(msgType === 'sticker' && stickerMeta)) {
      return jsonErr(res, 400, 'Missing text or sticker payload'), true;
    }
    const settings = await getSystemSettings();
    const msg = {
      sender: '[Admin]',
      senderDeviceId: 'admin',
      text: text || stickerMeta?.alt || '',
      type: msgType,
      stickerMeta,
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      status: 'delivered',
      isAdmin: 1,
    };
    const savedId = await saveMessage(msg);
    const clean = sanitizeMessageForClient({ ...msg, id: savedId });
    clean.senderAvatarUrl = settings.adminAvatarUrl;
    clean.senderOs = 'Admin';
    if (ioRef) ioRef.emit('receive_message', clean);
    await logActivity('ADMIN_MESSAGE', 'admin', clientIp, `Sent ${msgType}: "${String(msg.text).slice(0, 80)}"`);
    return jsonOk(res, { success: true, id: savedId }), true;
  }

  if (pathname === '/api/admin/upload_file' && req.method === 'POST') {
    return processMultiUpload(req, res, {
      senderName: '[Admin]',
      deviceId: 'admin',
      clientIp,
      isAdmin: 1,
      logAction: 'ADMIN_UPLOAD_FILE',
    });
  }

  return false;
}
