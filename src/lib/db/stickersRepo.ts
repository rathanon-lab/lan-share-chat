import { dbAll, dbGet, dbRun } from './client';

export interface StickerItemRow {
  id?: number;
  packId?: string;
  stickerId: string;
  fileName: string;
  url: string;
  alt: string;
  keywords: string;
  sortOrder: number;
}

export interface StickerPackRow {
  packId: string;
  name: string;
  description: string;
  mainUrl: string;
  tabUrl: string;
  source: 'builtin' | 'uploaded';
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  items: StickerItemRow[];
}

interface StickerPackSqlRow {
  packId: string;
  name: string;
  description?: string;
  mainUrl?: string;
  tabUrl?: string;
  source?: string;
  enabled?: number;
  sortOrder?: number;
  createdAt?: number;
}

export async function getStickerPacksWithItems(opts?: { onlyEnabled?: boolean }): Promise<StickerPackRow[]> {
  const packs = await dbAll<StickerPackSqlRow>(
    opts?.onlyEnabled
      ? 'SELECT * FROM sticker_packs WHERE enabled = 1 ORDER BY sortOrder ASC, createdAt ASC'
      : 'SELECT * FROM sticker_packs ORDER BY sortOrder ASC, createdAt ASC'
  );
  if (packs.length === 0) return [];
  const items = await dbAll<StickerItemRow>('SELECT * FROM stickers ORDER BY sortOrder ASC, id ASC');
  const byPack = new Map<string, StickerItemRow[]>();
  for (const item of items) {
    const pid = item.packId || '';
    if (!byPack.has(pid)) byPack.set(pid, []);
    byPack.get(pid)!.push(item);
  }
  return packs.map((p) => ({
    packId: p.packId,
    name: p.name,
    description: p.description || '',
    mainUrl: p.mainUrl || '',
    tabUrl: p.tabUrl || '',
    source: p.source === 'builtin' ? 'builtin' : 'uploaded',
    enabled: Boolean(p.enabled),
    sortOrder: Number(p.sortOrder) || 0,
    createdAt: Number(p.createdAt) || Date.now(),
    items: byPack.get(p.packId) || [],
  }));
}

export async function getStickerPackRow(packId: string): Promise<StickerPackSqlRow | undefined> {
  return dbGet<StickerPackSqlRow>('SELECT * FROM sticker_packs WHERE packId = ?', [packId]);
}

export async function upsertStickerPack(pack: {
  packId: string;
  name: string;
  description?: string;
  mainUrl: string;
  tabUrl: string;
  source: 'builtin' | 'uploaded';
  enabled?: boolean;
  sortOrder?: number;
  createdAt?: number;
  items: { stickerId: string; fileName: string; url: string; alt: string; keywords: string; sortOrder: number }[];
}): Promise<void> {
  const existing = await getStickerPackRow(pack.packId);
  const sortOrder =
    typeof pack.sortOrder === 'number'
      ? pack.sortOrder
      : existing
        ? Number(existing.sortOrder)
        : Number((await dbGet<{ m: number }>('SELECT COALESCE(MAX(sortOrder), -1) + 1 AS m FROM sticker_packs'))?.m || 0);
  const enabledVal = existing ? Number(existing.enabled) : pack.enabled === false ? 0 : 1;
  const createdAt = existing ? Number(existing.createdAt) : pack.createdAt || Date.now();

  await dbRun(
    `INSERT OR REPLACE INTO sticker_packs (packId, name, description, mainUrl, tabUrl, source, enabled, sortOrder, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pack.packId,
      pack.name,
      pack.description || '',
      pack.mainUrl,
      pack.tabUrl,
      pack.source,
      enabledVal,
      sortOrder,
      createdAt,
    ]
  );

  await dbRun('DELETE FROM stickers WHERE packId = ?', [pack.packId]);
  for (const item of pack.items) {
    await dbRun(
      `INSERT INTO stickers (packId, stickerId, fileName, url, alt, keywords, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pack.packId, item.stickerId, item.fileName, item.url, item.alt, item.keywords, item.sortOrder]
    );
  }
}

export async function updateStickerPackMeta(
  packId: string,
  updates: { name?: string; description?: string; enabled?: boolean; sortOrder?: number; mainUrl?: string; tabUrl?: string }
): Promise<void> {
  const existing = await getStickerPackRow(packId);
  if (!existing) return;
  await dbRun(
    'UPDATE sticker_packs SET name = ?, description = ?, enabled = ?, sortOrder = ?, mainUrl = ?, tabUrl = ? WHERE packId = ?',
    [
      updates.name ?? existing.name,
      updates.description ?? existing.description,
      typeof updates.enabled === 'boolean' ? (updates.enabled ? 1 : 0) : existing.enabled,
      typeof updates.sortOrder === 'number' ? updates.sortOrder : existing.sortOrder,
      updates.mainUrl ?? existing.mainUrl,
      updates.tabUrl ?? existing.tabUrl,
      packId,
    ]
  );
}

export async function reorderStickerPacks(packIds: string[]): Promise<void> {
  for (let i = 0; i < packIds.length; i++) {
    await dbRun('UPDATE sticker_packs SET sortOrder = ? WHERE packId = ?', [i, packIds[i]]);
  }
}

export async function appendStickerItems(
  packId: string,
  items: { stickerId: string; fileName: string; url: string; alt: string; keywords: string }[]
): Promise<void> {
  const maxRow = await dbGet<{ m: number }>('SELECT COALESCE(MAX(sortOrder), -1) AS m FROM stickers WHERE packId = ?', [packId]);
  let order = (Number(maxRow?.m) ?? -1) + 1;
  for (const item of items) {
    await dbRun(
      `INSERT INTO stickers (packId, stickerId, fileName, url, alt, keywords, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [packId, item.stickerId, item.fileName, item.url, item.alt, item.keywords, order++]
    );
  }
}

export async function updateStickerItem(
  packId: string,
  stickerId: string,
  updates: { alt?: string; keywords?: string; fileName?: string; url?: string }
): Promise<void> {
  const row = await dbGet<StickerItemRow>('SELECT * FROM stickers WHERE packId = ? AND stickerId = ?', [packId, stickerId]);
  if (!row) return;
  await dbRun('UPDATE stickers SET alt = ?, keywords = ?, fileName = ?, url = ? WHERE packId = ? AND stickerId = ?', [
    updates.alt ?? row.alt,
    updates.keywords ?? row.keywords,
    updates.fileName ?? row.fileName,
    updates.url ?? row.url,
    packId,
    stickerId,
  ]);
}

export async function deleteStickerItemRow(packId: string, stickerId: string): Promise<StickerItemRow | null> {
  const row = await dbGet<StickerItemRow>('SELECT * FROM stickers WHERE packId = ? AND stickerId = ?', [packId, stickerId]);
  if (!row) return null;
  await dbRun('DELETE FROM stickers WHERE packId = ? AND stickerId = ?', [packId, stickerId]);
  return row;
}

export async function deleteStickerPackRow(packId: string): Promise<void> {
  await dbRun('DELETE FROM stickers WHERE packId = ?', [packId]);
  await dbRun('DELETE FROM sticker_packs WHERE packId = ?', [packId]);
}

export async function deleteAllUploadedStickerPacks(): Promise<void> {
  await dbRun("DELETE FROM stickers WHERE packId IN (SELECT packId FROM sticker_packs WHERE source != 'builtin')");
  await dbRun("DELETE FROM sticker_packs WHERE source != 'builtin'");
  await dbRun("UPDATE sticker_packs SET enabled = 1, sortOrder = 0 WHERE source = 'builtin'");
}
