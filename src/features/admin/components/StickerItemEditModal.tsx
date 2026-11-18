"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { StickerItem, StickerPack } from "@/types/chat";
import { FB, css } from "@/features/admin/theme";

interface StickerItemEditModalProps {
  pack: StickerPack;
  item: StickerItem | null;
  minPerPack: number;
  onSave: (args: {
    packId: string;
    item: StickerItem;
    alt: string;
    keywords: string;
    replacementFile: File | null;
  }) => Promise<void>;
  onDelete: (pack: StickerPack, item: StickerItem) => void;
  onClose: () => void;
}

export function StickerItemEditModal({
  pack,
  item,
  minPerPack,
  onSave,
  onDelete,
  onClose,
}: StickerItemEditModalProps) {
  const [alt, setAlt] = useState("");
  const [keywords, setKeywords] = useState("");
  const [zoom, setZoom] = useState(1);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    setAlt(item.alt || "");
    setKeywords(item.keywords || "");
    setZoom(1);
    setReplacementFile(null);
    setPreviewObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [item]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [previewObjectUrl]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  const canDelete = pack.source === "uploaded" && pack.items.length > minPerPack;
  const displayUrl = previewObjectUrl || item.url;

  const handlePickReplacement = (file: File | null) => {
    if (!file) return;
    setPreviewObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setReplacementFile(file);
  };

  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ packId: pack.packId, item, alt, keywords, replacementFile });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="admin-sticker-edit-modal"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(15, 23, 42, 0.58)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleConfirmSave}
        style={{
          ...css.card,
          margin: 0,
          width: "100%",
          maxWidth: "620px",
          maxHeight: "92vh",
          overflowY: "auto",
          borderRadius: "16px",
          padding: "20px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "16px", color: FB.textPrimary }}>
              แก้ไขสติกเกอร์ · {pack.name}
            </div>
            <div style={{ fontSize: "12px", color: FB.textSecondary }}>
              ID: {item.stickerId} {replacementFile ? `· รูปใหม่: ${replacementFile.name}` : ""}
            </div>
          </div>
          <button
            type="button"
            data-testid="admin-sticker-edit-close"
            onClick={onClose}
            style={{ ...css.btn("secondary"), width: "34px", height: "34px", padding: 0, justifyContent: "center", borderRadius: "50%" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Preview Stage with Zoom Controls + Replace Image */}
        <div
          style={{
            position: "relative",
            border: `1px solid ${FB.border}`,
            borderRadius: "12px",
            height: "240px",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#F8FAFC",
            backgroundImage: "linear-gradient(45deg, #E2E8F0 25%, transparent 25%), linear-gradient(-45deg, #E2E8F0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #E2E8F0 75%), linear-gradient(-45deg, transparent 75%, #E2E8F0 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
          }}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => e.deltaY < 0 ? Math.min(2.5, Number((z + 0.2).toFixed(2))) : Math.max(0.5, Number((z - 0.2).toFixed(2))));
          }}
        >
          <img
            src={displayUrl}
            alt={alt || item.alt}
            style={{
              width: "160px",
              height: "160px",
              objectFit: "contain",
              transform: `scale(${zoom})`,
              transition: "transform 120ms ease",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(15, 23, 42, 0.78)",
              padding: "4px 6px",
              borderRadius: "10px",
              color: "white",
            }}
          >
            <button
              type="button"
              data-testid="admin-edit-zoom-out"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "3px" }}
              title="ย่อ (-)"
            >
              <ZoomOut size={15} />
            </button>
            <span style={{ fontSize: "11px", fontWeight: "700", minWidth: "38px", textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              data-testid="admin-edit-zoom-in"
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "3px" }}
              title="ขยาย (+)"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              style={{ background: "none", border: "none", color: "#CBD5E1", cursor: "pointer", padding: "3px" }}
              title="รีเซ็ต 100%"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <input
            ref={replaceInputRef}
            data-testid="admin-sticker-replace-file-input"
            type="file"
            accept="image/webp,image/png,image/gif,image/jpeg"
            style={{ display: "none" }}
            onChange={(e) => {
              handlePickReplacement(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            data-testid="admin-sticker-replace-btn"
            onClick={() => replaceInputRef.current?.click()}
            style={css.btn("secondary")}
          >
            <ImagePlus size={14} /> เปลี่ยนรูปภาพสติกเกอร์ (WebP/PNG/GIF/JPG)
          </button>
          {replacementFile && (
            <button
              type="button"
              onClick={() => {
                setReplacementFile(null);
                setPreviewObjectUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
              }}
              style={{ ...css.btn("ghost"), color: FB.red, fontSize: "12px" }}
            >
              ใช้รูปเดิม
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: FB.textSecondary, marginBottom: "4px" }}>
              ชื่อ / ข้อความกำกับสติกเกอร์
            </label>
            <input
              data-testid="admin-sticker-edit-alt"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="เช่น สวัสดีตอนเช้า"
              style={css.input}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: FB.textSecondary, marginBottom: "4px" }}>
              คีย์เวิร์ดค้นหา
            </label>
            <input
              data-testid="admin-sticker-edit-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="เช่น morning, ทักทาย, สวัสดี"
              style={css.input}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", paddingTop: "8px", borderTop: `1px solid ${FB.border}`, flexWrap: "wrap" }}>
          <div>
            {pack.source === "uploaded" && (
              <button
                type="button"
                disabled={!canDelete || saving}
                onClick={() => {
                  onClose();
                  onDelete(pack, item);
                }}
                title={canDelete ? "ลบสติกเกอร์ตัวนี้ออกจากชุด" : `ลบไม่ได้เพราะเหลือตัวสุดท้าย (ขั้นต่ำ ${minPerPack} ตัว) — ใช้ปุ่มเปลี่ยนรูปภาพแทนได้`}
                style={{ ...css.btn("danger"), opacity: canDelete ? 1 : 0.45 }}
              >
                <Trash2 size={14} /> {canDelete ? "ลบสติกเกอร์นี้" : `ลบไม่ได้ (เหลือขั้นต่ำ ${minPerPack})`}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={onClose} style={css.btn("secondary")} disabled={saving}>
              ยกเลิก
            </button>
            <button type="submit" data-testid="admin-sticker-edit-save" style={css.btn("primary")} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} บันทึกการแก้ไข
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
