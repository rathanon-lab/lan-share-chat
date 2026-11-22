"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Camera, ChevronRight, File as FileIcon, Image as ImageIcon, Keyboard, Loader2, Menu, Mic,
  Paperclip, Plus, SendHorizontal, Smile, Square, Trash2, Video, Volume2, XCircle,
} from "lucide-react";
import type { StickerItem, StickerMessageMeta, StickerPack, SystemSettings } from "@/types/chat";
import { FB, css, formatAdminBytes } from "@/features/admin/theme";
import { EmojiStickerPicker } from "@/features/stickers/components/EmojiStickerPicker";
import { CameraCaptureModal } from "@/features/stickers/components/CameraCaptureModal";
import { DockedStickerPreviewTray } from "@/features/stickers/components/DockedStickerPreviewTray";
import {
  type DockedStickerDraft,
  draftBuildMessagePayload,
  draftSelectSticker,
} from "@/features/stickers/lib/stickerDraft";

interface AdminChatComposerProps {
  systemSettings: SystemSettings;
  stickerPacks: StickerPack[];
  adminMessage: string;
  setAdminMessage: (val: string) => void;
  attachPreviews: { id: string; file: File; url: string; type: "image" | "video" | "file" }[];
  uploadProgress: number | null;
  onCancelUpload: () => void;
  isRecording: boolean;
  isEncodingVoice: boolean;
  recordSec: number;
  recordedVoice: { file: File; previewUrl: string; durationSec: number } | null;
  onClearRecordedVoice: () => void;
  canUseMicContext: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSendMessage: (e: React.FormEvent) => void;
  onSendSticker: (pack: StickerPack, item: StickerItem, customMeta?: StickerMessageMeta) => Promise<void>;
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveAttachPreview: (id: string) => void;
  onClearAllAttachPreviews: () => void;
}

export function AdminChatComposer({
  systemSettings,
  stickerPacks,
  adminMessage,
  setAdminMessage,
  attachPreviews,
  uploadProgress,
  onCancelUpload,
  isRecording,
  isEncodingVoice,
  recordSec,
  recordedVoice,
  onClearRecordedVoice,
  canUseMicContext,
  onStartRecording,
  onStopRecording,
  onSendMessage,
  onSendSticker,
  onFilesSelected,
  onAddFiles,
  onRemoveAttachPreview,
  onClearAllAttachPreviews,
}: AdminChatComposerProps) {
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"emoji" | "sticker">("sticker");
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [toolsExpandedWhileTyping, setToolsExpandedWhileTyping] = useState(false);
  const [stagedDockedSticker, setStagedDockedSticker] = useState<DockedStickerDraft | null>(null);

  const isDockedPreviewMode = systemSettings.stickerPreviewMode === "docked_tray";
  const isCollageEnabled = systemSettings.stickerCollageEnabled !== false;
  const activeDockedDraft = isDockedPreviewMode ? stagedDockedSticker : null;

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const canSendAdmin =
    (adminMessage.trim().length > 0 || attachPreviews.length > 0 || recordedVoice !== null || activeDockedDraft !== null) &&
    uploadProgress === null &&
    !isRecording &&
    !isEncodingVoice;

  const sendActiveDockedDraft = async () => {
    if (!activeDockedDraft) return;
    const payload = draftBuildMessagePayload(activeDockedDraft);
    if (!payload) return;
    setStagedDockedSticker(null);
    await onSendSticker(payload.pack, payload.item, payload.customMeta);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    if (activeDockedDraft && !adminMessage.trim() && attachPreviews.length === 0 && recordedVoice === null) {
      e.preventDefault();
      void sendActiveDockedDraft();
      return;
    }
    onSendMessage(e);
  };

  const collapseToolsOnMobile = adminMessage.trim().length > 0 && !toolsExpandedWhileTyping;

  const handleCameraClick = () => {
    setShowAttachMenu(false);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      mobileCameraInputRef.current?.click();
    } else {
      setIsCameraModalOpen(true);
    }
  };

  const handleAdminPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const clipboardFiles = e.clipboardData?.files;
    if (clipboardFiles && clipboardFiles.length > 0) {
      e.preventDefault();
      onAddFiles(clipboardFiles);
    }
  };

  return (
    <div style={{ position: "relative", borderTop: `1px solid ${FB.border}`, paddingTop: "12px" }}>
      <DockedStickerPreviewTray
        draft={activeDockedDraft}
        setDraft={setStagedDockedSticker}
        collageEnabled={isCollageEnabled}
        onSend={() => void sendActiveDockedDraft()}
        onClose={() => setStagedDockedSticker(null)}
      />
      {uploadProgress !== null && (
        <div style={{ marginBottom: "10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "12px", padding: "8px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "600", color: "#1D4ED8", marginBottom: "4px" }}>
              <span>กำลังอัปโหลดไฟล์เข้าห้องแชท...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div style={{ height: "6px", background: "#BFDBFE", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${uploadProgress}%`, background: FB.blue, transition: "width 0.15s", borderRadius: "999px" }} />
            </div>
          </div>
          <button type="button" onClick={onCancelUpload} style={{ ...css.btn("danger"), padding: "4px 10px", fontSize: "12px", borderRadius: "8px" }}>
            ยกเลิก
          </button>
        </div>
      )}

      {recordedVoice && (
        <div data-testid="admin-voice-preview-strip" style={{ marginBottom: "10px", padding: "10px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: FB.blue, color: "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Volume2 size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#1E3A8A", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span>ข้อความเสียง (.mp3 พร้อมส่ง · {recordedVoice.durationSec}s)</span>
              <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "white", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                ตรวจสอบก่อนกดส่ง
              </span>
            </div>
            <audio src={recordedVoice.previewUrl} controls style={{ width: "100%", height: "32px" }} />
          </div>
          <button
            type="button"
            data-testid="admin-voice-discard-btn"
            onClick={onClearRecordedVoice}
            title="ลบเสียงที่บันทึก"
            style={{ width: "34px", height: "34px", borderRadius: "50%", border: "none", background: "#FEE2E2", color: FB.red, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {isEncodingVoice && (
        <div style={{ marginBottom: "8px", padding: "6px 12px", borderRadius: "10px", background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: "12px", color: "#92400E", fontWeight: "500" }}>
          กำลังแปลงไฟล์เสียงเป็น .mp3 เพื่อตรวจสอบก่อนส่ง (รองรับ iOS / Safari / Chrome)...
        </div>
      )}

      {attachPreviews.length > 0 && (
        <div style={{ ...css.card, marginBottom: "8px", padding: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: FB.textSecondary }}>รอส่ง {attachPreviews.length}/10 ไฟล์</span>
            <button type="button" onClick={onClearAllAttachPreviews} style={{ ...css.btn("ghost"), color: FB.red, fontSize: "12px", fontWeight: "600", padding: "2px 6px" }}>
              <Trash2 size={12} /> ล้างทั้งหมด
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", overflowX: "auto", paddingBottom: "2px" }}>
            {attachPreviews.map((item) => (
              <div key={item.id} style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px", background: FB.bg, padding: "6px 10px", borderRadius: "8px", border: `1px solid ${FB.border}`, flexShrink: 0 }}>
                {item.type === "image" && <img src={item.url} alt="preview" style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "6px" }} />}
                {item.type === "video" && (
                  <div style={{ position: "relative", width: "44px", height: "44px", background: "#0F172A", borderRadius: "6px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <video src={item.url} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }} muted />
                    <Video size={14} color="white" style={{ position: "absolute" }} />
                  </div>
                )}
                {item.type === "file" && <FileIcon size={22} color={FB.blue} />}
                <div style={{ maxWidth: "120px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.file.name}</div>
                  <div style={{ fontSize: "11px", color: FB.textSecondary }}>{formatAdminBytes(item.file.size)}</div>
                </div>
                <button type="button" onClick={() => onRemoveAttachPreview(item.id)} style={{ ...css.btn("ghost"), padding: "2px" }}>
                  <XCircle size={16} />
                </button>
              </div>
            ))}
            {attachPreviews.length < 10 && (
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...css.btn("secondary"), height: "56px" }}>
                <Plus size={16} /> เพิ่มไฟล์
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleFormSubmit} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <input ref={mediaInputRef} type="file" multiple accept="image/*,video/*" style={{ display: "none" }} onChange={onFilesSelected} />
        <input ref={fileInputRef} type="file" multiple accept="*/*" style={{ display: "none" }} onChange={onFilesSelected} />
        <input ref={mobileCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFilesSelected} />

        {collapseToolsOnMobile && (
          <button
            type="button"
            onClick={() => setToolsExpandedWhileTyping(true)}
            title="เปิดปุ่มแนบไฟล์และกล้อง"
            className="sm:hidden flex items-center gap-0.5 px-2 h-10 rounded-full text-gray-600 hover:bg-gray-100 border border-gray-200 shrink-0 cursor-pointer"
          >
            <Menu size={16} />
            <ChevronRight size={14} />
          </button>
        )}

        <div className={`items-center gap-1 shrink-0 ${collapseToolsOnMobile ? "hidden sm:flex" : "flex"}`}>
          <div style={{ position: "relative", flexShrink: 0 }} ref={attachMenuRef}>
            <button
              type="button"
              onClick={() => setShowAttachMenu((v) => !v)}
              title="แนบไฟล์หรือสื่อ"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "50%",
                background: showAttachMenu ? FB.blue : FB.bg,
                border: `1px solid ${showAttachMenu ? FB.blue : FB.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: showAttachMenu ? "white" : FB.blue,
              }}
            >
              <Plus size={18} />
            </button>
            {showAttachMenu && (
              <div style={{ position: "absolute", bottom: "46px", left: 0, background: FB.white, border: `1px solid ${FB.border}`, borderRadius: "12px", padding: "6px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "220px", zIndex: 100 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachMenu(false);
                    mediaInputRef.current?.click();
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", color: FB.textPrimary, fontSize: "14px", fontWeight: "500", borderRadius: "8px", textAlign: "left" }}
                >
                  <ImageIcon size={18} style={{ color: "#1877F2" }} /> รูปภาพ / วิดีโอ (หลายไฟล์)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachMenu(false);
                    fileInputRef.current?.click();
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", color: FB.textPrimary, fontSize: "14px", fontWeight: "500", borderRadius: "8px", textAlign: "left" }}
                >
                  <Paperclip size={18} style={{ color: "#7B1FA2" }} /> แนบไฟล์ (สูงสุด 10 ไฟล์)
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleCameraClick}
            title="ถ่ายรูปส่งเข้าห้องแชท"
            style={{ width: "38px", height: "38px", borderRadius: "50%", background: FB.bg, border: `1px solid ${FB.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: FB.textSecondary }}
          >
            <Camera size={18} />
          </button>

          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            title="เลือกรูปภาพหรือวิดีโอหลายไฟล์"
            style={{ width: "38px", height: "38px", borderRadius: "50%", background: FB.bg, border: `1px solid ${FB.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: FB.textSecondary }}
          >
            <ImageIcon size={18} />
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", background: FB.bg, border: `1px solid ${FB.border}`, borderRadius: "22px", paddingRight: "4px" }}>
          <input
            data-testid="admin-chat-input"
            style={{ ...css.input, flex: 1, background: "transparent", border: "none", borderRadius: "22px", padding: "9px 14px" }}
            placeholder={
              isRecording
                ? `กำลังอัดเสียง (${recordSec} วินาที)... กดปุ่มหยุดเมื่อเสร็จ`
                : attachPreviews.length > 0 || recordedVoice
                  ? "เพิ่มคำอธิบาย (ไม่บังคับ)..."
                  : "พิมพ์ในฐานะ [Admin]..."
            }
            value={adminMessage}
            disabled={isRecording}
            onPaste={handleAdminPaste}
            onChange={(e) => {
              if (!e.target.value.trim()) setToolsExpandedWhileTyping(false);
              setAdminMessage(e.target.value);
            }}
          />
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            title={showPicker ? "ซ่อนถาดอีโมจิและสติกเกอร์" : "เปิดอีโมจิและสติกเกอร์"}
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              background: showPicker ? FB.blueLight : "transparent",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: showPicker ? FB.blue : FB.textSecondary,
              flexShrink: 0,
            }}
          >
            {showPicker ? <Keyboard size={18} /> : <Smile size={18} />}
          </button>
        </div>

        {systemSettings.voiceMessageEnabled && (
          isRecording ? (
            <button
              type="button"
              data-testid="admin-voice-stop-btn"
              onClick={onStopRecording}
              title="หยุดบันทึกเสียง (เพื่อตรวจสอบก่อนส่ง)"
              className="animate-pulse"
              style={{
                padding: "0 12px",
                height: "40px",
                borderRadius: "20px",
                background: FB.red,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                flexShrink: 0,
                color: "white",
                fontSize: "12px",
                fontWeight: "700",
              }}
            >
              <Square size={13} fill="white" /> {recordSec}s
            </button>
          ) : (
            <button
              type="button"
              data-testid="admin-voice-record-btn"
              disabled={!canUseMicContext || isEncodingVoice || uploadProgress !== null}
              onClick={onStartRecording}
              title={canUseMicContext ? "บันทึกเสียง (.mp3 ตรวจสอบก่อนส่งได้)" : "ปิดใช้งานบน HTTP (กรุณาเปิดผ่าน HTTPS)"}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: FB.bg,
                border: `1px solid ${FB.border}`,
                cursor: !canUseMicContext || isEncodingVoice || uploadProgress !== null ? "not-allowed" : "pointer",
                opacity: !canUseMicContext ? 0.45 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: FB.textPrimary,
              }}
            >
              <Mic size={18} />
            </button>
          )
        )}

        <button
          type="submit"
          data-testid="admin-chat-send-btn"
          disabled={!canSendAdmin}
          className="fb-btn-primary"
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: !canSendAdmin ? FB.border : FB.blue,
            border: "none",
            cursor: !canSendAdmin ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "white",
          }}
        >
          {uploadProgress !== null ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <SendHorizontal size={18} />}
        </button>
      </form>

      {showPicker && (
        <div style={{ marginTop: "8px", border: `1px solid ${FB.border}`, borderRadius: "12px", overflow: "hidden" }}>
          <EmojiStickerPicker
            packs={stickerPacks}
            initialTab={pickerTab}
            previewMode={systemSettings.stickerPreviewMode || "fullscreen_modal"}
            collageEnabled={isCollageEnabled}
            gifMode={systemSettings.stickerPickerGifMode || "live_viewport"}
            onSelectEmoji={(c) => {
              setPickerTab("emoji");
              setAdminMessage(adminMessage + c);
            }}
            onSendSticker={(pack, item) => {
              setPickerTab("sticker");
              return onSendSticker(pack, item);
            }}
            onStageStickerForTray={(pack, item, enterCollage) => {
              setPickerTab("sticker");
              setStagedDockedSticker((prev) =>
                draftSelectSticker(prev, pack, item, Boolean(enterCollage), isCollageEnabled)
              );
            }}
            onClose={() => setShowPicker(false)}
            showAdminShortcut={false}
          />
        </div>
      )}

      {isCameraModalOpen && (
        <CameraCaptureModal
          onCaptureFile={(file) => onAddFiles([file])}
          onFallbackFilePick={() => mediaInputRef.current?.click()}
          onClose={() => setIsCameraModalOpen(false)}
        />
      )}
    </div>
  );
}
