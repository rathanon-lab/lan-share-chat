"use client";

import React, { useMemo, useState } from 'react';
import {
  Check, CheckSquare, Download, Eye, File as FileIcon, FileArchive,
  Loader2, Music, Package, Play, Square, X
} from 'lucide-react';
import type { ChatAttachment } from '@/types/chat';
import {
  formatBytes,
  isAudioAttachment,
  isVideoAttachment,
  isVisualMediaAttachment,
} from '@/features/chat/lib/formatters';
import { getFilePreviewKind, isRichPreviewSupported, type PreviewableFile } from '@/lib/filePreviewer';
import {
  SecureImage,
  SecureVideo,
  downloadEncryptedMedia,
  downloadMediaZip,
  downloadMultipleEncryptedMedia,
} from '@/lib/secureMedia';

export interface AlbumGalleryModalProps {
  items: ChatAttachment[];
  initialFilter?: 'all' | 'media' | 'files';
  onClose: () => void;
  onOpenLightbox: (visualItems: ChatAttachment[], index: number) => void;
  onOpenPreviewFile: (file: PreviewableFile) => void;
}

export function AlbumGalleryModal({
  items,
  initialFilter = 'all',
  onClose,
  onOpenLightbox,
  onOpenPreviewFile,
}: AlbumGalleryModalProps) {
  const [filter, setFilter] = useState<'all' | 'media' | 'files'>(initialFilter);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set());
  const [isZipping, setIsZipping] = useState(false);
  const [multiProgress, setMultiProgress] = useState<{ done: number; total: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const visualEntries = useMemo(
    () => items.map((item, idx) => ({ item, idx })).filter((e) => isVisualMediaAttachment(e.item)),
    [items]
  );
  const fileEntries = useMemo(
    () => items.map((item, idx) => ({ item, idx })).filter((e) => !isVisualMediaAttachment(e.item)),
    [items]
  );
  const visualItemsOnly = useMemo(() => visualEntries.map((e) => e.item), [visualEntries]);

  const hasMixedCategories = visualEntries.length > 0 && fileEntries.length > 0;
  const visibleEntries = useMemo(() => {
    if (filter === 'media' && visualEntries.length > 0) return visualEntries;
    if (filter === 'files' && fileEntries.length > 0) return fileEntries;
    return items.map((item, idx) => ({ item, idx }));
  }, [filter, visualEntries, fileEntries, items]);

  const selectedVisible = useMemo(
    () => visibleEntries.filter((e) => selectedIndices.has(e.idx)),
    [visibleEntries, selectedIndices]
  );
  const targetEntries = selectedVisible.length > 0 ? selectedVisible : visibleEntries;
  const allVisibleSelected =
    visibleEntries.length > 0 && selectedVisible.length === visibleEntries.length;

  const toggleIndex = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleEntries.forEach((e) => next.delete(e.idx));
      } else {
        visibleEntries.forEach((e) => next.add(e.idx));
      }
      return next;
    });
  };

  const handleDownloadZip = async () => {
    if (targetEntries.length === 0 || isZipping) return;
    setActionError(null);
    setIsZipping(true);
    try {
      const tokens = targetEntries.map((e) => e.item.mediaToken).filter(Boolean);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      await downloadMediaZip(tokens, `lan-share-${tokens.length}files-${stamp}.zip`);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'สร้างไฟล์ ZIP ไม่สำเร็จ');
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadMultiple = async () => {
    if (targetEntries.length === 0 || multiProgress) return;
    setActionError(null);
    const list = targetEntries.map((e) => ({
      mediaToken: e.item.mediaToken,
      fileName: e.item.fileName,
    }));
    setMultiProgress({ done: 0, total: list.length });
    try {
      await downloadMultipleEncryptedMedia(list, undefined, (done, total) => {
        setMultiProgress({ done, total });
      });
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'ดาวน์โหลดบางไฟล์ไม่สำเร็จ');
    } finally {
      setMultiProgress(null);
    }
  };

  const handleCardPrimaryAction = (item: ChatAttachment) => {
    if (isVisualMediaAttachment(item)) {
      const vIdx = visualItemsOnly.findIndex((v) => v.mediaToken === item.mediaToken && v.fileName === item.fileName);
      onOpenLightbox(visualItemsOnly, vIdx >= 0 ? vIdx : 0);
      return;
    }
    if (isRichPreviewSupported(item.fileName, item.mimeType)) {
      onOpenPreviewFile({
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        mediaToken: item.mediaToken,
      });
      return;
    }
    downloadEncryptedMedia(item.mediaToken, item.fileName);
  };

  const totalBytes = targetEntries.reduce((acc, e) => acc + (Number(e.item.fileSize) || 0), 0);

  return (
    <div
      data-testid="album-gallery-modal"
      className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Fixed single-line subtitle to prevent vertical shift) */}
        <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2.5 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm sm:text-base text-gray-900 truncate">
              รายการไฟล์และสื่อทั้งหมด ({items.length} รายการ)
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {selectedVisible.length > 0
                ? `เลือกแล้ว ${selectedVisible.length}/${visibleEntries.length} (${formatBytes(totalBytes)})`
                : `แสดง ${visibleEntries.length} รายการ (${formatBytes(totalBytes)})`}
            </p>
          </div>
          <button
            type="button"
            data-testid="album-close-btn"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-200 text-gray-500 cursor-pointer shrink-0"
            aria-label="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar (Fixed grid tracks so card list NEVER jumps when toggling checkboxes) */}
        <div
          data-testid="album-toolbar"
          className="px-3.5 sm:px-4 py-2.5 border-b border-gray-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0"
        >
          <div className="flex flex-wrap items-center gap-1.5 min-h-[30px]">
            {hasMixedCategories && (
              <>
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                    filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ทั้งหมด ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('media')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                    filter === 'media' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  รูป/วิดีโอ ({visualEntries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('files')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                    filter === 'files' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  เสียง/เอกสาร ({fileEntries.length})
                </button>
              </>
            )}

            <button
              type="button"
              data-testid="album-select-all-btn"
              onClick={toggleSelectAll}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {allVisibleSelected ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
              {allVisibleSelected ? 'ล้างการเลือก' : 'เลือกทั้งหมด'}
            </button>

            <span className="text-[11px] font-medium text-gray-500 px-1 whitespace-nowrap">
              {selectedVisible.length > 0 ? `เลือก ${selectedVisible.length} ไฟล์` : 'ทั้งหมด'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              data-testid="album-download-zip-btn"
              disabled={targetEntries.length === 0 || isZipping}
              onClick={handleDownloadZip}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
              title="รวมเป็นไฟล์ .zip เดียวแบบสตรีมตรงจากเซิร์ฟเวอร์"
            >
              {isZipping ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Package size={14} className="shrink-0" />}
              <span className="truncate">โหลด .ZIP ({targetEntries.length})</span>
            </button>

            <button
              type="button"
              data-testid="album-download-multi-btn"
              disabled={targetEntries.length === 0 || Boolean(multiProgress)}
              onClick={handleDownloadMultiple}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
              title="ดาวน์โหลดแยกเป็นไฟล์เดี่ยวทีละไฟล์"
            >
              {multiProgress ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Download size={14} className="shrink-0" />}
              <span className="truncate">
                {multiProgress
                  ? `โหลด (${multiProgress.done}/${multiProgress.total})`
                  : `โหลดหลายไฟล์ (${targetEntries.length})`}
              </span>
            </button>
          </div>
        </div>

        {actionError && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {actionError}
          </div>
        )}

        {/* Grid Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gray-100/70">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {visibleEntries.map(({ item, idx }) => {
              const isChecked = selectedIndices.has(idx);
              const isVisual = isVisualMediaAttachment(item);
              const isVid = isVideoAttachment(item);
              const isAud = isAudioAttachment(item);
              const previewKind = getFilePreviewKind(item.fileName, item.mimeType);
              const canPreview = isVisual || isRichPreviewSupported(item.fileName, item.mimeType);

              return (
                <div
                  key={`${idx}-${item.mediaToken}`}
                  data-testid={`album-card-${idx}`}
                  className={`relative rounded-xl bg-white border transition-all overflow-hidden flex flex-col shadow-sm ${
                    isChecked ? 'border-blue-600 ring-2 ring-blue-500/30' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Top-left selection checkbox */}
                  <button
                    type="button"
                    data-testid={`album-item-checkbox-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleIndex(idx);
                    }}
                    className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md border flex items-center justify-center transition-colors cursor-pointer shadow ${
                      isChecked
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white/90 border-gray-300 text-transparent hover:border-blue-500'
                    }`}
                    aria-label={`เลือก ${item.fileName}`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </button>

                  {/* Top-right single download button */}
                  <button
                    type="button"
                    data-testid={`album-item-download-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadEncryptedMedia(item.mediaToken, item.fileName);
                    }}
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-lg bg-black/55 hover:bg-black/75 text-white flex items-center justify-center cursor-pointer shadow"
                    title="ดาวน์โหลดไฟล์นี้"
                  >
                    <Download size={13} />
                  </button>

                  {/* Thumbnail / Icon Area */}
                  <div
                    onClick={() => handleCardPrimaryAction(item)}
                    className="relative aspect-square w-full bg-gray-900/5 flex items-center justify-center overflow-hidden cursor-pointer group"
                  >
                    {isVisual && !isVid && (
                      <SecureImage
                        token={item.mediaToken}
                        thumbnail
                        alt={item.fileName}
                        fileName={item.fileName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    )}
                    {isVid && (
                      <div className="relative w-full h-full bg-black flex items-center justify-center">
                        <SecureVideo
                          token={item.mediaToken}
                          controls={false}
                          muted
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-black/65 text-white flex items-center justify-center shadow">
                            <Play size={18} fill="white" className="ml-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
                          VIDEO
                        </span>
                      </div>
                    )}
                    {!isVisual && (
                      <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                            isAud
                              ? 'bg-violet-100 text-violet-600'
                              : previewKind === 'zip'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-600'
                          }`}
                        >
                          {isAud ? (
                            <Music size={22} />
                          ) : previewKind === 'zip' ? (
                            <FileArchive size={22} />
                          ) : (
                            <FileIcon size={22} />
                          )}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          {canPreview ? (
                            <>
                              <Eye size={11} /> พรีวิวได้
                            </>
                          ) : (
                            'ดาวน์โหลดเท่านั้น'
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Footer Metadata */}
                  <div className="p-2 bg-white border-t border-gray-100 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate" title={item.fileName}>
                      {item.fileName}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-between">
                      <span>{formatBytes(item.fileSize)}</span>
                      <span className="text-gray-400">#{idx + 1}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
