export interface RecentStickerRef {
  packId: string;
  stickerId: string;
  usedAt: number;
}

const RECENT_EMOJIS_KEY = 'lsc_recent_emojis_v1';
const RECENT_STICKERS_KEY = 'lsc_recent_stickers_v1';
const HIDDEN_PACKS_KEY = 'lsc_hidden_sticker_packs_v1';
const PACK_ORDER_KEY = 'lsc_sticker_pack_order_v1';

const MAX_RECENT_EMOJIS = 24;
const MAX_RECENT_STICKERS = 16;

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors in restricted browsing modes
  }
}

export function loadRecentEmojis(): string[] {
  const arr = safeReadJson<unknown>(RECENT_EMOJIS_KEY, []);
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
}

export function pushRecentEmoji(char: string): string[] {
  const current = loadRecentEmojis().filter((c) => c !== char);
  const next = [char, ...current].slice(0, MAX_RECENT_EMOJIS);
  safeWriteJson(RECENT_EMOJIS_KEY, next);
  return next;
}

export function loadRecentStickers(): RecentStickerRef[] {
  const arr = safeReadJson<unknown>(RECENT_STICKERS_KEY, []);
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (x): x is RecentStickerRef =>
      Boolean(x && typeof x === 'object' && typeof (x as RecentStickerRef).packId === 'string' && typeof (x as RecentStickerRef).stickerId === 'string')
  );
}

export function pushRecentSticker(packId: string, stickerId: string): RecentStickerRef[] {
  const current = loadRecentStickers().filter(
    (s) => !(s.packId === packId && s.stickerId === stickerId)
  );
  const next: RecentStickerRef[] = [{ packId, stickerId, usedAt: Date.now() }, ...current].slice(0, MAX_RECENT_STICKERS);
  safeWriteJson(RECENT_STICKERS_KEY, next);
  return next;
}

export function loadHiddenPackIds(): string[] {
  const arr = safeReadJson<unknown>(HIDDEN_PACKS_KEY, []);
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
}

export function saveHiddenPackIds(ids: string[]): void {
  safeWriteJson(HIDDEN_PACKS_KEY, Array.from(new Set(ids)));
}

export function loadLocalPackOrder(): string[] {
  const arr = safeReadJson<unknown>(PACK_ORDER_KEY, []);
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
}

export function saveLocalPackOrder(packIds: string[]): void {
  safeWriteJson(PACK_ORDER_KEY, packIds);
}
