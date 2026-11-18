import type { StickerCollageLayer, StickerMessageMeta } from '../types/chat';

function isSafeStickerUrl(url: string): boolean {
  return url.startsWith('/api/stickers/') || url.startsWith('/stickers/');
}

function clampNum(raw: unknown, minVal: number, maxVal: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(minVal, Math.min(maxVal, Math.round(n * 100) / 100));
}

export function sanitizeStickerMeta(raw: unknown): StickerMessageMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawUrl = String(obj.url || '').slice(0, 250);
  const rawLayers = Array.isArray(obj.layers) ? obj.layers.slice(0, 8) : [];

  const cleanLayers: StickerCollageLayer[] = [];
  for (const entry of rawLayers) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const url = String(item.url || '').slice(0, 250);
    if (!isSafeStickerUrl(url)) continue;
    cleanLayers.push({
      packId: String(item.packId || '').slice(0, 64),
      stickerId: String(item.stickerId || '').slice(0, 80),
      url,
      alt: String(item.alt || '').slice(0, 80) || undefined,
      x: clampNum(item.x, 5, 95, 50),
      y: clampNum(item.y, 8, 92, 50),
      scale: clampNum(item.scale, 0.35, 2.4, 1),
      rotation: clampNum(item.rotation, -180, 180, 0),
    });
  }

  const fallbackUrl = cleanLayers[0]?.url || '';
  const url = isSafeStickerUrl(rawUrl) ? rawUrl : fallbackUrl;
  if (!url) return null;

  const packId = String(obj.packId || cleanLayers[0]?.packId || '').slice(0, 64);
  const stickerId = String(obj.stickerId || cleanLayers[0]?.stickerId || '').slice(0, 80);
  const alt = String(obj.alt || cleanLayers.map((l) => l.alt).filter(Boolean).join(' + ') || 'sticker').slice(0, 80);

  return {
    packId,
    stickerId,
    url,
    alt,
    ...(cleanLayers.length > 0 ? { layers: cleanLayers } : {}),
  };
}

export function buildStickerDedupeKey(meta: StickerMessageMeta | null): string | undefined {
  if (!meta) return undefined;
  if (meta.layers && meta.layers.length > 0) {
    return `collage:${meta.layers.map((l) => `${l.stickerId}@${Math.round(l.x)},${Math.round(l.y)}`).join('+')}`;
  }
  return `sticker:${meta.packId}:${meta.stickerId}`;
}
