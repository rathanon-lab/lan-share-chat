import type { StickerCollageLayer, StickerItem, StickerMessageMeta, StickerPack } from '@/types/chat';

export interface CollageDraftLayer extends StickerCollageLayer {
  uid: string;
  pack: StickerPack;
  item: StickerItem;
}

export type DockedStickerDraft =
  | { mode: 'single'; pack: StickerPack; item: StickerItem }
  | { mode: 'collage'; activeUid: string | null; layers: CollageDraftLayer[] };

export const MAX_COLLAGE_LAYERS = 6;

const PRESET_OFFSETS: Array<{ x: number; y: number }> = [
  { x: 38, y: 50 },
  { x: 64, y: 50 },
  { x: 24, y: 46 },
  { x: 78, y: 46 },
  { x: 50, y: 36 },
  { x: 50, y: 66 },
];

function makeUid(): string {
  return `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeLayer(
  pack: StickerPack,
  item: StickerItem,
  x: number,
  y: number,
  scale = 1,
  rotation = 0
): CollageDraftLayer {
  return {
    uid: makeUid(),
    pack,
    item,
    packId: pack.packId,
    stickerId: item.stickerId,
    url: item.url,
    alt: item.alt || item.stickerId,
    x,
    y,
    scale,
    rotation,
  };
}

export function draftSelectSticker(
  prev: DockedStickerDraft | null,
  pack: StickerPack,
  item: StickerItem,
  enterCollage = false,
  collageEnabled = true
): DockedStickerDraft {
  if (collageEnabled && (enterCollage || prev?.mode === 'collage')) {
    if (!prev) {
      const first = makeLayer(pack, item, 50, 50);
      return { mode: 'collage', activeUid: first.uid, layers: [first] };
    }
    if (prev.mode === 'single') {
      if (prev.pack.packId === pack.packId && prev.item.stickerId === item.stickerId && enterCollage) {
        const only = makeLayer(prev.pack, prev.item, 50, 50);
        return { mode: 'collage', activeUid: only.uid, layers: [only] };
      }
      const first = makeLayer(prev.pack, prev.item, PRESET_OFFSETS[0].x, PRESET_OFFSETS[0].y);
      const second = makeLayer(pack, item, PRESET_OFFSETS[1].x, PRESET_OFFSETS[1].y);
      return { mode: 'collage', activeUid: second.uid, layers: [first, second] };
    }
    if (prev.layers.length >= MAX_COLLAGE_LAYERS) {
      return prev;
    }
    const slot = PRESET_OFFSETS[prev.layers.length] || { x: 50, y: 50 };
    const nextLayer = makeLayer(pack, item, slot.x, slot.y);
    return {
      mode: 'collage',
      activeUid: nextLayer.uid,
      layers: [...prev.layers, nextLayer],
    };
  }
  return { mode: 'single', pack, item };
}

export function draftEnterCollageMode(prev: DockedStickerDraft | null): DockedStickerDraft | null {
  if (!prev) return null;
  if (prev.mode === 'collage') return prev;
  const first = makeLayer(prev.pack, prev.item, 50, 50);
  return { mode: 'collage', activeUid: first.uid, layers: [first] };
}

export function draftBuildMessagePayload(
  draft: DockedStickerDraft
): { pack: StickerPack; item: StickerItem; customMeta?: StickerMessageMeta } | null {
  if (draft.mode === 'single') {
    return { pack: draft.pack, item: draft.item };
  }
  if (draft.layers.length === 0) return null;
  const first = draft.layers[0];
  const cleanLayers: StickerCollageLayer[] = draft.layers.map((l) => ({
    packId: l.packId,
    stickerId: l.stickerId,
    url: l.url,
    alt: l.alt,
    x: l.x,
    y: l.y,
    scale: l.scale,
    rotation: l.rotation,
  }));
  const alt = cleanLayers.map((l) => l.alt || l.stickerId).filter(Boolean).join(' + ').slice(0, 80) || 'sticker';
  return {
    pack: first.pack,
    item: first.item,
    customMeta: {
      packId: first.packId,
      stickerId: first.stickerId,
      url: first.url,
      alt,
      layers: cleanLayers,
    },
  };
}
