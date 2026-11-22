"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Smile, Sticker as StickerIcon, Clock, Settings, X, Search,
  ArrowUp, ArrowDown, Eye, EyeOff, FolderUp, Sparkles, Maximize2, Minimize2
} from "lucide-react";
import type { StickerItem, StickerPack, StickerPickerGifMode, StickerPreviewMode } from "@/types/chat";
import { useVisibilityInViewport } from "@/lib/secureMedia";
import { UNIFIED_EMOJI_CATEGORIES, UnifiedEmojiItem } from "@/features/stickers/lib/emojiCatalog";
import {
  loadHiddenPackIds,
  loadLocalPackOrder,
  loadRecentEmojis,
  loadRecentStickers,
  pushRecentEmoji,
  pushRecentSticker,
  RecentStickerRef,
  saveHiddenPackIds,
  saveLocalPackOrder,
} from "@/features/stickers/lib/recentStickers";
import { StickerPreSendModal } from "@/features/stickers/components/StickerPreviewModals";

interface EmojiStickerPickerProps {
  packs: StickerPack[];
  initialTab?: 'emoji' | 'sticker';
  isDark?: boolean;
  previewMode?: StickerPreviewMode;
  collageEnabled?: boolean;
  gifMode?: StickerPickerGifMode;
  onSelectEmoji: (char: string) => void;
  onSendSticker: (pack: StickerPack, item: StickerItem) => void;
  onStageStickerForTray?: (pack: StickerPack, item: StickerItem, enterCollage?: boolean) => void;
  onClose: () => void;
  showAdminShortcut?: boolean;
}

/**
 * Viewport-gated sticker tile for EmojiStickerPicker.
 * - Unmounts off-screen <img> elements so iPad/mobile Safari only decodes visible rows.
 * - Supports both Option B ('live_viewport': animated GIF while visible) and
 *   Option A ('static_poster': lightweight Lossy WebP first-frame poster, animated on hover).
 */
function ViewportStickerImg({
  url,
  alt,
  className,
  gifMode = 'live_viewport',
  scrollRoot,
}: {
  url: string;
  alt: string;
  className: string;
  gifMode?: StickerPickerGifMode;
  scrollRoot?: Element | null;
}) {
  const { ref, inView } = useVisibilityInViewport('90px', scrollRoot);
  const [hovered, setHovered] = useState(false);
  const isAnimatedExt = /\.(gif|webp|apng)(\?|$)/i.test(url);
  const usePoster = gifMode === 'static_poster' && isAnimatedExt && !hovered && url.startsWith('/api/stickers/asset/');
  const resolvedSrc = usePoster ? `${url}${url.includes('?') ? '&' : '?'}poster=1` : url;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`inline-flex items-center justify-center ${className}`}
    >
      {inView ? (
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain group-hover:scale-105 transition-transform"
          draggable={false}
        />
      ) : (
        <div aria-hidden="true" className="w-full h-full rounded-xl bg-slate-200/40 dark:bg-slate-800/40" />
      )}
    </div>
  );
}

const EMOJI_CATEGORY_ICONS: Record<string, string> = {
  smileys: '/emoji/twemoji/1f600.svg',
  gestures: '/emoji/twemoji/1f44d.svg',
  hearts: '/emoji/twemoji/2764-fe0f.svg',
  animals: '/emoji/twemoji/1f431.svg',
  work: '/emoji/twemoji/1f4bb.svg',
  celebration: '/emoji/twemoji/1f389.svg',
};

export function EmojiStickerPicker({
  packs,
  initialTab = 'sticker',
  isDark = false,
  previewMode = 'fullscreen_modal',
  collageEnabled = true,
  gifMode = 'live_viewport',
  onSelectEmoji,
  onSendSticker,
  onStageStickerForTray,
  onClose,
  showAdminShortcut = true,
}: EmojiStickerPickerProps) {
  const [mode, setMode] = useState<'emoji' | 'sticker'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [recentStickers, setRecentStickers] = useState<RecentStickerRef[]>([]);
  const [hiddenPackIds, setHiddenPackIds] = useState<string[]>([]);
  const [localPackOrder, setLocalPackOrder] = useState<string[]>([]);

  const [activeEmojiCat, setActiveEmojiCat] = useState<string>('smileys');
  const [activeStickerTab, setActiveStickerTab] = useState<string>('');
  const [stagedSticker, setStagedSticker] = useState<{ pack: StickerPack; item: StickerItem } | null>(null);
  const [drawerHeightPx, setDrawerHeightPx] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [scrollRootEl, setScrollRootEl] = useState<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = drawerRef.current?.getBoundingClientRect().height || 300;
    const onMove = (ev: PointerEvent) => {
      const maxH = Math.round((window.innerHeight || 800) * 0.88);
      const nextH = Math.max(200, Math.min(maxH, Math.round(startH + (startY - ev.clientY))));
      setDrawerHeightPx(nextH);
      setIsExpanded(nextH > maxH * 0.72);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const toggleExpandDrawer = () => {
    if (isExpanded) {
      setIsExpanded(false);
      setDrawerHeightPx(null);
    } else {
      setIsExpanded(true);
      setDrawerHeightPx(Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.84));
    }
  };

  useEffect(() => {
    setRecentEmojis(loadRecentEmojis());
    setRecentStickers(loadRecentStickers());
    setHiddenPackIds(loadHiddenPackIds());
    setLocalPackOrder(loadLocalPackOrder());
  }, []);

  // Sort server-enabled packs by per-device override order (if any)
  const orderedEnabledPacks = useMemo(() => {
    const enabled = packs.filter((p) => p.enabled && p.items.length > 0);
    if (localPackOrder.length === 0) return enabled;
    const rank = new Map(localPackOrder.map((id, idx) => [id, idx]));
    return [...enabled].sort((a, b) => {
      const ra = rank.has(a.packId) ? rank.get(a.packId)! : 9999 + a.sortOrder;
      const rb = rank.has(b.packId) ? rank.get(b.packId)! : 9999 + b.sortOrder;
      return ra - rb;
    });
  }, [packs, localPackOrder]);

  const visiblePacks = useMemo(
    () => orderedEnabledPacks.filter((p) => !hiddenPackIds.includes(p.packId)),
    [orderedEnabledPacks, hiddenPackIds]
  );

  // Select default pack cleanly on mount or when packs arrive
  useEffect(() => {
    if (visiblePacks.length === 0) {
      setActiveStickerTab('recent');
      return;
    }
    if (!activeStickerTab || (activeStickerTab !== 'recent' && !visiblePacks.some((p) => p.packId === activeStickerTab))) {
      setActiveStickerTab(visiblePacks[0].packId);
    }
  }, [visiblePacks, activeStickerTab]);

  // Flat emoji lookup for Recent Emoji grid
  const emojiByChar = useMemo(() => {
    const map = new Map<string, UnifiedEmojiItem>();
    for (const cat of UNIFIED_EMOJI_CATEGORIES) {
      for (const item of cat.items) map.set(item.char, item);
    }
    return map;
  }, []);

  // Filter emojis by query or active category
  const displayedEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return UNIFIED_EMOJI_CATEGORIES.flatMap((c) => c.items).filter(
        (item) => item.keywords.toLowerCase().includes(q) || item.char.includes(q)
      );
    }
    if (activeEmojiCat === 'recent') {
      return recentEmojis
        .map((c) => emojiByChar.get(c))
        .filter((x): x is UnifiedEmojiItem => Boolean(x));
    }
    return UNIFIED_EMOJI_CATEGORIES.find((c) => c.id === activeEmojiCat)?.items || UNIFIED_EMOJI_CATEGORIES[0].items;
  }, [searchQuery, activeEmojiCat, recentEmojis, emojiByChar]);

  const activePack = useMemo(
    () => visiblePacks.find((p) => p.packId === activeStickerTab) || null,
    [visiblePacks, activeStickerTab]
  );

  // Resolve recent stickers against currently loaded visible packs
  const resolvedRecentStickers = useMemo(() => {
    const result: { pack: StickerPack; item: StickerItem }[] = [];
    for (const ref of recentStickers) {
      const pack = visiblePacks.find((p) => p.packId === ref.packId);
      const item = pack?.items.find((i) => i.stickerId === ref.stickerId);
      if (pack && item) result.push({ pack, item });
    }
    return result;
  }, [recentStickers, visiblePacks]);

  // Sticker search across all visible packs when searchQuery is non-empty
  const searchedStickers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const matches: { pack: StickerPack; item: StickerItem }[] = [];
    for (const pack of visiblePacks) {
      for (const item of pack.items) {
        if (
          item.alt.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q) ||
          pack.name.toLowerCase().includes(q)
        ) {
          matches.push({ pack, item });
        }
      }
    }
    return matches;
  }, [searchQuery, visiblePacks]);

  const handleEmojiClick = (item: UnifiedEmojiItem) => {
    setRecentEmojis(pushRecentEmoji(item.char));
    onSelectEmoji(item.char);
  };

  const handleStickerClick = (pack: StickerPack, item: StickerItem, enterCollage = false) => {
    if (previewMode === 'docked_tray' && onStageStickerForTray) {
      setRecentStickers(pushRecentSticker(pack.packId, item.stickerId));
      onStageStickerForTray(pack, item, enterCollage);
      return;
    }
    setStagedSticker({ pack, item });
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  const stickerTileHandlers = (pack: StickerPack, item: StickerItem) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (previewMode !== 'docked_tray' || !collageEnabled || !onStageStickerForTray) return;
      clearLongPress();
      suppressNextClickRef.current = false;
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        suppressNextClickRef.current = true;
        handleStickerClick(pack, item, true);
        clearLongPress();
      }, 360);
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const start = longPressStartRef.current;
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
        clearLongPress();
      }
    },
    onPointerUp: clearLongPress,
    onPointerCancel: clearLongPress,
    onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (previewMode === 'docked_tray' && collageEnabled) e.preventDefault();
    },
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      handleStickerClick(pack, item, e.shiftKey);
    },
  });

  const confirmSendStagedSticker = () => {
    if (!stagedSticker) return;
    setRecentStickers(pushRecentSticker(stagedSticker.pack.packId, stagedSticker.item.stickerId));
    onSendSticker(stagedSticker.pack, stagedSticker.item);
    setStagedSticker(null);
  };

  const toggleHidePack = (packId: string) => {
    const next = hiddenPackIds.includes(packId)
      ? hiddenPackIds.filter((id) => id !== packId)
      : [...hiddenPackIds, packId];
    setHiddenPackIds(next);
    saveHiddenPackIds(next);
  };

  const movePackOrder = (packId: string, dir: -1 | 1) => {
    const ids = orderedEnabledPacks.map((p) => p.packId);
    const idx = ids.indexOf(packId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= ids.length) return;
    const copy = [...ids];
    const [picked] = copy.splice(idx, 1);
    copy.splice(target, 0, picked);
    setLocalPackOrder(copy);
    saveLocalPackOrder(copy);
  };

  const gridBtnHover = isDark ? 'hover:bg-slate-800/90' : 'hover:bg-slate-100';
  const sectionLabelCls = isDark ? 'text-slate-300' : 'text-slate-500';
  const tabActiveCls = isDark
    ? 'bg-blue-950/70 text-blue-300 border border-blue-500/40'
    : 'bg-blue-50 text-blue-600 border border-blue-200';
  const tabIdleCls = isDark
    ? 'text-slate-400 hover:bg-slate-800/80'
    : 'text-slate-500 hover:bg-slate-200/70';

  return (
    <>
      <div
        ref={drawerRef}
        data-testid="emoji-sticker-picker"
        data-theme={isDark ? 'dark' : 'light'}
        className={`border-t flex flex-col select-none shrink-0 backdrop-blur-md animate-in slide-in-from-bottom-2 duration-150 ${
          isDark
            ? 'border-slate-800 bg-slate-900/95 text-slate-100'
            : 'border-slate-200 bg-white/95 text-slate-800'
        }`}
        style={{ height: drawerHeightPx ? `${drawerHeightPx}px` : 'clamp(250px, 38dvh, 340px)' }}
      >
        {/* Top Drag Handle Bar (drag up/down to resize tray height) */}
        <div
          data-testid="picker-drag-handle"
          onPointerDown={handleDragStart}
          title="ลากขึ้น–ลงเพื่อปรับขนาดถาดสติกเกอร์"
          className={`flex items-center justify-center py-1.5 cursor-ns-resize touch-none shrink-0 ${
            isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100/80'
          }`}
        >
          <span className={`w-10 h-1 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
        </div>
        {/* Top Tab Strip: [Emoji | Sticker] Toggle + Scrollable Tabs + Gear + Close */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-2 border-b shrink-0 ${
          isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-100 bg-slate-50/80'
        }`}
      >
        {/* Toggle Pill: 😊 Emoji vs 🎨 Stickers */}
        <div
          data-testid="picker-mode-toggle"
          className={`flex items-center p-0.5 rounded-full shrink-0 border ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200/80 border-slate-200'
          }`}
        >
          <button
            type="button"
            data-testid="picker-mode-emoji"
            onClick={() => { setMode('emoji'); setIsSettingsOpen(false); }}
            title="อีโมจิมาตรฐานข้ามระบบ (Twemoji SVG)"
            className={`w-8 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              mode === 'emoji' && !isSettingsOpen
                ? isDark
                  ? 'bg-slate-700 text-blue-400 shadow-sm'
                  : 'bg-white text-blue-600 shadow-sm'
                : isDark
                  ? 'text-slate-400 hover:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smile size={16} />
          </button>
          <button
            type="button"
            data-testid="picker-mode-stickers"
            onClick={() => { setMode('sticker'); setIsSettingsOpen(false); }}
            title="ชุดสติกเกอร์ห้องแชท"
            className={`w-8 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              mode === 'sticker' && !isSettingsOpen
                ? isDark
                  ? 'bg-slate-700 text-blue-400 shadow-sm'
                  : 'bg-white text-blue-600 shadow-sm'
                : isDark
                  ? 'text-slate-400 hover:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <StickerIcon size={16} />
          </button>
        </div>

        {/* Scrollable Category / Pack Bar */}
        <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 px-0.5">
          {mode === 'emoji' ? (
            <>
              <button
                type="button"
                onClick={() => { setActiveEmojiCat('recent'); setIsSettingsOpen(false); }}
                title="ใช้ล่าสุด"
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition cursor-pointer ${
                  activeEmojiCat === 'recent' && !isSettingsOpen ? tabActiveCls : tabIdleCls
                }`}
              >
                <Clock size={16} />
              </button>
              {UNIFIED_EMOJI_CATEGORIES.map((cat) => {
                const iconSrc = EMOJI_CATEGORY_ICONS[cat.id] || cat.items[0]?.src;
                const active = activeEmojiCat === cat.id && !isSettingsOpen;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { setActiveEmojiCat(cat.id); setIsSettingsOpen(false); }}
                    title={cat.label}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition cursor-pointer ${
                      active
                        ? `${tabActiveCls} shadow-2xs`
                        : `${isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-200/70'} opacity-80 hover:opacity-100`
                    }`}
                  >
                    <img src={iconSrc} alt={cat.label} className="w-5 h-5 object-contain" draggable={false} />
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setActiveStickerTab('recent'); setIsSettingsOpen(false); }}
                title="สติกเกอร์ใช้ล่าสุด"
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition cursor-pointer ${
                  activeStickerTab === 'recent' && !isSettingsOpen ? tabActiveCls : tabIdleCls
                }`}
              >
                <Clock size={16} />
              </button>
              {visiblePacks.map((pack) => {
                const active = activeStickerTab === pack.packId && !isSettingsOpen;
                return (
                  <button
                    key={pack.packId}
                    type="button"
                    data-testid={`sticker-pack-tab-${pack.packId}`}
                    onClick={() => { setActiveStickerTab(pack.packId); setIsSettingsOpen(false); }}
                    title={`${pack.name} (${pack.items.length})`}
                    className={`w-8 h-8 rounded-lg p-1 flex items-center justify-center shrink-0 transition cursor-pointer ${
                      active
                        ? `${tabActiveCls} shadow-2xs`
                        : `${isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-200/70'} opacity-80 hover:opacity-100`
                    }`}
                  >
                    <img
                      src={pack.tabUrl || pack.items[0]?.url}
                      alt={pack.name}
                      className="w-full h-full object-contain"
                      draggable={false}
                    />
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Right Controls: Expand ⤢ + Gear ⚙️ (Per-device pack settings) + Close ✕ */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="picker-expand-btn"
            onClick={toggleExpandDrawer}
            title={isExpanded ? "ย่อถาดสติกเกอร์กลับขนาดปกติ" : "ขยายถาดสติกเกอร์"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition cursor-pointer ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800'
            }`}
          >
            {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            data-testid="picker-settings-btn"
            onClick={() => setIsSettingsOpen((v) => !v)}
            title="ตั้งค่าชุดสติกเกอร์ของเครื่องนี้"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition cursor-pointer ${
              isSettingsOpen
                ? 'bg-blue-600 text-white'
                : isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800'
            }`}
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            data-testid="picker-close-btn"
            onClick={onClose}
            title="ปิดถาดสติกเกอร์"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition cursor-pointer ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800'
            }`}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Picker Body */}
      {isSettingsOpen ? (
        <div className={`flex-1 overflow-y-auto p-3 space-y-2.5 ${isDark ? 'bg-slate-900/60' : 'bg-slate-50/50'}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className={`text-xs font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                จัดการชุดสติกเกอร์บนเครื่องนี้
              </h4>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                ซ่อน/แสดง หรือจัดลำดับแท็บสติกเกอร์ส่วนตัว (ไม่มีผลกับเครื่องอื่น)
              </p>
            </div>
            {showAdminShortcut && (
              <Link
                href="/admin?tab=stickers"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  isDark
                    ? 'bg-blue-950/60 hover:bg-blue-900/70 text-blue-300 border-blue-800'
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                }`}
              >
                <FolderUp size={13} /> อัปโหลดแพ็กเพิ่มใน Admin
              </Link>
            )}
          </div>

          <div className="space-y-1.5">
            {orderedEnabledPacks.map((pack, idx) => {
              const hidden = hiddenPackIds.includes(pack.packId);
              return (
                <div
                  key={pack.packId}
                  className={`flex items-center gap-2.5 border rounded-xl px-3 py-2 ${
                    isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
                  }`}
                >
                  <img src={pack.tabUrl || pack.mainUrl} alt={pack.name} className="w-8 h-8 object-contain shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                      {pack.name}
                    </div>
                    <div className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {pack.items.length} ตัว · {pack.source === 'builtin' ? 'Built-in Starter' : 'Admin Upload'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => movePackOrder(pack.packId, -1)}
                      className={`p-1.5 rounded-lg disabled:opacity-30 cursor-pointer ${
                        isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                      title="เลื่อนขึ้น"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === orderedEnabledPacks.length - 1}
                      onClick={() => movePackOrder(pack.packId, 1)}
                      className={`p-1.5 rounded-lg disabled:opacity-30 cursor-pointer ${
                        isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                      title="เลื่อนลง"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleHidePack(pack.packId)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                        hidden
                          ? isDark
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-slate-100 text-slate-600'
                          : isDark
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                      {hidden ? 'ซ่อนอยู่' : 'แสดงอยู่'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Compact Search Filter */}
          <div className="px-3 pt-2 pb-1.5 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={mode === 'emoji' ? 'ค้นหาอีโมจิ (เช่น ยิ้ม, รัก, โอเค, fire)...' : 'ค้นหาสติกเกอร์ (เช่น สวัสดี, 555, ขอบคุณ)...'}
                className={`w-full pl-8 pr-7 py-1.5 border rounded-full text-xs placeholder:text-slate-400 focus:outline-none transition ${
                  isDark
                    ? 'bg-slate-800/90 border-slate-700 text-slate-100 focus:border-blue-500 focus:bg-slate-800'
                    : 'bg-slate-100 border-slate-200 text-slate-800 focus:border-blue-400 focus:bg-white'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer ${
                    isDark ? 'hover:text-slate-200' : 'hover:text-slate-600'
                  }`}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Content Grid */}
          <div ref={setScrollRootEl} className="flex-1 overflow-y-auto px-3 pb-3">
            {mode === 'emoji' ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[11px] font-bold ${sectionLabelCls}`}>
                    {searchQuery.trim()
                      ? `ผลการค้นหา (${displayedEmojis.length})`
                      : activeEmojiCat === 'recent'
                        ? 'ใช้ล่าสุด'
                        : UNIFIED_EMOJI_CATEGORIES.find((c) => c.id === activeEmojiCat)?.label}
                  </span>
                  <span className="text-[10px] text-slate-400">Twemoji SVG (CC-BY 4.0) · เหมือนกันทุก OS</span>
                </div>
                {displayedEmojis.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    {activeEmojiCat === 'recent' && !searchQuery
                      ? 'ยังไม่มีอีโมจิที่ใช้ล่าสุด ลองแตะเลือกจากหมวดหมู่ด้านบน'
                      : 'ไม่พบอีโมจิที่ตรงกับคำค้นหา'}
                  </div>
                ) : (
                  <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-12 gap-1">
                    {displayedEmojis.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        data-testid={`emoji-btn-${item.code}`}
                        onClick={() => handleEmojiClick(item)}
                        title={item.keywords}
                        className={`aspect-square flex items-center justify-center rounded-xl active:scale-95 transition cursor-pointer p-1.5 ${gridBtnHover}`}
                      >
                        <img
                          src={item.src}
                          alt={item.char}
                          className="w-7 h-7 object-contain"
                          draggable={false}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : searchedStickers ? (
              <div>
                <div className={`text-[11px] font-bold mb-2 ${sectionLabelCls}`}>
                  ผลการค้นหาสติกเกอร์ ({searchedStickers.length})
                </div>
                {searchedStickers.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">ไม่พบสติกเกอร์ที่ตรงกับ &ldquo;{searchQuery}&rdquo;</div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {searchedStickers.map(({ pack, item }) => (
                      <button
                        key={`${pack.packId}-${item.stickerId}`}
                        type="button"
                        data-testid={`sticker-item-${pack.packId}-${item.stickerId}`}
                        {...stickerTileHandlers(pack, item)}
                        title={`${item.alt} (${pack.name})`}
                        className={`group flex flex-col items-center justify-center p-1.5 rounded-xl active:scale-95 transition cursor-pointer ${gridBtnHover}`}
                      >
                        <ViewportStickerImg
                          url={item.url}
                          alt={item.alt}
                          gifMode={gifMode}
                          scrollRoot={scrollRootEl}
                          className="w-16 h-16 sm:w-18 sm:h-18"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : activeStickerTab === 'recent' ? (
              <div>
                <div className={`text-[11px] font-bold mb-2 ${sectionLabelCls}`}>
                  สติกเกอร์ที่ใช้ล่าสุด ({resolvedRecentStickers.length})
                </div>
                {resolvedRecentStickers.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    ยังไม่มีสติกเกอร์ที่ส่งล่าสุด กดเลือกแพ็กด้านบนเพื่อส่งได้เลย!
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {resolvedRecentStickers.map(({ pack, item }) => (
                      <button
                        key={`rec-${pack.packId}-${item.stickerId}`}
                        type="button"
                        {...stickerTileHandlers(pack, item)}
                        title={item.alt}
                        className={`group flex flex-col items-center justify-center p-1.5 rounded-xl active:scale-95 transition cursor-pointer ${gridBtnHover}`}
                      >
                        <ViewportStickerImg
                          url={item.url}
                          alt={item.alt}
                          gifMode={gifMode}
                          scrollRoot={scrollRootEl}
                          className="w-16 h-16 sm:w-18 sm:h-18"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : activePack ? (
              <div>
                {/* Sticker Pack Header */}
                <div className={`flex items-center gap-2.5 mb-2.5 pb-2 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                  <img
                    src={activePack.mainUrl || activePack.items[0]?.url}
                    alt={activePack.name}
                    className="w-9 h-9 object-contain shrink-0"
                    draggable={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                        {activePack.name}
                      </span>
                      {activePack.source === 'builtin' && (
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold border shrink-0 ${
                            isDark
                              ? 'bg-indigo-950/70 text-indigo-300 border-indigo-800'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}
                        >
                          <Sparkles size={9} /> Starter Pack
                        </span>
                      )}
                    </div>
                    {activePack.description && (
                      <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {activePack.description}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 shrink-0">{activePack.items.length} ตัว</span>
                </div>

                {/* 4-to-8 Column Transparent Sticker Grid (keyed by packId to immediately unmount old pack on switch) */}
                <div key={activePack.packId} className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {activePack.items.map((item) => (
                    <button
                      key={`${activePack.packId}-${item.stickerId}`}
                      type="button"
                      data-testid={`sticker-item-${activePack.packId}-${item.stickerId}`}
                      {...stickerTileHandlers(activePack, item)}
                      title={item.alt}
                      className={`group flex flex-col items-center justify-center p-1.5 rounded-xl active:scale-95 transition cursor-pointer ${gridBtnHover}`}
                    >
                      <ViewportStickerImg
                        url={item.url}
                        alt={item.alt}
                        gifMode={gifMode}
                        scrollRoot={scrollRootEl}
                        className={isExpanded ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-16 h-16 sm:w-20 sm:h-20'}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-400">
                ไม่มีชุดสติกเกอร์ที่แสดงอยู่ เปิดใช้งานได้ในปุ่ม ⚙️ หรือหน้า Admin
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      {previewMode !== 'docked_tray' && (
        <StickerPreSendModal
          staged={stagedSticker}
          isDark={isDark}
          onConfirm={confirmSendStagedSticker}
          onClose={() => setStagedSticker(null)}
        />
      )}
    </>
  );
}
