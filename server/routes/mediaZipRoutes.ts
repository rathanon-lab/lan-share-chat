import crypto from 'crypto';
import fs from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import { decryptMediaToken } from '../../src/lib/crypto';
import { isAuthorizedAdminToken, jsonErr, jsonOk, parseJsonBody } from '../state';
import { resolveMediaFilePath } from './mediaRoutes';
import { ZipSourceEntry, streamFilesAsZip } from '../utils/zipStream';

interface ZipTicketRecord {
  entries: ZipSourceEntry[];
  zipName: string;
  exp: number;
}

const zipTicketStore = new Map<string, ZipTicketRecord>();
const MAX_ZIP_TOKENS = 50;
const ZIP_TICKET_TTL_MS = 5 * 60 * 1000;

function pruneExpiredZipTickets() {
  const now = Date.now();
  for (const [k, rec] of zipTicketStore.entries()) {
    if (rec.exp <= now) zipTicketStore.delete(k);
  }
  while (zipTicketStore.size > 300) {
    const oldestKey = zipTicketStore.keys().next().value;
    if (!oldestKey) break;
    zipTicketStore.delete(oldestKey);
  }
}

function sanitizeZipDownloadName(rawName?: unknown): string {
  const base = String(rawName || 'lan-share-bundle.zip')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .trim();
  if (!base) return 'lan-share-bundle.zip';
  return base.toLowerCase().endsWith('.zip') ? base : `${base}.zip`;
}

function resolveEntriesFromTokens(rawTokens: unknown): { entries?: ZipSourceEntry[]; err?: string; code?: number } {
  if (!Array.isArray(rawTokens) || rawTokens.length === 0) {
    return { err: 'Missing media tokens list', code: 400 };
  }
  if (rawTokens.length > MAX_ZIP_TOKENS) {
    return { err: `Too many files in one ZIP (max ${MAX_ZIP_TOKENS})`, code: 400 };
  }

  const entries: ZipSourceEntry[] = [];
  for (const raw of rawTokens) {
    if (typeof raw !== 'string' || !raw) {
      return { err: 'Invalid media token in list', code: 400 };
    }
    const payload = decryptMediaToken(raw);
    if (!payload) {
      return { err: 'Invalid or tampered media token', code: 403 };
    }
    const filePath = resolveMediaFilePath(payload.f);
    if (!filePath) continue;
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      entries.push({
        filePath,
        fileName: payload.n || payload.f,
        fileSize: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      // Skip unreadable file entry
    }
  }

  if (entries.length === 0) {
    return { err: 'No downloadable files found', code: 404 };
  }
  return { entries };
}

function sendZipHeaders(res: ServerResponse, zipName: string) {
  const fallbackAscii = zipName.replace(/[^\x20-\x7e]/g, '_');
  const encodedUtf8 = encodeURIComponent(zipName);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${fallbackAscii}"; filename*=UTF-8''${encodedUtf8}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

function checkCallerAuth(req: IncomingMessage): boolean {
  const deviceId = (req.headers['x-device-id'] as string) || '';
  const adminToken = (req.headers['x-admin-token'] as string) || '';
  return Boolean(deviceId || isAuthorizedAdminToken(adminToken));
}

export async function handleCreateZipTicket(req: IncomingMessage, res: ServerResponse) {
  if (!checkCallerAuth(req)) {
    return jsonErr(res, 401, 'Missing device or admin authentication header');
  }

  const body = await parseJsonBody(req);
  const resolved = resolveEntriesFromTokens(body?.tokens);
  if (!resolved.entries) {
    return jsonErr(res, resolved.code || 400, resolved.err || 'Invalid zip request');
  }

  pruneExpiredZipTickets();
  const ticket = crypto.randomBytes(24).toString('hex');
  const zipName = sanitizeZipDownloadName(body?.zipName);
  zipTicketStore.set(ticket, {
    entries: resolved.entries,
    zipName,
    exp: Date.now() + ZIP_TICKET_TTL_MS,
  });

  const totalBytes = resolved.entries.reduce((sum, e) => sum + e.fileSize, 0);
  return jsonOk(res, {
    ticket,
    downloadUrl: `/api/media/download-zip?t=${encodeURIComponent(ticket)}`,
    fileCount: resolved.entries.length,
    totalBytes,
  });
}

export async function handleDownloadZipGet(
  req: IncomingMessage,
  res: ServerResponse,
  query: Record<string, unknown>
) {
  const ticket = typeof query.t === 'string' ? query.t : '';
  if (!ticket) return jsonErr(res, 401, 'Missing zip ticket');

  pruneExpiredZipTickets();
  const record = zipTicketStore.get(ticket);
  if (!record || record.exp <= Date.now()) {
    return jsonErr(res, 403, 'Invalid or expired zip ticket');
  }

  sendZipHeaders(res, record.zipName);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  try {
    await streamFilesAsZip(res, record.entries);
  } catch {
    if (!res.headersSent) jsonErr(res, 500, 'Failed to stream ZIP archive');
    else if (!res.destroyed) res.destroy();
  }
}

export async function handleDownloadZipPost(req: IncomingMessage, res: ServerResponse) {
  if (!checkCallerAuth(req)) {
    return jsonErr(res, 401, 'Missing device or admin authentication header');
  }

  const body = await parseJsonBody(req);
  const resolved = resolveEntriesFromTokens(body?.tokens);
  if (!resolved.entries) {
    return jsonErr(res, resolved.code || 400, resolved.err || 'Invalid zip request');
  }

  const zipName = sanitizeZipDownloadName(body?.zipName);
  sendZipHeaders(res, zipName);
  try {
    await streamFilesAsZip(res, resolved.entries);
  } catch {
    if (!res.headersSent) jsonErr(res, 500, 'Failed to stream ZIP archive');
    else if (!res.destroyed) res.destroy();
  }
}
