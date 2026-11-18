import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import {
  saveDeviceProfile,
  saveMessage,
  getDeviceProfile,
  getSystemSettings,
  createAdminAlert,
  sanitizeMessageForClient,
  incrementTelemetryCounter,
} from '../src/lib/db';
import {
  ANIMAL_AVATAR_PRESETS,
  resolveFallbackAvatarForName,
} from '../src/lib/avatars';
import { ADMIN_PASSWORD, avatarsDir } from './config';
import { checkUploadDiskGuard } from './utils/storageRuntime';

export const SERVER_STARTED_AT = Date.now();
export const clients = new Map<string, any>();

let ioInstance: SocketIOServer | null = null;
let activeHttpsPortVal: number | null = null;
let cachedCaCertPemVal: string | null = null;

export function setIoRef(io: SocketIOServer) {
  ioInstance = io;
}
export function getIoRef(): SocketIOServer | null {
  return ioInstance;
}

export function setTlsRuntimeInfo(httpsPort: number | null, caPem: string | null) {
  activeHttpsPortVal = httpsPort;
  cachedCaCertPemVal = caPem;
}
export function getActiveHttpsPort(): number | null {
  return activeHttpsPortVal;
}
export function getCachedCaCertPem(): string | null {
  return cachedCaCertPemVal;
}

export function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0';
}

export function generateRandomName(): string {
  const pick = ANIMAL_AVATAR_PRESETS[Math.floor(Math.random() * ANIMAL_AVATAR_PRESETS.length)];
  return pick.name + '_' + Math.floor(100 + Math.random() * 900);
}

export function saveBase64AvatarToStorage(prefix: string, imageDataUrl: string): string {
  const match = String(imageDataUrl || '').match(/^data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('รองรับเฉพาะไฟล์ภาพ WebP, PNG หรือ JPEG เท่านั้น');
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length === 0 || buf.length > 700 * 1024) {
    throw new Error('ขนาดรูปโปรไฟล์ที่ตัดแล้วต้องไม่เกิน 700KB');
  }
  const diskCheck = checkUploadDiskGuard(buf.length, 'avatars');
  if (!diskCheck.ok) {
    throw new Error(diskCheck.error || 'พื้นที่จัดเก็บรูปโปรไฟล์เต็มแล้ว');
  }
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'user';
  const fileName = `${safePrefix}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(avatarsDir, fileName), buf);
  return `/api/avatar/${fileName}`;
}

export function hasAdminMention(text?: string | null): boolean {
  if (!text) return false;
  return /(^|\s)@admin(\b|$)|(^|\s)#help(\b|$)/i.test(text);
}

export interface ActiveAdminSession {
  token: string;
  clientId: string;
  deviceId: string;
  ip: string;
  loginAt: number;
}

let currentAdminSession: ActiveAdminSession | null = null;
const revokedAdminTokens = new Set<string>();

export function issueAdminSessionToken(params: { clientId?: string; deviceId?: string; ip: string }): string {
  const clientId = String(params.clientId || '').trim();
  if (!clientId) {
    return Buffer.from('admin:' + ADMIN_PASSWORD).toString('base64');
  }
  const nextToken = `adm_sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  if (currentAdminSession && currentAdminSession.token !== nextToken) {
    revokedAdminTokens.add(currentAdminSession.token);
    if (ioInstance) {
      ioInstance.emit('admin_session_kicked', {
        replacedToken: currentAdminSession.token,
        replacedClientId: currentAdminSession.clientId,
        newClientId: clientId,
        newIp: params.ip,
        timestamp: Date.now(),
      });
    }
  }
  currentAdminSession = {
    token: nextToken,
    clientId,
    deviceId: String(params.deviceId || '').trim(),
    ip: params.ip,
    loginAt: Date.now(),
  };
  return nextToken;
}

export function clearActiveAdminSession(token?: string) {
  if (!currentAdminSession) return;
  if (!token || currentAdminSession.token === token) {
    revokedAdminTokens.add(currentAdminSession.token);
    currentAdminSession = null;
  }
}

export function getActiveAdminSession(): ActiveAdminSession | null {
  return currentAdminSession;
}

export function isRevokedAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  if (revokedAdminTokens.has(token)) return true;
  if (token.startsWith('adm_sess_') && (!currentAdminSession || currentAdminSession.token !== token)) {
    return true;
  }
  return false;
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function isAuthorizedAdminToken(token: string | undefined): boolean {
  if (!ADMIN_PASSWORD || !token) return false;
  if (token.startsWith('adm_sess_')) {
    return Boolean(currentAdminSession && timingSafeEqualStr(currentAdminSession.token, token));
  }
  const legacyExpected = Buffer.from('admin:' + ADMIN_PASSWORD).toString('base64');
  return timingSafeEqualStr(token, legacyExpected);
}

export function getPublicHost(fallbackIp: string): string {
  const configured = (process.env.PUBLIC_HOST || process.env.HOST_LAN_IP || '').trim();
  return configured || fallbackIp;
}

export function normalizeClientIp(
  rawHeader: string | string[] | undefined,
  socketRemote: string | undefined,
  hostIp: string
): string {
  const firstForwarded = Array.isArray(rawHeader)
    ? rawHeader[0]
    : typeof rawHeader === 'string'
      ? rawHeader.split(',')[0].trim()
      : '';
  let clientIp = (firstForwarded || socketRemote || '127.0.0.1').trim();
  if (clientIp.includes('::ffff:')) {
    clientIp = clientIp.split('::ffff:')[1];
  }
  if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === hostIp) {
    return hostIp !== '0.0.0.0' ? hostIp : '127.0.0.1';
  }
  return clientIp;
}

export function resolveClientIp(req: IncomingMessage): string {
  return normalizeClientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, getLocalIp());
}

export function getGroupedPeers(clientsMap: Map<string, any>) {
  const deviceCounts: Record<string, number> = {};
  clientsMap.forEach((client) => {
    const key = client.deviceId || client.ip;
    deviceCounts[key] = (deviceCounts[key] || 0) + 1;
  });

  const uniquePeersMap = new Map<string, any>();
  clientsMap.forEach((client) => {
    const key = client.deviceId || client.ip;
    if (!uniquePeersMap.has(key)) {
      uniquePeersMap.set(key, {
        id: client.id,
        deviceId: client.deviceId,
        name: client.name,
        avatarUrl: client.avatarUrl || resolveFallbackAvatarForName(client.name),
        os: client.os || 'Unknown',
        browser: client.browser || 'Browser',
        ip: client.ip,
        tabCount: deviceCounts[key],
        status: client.status || 'online',
      });
    }
  });
  return Array.from(uniquePeersMap.values());
}

export function getPresenceMap(clientsMap: Map<string, any>): Record<string, string> {
  const result: Record<string, string> = {};
  clientsMap.forEach((client) => {
    const current = result[client.deviceId];
    const status = client.status || 'online';
    if (!current || status === 'online' || (status === 'idle' && current === 'offline')) {
      result[client.deviceId] = status;
    }
  });
  return result;
}

export function parseJsonBody(req: IncomingMessage, maxBytes = 2 * 1024 * 1024): Promise<any> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({}), 8000);
    let body = '';
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        aborted = true;
        clearTimeout(timeout);
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      if (aborted) return;
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => {
      clearTimeout(timeout);
      resolve({});
    });
  });
}

export function jsonOk(res: ServerResponse, data: any) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function jsonErr(res: ServerResponse, code: number, msg: string) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: msg }));
}

export async function saveAndBroadcastMessage(rawMsg: any, senderDeviceId: string) {
  const io = getIoRef();
  const mentionAdmin = !rawMsg.isAdmin && hasAdminMention(rawMsg.text) ? 1 : 0;
  const createdAt = rawMsg.createdAt || Date.now();
  const msgToSave = {
    ...rawMsg,
    senderDeviceId,
    createdAt,
    mentionAdmin,
  };
  const savedId = await saveMessage(msgToSave);
  incrementTelemetryCounter('message').catch(() => {});
  const [deviceProfile, settings] = await Promise.all([
    !rawMsg.isAdmin && senderDeviceId ? getDeviceProfile(senderDeviceId) : Promise.resolve(null),
    getSystemSettings(),
  ]);
  const clientSafeMsg = sanitizeMessageForClient({ ...msgToSave, id: savedId });
  clientSafeMsg.senderAvatarUrl = rawMsg.isAdmin
    ? settings.adminAvatarUrl
    : deviceProfile?.avatarUrl || resolveFallbackAvatarForName(rawMsg.sender);
  clientSafeMsg.senderOs = rawMsg.isAdmin
    ? 'Admin'
    : deviceProfile?.os && deviceProfile.os !== 'Unknown'
      ? deviceProfile.os
      : undefined;
  clientSafeMsg.senderStatus = 'active';
  if (io) io.emit('receive_message', clientSafeMsg);

  if (mentionAdmin) {
    const preview = String(rawMsg.text || rawMsg.fileName || '').slice(0, 140);
    const alert = await createAdminAlert({
      alertType: 'mention_admin',
      messageId: savedId,
      sender: rawMsg.sender || 'Unknown',
      deviceId: senderDeviceId || 'unknown',
      previewText: preview,
      reason: 'มีการกล่าวถึง @admin ในห้องแชท',
    });
    if (io && alert) io.emit('admin_alert', alert);
  }
  return { savedId, clientSafeMsg };
}

export async function applyDeviceRename(deviceId: string, newName: string, newAvatarUrl?: string) {
  const io = getIoRef();
  const saved = await saveDeviceProfile(deviceId, {
    name: newName,
    ...(newAvatarUrl ? { avatarUrl: newAvatarUrl } : {}),
  });
  for (const [sockId, client] of clients.entries()) {
    if (client.deviceId === deviceId) {
      client.name = saved.name;
      client.avatarUrl = saved.avatarUrl;
      clients.set(sockId, client);
      if (io) {
        io.to(sockId).emit('identity', {
          deviceId,
          name: saved.name,
          avatarUrl: saved.avatarUrl,
          os: saved.os,
          browser: saved.browser,
          ip: client.ip,
          socketId: sockId,
        });
      }
    }
  }
  if (io) {
    io.emit('peers_update', getGroupedPeers(clients));
    io.emit('device_profile_updated', { deviceId, name: saved.name, avatarUrl: saved.avatarUrl });
  }
}
