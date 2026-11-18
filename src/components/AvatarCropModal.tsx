'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, X, ZoomIn, ZoomOut, Move } from 'lucide-react';

interface AvatarCropModalProps {
  file: File;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  title?: string;
}

const VIEW_SIZE = 256;
const OUTPUT_SIZE = 256;

export function AvatarCropModal({
  file,
  onCancel,
  onConfirm,
  title = 'ปรับตำแหน่งและตัดขอบรูปวงกลม',
}: AvatarCropModalProps) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const getBaseScale = (img: HTMLImageElement) => Math.max(VIEW_SIZE / img.naturalWidth, VIEW_SIZE / img.naturalHeight);

  const clampOffset = (nextX: number, nextY: number, z: number, img: HTMLImageElement | null) => {
    if (!img) return { x: 0, y: 0 };
    const scale = getBaseScale(img) * z;
    const drawnW = img.naturalWidth * scale;
    const drawnH = img.naturalHeight * scale;
    const maxOffsetX = Math.max(0, (drawnW - VIEW_SIZE) / 2);
    const maxOffsetY = Math.max(0, (drawnH - VIEW_SIZE) / 2);
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy, zoom, imgEl));
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const handleZoomChange = (nextZoom: number) => {
    const clampedZ = Math.max(1, Math.min(3, nextZoom));
    setZoom(clampedZ);
    setOffset((prev) => clampOffset(prev.x, prev.y, clampedZ, imgEl));
  };

  const handleConfirm = () => {
    if (!imgEl) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const ratio = OUTPUT_SIZE / VIEW_SIZE;
    const scale = getBaseScale(imgEl) * zoom * ratio;
    const drawnW = imgEl.naturalWidth * scale;
    const drawnH = imgEl.naturalHeight * scale;
    const dx = (OUTPUT_SIZE - drawnW) / 2 + offset.x * ratio;
    const dy = (OUTPUT_SIZE - drawnH) / 2 + offset.y * ratio;
    ctx.drawImage(imgEl, dx, dy, drawnW, drawnH);
    ctx.restore();

    let dataUrl = canvas.toDataURL('image/webp', 0.88);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/png');
    }
    onConfirm(dataUrl);
  };

  const baseScale = imgEl ? getBaseScale(imgEl) * zoom : 1;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-gray-900">{title}</h3>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative overflow-hidden rounded-2xl bg-slate-900 cursor-grab active:cursor-grabbing touch-none select-none"
            style={{ width: `${VIEW_SIZE}px`, height: `${VIEW_SIZE}px` }}
          >
            {imgEl && (
              <img
                src={imgEl.src}
                alt="Crop preview"
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `${imgEl.naturalWidth * baseScale}px`,
                  height: `${imgEl.naturalHeight * baseScale}px`,
                  maxWidth: 'none',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* Circular spotlight mask */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle 124px at center, transparent 122px, rgba(15,23,42,0.68) 124px)',
              }}
            />
            <div
              className="absolute inset-0 pointer-events-none rounded-full m-1"
              style={{ border: '2px solid rgba(255,255,255,0.85)' }}
            />
          </div>

          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <Move size={12} /> ลากรูปเพื่อจัดตำแหน่งให้อยู่ในกรอบวงกลม
          </div>

          <div className="w-full flex items-center gap-2.5 px-2">
            <ZoomOut size={15} className="text-gray-400 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <ZoomIn size={15} className="text-gray-400 shrink-0" />
          </div>
        </div>

        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!imgEl}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check size={14} /> ใช้รูปโปรไฟล์นี้
          </button>
        </div>
      </div>
    </div>
  );
}
