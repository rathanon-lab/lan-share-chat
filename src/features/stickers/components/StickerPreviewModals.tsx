"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from "react";
import { Maximize2, Send, X, ZoomIn, ZoomOut } from "lucide-react";
import type { StickerItem, StickerMessageMeta, StickerPack } from "@/types/chat";
import { useLanguage } from "@/lib/i18n";
import { ZoomableMediaStage } from "@/components/ZoomableMediaStage";
import { StickerVisual } from "@/features/stickers/components/StickerVisual";

function FloatingZoomRail({
  zoom,
  onZoomChange,
  topOffsetClass = "top-4",
  testIdPrefix,
}: {
  zoom: number;
  onZoomChange: React.Dispatch<React.SetStateAction<number>>;
  topOffsetClass?: string;
  testIdPrefix: string;
}) {
  const { tx } = useLanguage();
  const zoomIn = () => onZoomChange((z) => Math.min(3, Number((z + 0.25).toFixed(2))));
  const zoomOut = () => onZoomChange((z) => Math.max(0.6, Number((z - 0.25).toFixed(2))));

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`fixed ${topOffsetClass} right-4 z-20 flex flex-col items-center gap-1 bg-slate-900/75 border border-white/15 rounded-2xl p-1.5 backdrop-blur-md shadow-xl`}
    >
      <button
        type="button"
        data-testid={`${testIdPrefix}-zoom-in`}
        onClick={zoomIn}
        disabled={zoom >= 3}
        title={tx("ขยายใหญ่ขึ้น (+)", "Zoom In (+)")}
        className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 text-white flex items-center justify-center cursor-pointer transition"
      >
        <ZoomIn size={18} />
      </button>
      <button
        type="button"
        data-testid={`${testIdPrefix}-zoom-reset`}
        onClick={() => onZoomChange(1)}
        title={tx("รีเซ็ตขนาด 100%", "Reset Zoom (100%)")}
        className="w-9 py-1 rounded-lg text-[10px] font-bold text-slate-200 hover:bg-white/10 cursor-pointer transition"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        data-testid={`${testIdPrefix}-zoom-out`}
        onClick={zoomOut}
        disabled={zoom <= 0.6}
        title={tx("ย่อขนาดลง (-)", "Zoom Out (-)")}
        className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 text-white flex items-center justify-center cursor-pointer transition"
      >
        <ZoomOut size={18} />
      </button>
      <button
        type="button"
        data-testid={`${testIdPrefix}-zoom-toggle`}
        onClick={() => onZoomChange((z) => (z > 1.25 ? 1 : 1.75))}
        title={tx("สลับขยายเต็มตา / ปกติ", "Toggle Enlarge")}
        className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition"
      >
        <Maximize2 size={15} />
      </button>
    </div>
  );
}

function StickerPreSendBody({
  staged,
  onConfirm,
  onClose,
}: {
  staged: { pack: StickerPack; item: StickerItem };
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { tx } = useLanguage();
  const [zoom, setZoom] = useState(1);

  return (
    <>
      <FloatingZoomRail
        zoom={zoom}
        onZoomChange={setZoom}
        topOffsetClass="top-4"
        testIdPrefix="sticker-presend"
      />

      <ZoomableMediaStage
        zoom={zoom}
        onZoomChange={setZoom}
        onBackgroundClick={onClose}
        onSingleTapContent={zoom <= 1 ? onConfirm : undefined}
        contentTestId="sticker-presend-image-btn"
        className="flex-1 min-h-0 w-full"
      >
        <img
          src={staged.item.url}
          alt={staged.item.alt}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className="w-[min(76vw,48dvh)] h-[min(76vw,48dvh)] sm:w-[340px] sm:h-[340px] object-contain drop-shadow-2xl pointer-events-none select-none"
        />
      </ZoomableMediaStage>

      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm flex flex-col items-center text-center gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0 z-20"
      >
        <div className="text-sm font-bold text-white drop-shadow">
          {staged.item.alt || staged.item.stickerId}
        </div>
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            data-testid="sticker-presend-close"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 backdrop-blur-md text-white text-sm font-bold cursor-pointer transition"
          >
            {tx("ยกเลิก", "Cancel")}
          </button>
          <button
            type="button"
            data-testid="sticker-presend-confirm"
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xl transition"
          >
            <Send size={15} /> {tx("กดส่งสติ๊กเกอร์", "Send Sticker")}
          </button>
        </div>
      </div>
    </>
  );
}

export function StickerPreSendModal({
  staged,
  isDark = false,
  onConfirm,
  onClose,
}: {
  staged: { pack: StickerPack; item: StickerItem } | null;
  isDark?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!staged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [staged, onClose, onConfirm]);

  if (!staged) return null;

  return (
    <div
      data-testid="sticker-presend-preview"
      data-theme={isDark ? "dark" : "light"}
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      className={`fixed inset-0 z-[120] backdrop-blur-[3px] flex flex-col items-center justify-between p-4 select-none overflow-hidden animate-in fade-in duration-150 ${
        isDark ? "bg-black/60" : "bg-slate-950/50"
      }`}
    >
      <StickerPreSendBody
        key={`${staged.pack.packId}:${staged.item.stickerId}`}
        staged={staged}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </div>
  );
}

function StickerZoomBody({
  sticker,
  onClose,
}: {
  sticker: StickerMessageMeta;
  onClose: () => void;
}) {
  const { tx } = useLanguage();
  const [zoom, setZoom] = useState(1);

  return (
    <>
      <button
        type="button"
        data-testid="sticker-zoom-close"
        onClick={onClose}
        aria-label={tx("ปิดหน้าต่าง", "Close")}
        className="fixed top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition"
      >
        <X size={20} />
      </button>

      <FloatingZoomRail
        zoom={zoom}
        onZoomChange={setZoom}
        topOffsetClass="top-16"
        testIdPrefix="sticker"
      />

      <ZoomableMediaStage
        zoom={zoom}
        onZoomChange={setZoom}
        onBackgroundClick={onClose}
        className="flex-1 min-h-0 w-full"
      >
        <StickerVisual meta={sticker} variant="zoom" />
      </ZoomableMediaStage>

      {sticker.alt && (
        <div className="text-base font-bold text-white pb-4 drop-shadow shrink-0">{sticker.alt}</div>
      )}
    </>
  );
}

export function StickerZoomModal({
  sticker,
  onClose,
}: {
  sticker: StickerMessageMeta | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!sticker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sticker, onClose]);

  if (!sticker) return null;

  return (
    <div
      data-testid="sticker-zoom-lightbox"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 select-none overflow-hidden animate-in fade-in duration-150"
    >
      <StickerZoomBody key={sticker.url} sticker={sticker} onClose={onClose} />
    </div>
  );
}
