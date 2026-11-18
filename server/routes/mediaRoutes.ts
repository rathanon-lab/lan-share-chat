import fs from 'fs';
import path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import {
  MAX_CHAT_FILES_BATCH,
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_FILE_SIZE_MB,
  chunkStagingDir,
  legacyUploadsDir,
  upload,
  uploadsDir,
} from '../config';
import {
  checkClientRestriction,
  getSystemSettings,
  incrementTelemetryCounter,
  logActivity,
  recordMediaEgressBytes,
  saveUploadedFile,
} from '../../src/lib/db';
import {
  MediaTokenPayload,
  createStreamTicket,
  decryptMediaToken,
  encryptMediaToken,
  verifyStreamTicket,
} from '../../src/lib/crypto';
import { parseDevicePlatform } from '../../src/lib/deviceMeta';
import { sanitizeDownloadFileName, validateUploadFileName } from '../../src/lib/fileNameGuard';
import { checkUploadDiskGuard, moveFileAcrossZones } from '../utils/storageRuntime';
import {
  isAuthorizedAdminToken,
  jsonErr,
  jsonOk,
  parseJsonBody,
  resolveClientIp,
  saveAndBroadcastMessage,
} from '../state';
import { enforceChatGuard } from '../security';
import { getOrCreateCompatPreviewVideo, getOrCreateMediaThumbnail } from '../utils/ffmpegCompat';

export function resolveMediaFilePath(storedName: string): string | null {
  const safeStoredName = path.basename(storedName);
  const primary = path.join(uploadsDir, safeStoredName);
  if (fs.existsSync(primary)) return primary;
  const fallback = path.join(legacyUploadsDir, safeStoredName);
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

export function streamFileWithRange(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentType: string,
  originalName: string
) {
  const stat = fs.statSync(filePath);
  const baseHeaders: Record<string, string | number> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Original-Filename': encodeURIComponent(sanitizeDownloadFileName(originalName)),
  };

  if (stat.size === 0) {
    res.writeHead(200, { ...baseHeaders, 'Content-Length': 0 });
    res.end();
    return;
  }

  const rangeHeader = req.headers.range;
  let start = 0;
  let end = stat.size - 1;
  let statusCode = 200;

  if (typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.replace('bytes=', '').split('-');
    const parsedStart = parseInt(parts[0], 10);
    const parsedEnd = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    if (!Number.isNaN(parsedStart) && parsedStart >= 0 && parsedStart < stat.size) {
      start = parsedStart;
      end = !Number.isNaN(parsedEnd) && parsedEnd >= start ? Math.min(parsedEnd, stat.size - 1) : stat.size - 1;
      statusCode = 206;
      baseHeaders['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    } else if (!Number.isNaN(parsedStart) && parsedStart >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
  }

  baseHeaders['Content-Length'] = end - start + 1;
  res.writeHead(statusCode, baseHeaders);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  recordMediaEgressBytes(end - start + 1).catch(() => {});
  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', () => {
    if (!res.headersSent) jsonErr(res, 500, 'Failed to read media file');
    else res.destroy();
  });
  res.on('close', () => {
    if (!stream.destroyed) stream.destroy();
  });
  stream.pipe(res);
}

export function streamMediaPayload(req: IncomingMessage, res: ServerResponse, payload: MediaTokenPayload) {
  const safeStoredName = path.basename(payload.f);
  const filePath = resolveMediaFilePath(safeStoredName);
  if (!filePath) {
    return jsonErr(res, 404, 'Media file not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.heic': 'image/heic', '.heif': 'image/heif', '.avif': 'image/avif',
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4a': 'audio/mp4',
    '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf', '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.md': 'text/markdown; charset=utf-8',
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml', '.json': 'application/json',
    '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  };
  const contentType = payload.m || mimeMap[ext] || 'application/octet-stream';
  return streamFileWithRange(req, res, filePath, contentType, payload.n || safeStoredName);
}

export async function handleEncryptedMediaFetch(req: IncomingMessage, res: ServerResponse) {
  const deviceId = (req.headers['x-device-id'] as string) || '';
  const adminToken = (req.headers['x-admin-token'] as string) || '';
  if (!deviceId && !isAuthorizedAdminToken(adminToken)) {
    return jsonErr(res, 401, 'Missing device or admin authentication header');
  }

  const body = await parseJsonBody(req);
  const token = body?.token;
  if (!token || typeof token !== 'string') {
    return jsonErr(res, 400, 'Missing encrypted media token');
  }

  const payload = decryptMediaToken(token);
  if (!payload) {
    return jsonErr(res, 403, 'Invalid or tampered media token');
  }
  return streamMediaPayload(req, res, payload);
}

export async function handleEncryptedMediaThumb(req: IncomingMessage, res: ServerResponse) {
  const deviceId = (req.headers['x-device-id'] as string) || '';
  const adminToken = (req.headers['x-admin-token'] as string) || '';
  if (!deviceId && !isAuthorizedAdminToken(adminToken)) {
    return jsonErr(res, 401, 'Missing device or admin authentication header');
  }

  const body = await parseJsonBody(req);
  const token = body?.token;
  if (!token || typeof token !== 'string') {
    return jsonErr(res, 400, 'Missing encrypted media token');
  }

  const payload = decryptMediaToken(token);
  if (!payload) {
    return jsonErr(res, 403, 'Invalid or tampered media token');
  }

  const safeStoredName = path.basename(payload.f);
  const filePath = resolveMediaFilePath(safeStoredName);
  if (!filePath) {
    return jsonErr(res, 404, 'Media file not found');
  }

  const mime = String(payload.m || '').toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = mime.startsWith('video/') || /\.(mp4|m4v|mov|avi|mkv|webm)$/i.test(ext);
  const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/i.test(ext);
  if (!isVideo && !isImage) {
    res.writeHead(204);
    res.end();
    return;
  }

  const thumbPath = await getOrCreateMediaThumbnail(filePath, safeStoredName, isVideo);
  if (!thumbPath) {
    res.writeHead(204);
    res.end();
    return;
  }

  const thumbContentType = thumbPath.endsWith('.jpg') ? 'image/jpeg' : payload.m || 'image/jpeg';
  return streamFileWithRange(req, res, thumbPath, thumbContentType, payload.n || safeStoredName);
}

export async function handleCreateStreamTicket(req: IncomingMessage, res: ServerResponse) {
  const deviceId = (req.headers['x-device-id'] as string) || '';
  const adminToken = (req.headers['x-admin-token'] as string) || '';
  if (!deviceId && !isAuthorizedAdminToken(adminToken)) {
    return jsonErr(res, 401, 'Missing device or admin authentication header');
  }
  const body = await parseJsonBody(req);
  const token = body?.token;
  if (!token || typeof token !== 'string') {
    return jsonErr(res, 400, 'Missing media token');
  }
  const payload = decryptMediaToken(token);
  if (!payload) {
    return jsonErr(res, 403, 'Invalid or tampered media token');
  }
  const ticket = createStreamTicket(payload, 15 * 60 * 1000);
  return jsonOk(res, { ticket, streamUrl: `/api/media/stream?t=${encodeURIComponent(ticket)}` });
}

export async function handleStreamGet(
  req: IncomingMessage,
  res: ServerResponse,
  query: Record<string, string | string[] | undefined>
) {
  const ticket = typeof query.t === 'string' ? query.t : '';
  if (!ticket) return jsonErr(res, 401, 'Missing stream ticket');
  const payload = verifyStreamTicket(ticket);
  if (!payload) return jsonErr(res, 403, 'Invalid or expired stream ticket');

  if (query.compat === '1') {
    const safeStoredName = path.basename(payload.f);
    const origPath = resolveMediaFilePath(safeStoredName);
    if (!origPath) return jsonErr(res, 404, 'Media file not found');
    const compatPath = await getOrCreateCompatPreviewVideo(origPath, safeStoredName);
    if (compatPath) {
      return streamFileWithRange(req, res, compatPath, 'video/mp4', payload.n || safeStoredName);
    }
  }

  return streamMediaPayload(req, res, payload);
}

export async function processMultiUpload(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { senderName: string; deviceId: string; clientIp: string; isAdmin: number; logAction: string }
): Promise<boolean> {
  if (!opts.isAdmin) {
    const guard = await enforceChatGuard({
      deviceId: opts.deviceId,
      ip: opts.clientIp,
      senderName: opts.senderName,
    });
    if (!guard.allowed) {
      jsonErr(res, guard.code === 'RATE_LIMIT' ? 429 : 403, guard.message || 'Upload blocked');
      return true;
    }
  }
  const declaredBytes = parseInt(String(req.headers['content-length'] || '0'), 10) || 0;
  const diskCheck = checkUploadDiskGuard(declaredBytes);
  if (!diskCheck.ok) {
    jsonErr(res, 507, diskCheck.error || 'Insufficient storage space');
    return true;
  }
  req.setTimeout(0);
  const uploadAny = upload.any();
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (val: boolean) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    req.on('aborted', () => {
      // @ts-expect-error Multer attaches req.files
      const partial: Express.Multer.File[] = req.files || [];
      for (const f of partial) {
        try {
          if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
        } catch {}
      }
      finish(true);
    });

    // @ts-expect-error Multer middleware signature works with IncomingMessage/ServerResponse
    uploadAny(req, res, async (err: { code?: string; message?: string } | null) => {
      if (err) {
        // @ts-expect-error Multer attaches req.files
        const partial: Express.Multer.File[] = req.files || [];
        for (const f of partial) {
          try {
            if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
          } catch {}
        }
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? `File size exceeds limit (${MAX_CHAT_FILE_SIZE_MB}MB per file)`
            : err.message || 'Upload failed';
        if (!res.headersSent) jsonErr(res, status, msg);
        return finish(true);
      }
      // @ts-expect-error Multer attaches req.files/req.file
      const uploadedFiles: Express.Multer.File[] = req.files || (req.file ? [req.file] : []);
      if (!uploadedFiles || uploadedFiles.length === 0) {
        if (!res.headersSent) jsonErr(res, 400, 'No files uploaded');
        return finish(true);
      }

      let caption = '';
      try {
        // @ts-expect-error Multer attaches req.body
        caption = req.body && req.body.caption ? String(req.body.caption).trim() : '';
      } catch {}

      try {
        const attachments: Array<{
          fileId: number;
          fileName: string;
          fileSize: number;
          mimeType: string;
          mediaToken: string;
        }> = [];
        for (const file of uploadedFiles) {
          let originalName = file.originalname;
          try {
            const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
            if (!decoded.includes('\ufffd')) originalName = decoded;
          } catch {}

          const nameCheck = validateUploadFileName(originalName);
          if (!nameCheck.valid) {
            for (const f of uploadedFiles) {
              try {
                if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
              } catch {}
            }
            if (!res.headersSent) jsonErr(res, 400, nameCheck.reason || 'Invalid file name');
            return finish(true);
          }

          const fileRecordId = await saveUploadedFile({
            sender: opts.senderName,
            deviceId: opts.deviceId,
            senderIp: opts.clientIp,
            originalName,
            storedName: file.filename,
            mimeType: file.mimetype,
            fileSize: file.size,
          });

          const mediaToken = encryptMediaToken({
            storedName: file.filename,
            originalName,
            mimeType: file.mimetype,
          });

          attachments.push({
            fileId: fileRecordId,
            fileName: originalName,
            fileSize: file.size,
            mimeType: file.mimetype,
            mediaToken,
          });
        }

        const first = attachments[0];
        const isVoice = attachments.length === 1 && String(first.mimeType || '').startsWith('audio/');
        const settings = await getSystemSettings();
        if (!opts.isAdmin && isVoice && String(req.headers['x-voice-recording'] || '') === '1' && !settings.voiceMessageEnabled) {
          jsonErr(res, 403, 'Voice messaging is currently disabled by administrator');
          return finish(true);
        }

        const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const msg = {
          sender: opts.senderName,
          text: caption,
          type: isVoice && String(req.headers['x-voice-recording'] || '') === '1' ? 'audio' : 'file',
          fileName: first.fileName,
          fileSize: first.fileSize,
          mimeType: first.mimeType,
          mediaToken: first.mediaToken,
          attachments,
          time,
          status: 'delivered',
          isAdmin: opts.isAdmin,
        };

        const { savedId } = await saveAndBroadcastMessage(msg, opts.deviceId);
        const totalBytes = attachments.reduce((sum, a) => sum + a.fileSize, 0);
        incrementTelemetryCounter('upload', attachments.length, totalBytes).catch(() => {});

        const uaMeta = parseDevicePlatform(String(req.headers['user-agent'] || ''));
        await logActivity(
          opts.logAction,
          opts.isAdmin ? 'admin' : opts.senderName,
          opts.clientIp,
          `[${uaMeta.summary}] Uploaded ${attachments.length} file(s): ${attachments.map((a) => a.fileName).join(', ')} (${totalBytes} bytes)`
        );

        jsonOk(res, {
          success: true,
          messageId: savedId,
          count: attachments.length,
          attachments,
        });
      } catch (saveErr: unknown) {
        if (!res.headersSent) {
          jsonErr(res, 500, saveErr instanceof Error ? saveErr.message : 'Failed to persist upload');
        }
      }
      finish(true);
    });
  });
}

interface ChunkSession {
  uploadId: string;
  fileName: string;
  mimeType: string;
  totalSize: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  tempPath: string;
  storedName: string;
  createdAt: number;
}

const chunkSessions = new Map<string, ChunkSession>();

// Periodically evict abandoned chunk sessions older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [uid, sess] of chunkSessions.entries()) {
    if (sess.createdAt < cutoff) {
      chunkSessions.delete(uid);
      try {
        if (fs.existsSync(sess.tempPath)) fs.unlinkSync(sess.tempPath);
      } catch {}
    }
  }
}, 10 * 60 * 1000).unref();

function readBinaryChunk(req: IncomingMessage, maxChunkBytes = 10 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    req.setTimeout(0);
    const parts: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxChunkBytes) {
        req.destroy();
        reject(new Error('Chunk exceeds maximum slice size'));
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Client aborted chunk transfer')));
  });
}

export async function handleChunkUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const adminToken = (req.headers['x-admin-token'] as string) || '';
    if (!isAuthorizedAdminToken(adminToken)) {
      const clientIp = resolveClientIp(req);
      const deviceId = String(req.headers['x-device-id'] || '').trim();
      const settings = await getSystemSettings();
      if (settings.chatLocked) {
        jsonErr(res, 423, 'ขณะนี้ Admin ปิดการส่งชั่วคราวเพื่อตรวจสอบระบบ');
        return;
      }
      const restriction = await checkClientRestriction(deviceId, clientIp);
      if (restriction.isBanned || restriction.isMuted) {
        jsonErr(res, 403, restriction.reason || 'อุปกรณ์ของคุณถูกระงับการส่งชั่วคราว');
        return;
      }
    }
    const uploadId = String(req.headers['x-upload-id'] || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const chunkIndex = parseInt(String(req.headers['x-chunk-index'] || '0'), 10);
    const totalChunks = parseInt(String(req.headers['x-total-chunks'] || '1'), 10);
    const totalSize = parseInt(String(req.headers['x-file-size'] || '0'), 10);
    const rawName = String(req.headers['x-file-name'] || 'file.bin');
    let fileName = rawName;
    try {
      fileName = decodeURIComponent(rawName);
    } catch {}
    const mimeType = String(req.headers['x-mime-type'] || 'application/octet-stream');

    if (!uploadId || Number.isNaN(chunkIndex) || chunkIndex < 0 || totalChunks < 1 || chunkIndex >= totalChunks) {
      jsonErr(res, 400, 'Invalid chunk upload metadata');
      return;
    }
    const nameCheck = validateUploadFileName(fileName);
    if (!nameCheck.valid) {
      jsonErr(res, 400, nameCheck.reason || 'Invalid file name');
      return;
    }
    if (totalSize > MAX_CHAT_FILE_BYTES) {
      jsonErr(res, 413, `File "${fileName}" exceeds limit of ${MAX_CHAT_FILE_SIZE_MB}MB`);
      return;
    }
    const diskCheck = checkUploadDiskGuard(chunkIndex === 0 ? totalSize : 0, 'uploads');
    if (!diskCheck.ok) {
      jsonErr(res, 507, diskCheck.error || 'Insufficient storage space');
      return;
    }
    if (chunkIndex === 0) {
      const chunkZoneCheck = checkUploadDiskGuard(totalSize, 'chunks');
      if (!chunkZoneCheck.ok) {
        jsonErr(res, 507, chunkZoneCheck.error || 'Chunk staging storage quota exceeded');
        return;
      }
    }

    const buf = await readBinaryChunk(req);
    let session = chunkSessions.get(uploadId);
    if (!session) {
      const ext = path.extname(path.basename(fileName));
      const storedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const tempPath = path.join(chunkStagingDir, `${uploadId}.part`);
      session = {
        uploadId,
        fileName: path.basename(fileName) || 'file.bin',
        mimeType,
        totalSize,
        totalChunks,
        receivedChunks: new Set<number>(),
        tempPath,
        storedName,
        createdAt: Date.now(),
      };
      chunkSessions.set(uploadId, session);
    }

    if (!session.receivedChunks.has(chunkIndex)) {
      await fs.promises.appendFile(session.tempPath, buf);
      session.receivedChunks.add(chunkIndex);
    }

    jsonOk(res, {
      ok: true,
      uploadId,
      chunkIndex,
      receivedCount: session.receivedChunks.size,
      totalChunks: session.totalChunks,
    });
  } catch (err: unknown) {
    if (!res.headersSent) jsonErr(res, 500, err instanceof Error ? err.message : 'Chunk write error');
  }
}

export async function handleChunkComplete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req);
  const uploadIds: string[] = Array.isArray(body.uploadIds) ? body.uploadIds : [];
  if (uploadIds.length === 0 || uploadIds.length > MAX_CHAT_FILES_BATCH) {
    jsonErr(res, 400, `Batch must contain 1-${MAX_CHAT_FILES_BATCH} uploadIds`);
    return;
  }

  const isAdminReq = Boolean(body.isAdmin);
  const adminToken = (req.headers['x-admin-token'] as string) || '';
  if (isAdminReq && !isAuthorizedAdminToken(adminToken)) {
    jsonErr(res, 401, 'Unauthorized admin chunk completion');
    return;
  }

  const clientIp = resolveClientIp(req);
  const deviceId = isAdminReq ? 'admin' : (req.headers['x-device-id'] as string) || 'unknown';
  const rawSender = (req.headers['x-sender-name'] as string) || (isAdminReq ? '[Admin]' : 'Unknown');
  let senderName = rawSender;
  try {
    senderName = decodeURIComponent(rawSender);
  } catch {}
  if (isAdminReq) senderName = '[Admin]';

  if (!isAdminReq) {
    const guard = await enforceChatGuard({
      deviceId,
      ip: clientIp,
      senderName,
      text: body.caption ? String(body.caption).trim() : '',
    });
    if (!guard.allowed) {
      jsonErr(res, guard.code === 'RATE_LIMIT' ? 429 : 403, guard.message || 'Upload blocked');
      return;
    }
  }

  const attachments: Array<{
    fileId: number;
    fileName: string;
    fileSize: number;
    mimeType: string;
    mediaToken: string;
  }> = [];
  for (const uid of uploadIds) {
    const session = chunkSessions.get(uid);
    if (!session || session.receivedChunks.size < session.totalChunks || !fs.existsSync(session.tempPath)) {
      jsonErr(res, 400, `Incomplete chunk session: ${uid}`);
      return;
    }

    const finalPath = path.join(uploadsDir, session.storedName);
    await moveFileAcrossZones(session.tempPath, finalPath);
    const stat = await fs.promises.stat(finalPath);
    if (stat.size > MAX_CHAT_FILE_BYTES) {
      await fs.promises.unlink(finalPath).catch(() => {});
      chunkSessions.delete(uid);
      jsonErr(res, 413, `File "${session.fileName}" exceeds ${MAX_CHAT_FILE_SIZE_MB}MB`);
      return;
    }

    const fileRecordId = await saveUploadedFile({
      sender: senderName,
      deviceId,
      senderIp: clientIp,
      originalName: session.fileName,
      storedName: session.storedName,
      mimeType: session.mimeType,
      fileSize: stat.size,
    });

    const mediaToken = encryptMediaToken({
      storedName: session.storedName,
      originalName: session.fileName,
      mimeType: session.mimeType,
    });

    attachments.push({
      fileId: fileRecordId,
      fileName: session.fileName,
      fileSize: stat.size,
      mimeType: session.mimeType,
      mediaToken,
    });
    chunkSessions.delete(uid);
  }

  const caption = body.caption ? String(body.caption).trim() : '';
  const first = attachments[0];
  const isVoice =
    attachments.length === 1 && String(first.mimeType || '').startsWith('audio/') && Boolean(body.isVoiceRecording);
  const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const msg = {
    sender: senderName,
    text: caption,
    type: isVoice ? 'audio' : 'file',
    fileName: first.fileName,
    fileSize: first.fileSize,
    mimeType: first.mimeType,
    mediaToken: first.mediaToken,
    attachments,
    time,
    status: 'delivered',
    isAdmin: isAdminReq ? 1 : 0,
  };

  const { savedId } = await saveAndBroadcastMessage(msg, deviceId);
  const totalBytes = attachments.reduce((sum, a) => sum + a.fileSize, 0);
  incrementTelemetryCounter('upload', attachments.length, totalBytes).catch(() => {});

  const uaMeta = parseDevicePlatform(String(req.headers['user-agent'] || ''));
  await logActivity(
    isAdminReq ? 'ADMIN_UPLOAD_FILE' : 'UPLOAD_FILE',
    isAdminReq ? 'admin' : senderName,
    clientIp,
    `[${uaMeta.summary}] Chunked upload ${attachments.length} file(s): ${attachments.map((a) => a.fileName).join(', ')} (${totalBytes} bytes)`
  );

  jsonOk(res, { success: true, messageId: savedId, count: attachments.length, attachments });
}
