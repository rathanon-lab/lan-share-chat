"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, History, LayoutGrid, Maximize2, RotateCw, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ChatAttachment } from "@/types/chat";
import { formatBytes, isVideoAttachment } from "@/features/chat/lib/formatters";
import { SecureImage, downloadEncryptedMedia, isMediaTokenGone } from "@/lib/secureMedia";
import { CustomVideoPlayer } from "@/features/chat/components/CustomVideoPlayer";
import { ZoomableMediaStage } from "@/components/ZoomableMediaStage";

export interface EditHistoryModalState {
  sender: string;
  currentText: string;
  edits: { id: number; previousText: string; newText: string; editedBy: string; editedAt: number }[];
}

export interface ConfirmDeleteModalState {
  msgId: number;
  mode: 'self' | 'request_admin';
  textPreview: string;
  fileCount: number;
  fileNames: string[];
  isSubmitting?: boolean;
}

export function LightboxModal({
  lightbox,
  setLightbox,
  onOpenGrid,
  onClose,
}: {
  lightbox: { items: ChatAttachment[]; index: number };
  setLightbox: React.Dispatch<React.SetStateAction<{ items: ChatAttachment[]; index: number } | null>>;
  onOpenGrid?: () => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const activeItem = lightbox.items[lightbox.index];
  const activeToken = activeItem?.mediaToken || "";
  const isCurrentVideo = isVideoAttachment(activeItem);
  const [rotationState, setRotationState] = useState<{ token: string; deg: 0 | 90 | 180 | 270 }>({
    token: activeToken,
    deg: 0,
  });
  const imageRotation = rotationState.token === activeToken ? rotationState.deg : 0;
  const isQuarterTurn = imageRotation === 90 || imageRotation === 270;

  const rotateImage = useCallback(() => {
    setRotationState((prev) => {
      const cur = prev.token === activeToken ? prev.deg : 0;
      const next = (((cur + 90) % 360) as 0 | 90 | 180 | 270);
      return { token: activeToken, deg: next };
    });
  }, [activeToken]);

  useEffect(() => {
    if (isCurrentVideo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotateImage();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCurrentVideo, rotateImage]);

  return (
    <div
      data-testid="lightbox-modal"
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-[80] flex flex-col items-center justify-between p-4 select-none overflow-hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl flex items-center justify-between text-white py-2 px-3 sm:px-4 bg-white/10 rounded-2xl gap-2 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
          <span className="text-[11px] sm:text-xs font-bold bg-blue-600 px-2 sm:px-2.5 py-1 rounded-full shrink-0">
            {lightbox.index + 1} / {lightbox.items.length}
          </span>
          <span className="text-xs sm:text-sm font-medium truncate">
            {lightbox.items[lightbox.index]?.fileName}
          </span>
          <span className="hidden sm:inline text-xs text-gray-300 shrink-0">
            ({formatBytes(lightbox.items[lightbox.index]?.fileSize)})
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {lightbox.items.length > 1 && onOpenGrid && (
            <button
              type="button"
              data-testid="lightbox-open-grid-btn"
              onClick={onOpenGrid}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-colors cursor-pointer"
              title="ดูอัลบั้มแบบตาราง / เลือกดาวน์โหลดหลายไฟล์"
            >
              <LayoutGrid size={15} />
              <span className="hidden sm:inline">อัลบั้มทั้งหมด</span>
              <span className="sm:hidden">อัลบั้ม</span>
            </button>
          )}
          {!(activeItem?.isDeleted || isMediaTokenGone(activeToken)) && (
            <button
              type="button"
              onClick={() => {
                const current = lightbox.items[lightbox.index];
                if (current?.mediaToken) {
                  downloadEncryptedMedia(current.mediaToken, current.fileName);
                }
              }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-colors cursor-pointer"
            >
              <Download size={15} />
              <span className="hidden sm:inline">ดาวน์โหลด</span>
            </button>
          )}
          <button
            type="button"
            data-testid="lightbox-close-btn"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="ปิดหน้าต่างแสดงผล"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {!isCurrentVideo && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed top-20 right-4 z-30 flex flex-col items-center gap-1 bg-slate-900/75 border border-white/15 rounded-2xl p-1.5 backdrop-blur-md shadow-xl"
        >
          <button
            type="button"
            data-testid="lightbox-zoom-in"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
            disabled={zoom >= 3}
            title="ขยายใหญ่ขึ้น (+)"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 text-white flex items-center justify-center cursor-pointer transition"
          >
            <ZoomIn size={18} />
          </button>
          <button
            type="button"
            data-testid="lightbox-zoom-reset"
            onClick={() => setZoom(1)}
            title="รีเซ็ตขนาด 100%"
            className="w-9 py-1 rounded-lg text-[10px] font-bold text-slate-200 hover:bg-white/10 cursor-pointer transition"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            data-testid="lightbox-zoom-out"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.25).toFixed(2))))}
            disabled={zoom <= 0.6}
            title="ย่อขนาดลง (-)"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 text-white flex items-center justify-center cursor-pointer transition"
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => (z > 1.25 ? 1 : 2))}
            title="สลับซูม 2x / ปกติ"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition"
          >
            <Maximize2 size={15} />
          </button>
          <div className="w-6 h-px bg-white/15 my-0.5" />
          <button
            type="button"
            data-testid="lightbox-rotate-btn"
            onClick={rotateImage}
            title="หมุนภาพ 90° (ปุ่ม R)"
            className={`w-9 min-h-[36px] py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition ${
              imageRotation !== 0
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
          >
            <RotateCw size={16} />
            {imageRotation !== 0 && (
              <span className="text-[9px] font-bold leading-none">{imageRotation}°</span>
            )}
          </button>
        </div>
      )}

      <div className="flex-1 w-full flex items-center justify-center relative my-2 sm:my-4 overflow-hidden">
        {lightbox.items.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom(1);
              setLightbox((prev) =>
                prev ? { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length } : null
              );
            }}
            className="absolute left-1.5 md:left-6 z-20 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {isCurrentVideo ? (
          <div
            className="w-full max-w-4xl max-h-[78dvh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <CustomVideoPlayer
              key={activeItem.mediaToken}
              token={activeItem.mediaToken}
              autoPlay
            />
          </div>
        ) : (
          <ZoomableMediaStage
            key={activeItem.mediaToken}
            zoom={zoom}
            onZoomChange={setZoom}
            rotation={imageRotation}
            contentTestId="lightbox-image-stage"
            onBackgroundClick={onClose}
            className="w-full h-full"
          >
            <SecureImage
              token={activeItem.mediaToken}
              alt={activeItem.fileName}
              className={`${
                isQuarterTurn ? "max-w-[72dvh] max-h-[82vw]" : "max-h-[80dvh] max-w-full"
              } object-contain rounded-xl shadow-2xl pointer-events-none`}
            />
          </ZoomableMediaStage>
        )}

        {lightbox.items.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoom(1);
              setLightbox((prev) =>
                prev ? { ...prev, index: (prev.index + 1) % prev.items.length } : null
              );
            }}
            className="absolute right-1.5 md:right-6 z-20 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
}

export function EditHistoryModal({
  modal,
  onClose,
}: {
  modal: EditHistoryModalState;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="edit-history-modal"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[82vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2 font-bold text-sm text-gray-800">
            <History size={16} className="text-amber-600" />
            ประวัติการแก้ไขข้อความ — {modal.sender}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 text-gray-500 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3 text-sm">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
            <div className="text-[11px] font-bold text-blue-700 mb-1">ข้อความล่าสุดในปัจจุบัน</div>
            <div className="text-gray-900 whitespace-pre-wrap break-words">{modal.currentText}</div>
          </div>
          {modal.edits.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">ไม่พบรายการย้อนหลัง</p>
          ) : (
            modal.edits
              .slice()
              .reverse()
              .map((ed, idx) => (
                <div key={ed.id || idx} className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-[11px] text-gray-500 mb-1 flex justify-between">
                    <span>ก่อนแก้ไข (#{modal.edits.length - idx})</span>
                    <span>{new Date(ed.editedAt).toLocaleString('th-TH')}</span>
                  </div>
                  <div className="text-gray-700 whitespace-pre-wrap break-words line-through decoration-red-400/70">
                    {ed.previousText}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfirmDeleteModal({
  modal,
  editWindowMinutes,
  onClose,
  onConfirm,
}: {
  modal: ConfirmDeleteModalState;
  editWindowMinutes: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !modal.isSubmitting && onClose()}
      data-testid="confirm-delete-modal"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-red-50/70">
          <div className="flex items-center gap-2.5 font-bold text-sm text-red-700">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <Trash2 size={16} className="text-red-600" />
            </div>
            <span>
              {modal.mode === 'self'
                ? 'คุณต้องการลบข้อความนี้จริง ๆ เหรอ?'
                : 'ต้องการส่งคำขอลบถึง Admin จริง ๆ เหรอ?'}
            </span>
          </div>
          <button
            type="button"
            disabled={modal.isSubmitting}
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-red-100/70 text-gray-500 disabled:opacity-40 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm">
          <p className="text-gray-600 text-xs leading-relaxed">
            {modal.mode === 'self'
              ? 'หากยืนยันการลบ รายการนี้และไฟล์ที่เกี่ยวข้องจะถูกนำออกจากห้องแชทและไม่สามารถกู้คืนได้'
              : `เลยกำหนดลบเองภายใน ${editWindowMinutes} นาทีแล้ว ระบบจะส่งคำขอให้ Admin ตรวจสอบและอนุมัติการลบรายการนี้`}
          </p>

          <div
            data-testid="confirm-delete-file-summary"
            className={`p-3 rounded-xl border text-xs ${
              modal.fileCount > 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle
                size={14}
                className={modal.fileCount > 0 ? 'text-amber-600 shrink-0' : 'text-gray-400 shrink-0'}
              />
              <span>
                {modal.fileCount > 0
                  ? `จะลบไฟล์แนบทั้งหมดจำนวน ${modal.fileCount} ไฟล์`
                  : 'ไม่มีไฟล์แนบ (0 ไฟล์)'}
              </span>
            </div>
            {modal.fileNames.length > 0 && (
              <ul className="mt-2 space-y-1 pl-5 list-disc text-[11px] text-amber-800/90 max-h-24 overflow-y-auto">
                {modal.fileNames.slice(0, 5).map((fname, idx) => (
                  <li key={idx} className="truncate">{fname}</li>
                ))}
                {modal.fileNames.length > 5 && (
                  <li className="list-none font-semibold">
                    ...และอีก {modal.fileNames.length - 5} ไฟล์
                  </li>
                )}
              </ul>
            )}
          </div>

          {modal.textPreview && (
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs">
              <div className="text-[11px] font-semibold text-gray-500 mb-1">ตัวอย่างข้อความที่จะลบ</div>
              <div className="text-gray-800 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                {modal.textPreview}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={modal.isSubmitting}
            onClick={onClose}
            data-testid="confirm-delete-cancel"
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={modal.isSubmitting}
            onClick={onConfirm}
            data-testid="confirm-delete-submit"
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer ${
              modal.mode === 'self'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {modal.isSubmitting
              ? 'กำลังดำเนินการ...'
              : modal.mode === 'self'
                ? `ยืนยันลบ${modal.fileCount > 0 ? ` (${modal.fileCount} ไฟล์)` : ''}`
                : 'ยืนยันส่งคำขอลบ'}
          </button>
        </div>
      </div>
    </div>
  );
}
