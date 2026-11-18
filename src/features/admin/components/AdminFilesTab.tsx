"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileText, Film, Image as ImageIcon, LayoutGrid, List, Mic, Play, Search, Trash2 } from "lucide-react";
import type { PreviewableFile } from "@/lib/filePreviewer";
import { isRichPreviewSupported } from "@/lib/filePreviewer";
import { FB, css, formatAdminBytes, formatAdminDate } from "@/features/admin/theme";
import { SecureAudio, SecureImage, SecureVideo, downloadEncryptedMedia } from "@/lib/secureMedia";

const PAGE_WINDOW_STEP = 24;

export interface AdminUploadedFileItem {
  id: number;
  originalName: string;
  storedName?: string;
  mimeType: string;
  fileSize: number;
  sender: string;
  senderIp: string;
  uploadedAt: string;
  mediaToken: string;
}

type FileCategory = "all" | "image" | "video" | "audio" | "other";

function detectFileCategory(f: AdminUploadedFileItem): Exclude<FileCategory, "all"> {
  const mime = String(f?.mimeType || "").toLowerCase();
  const name = String(f?.originalName || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/i.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv)$/i.test(name)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(name)) return "audio";
  return "other";
}

function getExtBadge(fileName: string): { label: string; bg: string; fg: string } {
  const idx = String(fileName || "").lastIndexOf(".");
  const ext = idx >= 0 ? fileName.slice(idx + 1).toUpperCase().slice(0, 6) : "FILE";
  if (ext === "PDF") return { label: ext, bg: "#FEE2E2", fg: "#B91C1C" };
  if (["DOC", "DOCX"].includes(ext)) return { label: ext, bg: "#DBEAFE", fg: "#1D4ED8" };
  if (["ZIP", "RAR", "7Z"].includes(ext)) return { label: ext, bg: "#FEF3C7", fg: "#B45309" };
  if (["CRT", "PEM", "KEY"].includes(ext)) return { label: ext, bg: "#DCFCE7", fg: "#15803D" };
  if (["MD", "TXT", "JSON", "CSV"].includes(ext)) return { label: ext, bg: "#E0E7FF", fg: "#4338CA" };
  return { label: ext, bg: "#E2E8F0", fg: "#475569" };
}

export function AdminFilesTab({
  token,
  files,
  onResetFiles,
  onDeleteFile,
  onBatchDeleteFiles,
  onPreviewFile,
}: {
  token: string;
  files: AdminUploadedFileItem[];
  onResetFiles: () => void;
  onDeleteFile: (id: number) => void;
  onBatchDeleteFiles: (ids: number[], names: string[]) => void;
  onPreviewFile: (f: PreviewableFile) => void;
}) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [category, setCategory] = useState<FileCategory>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_WINDOW_STEP);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const validFileIds = useMemo(() => new Set(files.map((f) => Number(f.id))), [files]);
  const activeSelectedIds = useMemo(
    () => new Set(Array.from(selectedIds).filter((id) => validFileIds.has(id))),
    [selectedIds, validFileIds]
  );

  const counts = useMemo(() => {
    const c = { all: files.length, image: 0, video: 0, audio: 0, other: 0 };
    for (const f of files) c[detectFileCategory(f)]++;
    return c;
  }, [files]);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (category !== "all" && detectFileCategory(f) !== category) return false;
      if (!q) return true;
      return (
        String(f.originalName || "").toLowerCase().includes(q) ||
        String(f.sender || "").toLowerCase().includes(q) ||
        String(f.senderIp || "").toLowerCase().includes(q)
      );
    });
  }, [files, category, query]);

  const visibleFiles = useMemo(
    () => filteredFiles.slice(0, visibleCount),
    [filteredFiles, visibleCount]
  );
  const hasMoreFiles = visibleFiles.length < filteredFiles.length;

  useEffect(() => {
    if (!hasMoreFiles) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((prev) => Math.min(filteredFiles.length, prev + PAGE_WINDOW_STEP));
        }
      },
      { rootMargin: "360px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreFiles, filteredFiles.length, visibleFiles.length]);

  const allFilteredSelected =
    filteredFiles.length > 0 && filteredFiles.every((f) => activeSelectedIds.has(Number(f.id)));

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredFiles.forEach((f) => next.delete(Number(f.id)));
      } else {
        filteredFiles.forEach((f) => next.add(Number(f.id)));
      }
      return next;
    });
  }

  function triggerBatchDelete() {
    const ids = Array.from(activeSelectedIds);
    if (ids.length === 0) return;
    const names = files.filter((f) => activeSelectedIds.has(Number(f.id))).map((f) => String(f.originalName || "file"));
    onBatchDeleteFiles(ids, names);
  }

  return (
    <div data-testid="admin-files-tab">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={css.badge(false)}>
            {files.length} ไฟล์ · รวม {formatAdminBytes(files.reduce((s, f) => s + Number(f.fileSize || 0), 0))}
          </span>
          {activeSelectedIds.size > 0 && (
            <button
              type="button"
              data-testid="files-batch-delete-btn"
              onClick={triggerBatchDelete}
              style={{ ...css.btn("danger"), background: FB.red, color: "white", border: "none" }}
            >
              <Trash2 size={14} /> ลบที่เลือก ({activeSelectedIds.size})
            </button>
          )}
          {activeSelectedIds.size > 0 && (
            <button type="button" onClick={() => setSelectedIds(new Set())} style={css.btn("secondary")}>
              ยกเลิกเลือก
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", padding: "3px", borderRadius: "8px", background: "#E2E8F0", gap: "2px" }}>
            <button
              type="button"
              data-testid="files-view-grid-btn"
              onClick={() => {
                setViewMode("grid");
                setVisibleCount(PAGE_WINDOW_STEP);
              }}
              title="มุมมองการ์ด (Grid)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
                background: viewMode === "grid" ? FB.white : "transparent",
                color: viewMode === "grid" ? FB.blue : FB.textSecondary,
                boxShadow: viewMode === "grid" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <LayoutGrid size={14} /> การ์ด
            </button>
            <button
              type="button"
              data-testid="files-view-list-btn"
              onClick={() => {
                setViewMode("list");
                setVisibleCount(PAGE_WINDOW_STEP);
              }}
              title="มุมมองรายการ (List)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
                background: viewMode === "list" ? FB.white : "transparent",
                color: viewMode === "list" ? FB.blue : FB.textSecondary,
                boxShadow: viewMode === "list" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <List size={14} /> รายการ
            </button>
          </div>
          <button onClick={onResetFiles} style={css.btn("danger")}>
            <Trash2 size={15} /> ลบไฟล์ทั้งหมด
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {(
            [
              { id: "all", label: `ทั้งหมด (${counts.all})`, icon: null },
              { id: "image", label: `รูปภาพ (${counts.image})`, icon: <ImageIcon size={13} /> },
              { id: "video", label: `วิดีโอ (${counts.video})`, icon: <Film size={13} /> },
              { id: "audio", label: `เสียง (${counts.audio})`, icon: <Mic size={13} /> },
              { id: "other", label: `เอกสาร/อื่น ๆ (${counts.other})`, icon: <FileText size={13} /> },
            ] as const
          ).map((chip) => {
            const active = category === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                data-testid={`files-filter-${chip.id}`}
                onClick={() => {
                  setCategory(chip.id);
                  setVisibleCount(PAGE_WINDOW_STEP);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "6px 11px",
                  borderRadius: "999px",
                  border: `1px solid ${active ? FB.blue : FB.border}`,
                  background: active ? FB.blueLight : FB.white,
                  color: active ? FB.blue : FB.textSecondary,
                  fontSize: "12px",
                  fontWeight: active ? "700" : "500",
                  cursor: "pointer",
                }}
              >
                {chip.icon}
                {chip.label}
              </button>
            );
          })}
          {filteredFiles.length > 0 && (
            <button
              type="button"
              data-testid="files-select-all-btn"
              onClick={toggleSelectFiltered}
              style={{ ...css.btn("secondary"), padding: "5px 10px", fontSize: "12px" }}
            >
              {allFilteredSelected ? "เอาเครื่องหมายออกหมด" : `เลือกทั้งหมวด (${filteredFiles.length})`}
            </button>
          )}
        </div>

        <div style={{ position: "relative", minWidth: "220px", flex: "0 1 280px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: FB.textMuted }} />
          <input
            style={{ ...css.input, paddingLeft: "32px", borderRadius: "20px", fontSize: "13px" }}
            placeholder="ค้นหาชื่อไฟล์ / ผู้ส่ง / IP..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(PAGE_WINDOW_STEP);
            }}
          />
        </div>
      </div>

      {filteredFiles.length === 0 ? (
        <div style={{ ...css.card, textAlign: "center", padding: "48px", color: FB.textMuted }}>
          <FileText size={32} style={{ opacity: 0.3, marginBottom: "8px" }} />
          <p style={{ margin: 0 }}>ไม่พบไฟล์ในหมวดหมู่นี้</p>
        </div>
      ) : viewMode === "grid" ? (
        <div data-testid="files-grid-container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "12px" }}>
          {visibleFiles.map((f) => {
            const cat = detectFileCategory(f);
            const extInfo = getExtBadge(f.originalName);
            const idNum = Number(f.id);
            const isChecked = activeSelectedIds.has(idNum);
            const canPreview = Boolean(f.mediaToken && isRichPreviewSupported(f.originalName, f.mimeType));
            const previewObj = { fileName: f.originalName, fileSize: f.fileSize, mimeType: f.mimeType, mediaToken: f.mediaToken };

            return (
              <div
                key={f.id}
                data-testid={`file-card-${f.id}`}
                style={{
                  ...css.card,
                  margin: 0,
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  border: isChecked ? `2px solid ${FB.blue}` : `1px solid ${FB.border}`,
                  background: isChecked ? "#F8FBFF" : FB.white,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    height: "154px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    background: cat === "video" ? "#0F172A" : cat === "audio" ? "#F1F5F9" : "#E2E8F0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <label
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      top: "8px",
                      left: "8px",
                      zIndex: 4,
                      width: "26px",
                      height: "26px",
                      borderRadius: "6px",
                      background: isChecked ? FB.blue : "rgba(255,255,255,0.92)",
                      border: `1px solid ${isChecked ? FB.blue : "#CBD5E1"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.16)",
                    }}
                  >
                    <input
                      type="checkbox"
                      data-testid={`file-select-${f.id}`}
                      checked={isChecked}
                      onChange={() => toggleOne(idNum)}
                      style={{ width: "15px", height: "15px", accentColor: FB.blue, cursor: "pointer", margin: 0 }}
                    />
                  </label>

                  <span
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "8px",
                      zIndex: 4,
                      padding: "2px 7px",
                      borderRadius: "6px",
                      fontSize: "10px",
                      fontWeight: "700",
                      background: extInfo.bg,
                      color: extInfo.fg,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                    }}
                  >
                    {extInfo.label}
                  </span>

                  {cat === "image" && f.mediaToken && (
                    <div onClick={() => onPreviewFile(previewObj)} style={{ width: "100%", height: "100%", cursor: "pointer" }} title="คลิกเพื่อดูภาพเต็มจอ">
                      <SecureImage token={f.mediaToken} thumbnail alt={f.originalName} fileName={f.originalName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  )}
                  {cat === "video" && f.mediaToken && (
                    <div onClick={() => onPreviewFile(previewObj)} style={{ width: "100%", height: "100%", cursor: "pointer", position: "relative" }} title="คลิกเพื่อเล่นวิดีโอ">
                      <SecureVideo token={f.mediaToken} controls={false} muted style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.32)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "rgba(24,119,242,0.92)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.35)" }}>
                          <Play size={18} fill="white" />
                        </div>
                      </div>
                    </div>
                  )}
                  {cat === "audio" && f.mediaToken && (
                    <div style={{ width: "100%", padding: "36px 10px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: FB.blueLight, color: FB.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Mic size={20} />
                      </div>
                      <SecureAudio token={f.mediaToken} style={{ width: "100%", height: "34px" }} />
                    </div>
                  )}
                  {cat === "other" && (
                    <div
                      onClick={() => canPreview && onPreviewFile(previewObj)}
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        cursor: canPreview ? "pointer" : "default",
                        background: "#F8FAFC",
                      }}
                    >
                      <div style={{ padding: "10px 16px", borderRadius: "10px", background: extInfo.bg, color: extInfo.fg, fontWeight: "800", fontSize: "18px", letterSpacing: "0.5px" }}>
                        {extInfo.label}
                      </div>
                      <span style={{ fontSize: "11px", color: FB.textMuted }}>{canPreview ? "คลิกเพื่อพรีวิว" : "พร้อมดาวน์โหลด"}</span>
                    </div>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: FB.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.originalName}>
                    {f.originalName}
                  </div>
                  <div style={{ fontSize: "11px", color: FB.textSecondary, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {formatAdminBytes(f.fileSize)} · {f.sender} · {f.senderIp}
                  </div>
                  <div style={{ fontSize: "11px", color: FB.textMuted }}>{formatAdminDate(f.uploadedAt)}</div>
                </div>

                <div style={{ display: "flex", gap: "6px", marginTop: "auto", paddingTop: "4px", borderTop: `1px solid ${FB.border}` }}>
                  {canPreview && (
                    <button type="button" onClick={() => onPreviewFile(previewObj)} style={{ ...css.btn("secondary"), flex: 1, justifyContent: "center", padding: "6px 8px", color: FB.blue }} title="พรีวิวไฟล์">
                      <Eye size={14} /> ดู
                    </button>
                  )}
                  {f.mediaToken && (
                    <button type="button" onClick={() => downloadEncryptedMedia(f.mediaToken, f.originalName, { adminToken: token })} style={{ ...css.btn("secondary"), flex: 1, justifyContent: "center", padding: "6px 8px", color: FB.blue }} title="ดาวน์โหลด">
                      <Download size={14} /> โหลด
                    </button>
                  )}
                  <button type="button" onClick={() => onDeleteFile(f.id)} style={{ ...css.btn("danger"), padding: "6px 10px" }} title="ลบไฟล์">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div data-testid="files-list-container">
          {visibleFiles.map((f) => {
            const cat = detectFileCategory(f);
            const extInfo = getExtBadge(f.originalName);
            const idNum = Number(f.id);
            const isChecked = activeSelectedIds.has(idNum);
            const canPreview = Boolean(f.mediaToken && isRichPreviewSupported(f.originalName, f.mimeType));
            const previewObj = { fileName: f.originalName, fileSize: f.fileSize, mimeType: f.mimeType, mediaToken: f.mediaToken };

            return (
              <div
                key={f.id}
                style={{
                  ...css.card,
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  border: isChecked ? `2px solid ${FB.blue}` : `1px solid ${FB.border}`,
                  background: isChecked ? "#F8FBFF" : FB.white,
                }}
              >
                <input
                  type="checkbox"
                  data-testid={`file-select-${f.id}`}
                  checked={isChecked}
                  onChange={() => toggleOne(idNum)}
                  style={{ width: "16px", height: "16px", accentColor: FB.blue, cursor: "pointer", flexShrink: 0 }}
                />

                <div
                  onClick={() => canPreview && onPreviewFile(previewObj)}
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "8px",
                    flexShrink: 0,
                    overflow: "hidden",
                    background: extInfo.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1px solid ${FB.border}`,
                    cursor: canPreview ? "pointer" : "default",
                    position: "relative",
                  }}
                >
                  {cat === "image" && f.mediaToken ? (
                    <SecureImage token={f.mediaToken} thumbnail alt={f.originalName} fileName={f.originalName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : cat === "video" ? (
                    <div style={{ width: "100%", height: "100%", background: "#0F172A", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Play size={18} fill="white" />
                    </div>
                  ) : cat === "audio" ? (
                    <Mic size={20} style={{ color: FB.blue }} />
                  ) : (
                    <span style={{ fontSize: "11px", fontWeight: "800", color: extInfo.fg }}>{extInfo.label}</span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: FB.textPrimary }}>
                    {f.originalName}
                  </div>
                  <div style={{ fontSize: "12px", color: FB.textSecondary, marginTop: "2px" }}>
                    {formatAdminBytes(f.fileSize)} · {f.sender} · {f.senderIp} · {formatAdminDate(f.uploadedAt)}
                  </div>
                </div>

                {cat === "audio" && f.mediaToken && (
                  <div style={{ width: "210px", flexShrink: 0 }} className="hidden sm:block">
                    <SecureAudio token={f.mediaToken} style={{ width: "100%", height: "32px" }} />
                  </div>
                )}
                {canPreview && (
                  <button type="button" onClick={() => onPreviewFile(previewObj)} style={{ ...css.btn("secondary"), color: FB.blue }} title="พรีวิวไฟล์">
                    <Eye size={14} />
                  </button>
                )}
                {f.mediaToken && (
                  <button type="button" onClick={() => downloadEncryptedMedia(f.mediaToken, f.originalName, { adminToken: token })} style={{ ...css.btn("secondary"), color: FB.blue }} title="ดาวน์โหลด">
                    <Download size={14} />
                  </button>
                )}
                <button onClick={() => onDeleteFile(f.id)} style={css.btn("danger")}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {filteredFiles.length > 0 && (
        <div
          ref={sentinelRef}
          data-testid="files-window-footer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "16px",
            padding: "10px 14px",
            borderRadius: "10px",
            background: FB.white,
            border: `1px solid ${FB.border}`,
          }}
        >
          <span style={{ fontSize: "12px", color: FB.textSecondary, fontWeight: "600" }}>
            แสดง {visibleFiles.length} จาก {filteredFiles.length} ไฟล์
          </span>
          {hasMoreFiles && (
            <>
              <button
                type="button"
                data-testid="files-load-more-btn"
                onClick={() => setVisibleCount((prev) => Math.min(filteredFiles.length, prev + PAGE_WINDOW_STEP))}
                style={{ ...css.btn("secondary"), fontSize: "12px", padding: "5px 12px", color: FB.blue }}
              >
                โหลดเพิ่ม (+{Math.min(PAGE_WINDOW_STEP, filteredFiles.length - visibleFiles.length)})
              </button>
              <button
                type="button"
                data-testid="files-show-all-btn"
                onClick={() => setVisibleCount(filteredFiles.length)}
                style={{ ...css.btn("secondary"), fontSize: "12px", padding: "5px 12px" }}
              >
                แสดงทั้งหมด ({filteredFiles.length})
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
