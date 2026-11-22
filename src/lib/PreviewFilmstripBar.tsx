"use client";

import React, { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, FileArchive, FileText, Film, Mic, Play } from "lucide-react";
import type { PreviewableFile, PreviewKind } from "./filePreviewer";
import { getExtension, getFilePreviewKind } from "./filePreviewer";
import { SecureImage, SecureVideo } from "./secureMedia";

interface PreviewFilmstripBarProps {
  gallery: PreviewableFile[];
  currentIndex: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelectIndex: (index: number) => void;
}

function getShortExt(fileName: string): string {
  const ext = getExtension(fileName);
  return ext ? ext.slice(1).toUpperCase().slice(0, 5) : "FILE";
}

function renderThumbIcon(kind: PreviewKind, fileName: string) {
  if (kind === "audio") return <Mic size={18} className="text-blue-400" />;
  if (kind === "zip") return <FileArchive size={18} className="text-amber-400" />;
  if (kind === "video") return <Film size={18} className="text-slate-300" />;
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 text-slate-200">
      <FileText size={15} className="opacity-80" />
      <span className="text-[9px] font-bold tracking-wide">{getShortExt(fileName)}</span>
    </div>
  );
}

/**
 * macOS Finder Gallery-style collapsible bottom thumbnail filmstrip.
 * Lets Admin slide across videos, images, audio, and documents quickly
 * or fold the tray down for full-height stage viewing.
 */
export function PreviewFilmstripBar({
  gallery,
  currentIndex,
  expanded,
  onToggleExpanded,
  onSelectIndex,
}: PreviewFilmstripBarProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!expanded) return;
    const activeEl = itemRefs.current[currentIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentIndex, expanded]);

  if (gallery.length <= 1) return null;

  return (
    <div
      data-testid="preview-filmstrip-bar"
      className="border-t border-gray-200 bg-slate-900/95 text-white shrink-0 select-none"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span className="text-[11px] font-semibold text-slate-300">
          แกลเลอรีสื่อ ({currentIndex + 1} / {gallery.length}) — ใช้ลูกศร ← / → หรือคลิกสไลด์ด้านล่าง
        </span>
        <button
          type="button"
          data-testid="preview-filmstrip-toggle"
          onClick={onToggleExpanded}
          title={expanded ? "พับแถบฟิล์มลงเพื่อดูเต็มจอ" : "เปิดแถบฟิล์มเลือกรายการ"}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-slate-100 transition-colors cursor-pointer"
        >
          {expanded ? (
            <>
              <ChevronDown size={14} />
              <span>พับแถบฟิล์ม</span>
            </>
          ) : (
            <>
              <ChevronUp size={14} />
              <span>แสดงแถบฟิล์ม ({gallery.length})</span>
            </>
          )}
        </button>
      </div>

      {expanded && (
        <div
          data-testid="preview-filmstrip-strip"
          className="flex items-center gap-2 overflow-x-auto px-3 py-2.5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {gallery.map((item, idx) => {
            const active = idx === currentIndex;
            const kind = getFilePreviewKind(item.fileName, item.mimeType);
            return (
              <button
                key={`${item.mediaToken}-${idx}`}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                data-testid={`preview-filmstrip-item-${idx}`}
                onClick={() => onSelectIndex(idx)}
                title={item.fileName}
                className={`relative shrink-0 w-[72px] h-[56px] rounded-lg overflow-hidden transition-all cursor-pointer flex items-center justify-center bg-slate-800 ${
                  active
                    ? "ring-2 ring-blue-400 scale-[1.05] shadow-lg opacity-100"
                    : "ring-1 ring-white/15 opacity-70 hover:opacity-100 hover:ring-white/40"
                }`}
              >
                {kind === "image" && item.mediaToken ? (
                  <SecureImage
                    token={item.mediaToken}
                    thumbnail
                    alt={item.fileName}
                    fileName={item.fileName}
                    className="w-full h-full object-cover block"
                  />
                ) : kind === "video" && item.mediaToken ? (
                  <div className="relative w-full h-full bg-black">
                    <SecureVideo
                      token={item.mediaToken}
                      controls={false}
                      muted
                      className="w-full h-full object-cover block"
                      style={{ minHeight: 0 }}
                    />
                    <span className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
                      <span className="w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center">
                        <Play size={10} fill="white" className="ml-0.5" />
                      </span>
                    </span>
                    <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/75 text-[8px] font-bold text-white">
                      VID
                    </span>
                  </div>
                ) : (
                  renderThumbIcon(kind, item.fileName)
                )}

                <span
                  className={`absolute top-0.5 left-0.5 px-1 rounded text-[9px] font-bold leading-tight ${
                    active ? "bg-blue-500 text-white" : "bg-black/65 text-slate-200"
                  }`}
                >
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
