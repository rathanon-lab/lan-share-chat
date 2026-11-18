"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef } from "react";
import { Layers, MoveDiagonal2, RotateCcw, RotateCw, Send, Sparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import type { DockedStickerDraft } from "@/features/stickers/lib/stickerDraft";
import { MAX_COLLAGE_LAYERS } from "@/features/stickers/lib/stickerDraft";

interface DockedStickerPreviewTrayProps {
  draft: DockedStickerDraft | null;
  setDraft: React.Dispatch<React.SetStateAction<DockedStickerDraft | null>>;
  collageEnabled?: boolean;
  onSend: () => void;
  onClose: () => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function DockedStickerPreviewTray({
  draft,
  setDraft,
  collageEnabled = true,
  onSend,
  onClose,
}: DockedStickerPreviewTrayProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const touchPtsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    uid: string;
    dist: number;
    angle: number;
    scale: number;
    rotation: number;
  } | null>(null);

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, onClose]);

  if (!draft) return null;

  const updateLayer = (uid: string, patch: { x?: number; y?: number; scale?: number; rotation?: number }) => {
    setDraft((prev) => {
      if (!prev || prev.mode !== "collage") return prev;
      return {
        ...prev,
        layers: prev.layers.map((l) => (l.uid === uid ? { ...l, ...patch } : l)),
      };
    });
  };

  const removeLayer = (uid: string) => {
    setDraft((prev) => {
      if (!prev || prev.mode !== "collage") return prev;
      const next = prev.layers.filter((l) => l.uid !== uid);
      if (next.length === 0) return null;
      return {
        mode: "collage",
        activeUid: prev.activeUid === uid ? next[next.length - 1].uid : prev.activeUid,
        layers: next,
      };
    });
  };

  const enterCollageFromSingle = () => {
    setDraft((prev) => {
      if (!prev || prev.mode !== "single") return prev;
      const uid = `cl_${Date.now().toString(36)}`;
      return {
        mode: "collage",
        activeUid: uid,
        layers: [
          {
            uid,
            pack: prev.pack,
            item: prev.item,
            packId: prev.pack.packId,
            stickerId: prev.item.stickerId,
            url: prev.item.url,
            alt: prev.item.alt || prev.item.stickerId,
            x: 50,
            y: 50,
            scale: 1,
            rotation: 0,
          },
        ],
      };
    });
  };

  const startDragMove = (uid: string, startX: number, startY: number, origX: number, origY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      if (touchPtsRef.current.size >= 2) return;
      const dxPct = ((ev.clientX - startX) / Math.max(1, rect.width)) * 100;
      const dyPct = ((ev.clientY - startY) / Math.max(1, rect.height)) * 100;
      updateLayer(uid, {
        x: clamp(Math.round((origX + dxPct) * 10) / 10, 8, 92),
        y: clamp(Math.round((origY + dyPct) * 10) / 10, 10, 90),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startHandleTransform = (
    uid: string,
    centerClientX: number,
    centerClientY: number,
    startClientX: number,
    startClientY: number,
    origScale: number,
    origRot: number
  ) => {
    const baseDist = Math.max(16, Math.hypot(startClientX - centerClientX, startClientY - centerClientY));
    const baseAngle = Math.atan2(startClientY - centerClientY, startClientX - centerClientX);
    const onMove = (ev: PointerEvent) => {
      const dist = Math.max(12, Math.hypot(ev.clientX - centerClientX, ev.clientY - centerClientY));
      const angle = Math.atan2(ev.clientY - centerClientY, ev.clientX - centerClientX);
      const degDelta = ((angle - baseAngle) * 180) / Math.PI;
      const nextScale = clamp(Math.round(origScale * (dist / baseDist) * 100) / 100, 0.4, 2.2);
      let nextRot = Math.round((origRot + degDelta) * 10) / 10;
      if (nextRot > 180) nextRot -= 360;
      if (nextRot < -180) nextRot += 360;
      updateLayer(uid, { scale: nextScale, rotation: nextRot });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const activeLayer =
    draft.mode === "collage" ? draft.layers.find((l) => l.uid === draft.activeUid) || null : null;

  return (
    <div
      data-testid="sticker-docked-tray"
      onContextMenu={(e) => e.preventDefault()}
      className="absolute bottom-full left-0 right-0 z-30 h-[182px] sm:h-[206px] rounded-t-2xl border-t border-x border-white/15 bg-slate-900/80 backdrop-blur-md shadow-[0_-8px_28px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden select-none animate-in fade-in duration-150"
    >
      {/* Top Floating Bar */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1 shrink-0 z-20">
        <div className="flex items-center gap-1.5 min-w-0">
          {draft.mode === "single" && collageEnabled && (
            <button
              type="button"
              data-testid="sticker-collage-enter-btn"
              onClick={enterCollageFromSingle}
              className="px-2.5 py-1 rounded-full bg-white/12 hover:bg-white/22 border border-white/20 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
              title="เปิดโหมดวางสติกเกอร์หลายตัว ย่อ-ขยาย หมุนข้างๆ กัน"
            >
              <Sparkles size={12} /> ผสมสติกเกอร์ (+)
            </button>
          )}
          {draft.mode === "collage" && (
            <>
              <span className="px-2.5 py-1 rounded-full bg-indigo-500/30 border border-indigo-400/40 text-indigo-100 text-[11px] font-bold flex items-center gap-1 shrink-0">
                <Layers size={12} /> ผสม {draft.layers.length}/{MAX_COLLAGE_LAYERS}
              </span>
              {activeLayer && (
                <div className="hidden sm:flex items-center gap-0.5 bg-white/10 border border-white/15 rounded-full px-1.5 py-0.5">
                  <button
                    type="button"
                    data-testid="collage-zoom-out"
                    onClick={() => updateLayer(activeLayer.uid, { scale: clamp(activeLayer.scale - 0.15, 0.4, 2.2) })}
                    className="p-1 text-white hover:bg-white/15 rounded-full cursor-pointer"
                    title="ย่อขนาด"
                  >
                    <ZoomOut size={12} />
                  </button>
                  <button
                    type="button"
                    data-testid="collage-zoom-in"
                    onClick={() => updateLayer(activeLayer.uid, { scale: clamp(activeLayer.scale + 0.15, 0.4, 2.2) })}
                    className="p-1 text-white hover:bg-white/15 rounded-full cursor-pointer"
                    title="ขยายขนาด"
                  >
                    <ZoomIn size={12} />
                  </button>
                  <button
                    type="button"
                    data-testid="collage-rotate-left"
                    onClick={() => updateLayer(activeLayer.uid, { rotation: clamp(activeLayer.rotation - 15, -180, 180) })}
                    className="p-1 text-white hover:bg-white/15 rounded-full cursor-pointer"
                    title="หมุนซ้าย"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    type="button"
                    data-testid="collage-rotate-right"
                    onClick={() => updateLayer(activeLayer.uid, { rotation: clamp(activeLayer.rotation + 15, -180, 180) })}
                    className="p-1 text-white hover:bg-white/15 rounded-full cursor-pointer"
                    title="หมุนขวา"
                  >
                    <RotateCw size={12} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="sticker-docked-send-btn"
            onClick={onSend}
            className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1 shadow cursor-pointer transition"
          >
            <Send size={12} />
            {draft.mode === "collage" && draft.layers.length > 1 ? `ส่ง (${draft.layers.length})` : "ส่งสติกเกอร์"}
          </button>
          <button
            type="button"
            data-testid="sticker-docked-close"
            onClick={onClose}
            aria-label="ปิดพรีวิวสติกเกอร์"
            className="w-7 h-7 rounded-full bg-white/12 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Main Preview / Collage Stage */}
      {draft.mode === "single" ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center pb-2 px-3">
          <button
            type="button"
            data-testid="sticker-docked-single-btn"
            onClick={onSend}
            title="แตะสติกเกอร์เพื่อส่งทันที หรือเลือกตัวอื่นด้านล่างเพื่อเปลี่ยน"
            className="p-1 rounded-2xl hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          >
            <img
              data-testid="sticker-docked-single-img"
              src={draft.item.url}
              alt={draft.item.alt || "sticker"}
              draggable={false}
              className="w-[108px] h-[108px] sm:w-[128px] sm:h-[128px] object-contain drop-shadow-xl pointer-events-none select-none"
            />
          </button>
          <div className="text-[10px] text-slate-300/90 truncate max-w-full">
            {draft.item.alt || draft.item.stickerId}
            {collageEnabled ? " · แตะค้างที่ตัวอื่นเพื่อวางผสมข้างๆ กัน" : ""}
          </div>
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 flex items-center justify-center px-3 pb-2"
          onClick={() => setDraft((p) => (p && p.mode === "collage" ? { ...p, activeUid: null } : p))}
        >
          <div
            ref={stageRef}
            data-testid="sticker-collage-stage"
            className="relative h-full aspect-[16/10] max-w-full rounded-xl border border-white/10 bg-black/20 overflow-visible touch-none"
          >
            {draft.layers.map((layer, idx) => {
              const isActive = draft.activeUid === layer.uid;
              return (
                <div
                  key={layer.uid}
                  data-testid={`collage-layer-${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDraft((p) => (p && p.mode === "collage" ? { ...p, activeUid: layer.uid } : p));
                  }}
                  onWheel={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const delta = e.deltaY < 0 ? 0.1 : -0.1;
                    updateLayer(layer.uid, { scale: clamp(layer.scale + delta, 0.4, 2.2) });
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    touchPtsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    setDraft((p) => (p && p.mode === "collage" ? { ...p, activeUid: layer.uid } : p));

                    if (touchPtsRef.current.size === 2) {
                      const pts = Array.from(touchPtsRef.current.values());
                      pinchStartRef.current = {
                        uid: layer.uid,
                        dist: Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)),
                        angle: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),
                        scale: layer.scale,
                        rotation: layer.rotation,
                      };
                      return;
                    }
                    startDragMove(layer.uid, e.clientX, e.clientY, layer.x, layer.y);
                  }}
                  onPointerMove={(e) => {
                    if (!touchPtsRef.current.has(e.pointerId)) return;
                    touchPtsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    const ps = pinchStartRef.current;
                    if (ps && ps.uid === layer.uid && touchPtsRef.current.size === 2) {
                      const pts = Array.from(touchPtsRef.current.values());
                      const dist = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
                      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
                      const degDelta = ((angle - ps.angle) * 180) / Math.PI;
                      updateLayer(layer.uid, {
                        scale: clamp(Math.round(ps.scale * (dist / ps.dist) * 100) / 100, 0.4, 2.2),
                        rotation: clamp(Math.round(ps.rotation + degDelta), -180, 180),
                      });
                    }
                  }}
                  onPointerUp={(e) => {
                    touchPtsRef.current.delete(e.pointerId);
                    if (touchPtsRef.current.size < 2) pinchStartRef.current = null;
                  }}
                  onPointerCancel={(e) => {
                    touchPtsRef.current.delete(e.pointerId);
                    if (touchPtsRef.current.size < 2) pinchStartRef.current = null;
                  }}
                  style={{
                    position: "absolute",
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    width: "42%",
                    height: "60.9%",
                    transform: `translate(-50%, -50%) scale(${layer.scale}) rotate(${layer.rotation}deg)`,
                    transformOrigin: "center center",
                    zIndex: isActive ? 20 : 10 + idx,
                  }}
                  className={`cursor-grab active:cursor-grabbing flex items-center justify-center touch-none ${
                    isActive ? "ring-2 ring-white/95 rounded-md bg-white/5" : ""
                  }`}
                >
                  <img
                    src={layer.url}
                    alt={layer.alt || "sticker"}
                    draggable={false}
                    className="w-full h-full object-contain drop-shadow-lg pointer-events-none select-none"
                  />

                  {isActive && (
                    <>
                      <button
                        type="button"
                        data-testid={`collage-remove-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLayer(layer.uid);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="ลบสติกเกอร์นี้ออก"
                        className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full bg-slate-800/95 border border-white/80 text-white hover:bg-red-600 flex items-center justify-center shadow-md cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                      <button
                        type="button"
                        data-testid={`collage-handle-${idx}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const parentEl = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
                          if (!parentEl) return;
                          const cx = parentEl.left + parentEl.width / 2;
                          const cy = parentEl.top + parentEl.height / 2;
                          startHandleTransform(layer.uid, cx, cy, e.clientX, e.clientY, layer.scale, layer.rotation);
                        }}
                        title="ลากเพื่อขยายและหมุนสติกเกอร์"
                        className="absolute -bottom-2.5 -right-2.5 w-6 h-6 rounded-full bg-white text-slate-800 hover:bg-blue-50 flex items-center justify-center shadow-md cursor-nwse-resize"
                      >
                        <MoveDiagonal2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
