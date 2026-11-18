"use client";
/* eslint-disable @next/next/no-img-element */

import React from "react";
import type { StickerMessageMeta } from "@/types/chat";

interface StickerVisualProps {
  meta: StickerMessageMeta;
  variant?: "bubble" | "admin" | "zoom";
  className?: string;
}

export function StickerVisual({ meta, variant = "bubble", className = "" }: StickerVisualProps) {
  const layers = meta.layers && meta.layers.length > 0 ? meta.layers : null;

  if (!layers) {
    const sizeCls =
      variant === "zoom"
        ? "w-[min(84vw,68dvh)] h-[min(84vw,68dvh)] drop-shadow-2xl"
        : variant === "admin"
          ? "w-[132px] h-[132px]"
          : "w-36 h-36 sm:w-40 sm:h-40 drop-shadow-sm";
    return (
      <img
        data-testid={variant === "zoom" ? "sticker-zoom-img" : undefined}
        src={meta.url}
        alt={meta.alt || "sticker"}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        className={`${sizeCls} object-contain pointer-events-none select-none ${className}`}
      />
    );
  }

  const stageCls =
    variant === "zoom"
      ? "w-[min(90vw,640px)] aspect-[16/10]"
      : variant === "admin"
        ? "w-[220px] aspect-[16/10]"
        : "w-[232px] sm:w-[272px] aspect-[16/10]";

  const baseItemPct = 42;

  return (
    <div
      data-testid={variant === "zoom" ? "sticker-zoom-img" : undefined}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative overflow-visible select-none pointer-events-none ${stageCls} ${className}`}
    >
      {layers.map((layer, idx) => (
        <div
          key={`${layer.packId}:${layer.stickerId}:${idx}`}
          style={{
            position: "absolute",
            left: `${layer.x}%`,
            top: `${layer.y}%`,
            width: `${baseItemPct}%`,
            height: `${baseItemPct * 1.45}%`,
            transform: `translate(-50%, -50%) scale(${layer.scale}) rotate(${layer.rotation}deg)`,
            transformOrigin: "center center",
          }}
          className="flex items-center justify-center"
        >
          <img
            src={layer.url}
            alt={layer.alt || "sticker"}
            draggable={false}
            className="w-full h-full object-contain drop-shadow-md select-none"
          />
        </div>
      ))}
    </div>
  );
}
