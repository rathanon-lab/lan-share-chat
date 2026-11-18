import fs from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import { stickerUpload } from '../config';
import {
  getStickerPacksWithItems,
  logActivity,
  reorderStickerPacks,
  updateStickerItem,
  updateStickerPackMeta,
} from '../../src/lib/db';
import { getIoRef, jsonErr, jsonOk, parseJsonBody } from '../state';
import { checkUploadDiskGuard } from '../utils/storageRuntime';
import {
  MAX_STICKERS_PER_PACK,
  MIN_STICKERS_PER_PACK,
  RECOMMENDED_STICKERS_PER_PACK,
  appendFilesToExistingPack,
  importStickerPackFromFiles,
  importStickerPackFromZip,
  removeStickerItemFromPack,
  removeStickerPack,
  replaceStickerItemImage,
} from '../../src/lib/stickerStore';

async function broadcastActiveStickerPacks() {
  const ioRef = getIoRef();
  if (!ioRef) return;
  const packs = await getStickerPacksWithItems({ onlyEnabled: true });
  ioRef.emit('sticker_packs_update', packs);
}

function cleanupUploadedFiles(filesList: Array<{ path?: string }>) {
  for (const f of filesList) {
    try {
      if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
    } catch {}
  }
}

function handleStickerMultipartUpload(
  req: IncomingMessage,
  res: ServerResponse,
  targetPackId?: string
): Promise<boolean> {
  const declaredBytes = parseInt(String(req.headers['content-length'] || '0'), 10) || 0;
  const diskCheck = checkUploadDiskGuard(declaredBytes, 'stickers');
  if (!diskCheck.ok) {
    jsonErr(res, 507, diskCheck.error || 'Insufficient sticker storage space');
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    const uploadAny = stickerUpload.any();
    // @ts-expect-error Multer middleware signature works with raw IncomingMessage/ServerResponse
    uploadAny(req, res, async (err: unknown) => {
      // @ts-expect-error Multer attaches req.files
      const uploaded: Express.Multer.File[] = req.files || [];
      if (err) {
        cleanupUploadedFiles(uploaded);
        const msg = err instanceof Error ? err.message : 'อัปโหลดชุดสติกเกอร์ไม่สำเร็จ';
        jsonErr(res, 400, msg);
        return resolve(true);
      }

      try {
        // @ts-expect-error Multer attaches req.body
        const body = (req.body || {}) as Record<string, string | undefined>;
        if (targetPackId) {
          const updated = await appendFilesToExistingPack(
            targetPackId,
            uploaded.map((f) => ({ originalname: f.originalname, path: f.path }))
          );
          cleanupUploadedFiles(uploaded);
          await broadcastActiveStickerPacks();
          await logActivity('ADMIN_STICKER_APPEND', 'admin', 'admin', `Added ${uploaded.length} sticker(s) to ${targetPackId}`);
          jsonOk(res, { success: true, pack: updated });
          return resolve(true);
        }

        const zipFiles = uploaded.filter((f) => f.originalname.toLowerCase().endsWith('.zip'));
        let createdPack;
        const createdPacks = [];
        if (zipFiles.length > 0) {
          for (const zf of zipFiles) {
            const baseZipName = zf.originalname.replace(/\.zip$/i, '').trim();
            const pack = await importStickerPackFromZip({
              zipBuffer: fs.readFileSync(zf.path),
              packName: zipFiles.length === 1 && body.name ? String(body.name) : baseZipName || undefined,
              description: body.description ? String(body.description) : undefined,
              desiredPackId: zipFiles.length === 1 && body.packId ? String(body.packId) : undefined,
            });
            if (pack) createdPacks.push(pack);
          }
          createdPack = createdPacks[0];
        } else {
          let relPaths: string[] = [];
          try {
            if (body.relativePaths) relPaths = JSON.parse(String(body.relativePaths));
          } catch {}
          createdPack = await importStickerPackFromFiles({
            files: uploaded.map((f) => ({ originalname: f.originalname, path: f.path })),
            relativePaths: relPaths,
            packName: body.name ? String(body.name) : undefined,
            description: body.description ? String(body.description) : undefined,
            desiredPackId: body.packId ? String(body.packId) : undefined,
          });
        }
        cleanupUploadedFiles(uploaded);
        await broadcastActiveStickerPacks();
        await logActivity(
          'ADMIN_STICKER_CREATE',
          'admin',
          'admin',
          createdPacks.length > 1
            ? `Imported ${createdPacks.length} sticker packs (${createdPacks.map((p) => p.name).join(', ')})`
            : `Created pack "${createdPack?.name}" (${createdPack?.items?.length || 0} stickers)`
        );
        jsonOk(res, { success: true, pack: createdPack, packs: createdPacks.length > 0 ? createdPacks : createdPack ? [createdPack] : [] });
      } catch (e: unknown) {
        cleanupUploadedFiles(uploaded);
        const msg = e instanceof Error ? e.message : 'ไม่สามารถนำเข้าชุดสติกเกอร์ได้';
        jsonErr(res, 400, msg);
      }
      resolve(true);
    });
  });
}

export async function handleAdminStickerRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  clientIp: string
): Promise<boolean> {
  if (pathname === '/api/admin/stickers' && req.method === 'GET') {
    const packs = await getStickerPacksWithItems();
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

  if (pathname === '/api/admin/stickers/import' && req.method === 'POST') {
    return handleStickerMultipartUpload(req, res);
  }

  if (pathname === '/api/admin/stickers/reorder' && req.method === 'PUT') {
    const body = await parseJsonBody(req);
    const packIds = Array.isArray(body.packIds) ? body.packIds.map(String) : [];
    if (packIds.length > 0) {
      await reorderStickerPacks(packIds);
      await broadcastActiveStickerPacks();
    }
    jsonOk(res, { success: true });
    return true;
  }

  if (pathname === '/api/admin/stickers/batch-visibility' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const packIds = Array.isArray(body.packIds) ? body.packIds.map(String) : [];
    const action = body.action === 'enable' || body.action === 'disable' || body.action === 'toggle' ? body.action : 'toggle';
    const currentPacks = await getStickerPacksWithItems();
    const packMap = new Map(currentPacks.map((p) => [p.packId, p]));
    const updated: { packId: string; enabled: boolean }[] = [];

    for (const pid of packIds) {
      const existing = packMap.get(pid);
      if (!existing) continue;
      const nextEnabled = action === 'enable' ? true : action === 'disable' ? false : !existing.enabled;
      await updateStickerPackMeta(pid, { enabled: nextEnabled });
      updated.push({ packId: pid, enabled: nextEnabled });
    }
    if (updated.length > 0) {
      await broadcastActiveStickerPacks();
      await logActivity('ADMIN_STICKER_BATCH_VISIBILITY', 'admin', clientIp, JSON.stringify({ action, updatedCount: updated.length }));
    }
    jsonOk(res, { success: true, updatedCount: updated.length, updated });
    return true;
  }

  if (pathname === '/api/admin/stickers/batch-delete' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const packIds = Array.isArray(body.packIds) ? body.packIds.map(String) : [];
    const deletedPackIds: string[] = [];
    for (const pid of packIds) {
      try {
        await removeStickerPack(pid);
        deletedPackIds.push(pid);
      } catch {}
    }
    if (deletedPackIds.length > 0) {
      await broadcastActiveStickerPacks();
      await logActivity('ADMIN_STICKER_BATCH_DELETE', 'admin', clientIp, JSON.stringify({ count: deletedPackIds.length, packIds: deletedPackIds }));
    }
    jsonOk(res, { success: true, deletedPackIds, deletedCount: deletedPackIds.length });
    return true;
  }

  const packAddItemsMatch = pathname.match(/^\/api\/admin\/stickers\/([^/]+)\/items$/);
  if (packAddItemsMatch && req.method === 'POST') {
    return handleStickerMultipartUpload(req, res, decodeURIComponent(packAddItemsMatch[1]));
  }

  const itemImageMatch = pathname.match(/^\/api\/admin\/stickers\/([^/]+)\/items\/([^/]+)\/image$/);
  if (itemImageMatch && req.method === 'POST') {
    const packId = decodeURIComponent(itemImageMatch[1]);
    const stickerId = decodeURIComponent(itemImageMatch[2]);
    return new Promise<boolean>((resolve) => {
      const uploadAny = stickerUpload.any();
      // @ts-expect-error Multer middleware signature works with raw IncomingMessage/ServerResponse
      uploadAny(req, res, async (err: unknown) => {
        // @ts-expect-error Multer attaches req.files
        const uploaded: Express.Multer.File[] = req.files || [];
        if (err || uploaded.length === 0) {
          cleanupUploadedFiles(uploaded);
          jsonErr(res, 400, err instanceof Error ? err.message : 'กรุณาเลือกไฟล์รูปภาพสติกเกอร์');
          return resolve(true);
        }
        try {
          const item = await replaceStickerItemImage(packId, stickerId, {
            originalname: uploaded[0].originalname,
            path: uploaded[0].path,
          });
          cleanupUploadedFiles(uploaded);
          await broadcastActiveStickerPacks();
          await logActivity('ADMIN_STICKER_IMAGE_REPLACE', 'admin', clientIp, `Replaced image for ${packId}/${stickerId}`);
          jsonOk(res, { success: true, item });
        } catch (e: unknown) {
          cleanupUploadedFiles(uploaded);
          jsonErr(res, 400, e instanceof Error ? e.message : 'เปลี่ยนรูปสติกเกอร์ไม่สำเร็จ');
        }
        resolve(true);
      });
    });
  }

  const itemMatch = pathname.match(/^\/api\/admin\/stickers\/([^/]+)\/items\/([^/]+)$/);
  if (itemMatch) {
    const packId = decodeURIComponent(itemMatch[1]);
    const stickerId = decodeURIComponent(itemMatch[2]);
    if (req.method === 'PUT') {
      const body = await parseJsonBody(req);
      await updateStickerItem(packId, stickerId, {
        alt: typeof body.alt === 'string' ? body.alt.slice(0, 80) : undefined,
        keywords: typeof body.keywords === 'string' ? body.keywords.slice(0, 200) : undefined,
      });
      await broadcastActiveStickerPacks();
      jsonOk(res, { success: true });
      return true;
    }
    if (req.method === 'DELETE') {
      try {
        await removeStickerItemFromPack(packId, stickerId);
        await broadcastActiveStickerPacks();
        jsonOk(res, { success: true });
      } catch (e: unknown) {
        jsonErr(res, 400, e instanceof Error ? e.message : 'ลบสติกเกอร์ไม่สำเร็จ');
      }
      return true;
    }
  }

  const packMatch = pathname.match(/^\/api\/admin\/stickers\/([^/]+)$/);
  if (packMatch) {
    const packId = decodeURIComponent(packMatch[1]);
    if (req.method === 'PUT') {
      const body = await parseJsonBody(req);
      await updateStickerPackMeta(packId, {
        name: typeof body.name === 'string' ? body.name.trim().slice(0, 64) : undefined,
        description: typeof body.description === 'string' ? body.description.trim().slice(0, 200) : undefined,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      });
      await broadcastActiveStickerPacks();
      jsonOk(res, { success: true });
      return true;
    }
    if (req.method === 'DELETE') {
      try {
        await removeStickerPack(packId);
        await broadcastActiveStickerPacks();
        await logActivity('ADMIN_STICKER_DELETE', 'admin', clientIp, `Deleted sticker pack ${packId}`);
        jsonOk(res, { success: true });
      } catch (e: unknown) {
        jsonErr(res, 400, e instanceof Error ? e.message : 'ลบชุดสติกเกอร์ไม่สำเร็จ');
      }
      return true;
    }
  }

  return false;
}
