"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, CheckSquare, Download, Eye, EyeOff, FileArchive,
  FolderOpen, ImagePlus, Loader2, RefreshCw, Square, Sticker, Trash2, Upload,
} from "lucide-react";
import type { StickerItem, StickerPack } from "@/types/chat";
import { FB, css } from "@/features/admin/theme";
import { StickerPackInspectorCard } from "./StickerPackInspectorCard";

interface StickerManagerTabProps {
  token: string;
  packs: StickerPack[];
  limits: { min: number; recommended: number; max: number };
  onRefreshPacks: () => Promise<void>;
  notify: (text: string, type?: "success" | "error") => void;
  requestConfirm: (cfg: {
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  }) => void;
}

export function StickerManagerTab({
  token,
  packs,
  limits,
  onRefreshPacks,
  notify,
  requestConfirm,
}: StickerManagerTabProps) {
  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [checkedPackIds, setCheckedPackIds] = useState<Set<string>>(new Set());

  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFilesInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const effectiveSelectedId = useMemo(() => {
    if (selectedPackId && packs.some((p) => p.packId === selectedPackId)) return selectedPackId;
    return packs[0]?.packId || "";
  }, [packs, selectedPackId]);

  const selectedPack = packs.find((p) => p.packId === effectiveSelectedId) || null;
  const validAllIds = useMemo(() => new Set(packs.map((p) => p.packId)), [packs]);
  const activeCheckedIds = useMemo(
    () => new Set(Array.from(checkedPackIds).filter((id) => validAllIds.has(id))),
    [checkedPackIds, validAllIds]
  );
  const checkedDeletableIds = useMemo(
    () => packs.filter((p) => p.source === "uploaded" && activeCheckedIds.has(p.packId)).map((p) => p.packId),
    [packs, activeCheckedIds]
  );
  const allPacksChecked = packs.length > 0 && packs.every((p) => activeCheckedIds.has(p.packId));

  function toggleCheckOne(packId: string) {
    setCheckedPackIds((prev) => {
      const next = new Set(prev);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });
  }

  function toggleCheckAllPacks() {
    if (allPacksChecked) {
      setCheckedPackIds(new Set());
    } else {
      setCheckedPackIds(new Set(packs.map((p) => p.packId)));
    }
  }

  async function downloadTemplateZip() {
    try {
      const res = await fetch("/api/admin/stickers/template", {
        headers: { "x-admin-token": token },
      });
      if (!res.ok) throw new Error("ไม่สามารถดาวน์โหลดไฟล์แม่แบบได้");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sticker-pack-template.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      notify("ดาวน์โหลด Template .zip สำเร็จ");
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ", "error");
    }
  }

  async function importFiles(filesList: FileList | File[]) {
    const arr = Array.from(filesList);
    if (arr.length === 0) return;

    const zipFiles = arr.filter((f) => f.name.toLowerCase().endsWith(".zip"));
    setUploading(true);
    try {
      if (zipFiles.length > 1) {
        let importedCount = 0;
        let lastId = "";
        for (let i = 0; i < zipFiles.length; i++) {
          const zf = zipFiles[i];
          setUploadStatusText(`กำลังนำเข้าไฟล์ .zip ชุดที่ ${i + 1} / ${zipFiles.length} (${zf.name})...`);
          const fd = new FormData();
          if (packDescription.trim()) fd.append("description", packDescription.trim());
          fd.append("files", zf);
          const res = await fetch("/api/admin/stickers/import", {
            method: "POST",
            headers: { "x-admin-token": token },
            body: fd,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(`${zf.name}: ${data?.error || "นำเข้าไม่สำเร็จ"}`);
          importedCount++;
          if (data?.pack?.packId) lastId = data.pack.packId;
        }
        setPackName("");
        setPackDescription("");
        if (lastId) setSelectedPackId(lastId);
        notify(`นำเข้าชุดสติกเกอร์พร้อมกันสำเร็จ ${importedCount} ชุด`);
        await onRefreshPacks();
        return;
      }

      setUploadStatusText("กำลังตรวจสอบและบันทึกลงคลังสติกเกอร์...");
      const fd = new FormData();
      if (packName.trim()) fd.append("name", packName.trim());
      if (packDescription.trim()) fd.append("description", packDescription.trim());

      const relPaths: string[] = [];
      for (const f of arr) {
        fd.append("files", f);
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        relPaths.push(rel);
      }
      fd.append("relativePaths", JSON.stringify(relPaths));

      const res = await fetch("/api/admin/stickers/import", {
        method: "POST",
        headers: { "x-admin-token": token },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "นำเข้าชุดสติกเกอร์ไม่สำเร็จ");

      setPackName("");
      setPackDescription("");
      if (data?.pack?.packId) setSelectedPackId(data.pack.packId);
      notify(`นำเข้าชุดสติกเกอร์ "${data?.pack?.name}" สำเร็จ (${data?.pack?.items?.length || 0} ตัว)`);
      await onRefreshPacks();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "เกิดข้อผิดพลาดระหว่างอัปโหลด", "error");
    } finally {
      setUploading(false);
      setUploadStatusText("");
    }
  }

  async function handleToggleEnabled(pack: StickerPack) {
    try {
      const res = await fetch(`/api/admin/stickers/${encodeURIComponent(pack.packId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ enabled: !pack.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "อัปเดตสถานะไม่สำเร็จ");
      notify(!pack.enabled ? `เปิดใช้งาน "${pack.name}" แล้ว` : `ปิดใช้งาน "${pack.name}" ชั่วคราวแล้ว`);
      await onRefreshPacks();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Error", "error");
    }
  }

  async function handleMovePack(packId: string, dir: -1 | 1) {
    const ids = packs.map((p) => p.packId);
    const idx = ids.indexOf(packId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    const [picked] = next.splice(idx, 1);
    next.splice(target, 0, picked);

    try {
      const res = await fetch("/api/admin/stickers/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ packIds: next }),
      });
      if (!res.ok) throw new Error("จัดลำดับไม่สำเร็จ");
      notify("อัปเดตลำดับชุดสติกเกอร์ในห้องแชทแล้ว");
      await onRefreshPacks();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Error", "error");
    }
  }

  function handleDeletePack(pack: StickerPack) {
    if (pack.source === "builtin") {
      notify('ชุด Built-in Starter สามารถกด "ซ่อน/ปิดใช้งาน" ได้ แต่ไม่สามารถลบถาวร', "error");
      return;
    }
    requestConfirm({
      title: `ยืนยันลบชุดสติกเกอร์ "${pack.name}"`,
      description: `ต้องการลบแพ็กสติกเกอร์นี้ออกจากคลังเลือกสติกเกอร์ใช่หรือไม่? (สติกเกอร์ที่เคยส่งในแชทแล้วจะยังคงแสดงภาพตามปกติ)`,
      confirmLabel: "ลบชุดสติกเกอร์",
      onConfirm: async () => {
        const res = await fetch(`/api/admin/stickers/${encodeURIComponent(pack.packId)}`, {
          method: "DELETE",
          headers: { "x-admin-token": token },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "ลบชุดสติกเกอร์ไม่สำเร็จ");
        notify(`ลบชุดสติกเกอร์ "${pack.name}" แล้ว`);
        await onRefreshPacks();
      },
    });
  }

  async function handleBatchVisibility(action: "enable" | "disable" | "toggle") {
    const ids = Array.from(activeCheckedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/admin/stickers/batch-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ packIds: ids, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "อัปเดตสถานะไม่สำเร็จ");
      const label = action === "enable" ? "เปิดใช้งาน" : action === "disable" ? "ปิดซ่อน" : "สลับสถานะเปิด/ปิด";
      notify(`${label}ชุดสติกเกอร์ที่เลือก ${data?.updatedCount ?? ids.length} ชุดแล้ว`);
      await onRefreshPacks();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Error", "error");
    }
  }

  function handleBatchDeletePacks() {
    const ids = checkedDeletableIds;
    if (ids.length === 0) return;
    const names = packs.filter((p) => ids.includes(p.packId)).map((p) => p.name);
    requestConfirm({
      title: `ยืนยันลบชุดสติกเกอร์ที่เลือก (${ids.length} ชุด)`,
      description: `ต้องการลบชุดสติกเกอร์ที่เลือกจำนวน ${ids.length} ชุด (${names.slice(0, 3).join(", ")}${names.length > 3 ? ` และอีก ${names.length - 3} ชุด` : ""}) ใช่หรือไม่? (ข้อความสติกเกอร์เก่าในแชทจะยังแสดงผลปกติ)`,
      confirmLabel: `ลบ ${ids.length} ชุด`,
      onConfirm: async () => {
        const res = await fetch("/api/admin/stickers/batch-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-token": token },
          body: JSON.stringify({ packIds: ids }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "ลบชุดสติกเกอร์ไม่สำเร็จ");
        setCheckedPackIds(new Set());
        notify(`ลบชุดสติกเกอร์ที่เลือก ${data?.deletedCount ?? ids.length} ชุดแล้ว`);
        await onRefreshPacks();
      },
    });
  }

  async function handleAppendItems(packId: string, filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(filesList).forEach((f) => fd.append("files", f));
      const res = await fetch(`/api/admin/stickers/${encodeURIComponent(packId)}/items`, {
        method: "POST",
        headers: { "x-admin-token": token },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "เพิ่มสติกเกอร์ไม่สำเร็จ");
      notify(`เพิ่มสติกเกอร์ลงใน "${data?.pack?.name}" แล้ว (รวม ${data?.pack?.items?.length || 0} ตัว)`);
      await onRefreshPacks();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleSavePackMeta(packId: string, name: string, description: string) {
    try {
      const res = await fetch(`/api/admin/stickers/${encodeURIComponent(packId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "แก้ไขชื่อชุดไม่สำเร็จ");
      notify("อัปเดตชื่อและคำอธิบายชุดสติกเกอร์แล้ว");
      await onRefreshPacks();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Error", "error");
    }
  }

  async function handleSaveItemFull({
    packId,
    item,
    alt,
    keywords,
    replacementFile,
  }: {
    packId: string;
    item: StickerItem;
    alt: string;
    keywords: string;
    replacementFile: File | null;
  }) {
    try {
      if (replacementFile) {
        const fd = new FormData();
        fd.append("file", replacementFile);
        const imgRes = await fetch(
          `/api/admin/stickers/${encodeURIComponent(packId)}/items/${encodeURIComponent(item.stickerId)}/image`,
          {
            method: "POST",
            headers: { "x-admin-token": token },
            body: fd,
          }
        );
        const imgData = await imgRes.json();
        if (!imgRes.ok) throw new Error(imgData?.error || "เปลี่ยนรูปสติกเกอร์ไม่สำเร็จ");
      }
      const res = await fetch(
        `/api/admin/stickers/${encodeURIComponent(packId)}/items/${encodeURIComponent(item.stickerId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-admin-token": token },
          body: JSON.stringify({ alt: alt.trim() || item.alt, keywords: keywords.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
      notify(replacementFile ? "อัปเดตรูปภาพและข้อมูลสติกเกอร์แล้ว" : "อัปเดตคำอธิบายและคีย์เวิร์ดสติกเกอร์แล้ว");
      await onRefreshPacks();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Error", "error");
      throw e;
    }
  }

  function handleDeleteItem(pack: StickerPack, item: StickerItem) {
    requestConfirm({
      title: `ลบสติกเกอร์ "${item.alt || item.stickerId}"`,
      description: `ต้องการลบสติกเกอร์ตัวนี้ออกจากชุด "${pack.name}" ใช่หรือไม่? (คงเหลือขั้นต่ำ ${limits.min} ตัวต่อชุด)`,
      confirmLabel: "ลบสติกเกอร์นี้",
      onConfirm: async () => {
        const res = await fetch(
          `/api/admin/stickers/${encodeURIComponent(pack.packId)}/items/${encodeURIComponent(item.stickerId)}`,
          {
            method: "DELETE",
            headers: { "x-admin-token": token },
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
        notify("ลบสติกเกอร์ออกจากชุดแล้ว");
        await onRefreshPacks();
      },
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-testid="admin-stickers-tab">
      <div style={{ ...css.card, margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderLeft: `4px solid ${FB.blue}` }}>
        <div style={{ flex: 1, minWidth: "240px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "15px", color: FB.textPrimary }}>
            <Sticker size={18} style={{ color: FB.blue }} />
            <span>มาตรฐานชุดสติกเกอร์ห้องแชท (Shared Sticker Packs)</span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: FB.textSecondary, lineHeight: 1.5 }}>
            1 แพ็กมีสติกเกอร์ได้ <strong>{limits.min}–{limits.max} ตัว</strong> (แนะนำ <strong>{limits.recommended} ตัว</strong>) รองรับ PNG / WebP / GIF พื้นโปร่งใส ·
            คลุมดำลากไฟล์ <code>.zip</code> หลายไฟล์มาวางพร้อมกันได้เลย · ไฟล์ที่อัปโหลดเก็บถาวรใน <code>storage/stickers/</code>
          </p>
        </div>
        <button
          type="button"
          data-testid="download-sticker-template-btn"
          onClick={downloadTemplateZip}
          style={{ ...css.btn("primary"), padding: "9px 16px" }}
        >
          <Download size={15} /> ดาวน์โหลด Template (.zip)
        </button>
      </div>

      <div style={{ ...css.card, margin: 0 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: "700", color: FB.textPrimary }}>
          นำเข้าชุดสติกเกอร์ใหม่ (.zip หลายไฟล์พร้อมกัน / โฟลเดอร์ / หลายไฟล์ภาพ)
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "12px" }}>
          <input
            type="text"
            placeholder="ชื่อชุดสติกเกอร์ (ถ้าไม่ใส่จะอ่านจาก manifest.json หรือชื่อไฟล์ .zip)"
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
            style={{ ...css.input, borderRadius: "8px" }}
          />
          <input
            type="text"
            placeholder="คำอธิบายสั้น ๆ ของชุดสติกเกอร์ (ไม่บังคับ)"
            value={packDescription}
            onChange={(e) => setPackDescription(e.target.value)}
            style={{ ...css.input, borderRadius: "8px" }}
          />
        </div>

        <input
          ref={zipInputRef}
          type="file"
          multiple
          accept=".zip,application/zip"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={multiFilesInputRef}
          type="file"
          multiple
          accept="image/webp,image/png,image/gif,image/jpeg"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) importFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
          }}
          style={{
            border: `2px dashed ${isDragging ? FB.blue : "#CBD5E1"}`,
            background: isDragging ? FB.blueLight : "#F8FAFC",
            borderRadius: "12px",
            padding: "20px",
            textAlign: "center",
            transition: "all 0.15s",
          }}
        >
          {uploading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: FB.blue }}>
              <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontWeight: "600", fontSize: "14px" }}>
                {uploadStatusText || "กำลังตรวจสอบและบันทึกลงคลังสติกเกอร์..."}
              </span>
            </div>
          ) : (
            <>
              <Upload size={26} style={{ color: FB.blue, margin: "0 auto 8px" }} />
              <div style={{ fontSize: "14px", fontWeight: "600", color: FB.textPrimary, marginBottom: "4px" }}>
                คลุมดำลากไฟล์ <code>.zip</code> (หลายชุดพร้อมกันได้) หรือไฟล์ภาพสติกเกอร์มาวางที่นี่
              </div>
              <div style={{ fontSize: "12px", color: FB.textSecondary, marginBottom: "12px" }}>
                แนะนำขนาด 370x320 หรือ 360x360 px (WebP/PNG/GIF พื้นโปร่งใส · รองรับ <code>.zip</code> สูงสุด 100 MB ต่อไฟล์)
              </div>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  data-testid="upload-sticker-zip-btn"
                  onClick={() => zipInputRef.current?.click()}
                  style={css.btn("primary")}
                >
                  <FileArchive size={15} /> นำเข้าไฟล์ .zip (เลือกหลายไฟล์ได้)
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  style={css.btn("secondary")}
                >
                  <FolderOpen size={15} /> เลือกทั้งโฟลเดอร์
                </button>
                <button
                  type="button"
                  onClick={() => multiFilesInputRef.current?.click()}
                  style={css.btn("secondary")}
                >
                  <ImagePlus size={15} /> เลือกหลายไฟล์ ({limits.min}-{limits.max} รูป)
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: "14px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={css.badge(false)}>ทั้งหมด {packs.length} ชุดในระบบ</span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              {packs.length > 0 && (
                <button
                  type="button"
                  data-testid="stickers-select-all-btn"
                  onClick={toggleCheckAllPacks}
                  style={{ ...css.btn("secondary"), padding: "5px 10px", fontSize: "12px" }}
                >
                  {allPacksChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                  {allPacksChecked ? "ยกเลิกเลือกทั้งหมด" : `เลือกทั้งหมด (${packs.length})`}
                </button>
              )}
              {activeCheckedIds.size > 0 && (
                <>
                  <button
                    type="button"
                    data-testid="stickers-batch-enable-btn"
                    onClick={() => handleBatchVisibility("enable")}
                    style={{ ...css.btn("secondary"), background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0", padding: "5px 10px", fontSize: "12px" }}
                  >
                    <Eye size={13} /> เปิดที่เลือก ({activeCheckedIds.size})
                  </button>
                  <button
                    type="button"
                    data-testid="stickers-batch-disable-btn"
                    onClick={() => handleBatchVisibility("disable")}
                    style={{ ...css.btn("secondary"), background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A", padding: "5px 10px", fontSize: "12px" }}
                  >
                    <EyeOff size={13} /> ปิดที่เลือก ({activeCheckedIds.size})
                  </button>
                  <button
                    type="button"
                    data-testid="stickers-batch-toggle-btn"
                    onClick={() => handleBatchVisibility("toggle")}
                    style={{ ...css.btn("secondary"), background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", padding: "5px 10px", fontSize: "12px" }}
                    title="สลับสถานะแต่ละชุด: ตัวที่เปิดอยู่จะปิด และตัวที่ปิดอยู่จะเปิด"
                  >
                    <RefreshCw size={13} /> สลับเปิด/ปิด ({activeCheckedIds.size})
                  </button>
                </>
              )}
              {checkedDeletableIds.length > 0 && (
                <button
                  type="button"
                  data-testid="stickers-batch-delete-btn"
                  onClick={handleBatchDeletePacks}
                  style={{ ...css.btn("danger"), background: FB.red, color: "white", border: "none", padding: "5px 10px", fontSize: "12px" }}
                >
                  <Trash2 size={13} /> ลบชุดที่เลือก ({checkedDeletableIds.length})
                </button>
              )}
            </div>
          </div>

          {packs.map((pack, idx) => {
            const isSelected = selectedPack?.packId === pack.packId;
            const isChecked = activeCheckedIds.has(pack.packId);
            return (
              <div
                key={pack.packId}
                data-testid={`admin-pack-card-${pack.packId}`}
                onClick={() => setSelectedPackId(pack.packId)}
                style={{
                  ...css.card,
                  margin: 0,
                  cursor: "pointer",
                  border: isChecked
                    ? `2px solid ${FB.red}`
                    : isSelected
                      ? `2px solid ${FB.blue}`
                      : `1px solid ${FB.border}`,
                  background: isChecked ? "#FFF5F5" : isSelected ? "#F8FBFF" : FB.white,
                  opacity: pack.enabled ? 1 : 0.72,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    data-testid={`select-pack-checkbox-${pack.packId}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCheckOne(pack.packId);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "2px",
                      cursor: "pointer",
                      color: isChecked ? FB.blue : FB.textSecondary,
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="เลือกชุดสติกเกอร์นี้เพื่อเปิด/ปิด/สลับสถานะ หรือลบพร้อมกัน"
                  >
                    {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  <img
                    src={pack.mainUrl || pack.items[0]?.url}
                    alt={pack.name}
                    style={{ width: "52px", height: "52px", objectFit: "contain", borderRadius: "8px", background: FB.bg, padding: "4px", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: "700", fontSize: "14px", color: FB.textPrimary }}>{pack.name}</span>
                      <span
                        style={{
                          padding: "1px 7px",
                          borderRadius: "999px",
                          fontSize: "10px",
                          fontWeight: "700",
                          background: pack.source === "builtin" ? "#EEF2FF" : "#ECFDF5",
                          color: pack.source === "builtin" ? "#4338CA" : "#047857",
                        }}
                      >
                        {pack.source === "builtin" ? "Built-in Starter" : "Uploaded"}
                      </span>
                      {!pack.enabled && (
                        <span style={{ padding: "1px 7px", borderRadius: "999px", fontSize: "10px", fontWeight: "700", background: FB.redLight, color: FB.red }}>
                          ปิดอยู่
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: FB.textSecondary, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pack.description || "ไม่มีคำอธิบาย"} · {pack.items.length} / {limits.max} ตัว
                    </div>
                  </div>
                </div>

                <div
                  style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${FB.border}` }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMovePack(pack.packId, -1)}
                    style={{ ...css.btn("secondary"), padding: "5px 8px", opacity: idx === 0 ? 0.4 : 1 }}
                    title="เลื่อนขึ้น"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === packs.length - 1}
                    onClick={() => handleMovePack(pack.packId, 1)}
                    style={{ ...css.btn("secondary"), padding: "5px 8px", opacity: idx === packs.length - 1 ? 0.4 : 1 }}
                    title="เลื่อนลง"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(pack)}
                    style={{ ...css.btn("secondary"), padding: "5px 10px" }}
                  >
                    {pack.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                    {pack.enabled ? "เปิดแสดง" : "ซ่อนอยู่"}
                  </button>
                  <div style={{ flex: 1 }} />
                  {pack.source === "uploaded" && (
                    <button
                      type="button"
                      data-testid={`delete-pack-btn-${pack.packId}`}
                      onClick={() => handleDeletePack(pack)}
                      style={{ ...css.btn("danger"), padding: "5px 10px" }}
                    >
                      <Trash2 size={13} /> ลบชุดนี้
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selectedPack && (
          <StickerPackInspectorCard
            selectedPack={selectedPack}
            limits={limits}
            onAppendItems={handleAppendItems}
            onSavePackMeta={handleSavePackMeta}
            onSaveItemFull={handleSaveItemFull}
            onDeleteItem={handleDeleteItem}
          />
        )}
      </div>
    </div>
  );
}
