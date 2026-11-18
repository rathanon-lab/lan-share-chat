"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { StickerItem, StickerPack } from "@/types/chat";
import { FB, css } from "@/features/admin/theme";
import { StickerItemEditModal } from "./StickerItemEditModal";

interface StickerPackInspectorCardProps {
  selectedPack: StickerPack;
  limits: { min: number; recommended: number; max: number };
  onAppendItems: (packId: string, filesList: FileList | null) => Promise<void>;
  onSavePackMeta: (packId: string, name: string, description: string) => Promise<void>;
  onSaveItemFull: (args: {
    packId: string;
    item: StickerItem;
    alt: string;
    keywords: string;
    replacementFile: File | null;
  }) => Promise<void>;
  onDeleteItem: (pack: StickerPack, item: StickerItem) => void;
}

export function StickerPackInspectorCard({
  selectedPack,
  limits,
  onAppendItems,
  onSavePackMeta,
  onSaveItemFull,
  onDeleteItem,
}: StickerPackInspectorCardProps) {
  const appendFilesInputRef = useRef<HTMLInputElement>(null);
  const [modalItem, setModalItem] = useState<StickerItem | null>(null);
  const [editingPackMeta, setEditingPackMeta] = useState(false);
  const [packNameDraft, setPackNameDraft] = useState("");
  const [packDescDraft, setPackDescDraft] = useState("");

  useEffect(() => {
    setEditingPackMeta(false);
    setModalItem(null);
  }, [selectedPack.packId]);

  return (
    <div style={{ ...css.card, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
          <Sparkles size={16} style={{ color: FB.blue, flexShrink: 0 }} />
          {editingPackMeta ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
              <input
                data-testid="admin-pack-rename-input"
                value={packNameDraft}
                onChange={(e) => setPackNameDraft(e.target.value)}
                placeholder="ชื่อชุดสติกเกอร์"
                style={{ ...css.input, padding: "6px 10px", fontSize: "13px" }}
              />
              <input
                value={packDescDraft}
                onChange={(e) => setPackDescDraft(e.target.value)}
                placeholder="คำอธิบายชุด (ไม่บังคับ)"
                style={{ ...css.input, padding: "6px 10px", fontSize: "12px" }}
              />
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  data-testid="admin-pack-rename-save"
                  onClick={async () => {
                    await onSavePackMeta(selectedPack.packId, packNameDraft, packDescDraft);
                    setEditingPackMeta(false);
                  }}
                  style={{ ...css.btn("primary"), padding: "5px 10px", fontSize: "12px" }}
                >
                  <Check size={13} /> บันทึกชื่อชุด
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPackMeta(false)}
                  style={{ ...css.btn("secondary"), padding: "5px 10px", fontSize: "12px" }}
                >
                  <X size={13} /> ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: "700", fontSize: "15px" }}>{selectedPack.name}</span>
                <button
                  type="button"
                  data-testid="admin-pack-rename-btn"
                  onClick={() => {
                    setPackNameDraft(selectedPack.name);
                    setPackDescDraft(selectedPack.description || "");
                    setEditingPackMeta(true);
                  }}
                  style={{ ...css.btn("secondary"), padding: "3px 8px", fontSize: "11px" }}
                  title="แก้ไขชื่อและคำอธิบายชุดสติกเกอร์"
                >
                  <Pencil size={11} /> แก้ชื่อชุด
                </button>
              </div>
              <div style={{ fontSize: "12px", color: FB.textSecondary }}>
                ทั้งหมด {selectedPack.items.length} / {limits.max} ตัว (ขั้นต่ำ {limits.min} ตัว) · กดที่ตัวสติกเกอร์เพื่อเปิดหน้าต่างซูม/เปลี่ยนรูป/แก้คำ
              </div>
            </div>
          )}
        </div>

        {selectedPack.source === "uploaded" && selectedPack.items.length < limits.max && (
          <>
            <input
              ref={appendFilesInputRef}
              type="file"
              multiple
              accept="image/webp,image/png,image/gif,image/jpeg"
              style={{ display: "none" }}
              onChange={(e) => {
                onAppendItems(selectedPack.packId, e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => appendFilesInputRef.current?.click()}
              style={css.btn("primary")}
            >
              <Plus size={14} /> เพิ่มรูปลงชุดนี้
            </button>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))", gap: "10px" }}>
        {selectedPack.items.map((item) => {
          const canDeleteItem = selectedPack.source === "uploaded" && selectedPack.items.length > limits.min;

          return (
            <div
              key={item.stickerId}
              data-testid={`admin-sticker-card-${item.stickerId}`}
              onClick={() => setModalItem(item)}
              style={{
                border: `1px solid ${FB.border}`,
                borderRadius: "10px",
                padding: "8px",
                background: FB.bg,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
              }}
            >
              <img
                src={item.url}
                alt={item.alt}
                style={{ width: "74px", height: "74px", objectFit: "contain" }}
              />
              <div style={{ fontSize: "12px", fontWeight: "600", color: FB.textPrimary, textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.alt}
              </div>
              <div style={{ display: "flex", gap: "4px", width: "100%", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  data-testid={`admin-sticker-open-edit-${item.stickerId}`}
                  onClick={() => setModalItem(item)}
                  style={{ ...css.btn("secondary"), padding: "3px 8px", fontSize: "11px", background: FB.white }}
                >
                  <Pencil size={11} /> แก้ไข
                </button>
                {selectedPack.source === "uploaded" && (
                  <button
                    type="button"
                    disabled={!canDeleteItem}
                    onClick={() => onDeleteItem(selectedPack, item)}
                    title={canDeleteItem ? "ลบสติกเกอร์นี้" : `ต้องมีอย่างน้อย ${limits.min} ตัวต่อชุด`}
                    style={{ ...css.btn("danger"), padding: "3px 7px", fontSize: "11px", opacity: canDeleteItem ? 1 : 0.4 }}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <StickerItemEditModal
        pack={selectedPack}
        item={modalItem}
        minPerPack={limits.min}
        onSave={onSaveItemFull}
        onDelete={onDeleteItem}
        onClose={() => setModalItem(null)}
      />
    </div>
  );
}
