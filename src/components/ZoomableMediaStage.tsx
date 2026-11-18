"use client";

import React, { useCallback, useRef, useState } from "react";

interface ZoomableMediaStageProps {
  zoom: number;
  onZoomChange: (next: number) => void;
  minZoom?: number;
  maxZoom?: number;
  onBackgroundClick?: () => void;
  onSingleTapContent?: () => void;
  contentTestId?: string;
  className?: string;
  children: React.ReactNode;
}

function pointerDist(pts: Map<number, { x: number; y: number }>): number {
  const arr = Array.from(pts.values());
  if (arr.length < 2) return 0;
  return Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
}

export function ZoomableMediaStage({
  zoom,
  onZoomChange,
  minZoom = 0.6,
  maxZoom = 3.0,
  onBackgroundClick,
  onSingleTapContent,
  contentTestId,
  className = "",
  children,
}: ZoomableMediaStageProps) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number; moved: boolean; targetIsBg: boolean } | null>(null);
  const lastTapRef = useRef<number>(0);

  const clampZoom = useCallback(
    (v: number) => Math.max(minZoom, Math.min(maxZoom, Number(v.toFixed(2)))),
    [minZoom, maxZoom]
  );

  const applyZoom = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      if (clamped <= 1) setPan({ x: 0, y: 0 });
      onZoomChange(clamped);
    },
    [clampZoom, onZoomChange]
  );

  const clampPan = useCallback((nx: number, ny: number, curZoom: number) => {
    const el = stageRef.current;
    if (!el || curZoom <= 1) return { x: 0, y: 0 };
    const maxX = Math.max(40, (el.clientWidth * (curZoom - 1)) / 2 + 40);
    const maxY = Math.max(40, (el.clientHeight * (curZoom - 1)) / 2 + 40);
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setIsInteracting(true);

    if (pointersRef.current.size === 2) {
      pinchStartRef.current = { dist: pointerDist(pointersRef.current), zoom };
      dragStartRef.current = null;
    } else if (pointersRef.current.size === 1) {
      const basePan = zoom <= 1 ? { x: 0, y: 0 } : pan;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        px: basePan.x,
        py: basePan.y,
        moved: false,
        targetIsBg: e.target === stageRef.current,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current && pinchStartRef.current.dist > 0) {
      const nextDist = pointerDist(pointersRef.current);
      applyZoom((nextDist / pinchStartRef.current.dist) * pinchStartRef.current.zoom);
      return;
    }

    if (pointersRef.current.size === 1 && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 5) dragStartRef.current.moved = true;
      if (zoom > 1 && dragStartRef.current.moved) {
        setPan(clampPan(dragStartRef.current.px + dx, dragStartRef.current.py + dy, zoom));
      }
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasSingleDrag = pointersRef.current.size === 1 ? dragStartRef.current : null;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
      setIsInteracting(false);
    }

    if (wasSingleDrag && !wasSingleDrag.moved && e.type === "pointerup") {
      if (wasSingleDrag.targetIsBg) {
        if (onBackgroundClick) onBackgroundClick();
        return;
      }
      if (onSingleTapContent) {
        onSingleTapContent();
        return;
      }
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        applyZoom(zoom > 1.1 ? 1 : 2);
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const effectivePan = zoom <= 1 ? { x: 0, y: 0 } : pan;

  return (
    <div
      ref={stageRef}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        applyZoom(zoom + (e.deltaY < 0 ? 0.25 : -0.25));
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      style={{ touchAction: "none" }}
      className={`relative overflow-hidden flex items-center justify-center select-none ${
        zoom > 1 ? "cursor-grab active:cursor-grabbing" : onSingleTapContent ? "cursor-pointer" : "cursor-zoom-in"
      } ${className}`}
    >
      <div
        data-testid={contentTestId}
        style={{
          transform: `translate3d(${effectivePan.x}px, ${effectivePan.y}px, 0) scale(${zoom})`,
          transition: isInteracting ? "none" : "transform 130ms ease-out",
        }}
        className="flex items-center justify-center max-w-full max-h-full"
      >
        {children}
      </div>
    </div>
  );
}
