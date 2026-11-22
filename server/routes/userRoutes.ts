import fs from 'fs';
import path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import {
  MAX_CHAT_FILES_BATCH,
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_FILE_SIZE_MB,
  MAX_P2P_FILE_SIZE_MB,
  avatarsDir,
  port,
} from '../config';
import {
  checkClientRestriction,
  createAdminAlert,
  getCachedSystemSettings,
  getDeviceProfile,
  getMessageById,
  getMessageEdits,
  getMessagesPage,
  getStickerPacksWithItems,
  getSystemSettings,
  logActivity,
  pickUnusedAnimalPreset,
  recordMessageEdit,
  softDeleteMessage,
} from '../../src/lib/db';
import { checkHttpRateLimit } from '../security';
import { ANIMAL_AVATAR_PRESETS, isValidUserAvatarUrl } from '../../src/lib/avatars';
import {
  MAX_STICKERS_PER_PACK,
  MIN_STICKERS_PER_PACK,
  RECOMMENDED_STICKERS_PER_PACK,
  resolveStickerAssetFile,
} from '../../src/lib/stickerStore';
import {
  applyDeviceRename,
  generateRandomName,
  getActiveHttpsPort,
  getCachedCaCertPem,
  getIoRef,
  getLocalIp,
  getPublicHost,
  hasAdminMention,
  isAuthorizedAdminToken,
  jsonErr,
  jsonOk,
  parseJsonBody,
  resolveClientIp,
  saveBase64AvatarToStorage,
} from '../state';
import {
  handleChunkComplete,
  handleChunkUpload,
  handleCreateStreamTicket,
  handleEncryptedMediaFetch,
  handleEncryptedMediaThumb,
  handleStreamGet,
  processMultiUpload,
} from './mediaRoutes';
import {
  handleCreateZipTicket,
  handleDownloadZipGet,
  handleDownloadZipPost,
} from './mediaZipRoutes';
import { getOrCreateGifStaticPoster, probeFfmpegCapability } from '../utils/ffmpegCompat';

async function handleUserMessageApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  const deviceId = String(req.headers['x-device-id'] || '').trim();
  const clientIp = resolveClientIp(req);
  const ioRef = getIoRef();

  const histMatch = pathname.match(/^\/api\/messages\/(\d+)\/history$/);
  if (histMatch && req.method === 'GET') {
    const id = parseInt(histMatch[1], 10);
    const msg = await getMessageById(id);
    if (!msg) return jsonErr(res, 404, 'Message not found'), true;
    const history = await getMessageEdits(id);
    return jsonOk(res, { id, history }), true;
  }

  const reqDelMatch = pathname.match(/^\/api\/messages\/(\d+)\/request-delete$/);
  if (reqDelMatch && req.method === 'POST') {
    const id = parseInt(reqDelMatch[1], 10);
    const msg = await getMessageById(id);
    if (!msg) return jsonErr(res, 404, 'Message not found'), true;
    if (!deviceId || (msg.senderDeviceId && msg.senderDeviceId !== deviceId)) {
      return jsonErr(res, 403, 'คุณสามารถขอลบได้เฉพาะข้อความของตนเองเท่านั้น'), true;
    }
    const body = await parseJsonBody(req);
    const reason = String(body.reason || 'ผู้ใช้ขอให้ Admin ช่วยลบข้อความนี้').slice(0, 200);
    const alert = await createAdminAlert({
      alertType: 'delete_request',
      messageId: id,
      sender: msg.sender || 'Unknown',
      deviceId,
      previewText: String(msg.text || msg.fileName || '[Attachment]').slice(0, 140),
      reason,
    });
    if (ioRef && alert) ioRef.emit('admin_alert', alert);
    await logActivity('REQUEST_DELETE_MESSAGE', msg.sender || deviceId, clientIp, `Requested delete msg id=${id}`);
    return jsonOk(res, { success: true, alert }), true;
  }

  const msgMatch = pathname.match(/^\/api\/messages\/(\d+)$/);
  if (!msgMatch) return false;
  const id = parseInt(msgMatch[1], 10);

  if (req.method === 'PUT') {
    if (!deviceId) return jsonErr(res, 401, 'Missing x-device-id'), true;
    const fastGate = getCachedSystemSettings();
    if (fastGate && (fastGate.chatLocked || fastGate.chatBlurred)) {
      return jsonErr(res, 423, 'ขณะนี้ Admin ปิดการแก้ไขและส่งข้อความชั่วคราวเพื่อตรวจสอบระบบ'), true;
    }
    const msg = await getMessageById(id);
    if (!msg) return jsonErr(res, 404, 'Message not found'), true;
    if (msg.isDeleted) return jsonErr(res, 400, 'Cannot edit a deleted message'), true;
    if (msg.isAdmin || !msg.senderDeviceId || msg.senderDeviceId !== deviceId) {
      return jsonErr(res, 403, 'คุณสามารถแก้ไขได้เฉพาะข้อความของตนเองเท่านั้น'), true;
    }
    const settings = await getSystemSettings();
    const createdAt = Number(msg.createdAt) || 0;
    const windowMs = settings.editWindowMinutes * 60 * 1000;
    if (!createdAt || Date.now() - createdAt > windowMs) {
      return jsonErr(res, 403, `หมดเวลาแก้ไขข้อความแล้ว (เกิน ${settings.editWindowMinutes} นาที)`), true;
    }

    const body = await parseJsonBody(req);
    const newText = String(body.text || '').trim();
    if (!newText) return jsonErr(res, 400, 'ข้อความต้องไม่ว่างเปล่า'), true;
    if (newText === msg.text) return jsonOk(res, { success: true, unchanged: true }), true;

    const { editedAt, editCount, editHistory } = await recordMessageEdit({
      messageId: id,
      previousText: String(msg.text || ''),
      newText,
      editedBy: msg.sender || 'User',
      editedByDeviceId: deviceId,
    });

    if (ioRef) {
      ioRef.emit('message_edited', { id, text: newText, editedAt, editCount, editHistory });
    }
    if (hasAdminMention(newText) && !msg.mentionAdmin) {
      const alert = await createAdminAlert({
        alertType: 'mention_admin',
        messageId: id,
        sender: msg.sender || 'User',
        deviceId,
        previewText: newText.slice(0, 140),
        reason: 'มีการกล่าวถึง @admin หลังแก้ไขข้อความ',
      });
      if (ioRef && alert) ioRef.emit('admin_alert', alert);
    }
    await logActivity('EDIT_MESSAGE', msg.sender || deviceId, clientIp, `Edited msg id=${id} (edit #${editCount})`);
    return jsonOk(res, { success: true, id, text: newText, editedAt, editCount, editHistory }), true;
  }

  if (req.method === 'DELETE') {
    if (!deviceId) return jsonErr(res, 401, 'Missing x-device-id'), true;
    const fastGate = getCachedSystemSettings();
    if (fastGate && (fastGate.chatLocked || fastGate.chatBlurred)) {
      return jsonErr(res, 423, 'ขณะนี้ Admin ปิดการลบและส่งข้อความชั่วคราวเพื่อตรวจสอบระบบ'), true;
    }
    const msg = await getMessageById(id);
    if (!msg) return jsonErr(res, 404, 'Message not found'), true;
    if (msg.isDeleted) return jsonOk(res, { success: true, alreadyDeleted: true }), true;
    if (msg.isAdmin || !msg.senderDeviceId || msg.senderDeviceId !== deviceId) {
      return jsonErr(res, 403, 'คุณสามารถลบได้เฉพาะข้อความของตนเองเท่านั้น'), true;
    }

    const settings = await getSystemSettings();
    const createdAt = Number(msg.createdAt) || 0;
    const windowMs = settings.editWindowMinutes * 60 * 1000;
    const withinWindow = createdAt > 0 && Date.now() - createdAt <= windowMs;

    if (settings.deletePolicy === 'admin_only' || (settings.deletePolicy === 'hybrid_15m' && !withinWindow)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error:
            settings.deletePolicy === 'admin_only'
              ? 'นโยบายระบบกำหนดให้แจ้งแอดมินเป็นผู้ลบข้อความ'
              : `เกิน ${settings.editWindowMinutes} นาทีแล้ว กรุณาส่งคำขอลบถึงแอดมิน`,
          requireAdminRequest: true,
        })
      );
      return true;
    }

    const deletedAt = await softDeleteMessage(id, msg.sender || 'ผู้ส่ง');
    if (ioRef) {
      ioRef.emit('message_soft_deleted', { id, deletedAt, deletedBy: msg.sender || 'ผู้ส่ง' });
    }
    await logActivity('USER_SOFT_DELETE_MESSAGE', msg.sender || deviceId, clientIp, `Soft-deleted msg id=${id}`);
    return jsonOk(res, { success: true, id, deletedAt }), true;
  }

  return false;
}

export async function handlePublicAndUserApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  query: Record<string, any>
): Promise<boolean> {
  // Block direct /uploads/* access
  if (pathname.startsWith('/uploads/')) {
    jsonErr(res, 403, 'Direct URL file access is disabled. Retrieve media via encrypted POST /api/media/fetch.');
    return true;
  }

  // Encrypted media vault endpoints (with HTTP flood protection; authenticated Admins bypass grid-view rate limits)
  const isAdminCaller = isAuthorizedAdminToken((req.headers['x-admin-token'] as string) || '');
  if (pathname === '/api/media/thumb' && req.method === 'POST') {
    if (!isAdminCaller) {
      const rl = checkHttpRateLimit({ ip: resolveClientIp(req), bucketName: 'media-thumb', maxHits: 600, windowMs: 60 * 1000 });
      if (!rl.allowed) return jsonErr(res, 429, 'Too many thumbnail requests'), true;
    }
    await handleEncryptedMediaThumb(req, res);
    return true;
  }
  if (pathname === '/api/media/fetch' && req.method === 'POST') {
    if (!isAdminCaller) {
      const rl = checkHttpRateLimit({ ip: resolveClientIp(req), bucketName: 'media-fetch', maxHits: 360, windowMs: 60 * 1000 });
      if (!rl.allowed) return jsonErr(res, 429, 'Too many media requests'), true;
    }
    await handleEncryptedMediaFetch(req, res);
    return true;
  }
  if (pathname === '/api/media/stream-ticket' && req.method === 'POST') {
    if (!isAdminCaller) {
      const rl = checkHttpRateLimit({ ip: resolveClientIp(req), bucketName: 'media-stream-ticket', maxHits: 240, windowMs: 60 * 1000 });
      if (!rl.allowed) return jsonErr(res, 429, 'Too many stream requests'), true;
    }
    await handleCreateStreamTicket(req, res);
    return true;
  }
  if (pathname === '/api/media/stream' && (req.method === 'GET' || req.method === 'HEAD')) {
    await handleStreamGet(req, res, query);
    return true;
  }
  if (pathname === '/api/media/zip-ticket' && req.method === 'POST') {
    if (!isAdminCaller) {
      const rl = checkHttpRateLimit({ ip: resolveClientIp(req), bucketName: 'media-zip-ticket', maxHits: 40, windowMs: 60 * 1000 });
      if (!rl.allowed) return jsonErr(res, 429, 'Too many zip requests'), true;
    }
    await handleCreateZipTicket(req, res);
    return true;
  }
  if (pathname === '/api/media/download-zip' && (req.method === 'GET' || req.method === 'HEAD')) {
    await handleDownloadZipGet(req, res, query);
    return true;
  }
  if (pathname === '/api/media/download-zip' && req.method === 'POST') {
    if (!isAdminCaller) {
      const rl = checkHttpRateLimit({ ip: resolveClientIp(req), bucketName: 'media-download-zip', maxHits: 30, windowMs: 60 * 1000 });
      if (!rl.allowed) return jsonErr(res, 429, 'Too many zip requests'), true;
    }
    await handleDownloadZipPost(req, res);
    return true;
  }

  // Stickers public endpoints (served dynamically for both built-in and admin-uploaded packs)
  if (pathname === '/api/stickers' && req.method === 'GET') {
    const packs = await getStickerPacksWithItems({ onlyEnabled: true });
    jsonOk(res, {
      packs,
      limits: {
        min: MIN_STICKERS_PER_PACK,
        recommended: RECOMMENDED_STICKERS_PER_PACK,
        max: MAX_STICKERS_PER_PACK,
      },
    });
    return true;
  }

  const stickerAssetMatch = pathname.match(/^\/api\/stickers\/asset\/([^/]+)\/([^/]+)$/);
  if (stickerAssetMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const packId = decodeURIComponent(stickerAssetMatch[1]);
    const fileName = decodeURIComponent(stickerAssetMatch[2]);
    const resolved = resolveStickerAssetFile(packId, fileName);
    if (!resolved) {
      jsonErr(res, 404, 'Sticker asset not found');
      return true;
    }

    const urlObj = new URL(req.url || pathname, 'http://localhost');
    const wantPoster = urlObj.searchParams.get('poster') === '1';
    let servePath = resolved.filePath;
    let serveType = resolved.contentType;

    if (wantPoster && /\.(gif|webp|apng)$/i.test(fileName)) {
      const poster = await getOrCreateGifStaticPoster(resolved.filePath, `${packId}_${fileName}`);
      if (poster) {
        servePath = poster.path;
        serveType = poster.contentType;
      }
    }

    res.writeHead(200, {
      'Content-Type': serveType,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    fs.createReadStream(servePath).pipe(res);
    return true;
  }

  // Paginated message history for Reverse Auto Infinite Scroll
  if (pathname === '/api/messages/page' && req.method === 'GET') {
    const urlObj = new URL(req.url || pathname, 'http://localhost');
    const limit = parseInt(urlObj.searchParams.get('limit') || '60', 10) || 60;
    const beforeIdRaw = urlObj.searchParams.get('beforeId');
    const beforeId = beforeIdRaw ? parseInt(beforeIdRaw, 10) : null;
    const page = await getMessagesPage({ limit, beforeId, includeDeletedAudit: false });
    jsonOk(res, page);
    return true;
  }

  // Runtime config & presets
  if (pathname === '/api/config' && req.method === 'GET') {
    const settings = await getSystemSettings();
    jsonOk(res, {
      maxChatFileSizeMb: MAX_CHAT_FILE_SIZE_MB,
      maxChatFileBytes: MAX_CHAT_FILE_BYTES,
      maxP2pFileSizeMb: MAX_P2P_FILE_SIZE_MB,
      maxP2pFileBytes: MAX_P2P_FILE_SIZE_MB * 1024 * 1024,
      maxChatFilesBatch: MAX_CHAT_FILES_BATCH,
      minStickersPerPack: MIN_STICKERS_PER_PACK,
      recommendedStickersPerPack: RECOMMENDED_STICKERS_PER_PACK,
      maxStickersPerPack: MAX_STICKERS_PER_PACK,
      avatarPresets: ANIMAL_AVATAR_PRESETS,
      videoTranscodeAvailable: probeFfmpegCapability().available,
      settings,
    });
    return true;
  }

  // Custom avatar asset stream
  if (pathname.startsWith('/api/avatar/') && req.method === 'GET') {
    const fileName = path.basename(pathname.slice('/api/avatar/'.length));
    if (!fileName || !/^[a-zA-Z0-9._-]+\.(webp|png|jpg)$/.test(fileName)) {
      jsonErr(res, 400, 'Invalid avatar path');
      return true;
    }
    const fullPath = path.join(avatarsDir, fileName);
    if (!fs.existsSync(fullPath)) {
      jsonErr(res, 404, 'Avatar not found');
      return true;
    }
    const ext = path.extname(fileName).toLowerCase();
    const ctype = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
    res.writeHead(200, {
      'Content-Type': ctype,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(fullPath).pipe(res);
    return true;
  }

  // Update user profile avatar & alias
  if (pathname === '/api/profile/avatar' && req.method === 'POST') {
    const clientIp = resolveClientIp(req);
    const rl = checkHttpRateLimit({ ip: clientIp, bucketName: 'profile-update', maxHits: 15, windowMs: 60 * 1000 });
    if (!rl.allowed) return jsonErr(res, 429, 'อัปเดตโปรไฟล์ถี่เกินไป กรุณารอสักครู่'), true;
    const body = await parseJsonBody(req);
    const reqDeviceId = String(body.deviceId || req.headers['x-device-id'] || '').trim();
    if (!reqDeviceId || reqDeviceId.length > 64) {
      jsonErr(res, 400, 'Missing or invalid deviceId');
      return true;
    }
    const restriction = await checkClientRestriction(reqDeviceId, clientIp);
    if (restriction.isBanned || restriction.isMuted) {
      return jsonErr(res, 403, restriction.reason || 'อุปกรณ์ของคุณถูกระงับสิทธิ์'), true;
    }
    const profile = await getDeviceProfile(reqDeviceId);
    try {
      let nextAvatarUrl = '';
      if (body.randomUnused) {
        const unused = await pickUnusedAnimalPreset();
        nextAvatarUrl = unused.avatarUrl;
      } else if (body.avatarUrl && isValidUserAvatarUrl(body.avatarUrl)) {
        nextAvatarUrl = body.avatarUrl;
      } else if (body.imageDataUrl) {
        nextAvatarUrl = saveBase64AvatarToStorage(reqDeviceId, body.imageDataUrl);
      } else {
        jsonErr(res, 400, 'Missing avatar payload');
        return true;
      }
      const safeName =
        typeof body.name === 'string' && body.name.trim().length > 0
          ? body.name.trim().slice(0, 24)
          : profile?.name || generateRandomName();
      await applyDeviceRename(reqDeviceId, safeName, nextAvatarUrl);
      await logActivity('UPDATE_PROFILE', safeName, clientIp, `Updated avatar (${nextAvatarUrl})`);
      jsonOk(res, { success: true, name: safeName, avatarUrl: nextAvatarUrl });
    } catch (err: any) {
      jsonErr(res, 400, err?.message || 'Failed to update avatar');
    }
    return true;
  }

  if (pathname === '/api/settings' && req.method === 'GET') {
    const settings = await getSystemSettings();
    jsonOk(res, settings);
    return true;
  }

  if (pathname === '/api/server-info' && req.method === 'GET') {
    const settings = await getSystemSettings();
    const publicHost = getPublicHost(getLocalIp());
    const activeHttpsPort = getActiveHttpsPort();
    const httpsUrl = activeHttpsPort
      ? activeHttpsPort === 443
        ? `https://${publicHost}`
        : `https://${publicHost}:${activeHttpsPort}`
      : process.env.PUBLIC_HTTPS_URL?.trim() || null;
    jsonOk(res, {
      httpPort: port,
      httpsPort: activeHttpsPort,
      localIp: publicHost,
      httpsUrl,
      caDownloadUrl: getCachedCaCertPem() ? '/api/certs/root-ca.crt' : null,
      settings,
    });
    return true;
  }

  if (pathname === '/api/certs/root-ca.crt' && req.method === 'GET') {
    const pem = getCachedCaCertPem();
    if (!pem) {
      jsonErr(res, 404, 'TLS Root CA is not initialized');
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Disposition': 'attachment; filename="lan-share-root-ca.crt"',
    });
    res.end(pem);
    return true;
  }

  if (pathname.startsWith('/api/messages/')) {
    const handled = await handleUserMessageApi(req, res, pathname);
    if (handled) return true;
  }

  if (pathname === '/api/upload/chunk' && req.method === 'POST') {
    await handleChunkUpload(req, res);
    return true;
  }
  if (pathname === '/api/upload/complete' && req.method === 'POST') {
    await handleChunkComplete(req, res);
    return true;
  }
  if (pathname === '/api/upload' && req.method === 'POST') {
    const clientIp = resolveClientIp(req);
    const senderDeviceId = (req.headers['x-device-id'] as string) || 'unknown';
    const rawSenderName = (req.headers['x-sender-name'] as string) || 'Unknown';
    let senderName = rawSenderName;
    try {
      senderName = decodeURIComponent(rawSenderName);
    } catch {}

    return processMultiUpload(req, res, {
      senderName,
      deviceId: senderDeviceId,
      clientIp,
      isAdmin: 0,
      logAction: 'UPLOAD_FILE',
    });
  }

  return false;
}
