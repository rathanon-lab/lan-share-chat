import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import {
  checkClientRestriction,
  findExistingDeviceByIpAndOs,
  getAllMessages,
  getDeviceProfile,
  getStickerPacksWithItems,
  getSystemSettings,
  isDeviceDeleted,
  logActivity,
  markMessagesReadUpTo,
  pickUnusedAnimalPreset,
  recordOnlineTelemetry,
  saveDeviceProfile,
} from '../../src/lib/db';
import { isValidUserAvatarUrl, resolveFallbackAvatarForName } from '../../src/lib/avatars';
import { parseDevicePlatform } from '../../src/lib/deviceMeta';
import { validateUploadFileName } from '../../src/lib/fileNameGuard';
import { buildStickerDedupeKey, sanitizeStickerMeta } from '../../src/lib/stickerMeta';
import {
  applyDeviceRename,
  clients,
  getGroupedPeers,
  getLocalIp,
  normalizeClientIp,
  saveAndBroadcastMessage,
} from '../state';
import { enforceChatGuard, enforceP2pGuard } from '../security';

export function registerSocketHandlers(io: SocketIOServer) {
  const recentConnectLog = new Map<string, number>();

  io.on('connection', async (socket) => {
    // Admin console sockets subscribe only to moderation/chat broadcasts, not LAN peer discovery
    if (socket.handshake.auth?.isAdmin) {
      socket.join('admins');
      return;
    }

    const clientIp = normalizeClientIp(
      socket.handshake.headers['x-forwarded-for'],
      socket.conn.remoteAddress,
      getLocalIp()
    );
    const rawUserAgent = String(socket.handshake.headers['user-agent'] || '');
    const clientHint = typeof socket.handshake.query.clientHint === 'string' ? socket.handshake.query.clientHint : '';
    const platformInfo = parseDevicePlatform(rawUserAgent, clientHint);

    const queryDeviceId = typeof socket.handshake.query.deviceId === 'string' ? socket.handshake.query.deviceId.trim() : '';
    const incomingTabId = typeof socket.handshake.query.tabInstanceId === 'string' ? socket.handshake.query.tabInstanceId.trim() : '';
    const wasDeleted = queryDeviceId ? await isDeviceDeleted(queryDeviceId) : false;
    const settings = await getSystemSettings();
    const sessionPolicy = settings.sessionPolicy || 'takeover';
    const forceTakeover = socket.handshake.query.forceTakeover === '1';

    let deviceId =
      queryDeviceId && !wasDeleted
        ? queryDeviceId
        : 'id_' + crypto.randomBytes(5).toString('hex');

    const matchingOnlineSockets: Array<{ socketId: string; client: { deviceId?: string; browser?: string; name?: string; ip?: string; os?: string; tabInstanceId?: string } }> = [];
    const staleSameTabSockets: string[] = [];
    for (const [sid, c] of clients.entries()) {
      if (sid === socket.id) continue;
      const oldSock = io.sockets.sockets.get(sid);
      const isGhostOrSameTab = !oldSock?.connected || (Boolean(incomingTabId) && c.tabInstanceId === incomingTabId);
      const isSameDeviceOrHost =
        c.deviceId === deviceId ||
        (c.ip === clientIp && String(c.os || '') === String(platformInfo.os || ''));
      if (!isSameDeviceOrHost) continue;

      if (isGhostOrSameTab) {
        staleSameTabSockets.push(sid);
        if (!deviceId && c.deviceId) deviceId = c.deviceId;
      } else if (sessionPolicy !== 'multi_allow') {
        matchingOnlineSockets.push({ socketId: sid, client: c });
      }
    }

    for (const staleSid of staleSameTabSockets) {
      clients.delete(staleSid);
      io.sockets.sockets.get(staleSid)?.disconnect(true);
    }

    if (sessionPolicy !== 'multi_allow') {
      if (matchingOnlineSockets.length > 0 && matchingOnlineSockets[0].client?.deviceId) {
        deviceId = matchingOnlineSockets[0].client.deviceId;
      } else if (staleSameTabSockets.length === 0 && !queryDeviceId && platformInfo.os !== 'Unknown') {
        const existingForHost = await findExistingDeviceByIpAndOs(clientIp, platformInfo.os);
        if (existingForHost?.deviceId) {
          deviceId = existingForHost.deviceId;
        }
      }
    }

    const restriction = await checkClientRestriction(deviceId, clientIp);
    if (restriction.isBanned) {
      const existingProfile = await getDeviceProfile(deviceId);
      socket.emit('identity', {
        deviceId,
        name: existingProfile?.name || 'ถูกระงับการใช้งาน',
        avatarUrl: existingProfile?.avatarUrl || resolveFallbackAvatarForName(existingProfile?.name || 'Ban'),
        os: existingProfile?.os || platformInfo.os,
        browser: existingProfile?.browser || platformInfo.browser,
        ip: clientIp,
      });
      socket.emit('settings_update', settings);
      socket.emit('client_restricted', { banned: true, reason: restriction.reason });
      setTimeout(() => socket.disconnect(true), 250);
      return;
    }

    if (sessionPolicy !== 'multi_allow' && matchingOnlineSockets.length > 0) {
      if (sessionPolicy === 'block' && !forceTakeover) {
        const activePeer = matchingOnlineSockets[0].client;
        socket.emit('session_conflict', {
          mode: 'blocked',
          reason: 'เครื่องและ IP นี้กำลังใช้งานอยู่ในแท็บหรือหน้าต่างอื่นแล้ว (ไม่อนุญาตให้เปิดซ้อน / Incognito)',
          peerBrowser: activePeer?.browser || 'Browser',
        });
        setTimeout(() => socket.disconnect(true), 200);
        return;
      }

      for (const { socketId: oldSid } of matchingOnlineSockets) {
        io.to(oldSid).emit('session_conflict', {
          mode: 'taken_over',
          reason: 'มีการเปิดใช้งานบัญชีนี้จากแท็บ หน้าต่าง หรือเบราว์เซอร์อื่นบนเครื่องเดียวกัน',
          peerBrowser: platformInfo.browser,
        });
        clients.delete(oldSid);
        const oldSock = io.sockets.sockets.get(oldSid);
        setTimeout(() => oldSock?.disconnect(true), 120);
      }
    }

    if (!socket.connected) return;

    const maxConcurrent = Number(settings.maxConcurrentUsers || 0);
    if (maxConcurrent > 0) {
      const activeIds = new Set<string>();
      for (const [sid, c] of clients.entries()) {
        if (sid === socket.id || !c?.deviceId) continue;
        activeIds.add(String(c.deviceId));
      }
      if (!activeIds.has(deviceId) && activeIds.size >= maxConcurrent) {
        socket.emit('session_conflict', {
          mode: 'blocked',
          reason: `ห้องแชทเต็มชั่วคราว (ออนไลน์ครบโควตาสูงสุด ${maxConcurrent} เครื่องแล้ว กรุณาลองใหม่ภายหลัง)`,
          peerBrowser: 'Room Full',
        });
        setTimeout(() => socket.disconnect(true), 200);
        return;
      }
    }

    let profile = await getDeviceProfile(deviceId);
    if (!profile) {
      const preset = await pickUnusedAnimalPreset();
      profile = await saveDeviceProfile(deviceId, {
        name: preset.name,
        avatarUrl: preset.avatarUrl,
        os: platformInfo.os,
        browser: platformInfo.browser,
        userAgent: rawUserAgent.slice(0, 250),
        lastIp: clientIp,
        lastSeenAt: Date.now(),
      });
    } else {
      profile = await saveDeviceProfile(deviceId, {
        os: platformInfo.os,
        browser: platformInfo.browser,
        userAgent: rawUserAgent.slice(0, 250),
        lastIp: clientIp,
        lastSeenAt: Date.now(),
      });
    }

    const logKey = `${deviceId}|${clientIp}|${platformInfo.os}`;
    const lastLogged = recentConnectLog.get(logKey) || 0;
    if (Date.now() - lastLogged > 5 * 60 * 1000) {
      recentConnectLog.set(logKey, Date.now());
      logActivity(
        'DEVICE_CONNECT',
        profile.name,
        clientIp,
        `[${platformInfo.summary}] Connected (${deviceId})`
      ).catch(() => {});
    }

    const peerData = {
      id: socket.id,
      deviceId,
      tabInstanceId: incomingTabId || undefined,
      name: profile.name,
      avatarUrl: profile.avatarUrl || resolveFallbackAvatarForName(profile.name),
      os: platformInfo.os,
      browser: platformInfo.browser,
      ip: clientIp,
      status: 'online',
    };
    clients.set(socket.id, peerData);
    console.log(`[Socket] User connected: ${socket.id} (${peerData.name} [${deviceId}] · ${platformInfo.summary} @ ${clientIp})`);

    socket.emit('identity', {
      deviceId,
      name: peerData.name,
      avatarUrl: peerData.avatarUrl,
      os: peerData.os,
      browser: peerData.browser,
      ip: clientIp,
      socketId: socket.id,
    });

    const [history, stickerPacks] = await Promise.all([
      getAllMessages(),
      getStickerPacksWithItems({ onlyEnabled: true }),
    ]);
    socket.emit('chat_history', history);
    socket.emit('settings_update', settings);
    socket.emit('sticker_packs_update', stickerPacks);

    const groupedPeers = getGroupedPeers(clients);
    io.emit('peers_update', groupedPeers);
    recordOnlineTelemetry(groupedPeers.length).catch(() => {});

    if (restriction.isMuted) {
      socket.emit('client_restricted', { mutedUntil: restriction.mutedUntil, reason: restriction.reason });
    } else {
      socket.emit('client_restricted', { banned: false, mutedUntil: null });
    }

    socket.on('mark_messages_read', async (payload: { upToId?: number }) => {
      const upToId = Number(payload?.upToId) || 0;
      if (upToId <= 0) return;
      const res = await markMessagesReadUpTo(upToId, deviceId);
      if (res.changed > 0) {
        io.emit('messages_read', { upToId: res.upToId, readAt: res.readAt });
      }
    });

    socket.on('send_message', async (data) => {
      const cleanStickerMeta = data?.type === 'sticker' ? sanitizeStickerMeta(data?.stickerMeta) : null;
      const msgType = cleanStickerMeta ? 'sticker' : data?.type || 'text';
      const dedupeKey = buildStickerDedupeKey(cleanStickerMeta);
      const guard = await enforceChatGuard({
        deviceId,
        ip: clientIp,
        senderName: peerData.name,
        text: msgType === 'sticker' ? '' : String(data?.text || ''),
        dedupeKey,
      });
      if (!guard.allowed) {
        socket.emit('chat_error', { code: guard.code, message: guard.message, mutedUntil: guard.mutedUntil });
        return;
      }

      const msg = {
        sender: peerData.name,
        text: msgType === 'sticker' ? cleanStickerMeta?.alt || '' : data.text,
        type: msgType,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        mediaToken: data.mediaToken,
        attachments: data.attachments,
        stickerMeta: cleanStickerMeta,
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        status: 'delivered',
        isAdmin: 0,
      };

      await saveAndBroadcastMessage(msg, peerData.deviceId);
    });

    socket.on('file_status_update', (data) => {
      io.emit('file_status_changed', data);
    });

    socket.on('update_identity', async (payload: string | { name?: string; avatarUrl?: string }) => {
      const rawName = typeof payload === 'string' ? payload : payload?.name;
      const requestedAvatar = typeof payload === 'object' && payload ? payload.avatarUrl : undefined;
      const cleanName = typeof rawName === 'string' ? rawName.trim().slice(0, 24) : '';
      const validAvatar = requestedAvatar && isValidUserAvatarUrl(requestedAvatar) ? requestedAvatar : undefined;

      if (cleanName || validAvatar) {
        if (await isDeviceDeleted(deviceId)) return;
        const nextName = cleanName || peerData.name;
        await applyDeviceRename(deviceId, nextName, validAvatar);
        await logActivity(
          'UPDATE_PROFILE',
          nextName,
          clientIp,
          `[${platformInfo.summary}] Updated profile (name="${nextName}"${validAvatar ? `, avatar=${validAvatar}` : ''})`
        );
      }
    });

    socket.on('presence_update', (data: { status: string }) => {
      const validStatuses = ['online', 'idle', 'offline'];
      const status = validStatuses.includes(data.status) ? data.status : 'online';
      const p = clients.get(socket.id);
      if (p) {
        p.status = status;
        clients.set(socket.id, p);
        io.emit('peers_update', getGroupedPeers(clients));
      }
    });

    socket.on('webrtc_signaling', async (payload) => {
      const sender = clients.get(socket.id);
      if (!sender || !payload || typeof payload !== 'object') return;
      if (!payload.targetDeviceId && !payload.targetSocketId && !payload.targetIp) return;

      const sigKind =
        payload.type === 'transfer_request' || payload.type === 'offer' ? 'offer' : 'signal_other';
      const guard = await enforceP2pGuard({
        deviceId: sender.deviceId,
        ip: sender.ip,
        senderName: sender.name,
        kind: sigKind,
      });
      if (!guard.allowed) {
        socket.emit('p2p_error', { code: guard.code, message: guard.message, mutedUntil: guard.mutedUntil });
        return;
      }

      if (payload.type === 'transfer_request' && Array.isArray(payload.files)) {
        for (const f of payload.files) {
          const check = validateUploadFileName(String(f?.name || ''));
          if (!check.valid) {
            socket.emit('p2p_error', { code: 'INVALID_FILENAME', message: check.reason });
            return;
          }
        }
      }

      for (const [id, client] of clients.entries()) {
        if (id === socket.id) continue;
        const matchesDevice = payload.targetDeviceId && client.deviceId === payload.targetDeviceId;
        const matchesSocket = payload.targetSocketId && id === payload.targetSocketId;
        const matchesIp = !payload.targetDeviceId && !payload.targetSocketId && client.ip === payload.targetIp;
        if (matchesDevice || matchesSocket || matchesIp) {
          io.to(id).emit('webrtc_signaling', {
            ...payload,
            senderIp: sender.ip,
            senderDeviceId: sender.deviceId,
            senderSocketId: socket.id,
            senderName: sender.name,
          });
        }
      }
    });

    socket.on(
      'direct_relay',
      async (
        payload: {
          targetDeviceId?: string;
          targetSocketId?: string;
          targetIp?: string;
          relayType?: string;
          chunk?: string;
          [key: string]: unknown;
        },
        ack?: (resp: { ok: boolean; error?: string }) => void
      ) => {
      const sender = clients.get(socket.id);
      if (!sender || !payload || typeof payload !== 'object') {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      if (!payload.targetDeviceId && !payload.targetSocketId && !payload.targetIp) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }

      const relayKind =
        payload.relayType === 'file_header'
          ? 'relay_header'
          : payload.relayType === 'file_chunk'
            ? 'relay_chunk'
            : 'signal_other';
      const chunkBytes = payload.chunk ? Buffer.byteLength(payload.chunk) : 0;
      const guard = await enforceP2pGuard({
        deviceId: sender.deviceId,
        ip: sender.ip,
        senderName: sender.name,
        kind: relayKind,
        chunkBytes,
      });
      if (!guard.allowed) {
        if (typeof ack === 'function') ack({ ok: false, error: guard.message });
        if (relayKind !== 'relay_chunk') {
          socket.emit('p2p_error', { code: guard.code, message: guard.message, mutedUntil: guard.mutedUntil });
        }
        return;
      }

      let delivered = false;
      for (const [id, client] of clients.entries()) {
        if (id === socket.id) continue;
        const matchesDevice = payload.targetDeviceId && client.deviceId === payload.targetDeviceId;
        const matchesSocket = payload.targetSocketId && id === payload.targetSocketId;
        const matchesIp = !payload.targetDeviceId && !payload.targetSocketId && client.ip === payload.targetIp;
        if (matchesDevice || matchesSocket || matchesIp) {
          io.to(id).emit('direct_relay', {
            ...payload,
            senderIp: sender.ip,
            senderDeviceId: sender.deviceId,
            senderSocketId: socket.id,
            senderName: sender.name,
          });
          delivered = true;
        }
      }
      if (typeof ack === 'function') ack({ ok: delivered });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${socket.id}`);
      clients.delete(socket.id);
      io.emit('peers_update', getGroupedPeers(clients));
    });
  });
}
