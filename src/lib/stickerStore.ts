import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  upsertStickerPack,
  getStickerPacksWithItems,
  getStickerPackRow,
  appendStickerItems,
  updateStickerItem,
  deleteStickerItemRow,
  deleteStickerPackRow,
  deleteAllUploadedStickerPacks,
} from './db';

export const MIN_STICKERS_PER_PACK = 1;
export const RECOMMENDED_STICKERS_PER_PACK = 16;
export const MAX_STICKERS_PER_PACK = 40;
export const MAX_STICKER_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB per sticker image
export const MAX_STICKER_ZIP_BYTES = 100 * 1024 * 1024; // 100 MB zip archive

export const STICKERS_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'stickers');
export const STICKERS_BUILTIN_DIR = path.resolve(process.cwd(), 'public', 'stickers');

if (!fs.existsSync(STICKERS_STORAGE_DIR)) {
  fs.mkdirSync(STICKERS_STORAGE_DIR, { recursive: true });
}

const ALLOWED_EXTS = new Set(['.webp', '.png', '.gif', '.jpg', '.jpeg']);

export function sanitizeSlug(raw: string, fallback = 'sticker-pack'): string {
  const clean = String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return clean || fallback;
}

export function sanitizeAssetFilename(raw: string): string {
  const base = path.basename(String(raw || '')).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'sticker.webp';
}

export function isSupportedStickerImageBuffer(buf: Buffer, ext: string): boolean {
  if (!buf || buf.length < 12 || buf.length > MAX_STICKER_IMAGE_BYTES) return false;
  const lower = ext.toLowerCase();
  if (!ALLOWED_EXTS.has(lower)) return false;
  // Basic magic byte verification to block spoofed uploads
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isGif = buf.subarray(0, 3).toString('ascii') === 'GIF';
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return isPng || isGif || isJpg || isWebp;
}

export function getMimeTypeForImageExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.webp': return 'image/webp';
    case '.png': return 'image/png';
    case '.gif': return 'image/gif';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

export function buildStickerAssetUrl(packId: string, fileName: string): string {
  return `/api/stickers/asset/${encodeURIComponent(packId)}/${encodeURIComponent(fileName)}`;
}

/**
 * Seeds built-in packs found inside `public/stickers/*\/manifest.json`.
 * Preserves any existing admin-configured `enabled` or `sortOrder` values.
 */
export async function ensureBuiltInStickerPacks(): Promise<void> {
  if (!fs.existsSync(STICKERS_BUILTIN_DIR)) return;
  const dirs = fs.readdirSync(STICKERS_BUILTIN_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const manifestPath = path.join(STICKERS_BUILTIN_DIR, dir.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const packId = sanitizeSlug(raw.id || dir.name, dir.name);
      const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
      if (itemsRaw.length < MIN_STICKERS_PER_PACK) continue;

      const items = itemsRaw.slice(0, MAX_STICKERS_PER_PACK).map((it: any, idx: number) => {
        const fileName = sanitizeAssetFilename(it.file || `${String(idx + 1).padStart(2, '0')}.webp`);
        return {
          stickerId: sanitizeSlug(it.id || path.parse(fileName).name, `st-${idx + 1}`),
          fileName,
          url: buildStickerAssetUrl(packId, fileName),
          alt: String(it.alt || path.parse(fileName).name).slice(0, 80),
          keywords: String(it.keywords || it.alt || '').slice(0, 200),
          sortOrder: idx,
        };
      });

      const mainFile = sanitizeAssetFilename(raw.main || items[0].fileName);
      const tabFile = sanitizeAssetFilename(raw.tab || mainFile);

      await upsertStickerPack({
        packId,
        name: String(raw.name || packId).slice(0, 64),
        description: String(raw.description || '').slice(0, 200),
        mainUrl: buildStickerAssetUrl(packId, mainFile),
        tabUrl: buildStickerAssetUrl(packId, tabFile),
        source: 'builtin',
        items,
      });
    } catch (err) {
      console.warn(`[Stickers] Failed to load built-in pack ${dir.name}:`, err);
    }
  }
}

export function resolveStickerAssetFile(packId: string, fileName: string): { filePath: string; contentType: string } | null {
  const safePack = sanitizeSlug(packId, '');
  const safeFile = path.basename(fileName);
  if (!safePack || !safeFile || !/^[a-zA-Z0-9._-]+\.(webp|png|gif|jpg|jpeg)$/i.test(safeFile)) {
    return null;
  }
  const uploadedPath = path.join(STICKERS_STORAGE_DIR, safePack, safeFile);
  if (fs.existsSync(uploadedPath)) {
    return { filePath: uploadedPath, contentType: getMimeTypeForImageExt(path.extname(safeFile)) };
  }
  const builtinPath = path.join(STICKERS_BUILTIN_DIR, safePack, safeFile);
  if (fs.existsSync(builtinPath)) {
    return { filePath: builtinPath, contentType: getMimeTypeForImageExt(path.extname(safeFile)) };
  }
  return null;
}

export interface IncomingStickerFile {
  relativePath: string;
  buffer: Buffer;
}

async function persistImportedStickerPack(params: {
  packName?: string;
  description?: string;
  desiredPackId?: string;
  entries: IncomingStickerFile[];
}) {
  // Strip single top-level wrapper folder if uploaded as a folder or zipped root directory
  const cleanedEntries = params.entries.filter((e) => !path.basename(e.relativePath).startsWith('.'));
  const segmentsList = cleanedEntries.map((e) => e.relativePath.replace(/\\/g, '/').split('/').filter(Boolean));
  const commonRoot =
    segmentsList.length > 0 && segmentsList.every((segs) => segs.length > 1 && segs[0] === segmentsList[0][0])
      ? segmentsList[0][0]
      : null;

  const relEntries = cleanedEntries.map((e, i) => ({
    rel: (commonRoot ? segmentsList[i].slice(1) : segmentsList[i]).join('/'),
    buffer: e.buffer,
  }));

  let manifest: any = {};
  const manifestEntry = relEntries.find((e) => path.basename(e.rel).toLowerCase() === 'manifest.json');
  if (manifestEntry) {
    try {
      manifest = JSON.parse(manifestEntry.buffer.toString('utf-8'));
    } catch {
      manifest = {};
    }
  }

  let mainEntry: { ext: string; buffer: Buffer } | null = null;
  let tabEntry: { ext: string; buffer: Buffer } | null = null;
  const stickerCandidates: { baseName: string; ext: string; buffer: Buffer }[] = [];

  for (const e of relEntries) {
    const lowerRel = e.rel.toLowerCase();
    const base = path.basename(lowerRel);
    const parsed = path.parse(base);
    if (!ALLOWED_EXTS.has(parsed.ext)) continue;
    if (!isSupportedStickerImageBuffer(e.buffer, parsed.ext)) {
      throw new Error(`ไฟล์ "${e.rel}" ไม่ใช่รูปภาพที่รองรับ หรือขนาดเกิน ${Math.round(MAX_STICKER_IMAGE_BYTES / 1024 / 1024)}MB`);
    }

    if (parsed.name === 'main' && !lowerRel.includes('stickers/')) {
      mainEntry = { ext: parsed.ext, buffer: e.buffer };
    } else if (parsed.name === 'tab' && !lowerRel.includes('stickers/')) {
      tabEntry = { ext: parsed.ext, buffer: e.buffer };
    } else {
      stickerCandidates.push({ baseName: parsed.name, ext: parsed.ext, buffer: e.buffer });
    }
  }

  stickerCandidates.sort((a, b) => a.baseName.localeCompare(b.baseName, undefined, { numeric: true }));

  if (stickerCandidates.length < MIN_STICKERS_PER_PACK) {
    throw new Error(`ชุดสติกเกอร์ต้องมีอย่างน้อย ${MIN_STICKERS_PER_PACK} รูป (พบ ${stickerCandidates.length} รูป)`);
  }
  if (stickerCandidates.length > MAX_STICKERS_PER_PACK) {
    throw new Error(`ชุดสติกเกอร์รองรับสูงสุด ${MAX_STICKERS_PER_PACK} รูปต่อชุด (พบ ${stickerCandidates.length} รูป)`);
  }

  const baseId = sanitizeSlug(
    params.desiredPackId || manifest.id || params.packName || commonRoot || 'custom-pack',
    'custom-pack'
  );
  let packId = baseId;
  const existingPack = await getStickerPackRow(packId);
  if (existingPack) {
    packId = `${baseId}-${Date.now().toString(36)}`;
  }

  const targetDir = path.join(STICKERS_STORAGE_DIR, packId);
  fs.mkdirSync(targetDir, { recursive: true });

  const manifestItemsMap = new Map<string, any>();
  if (Array.isArray(manifest.items)) {
    for (const it of manifest.items) {
      if (it?.file) manifestItemsMap.set(path.parse(String(it.file)).name.toLowerCase(), it);
      if (it?.id) manifestItemsMap.set(String(it.id).toLowerCase(), it);
    }
  }

  const savedItems: {
    stickerId: string;
    fileName: string;
    url: string;
    alt: string;
    keywords: string;
    sortOrder: number;
  }[] = [];

  for (let i = 0; i < stickerCandidates.length; i++) {
    const c = stickerCandidates[i];
    const fileName = sanitizeAssetFilename(`${String(i + 1).padStart(2, '0')}-${c.baseName}${c.ext}`);
    fs.writeFileSync(path.join(targetDir, fileName), c.buffer);
    const meta = manifestItemsMap.get(c.baseName.toLowerCase());
    savedItems.push({
      stickerId: sanitizeSlug(meta?.id || `${String(i + 1).padStart(2, '0')}-${c.baseName}`, `st-${i + 1}`),
      fileName,
      url: buildStickerAssetUrl(packId, fileName),
      alt: String(meta?.alt || c.baseName.replace(/^\d+[-_]?/, '') || `Sticker ${i + 1}`).slice(0, 80),
      keywords: String(meta?.keywords || meta?.alt || c.baseName).slice(0, 200),
      sortOrder: i,
    });
  }

  let mainFileName = savedItems[0].fileName;
  if (mainEntry) {
    mainFileName = `main${mainEntry.ext}`;
    fs.writeFileSync(path.join(targetDir, mainFileName), mainEntry.buffer);
  }
  let tabFileName = mainFileName;
  if (tabEntry) {
    tabFileName = `tab${tabEntry.ext}`;
    fs.writeFileSync(path.join(targetDir, tabFileName), tabEntry.buffer);
  }

  const finalName = String(params.packName || manifest.name || commonRoot || packId).trim().slice(0, 64);
  const finalDesc = String(params.description || manifest.description || '').trim().slice(0, 200);

  await upsertStickerPack({
    packId,
    name: finalName,
    description: finalDesc,
    mainUrl: buildStickerAssetUrl(packId, mainFileName),
    tabUrl: buildStickerAssetUrl(packId, tabFileName),
    source: 'uploaded',
    enabled: true,
    items: savedItems,
  });

  const all = await getStickerPacksWithItems();
  return all.find((p) => p.packId === packId);
}

export async function importStickerPackFromZip(params: {
  zipBuffer: Buffer;
  packName?: string;
  description?: string;
  desiredPackId?: string;
}) {
  if (!params.zipBuffer || params.zipBuffer.length === 0) {
    throw new Error('ไฟล์ ZIP ว่างเปล่า');
  }
  if (params.zipBuffer.length > MAX_STICKER_ZIP_BYTES) {
    throw new Error(`ไฟล์ ZIP ต้องไม่เกิน ${Math.round(MAX_STICKER_ZIP_BYTES / 1024 / 1024)} MB`);
  }
  const zip = await JSZip.loadAsync(params.zipBuffer);
  const entries: IncomingStickerFile[] = [];
  for (const [relPath, fileObj] of Object.entries(zip.files)) {
    if (fileObj.dir) continue;
    if (relPath.includes('__MACOSX')) continue;
    const buffer = await fileObj.async('nodebuffer');
    entries.push({ relativePath: relPath, buffer });
  }
  return persistImportedStickerPack({
    packName: params.packName,
    description: params.description,
    desiredPackId: params.desiredPackId,
    entries,
  });
}

export async function importStickerPackFromFiles(params: {
  files: { originalname: string; path: string }[];
  relativePaths?: string[];
  packName?: string;
  description?: string;
  desiredPackId?: string;
}) {
  const entries: IncomingStickerFile[] = params.files.map((f, idx) => ({
    relativePath: params.relativePaths?.[idx] || f.originalname,
    buffer: fs.readFileSync(f.path),
  }));
  return persistImportedStickerPack({
    packName: params.packName,
    description: params.description,
    desiredPackId: params.desiredPackId,
    entries,
  });
}

export async function appendFilesToExistingPack(packId: string, files: { originalname: string; path: string }[]) {
  const packRow = await getStickerPackRow(packId);
  if (!packRow) throw new Error('ไม่พบชุดสติกเกอร์ที่ระบุ');
  const all = await getStickerPacksWithItems();
  const current = all.find((p) => p.packId === packId);
  const currentCount = current?.items?.length || 0;
  if (currentCount + files.length > MAX_STICKERS_PER_PACK) {
    throw new Error(`ชุดนี้มี ${currentCount} ตัวแล้ว เพิ่มได้สูงสุดไม่เกิน ${MAX_STICKERS_PER_PACK} ตัว`);
  }

  const targetDir = path.join(STICKERS_STORAGE_DIR, packId);
  fs.mkdirSync(targetDir, { recursive: true });

  const newItems: { stickerId: string; fileName: string; url: string; alt: string; keywords: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const parsed = path.parse(f.originalname.toLowerCase());
    const buf = fs.readFileSync(f.path);
    if (!isSupportedStickerImageBuffer(buf, parsed.ext)) {
      throw new Error(`ไฟล์ "${f.originalname}" ไม่รองรับ หรือขนาดเกิน 2MB`);
    }
    const baseClean = sanitizeSlug(parsed.name, `st-${currentCount + i + 1}`);
    const fileName = sanitizeAssetFilename(`${Date.now().toString(36)}-${baseClean}${parsed.ext}`);
    fs.writeFileSync(path.join(targetDir, fileName), buf);
    newItems.push({
      stickerId: `${baseClean}-${Date.now().toString(36)}${i}`,
      fileName,
      url: buildStickerAssetUrl(packId, fileName),
      alt: parsed.name.replace(/^\d+[-_]?/, '') || `Sticker ${currentCount + i + 1}`,
      keywords: parsed.name,
    });
  }

  await appendStickerItems(packId, newItems);
  const updated = await getStickerPacksWithItems();
  return updated.find((p) => p.packId === packId);
}

export async function replaceStickerItemImage(
  packId: string,
  stickerId: string,
  file: { originalname: string; path: string }
) {
  const packRow = await getStickerPackRow(packId);
  if (!packRow) throw new Error('ไม่พบชุดสติกเกอร์ที่ระบุ');
  const parsed = path.parse(file.originalname.toLowerCase());
  const buf = fs.readFileSync(file.path);
  if (!isSupportedStickerImageBuffer(buf, parsed.ext)) {
    throw new Error(`ไฟล์ "${file.originalname}" ไม่รองรับ หรือขนาดเกิน 2MB (รองรับ WebP/PNG/GIF/JPG)`);
  }
  const targetDir = path.join(STICKERS_STORAGE_DIR, packId);
  fs.mkdirSync(targetDir, { recursive: true });
  const baseClean = sanitizeSlug(stickerId, 'sticker');
  const newFileName = sanitizeAssetFilename(`${Date.now().toString(36)}-${baseClean}${parsed.ext}`);
  fs.writeFileSync(path.join(targetDir, newFileName), buf);
  const newUrl = buildStickerAssetUrl(packId, newFileName);
  await updateStickerItem(packId, stickerId, { fileName: newFileName, url: newUrl });
  const all = await getStickerPacksWithItems();
  const updatedPack = all.find((p) => p.packId === packId);
  return updatedPack?.items.find((i) => i.stickerId === stickerId) || null;
}

export async function removeStickerItemFromPack(packId: string, stickerId: string) {
  const all = await getStickerPacksWithItems();
  const pack = all.find((p) => p.packId === packId);
  if (!pack) throw new Error('ไม่พบชุดสติกเกอร์');
  if (pack.items.length <= MIN_STICKERS_PER_PACK) {
    throw new Error(`ต้องมีสติกเกอร์อย่างน้อย ${MIN_STICKERS_PER_PACK} ตัวในชุด ไม่สามารถลบจนต่ำกว่าเกณฑ์ได้`);
  }
  const removed = await deleteStickerItemRow(packId, stickerId);
  if (removed?.fileName) {
    const fp = path.join(STICKERS_STORAGE_DIR, packId, path.basename(removed.fileName));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
}

export async function removeStickerPack(packId: string) {
  const pack = await getStickerPackRow(packId);
  if (!pack) return;
  if (pack.source === 'builtin') {
    throw new Error('ไม่สามารถลบชุดสติกเกอร์เริ่มต้น (Built-in) ได้ (สามารถกด "ปิดใช้งาน" แทนได้)');
  }
  // Remove from sticker_packs & sticker_items tables so it disappears from /admin and picker tray,
  // while keeping asset files on disk so existing chat messages that sent stickers from this pack never 404!
  await deleteStickerPackRow(packId);
}

export async function resetStickerPacksToDefaults(opts?: { purgeFiles?: boolean }) {
  await deleteAllUploadedStickerPacks();
  await ensureBuiltInStickerPacks();
  if (opts?.purgeFiles) {
    await cleanupOrphanedStickerDirs();
  }
  return getStickerPacksWithItems({ onlyEnabled: true });
}

export async function cleanupOrphanedStickerDirs() {
  try {
    const activePacks = await getStickerPacksWithItems();
    const activeSet = new Set(activePacks.map((p) => sanitizeSlug(p.packId, '')));
    const entries = fs.readdirSync(STICKERS_STORAGE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!activeSet.has(entry.name)) {
        const dir = path.join(STICKERS_STORAGE_DIR, entry.name);
        if (dir.startsWith(STICKERS_STORAGE_DIR)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    }
  } catch {}
}

export async function buildStickerTemplateZip(): Promise<Buffer> {
  const zip = new JSZip();
  const root = zip.folder('my-sticker-pack-template')!;
  const stickersFolder = root.folder('stickers')!;

  root.file(
    'README.txt',
    [
      'LAN Share Chat — Standard Sticker Pack Template',
      '================================================',
      `1. Sticker count rule: Minimum ${MIN_STICKERS_PER_PACK} | Recommended ${RECOMMENDED_STICKERS_PER_PACK} | Maximum ${MAX_STICKERS_PER_PACK} images per pack`,
      '2. Supported formats: .webp, .png (transparent recommended), animated .gif / .webp (max 2MB each)',
      '3. Special filenames (optional):',
      '   - main.webp / main.png  (240x240 Pack Cover Header)',
      '   - tab.webp / tab.png    (96x96 Pack Tray Tab Icon)',
      '   (If omitted, the server automatically uses Sticker #1 as cover/tab)',
      '4. Place stickers inside stickers/ numbered sequentially (01-hello.webp, 02-ok.webp, ...)',
      '5. Zip this folder (or select the whole folder in /admin -> Stickers) to import!',
      '',
    ].join('\n')
  );

  const sampleManifest = {
    id: 'my-custom-pack',
    name: 'ชุดสติกเกอร์ของฉัน (ตัวอย่าง)',
    description: 'แก้ไขข้อความใน manifest.json และเปลี่ยนรูปใน stickers/ แล้วบีบอัดเป็น .zip เพื่ออัปโหลดใน /admin',
    main: 'main.webp',
    tab: 'tab.webp',
    items: [
      { id: '01-good-morning', file: '01-good-morning.webp', alt: 'สวัสดีตอนเช้า', keywords: 'morning hello สวัสดี' },
      { id: '02-sawasdee', file: '02-sawasdee.webp', alt: 'สวัสดีครับ/ค่ะ', keywords: 'sawasdee hello สวัสดี' },
      { id: '03-ok', file: '03-ok-thumbsup.webp', alt: 'โอเค รับทราบ!', keywords: 'ok thumbsup โอเค รับทราบ' },
      { id: '04-thank-you', file: '04-thank-you.webp', alt: 'ขอบคุณมากๆ', keywords: 'thank you love ขอบคุณ' },
    ],
  };
  root.file('manifest.json', JSON.stringify(sampleManifest, null, 2));

  const starterDir = path.join(STICKERS_BUILTIN_DIR, 'starter-office-animals');
  const copyIfPresent = (srcName: string, destFolder: JSZip, destName = srcName) => {
    const p = path.join(starterDir, srcName);
    if (fs.existsSync(p)) {
      destFolder.file(destName, fs.readFileSync(p));
    }
  };
  copyIfPresent('main.webp', root, 'main.webp');
  copyIfPresent('tab.webp', root, 'tab.webp');
  for (const item of sampleManifest.items) {
    copyIfPresent(item.file, stickersFolder, item.file);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
