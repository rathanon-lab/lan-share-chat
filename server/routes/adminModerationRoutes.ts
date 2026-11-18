import { IncomingMessage, ServerResponse } from 'http';
import {
  deleteDevice,
  getAdminAlerts,
  getAllDevices,
  getBannedIps,
  getDeviceProfile,
  getDevicesByIp,
  getMessageById,
  logActivity,
  pickUnusedAnimalPreset,
  resolveAdminAlert,
  setDeviceBan,
  setDeviceMute,
  softDeleteMessage,
  unbanIp,
} from '../../src/lib/db';
import { applyDeviceRename, clients, getActiveAdminSession, getIoRef, jsonErr, jsonOk, parseJsonBody, resolveClientIp } from '../state';
import { pushRestrictionState } from '../security';

async function emitIpDevicesStatus(ip: string) {
  const ioRef = getIoRef();
  if (!ioRef || !ip) return;
  const now = Date.now();
  const affected = await getDevicesByIp(ip);
  for (const d of affected) {
    const status = d.isBanned ? 'banned' : d.mutedUntil > now ? 'muted' : 'active';
    ioRef.emit('device_status_changed', { deviceId: d.deviceId, status, ip });
    if (!d.isBanned) {
      pushRestrictionState(d.deviceId, undefined, {
        banned: false,
        mutedUntil: d.mutedUntil > now ? d.mutedUntil : 0,
        reason: '',
      });
    }
  }
}

export async function handleAdminModerationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  clientIp: string
): Promise<boolean> {
  const ioRef = getIoRef();

  if (pathname === '/api/admin/devices' && req.method === 'GET') {
    const [devices, bannedIps] = await Promise.all([getAllDevices(), getBannedIps()]);
    const callerIp = resolveClientIp(req);
    const activeSess = getActiveAdminSession();
    const callerDeviceId = String(req.headers['x-device-id'] || activeSess?.deviceId || '').trim();
    jsonOk(res, { devices, bannedIps, callerIp, callerDeviceId });
    return true;
  }

  const deviceMuteMatch = pathname.match(/^\/api\/admin\/device\/([^/]+)\/mute$/);
  if (deviceMuteMatch && req.method === 'POST') {
    const deviceId = decodeURIComponent(deviceMuteMatch[1]);
    const body = await parseJsonBody(req);
    const minutes = Math.max(0, Math.min(1440, Number(body.minutes) || 0));
    const reason = String(body.reason || (minutes > 0 ? `ระงับการส่ง ${minutes} นาทีโดย Admin` : 'ปลดระงับการส่ง')).slice(0, 200);
    const mutedUntil = await setDeviceMute(deviceId, minutes, reason);
    pushRestrictionState(deviceId, undefined, { mutedUntil, reason });
    const devForMute = await getDeviceProfile(deviceId);
    if (ioRef) {
      ioRef.emit('device_status_changed', {
        deviceId,
        status: devForMute?.isBanned ? 'banned' : minutes > 0 ? 'muted' : 'active',
        mutedUntil,
      });
    }
    await logActivity(
      minutes > 0 ? 'MUTE_DEVICE' : 'UNMUTE_DEVICE',
      'admin',
      clientIp,
      JSON.stringify({ deviceId, minutes, mutedUntil, reason })
    );
    jsonOk(res, { success: true, deviceId, mutedUntil });
    return true;
  }

  const deviceBanMatch = pathname.match(/^\/api\/admin\/device\/([^/]+)\/ban$/);
  if (deviceBanMatch && req.method === 'POST') {
    const deviceId = decodeURIComponent(deviceBanMatch[1]);
    const body = await parseJsonBody(req);
    const banned = Boolean(body.banned);
    const banIpToo = Boolean(body.banIpToo);
    const reason = String(body.reason || (banned ? 'ถูกแบนโดย Admin' : 'ปลดแบนโดย Admin')).slice(0, 200);
    const dev = await getDeviceProfile(deviceId);
    const ipToBan = banned && banIpToo ? dev?.lastIp || null : null;
    await setDeviceBan(deviceId, banned, reason, ipToBan);

    const didUnbanIp = Boolean(!banned && body.unbanIp && dev?.lastIp);
    if (didUnbanIp && dev?.lastIp) {
      await unbanIp(dev.lastIp);
    }

    pushRestrictionState(
      deviceId,
      ipToBan || undefined,
      banned ? { banned: true, reason } : { banned: false, mutedUntil: 0, reason }
    );

    if (ioRef) {
      if (ipToBan) {
        const ipDevices = await getDevicesByIp(ipToBan);
        for (const d of ipDevices) {
          ioRef.emit('device_status_changed', { deviceId: d.deviceId, status: 'ip_banned', ip: ipToBan });
        }
      } else {
        const bannedIpsList = await getBannedIps();
        const stillIpBanned = Boolean(dev?.lastIp && bannedIpsList.some((b) => b.ip === dev.lastIp));
        ioRef.emit('device_status_changed', {
          deviceId,
          status: banned ? 'banned' : stillIpBanned ? 'ip_banned' : 'active',
          ip: dev?.lastIp,
        });
      }
      if (didUnbanIp && dev?.lastIp) {
        await emitIpDevicesStatus(dev.lastIp);
        pushRestrictionState('', dev.lastIp, { banned: false, mutedUntil: 0, reason });
      }
    }

    await logActivity(
      banned ? 'BAN_DEVICE' : 'UNBAN_DEVICE',
      'admin',
      clientIp,
      JSON.stringify({ deviceId, name: dev?.name, banned, banIpToo: ipToBan, reason })
    );
    jsonOk(res, { success: true, deviceId, banned });
    return true;
  }

  if (pathname === '/api/admin/banned-ip' && req.method === 'DELETE') {
    const body = await parseJsonBody(req);
    const ip = String(body.ip || '').trim();
    if (!ip) {
      jsonErr(res, 400, 'Missing ip');
      return true;
    }
    await unbanIp(ip);
    await emitIpDevicesStatus(ip);
    pushRestrictionState('', ip, { banned: false, mutedUntil: 0, reason: '' });
    await logActivity('UNBAN_IP', 'admin', clientIp, JSON.stringify({ ip }));
    jsonOk(res, { success: true, ip });
    return true;
  }

  const deviceDeleteMatch = pathname.match(/^\/api\/admin\/device\/([^/]+)$/);
  if (deviceDeleteMatch && req.method === 'DELETE') {
    const deviceId = decodeURIComponent(deviceDeleteMatch[1]);
    const deleted = await deleteDevice(deviceId);
    if (deleted) {
      if (ioRef) {
        ioRef.emit('device_status_changed', { deviceId, status: 'deleted' });
        for (const [sockId, client] of clients.entries()) {
          if (client.deviceId === deviceId) {
            ioRef.sockets.sockets.get(sockId)?.disconnect(true);
          }
        }
      }
      await logActivity(
        'DELETE_DEVICE',
        'admin',
        clientIp,
        JSON.stringify({
          deviceId: deleted.deviceId,
          name: deleted.name,
          os: deleted.os,
          browser: deleted.browser,
          lastIp: deleted.lastIp,
        })
      );
    }
    jsonOk(res, { success: true });
    return true;
  }

  const deviceRenameMatch = pathname.match(/^\/api\/admin\/device\/([^/]+)\/name$/);
  if (deviceRenameMatch && req.method === 'PUT') {
    const deviceId = decodeURIComponent(deviceRenameMatch[1]);
    const body = await parseJsonBody(req);
    if (!body.name) {
      jsonErr(res, 400, 'Missing name');
      return true;
    }
    await applyDeviceRename(deviceId, String(body.name).trim().slice(0, 24));
    await logActivity('RENAME_DEVICE', 'admin', clientIp, `Renamed deviceId=${deviceId} to "${body.name}"`);
    jsonOk(res, { success: true });
    return true;
  }

  const deviceGenMatch = pathname.match(/^\/api\/admin\/device\/([^/]+)\/generate-name$/);
  if (deviceGenMatch && req.method === 'POST') {
    const deviceId = decodeURIComponent(deviceGenMatch[1]);
    const preset = await pickUnusedAnimalPreset();
    await applyDeviceRename(deviceId, preset.name, preset.avatarUrl);
    await logActivity('GENERATE_DEVICE_NAME', 'admin', clientIp, `Generated alias "${preset.name}" for ${deviceId}`);
    jsonOk(res, { success: true, name: preset.name, avatarUrl: preset.avatarUrl });
    return true;
  }

  if (pathname === '/api/admin/alerts' && req.method === 'GET') {
    const alerts = await getAdminAlerts(200);
    jsonOk(res, alerts);
    return true;
  }

  const alertResolveMatch = pathname.match(/^\/api\/admin\/alerts\/(\d+)\/resolve$/);
  if (alertResolveMatch && req.method === 'POST') {
    const alertId = parseInt(alertResolveMatch[1], 10);
    const body = await parseJsonBody(req);
    const action = body.action === 'approve_delete' ? 'approved' : body.action === 'reject' ? 'rejected' : 'resolved';
    const updated = await resolveAdminAlert(alertId, action);
    if (!updated) {
      jsonErr(res, 404, 'Alert not found');
      return true;
    }

    if (action === 'approved' && updated.messageId) {
      const msg = await getMessageById(Number(updated.messageId));
      if (msg && !msg.isDeleted) {
        const deletedAt = await softDeleteMessage(Number(updated.messageId), `${msg.sender || 'User'} (Admin approved)`);
        if (ioRef) {
          ioRef.emit('message_soft_deleted', {
            id: updated.messageId,
            deletedAt,
            deletedBy: `${msg.sender || 'User'} (อนุมัติโดย Admin)`,
          });
        }
      }
      await logActivity('ADMIN_APPROVE_DELETE', 'admin', clientIp, `Approved delete request alertId=${alertId}, msgId=${updated.messageId}`);
    } else {
      await logActivity('ADMIN_RESOLVE_ALERT', 'admin', clientIp, `Resolved alertId=${alertId} as ${action}`);
    }
    if (ioRef) ioRef.emit('admin_alert_resolved', updated);
    jsonOk(res, { success: true, alert: updated });
    return true;
  }

  return false;
}
