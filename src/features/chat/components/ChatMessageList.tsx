"use client";

import React from "react";
import {
  Bell, Check, CheckCheck, Download, Edit2, Eye, File as FileIcon, FileX,
  History, ImageOff, Play, Shield, Trash2, VideoOff
} from "lucide-react";
import type { ChatAttachment, ChatMessage, SystemSettings } from "@/types/chat";
import type { PreviewableFile } from "@/lib/filePreviewer";
import type { EditHistoryModalState } from "@/features/chat/components/ChatModals";
import {
  formatBytes,
  isAudioAttachment,
  isVideoAttachment,
  isVisualMediaAttachment,
  normalizeAttachments,
} from "@/features/chat/lib/formatters";
import { AudioAttachmentCard } from "@/features/chat/components/AudioAttachmentCard";
import { TruncatedFileName } from "@/features/chat/components/TruncatedFileName";
import { UserAvatar } from "@/components/UserAvatar";
import { StickerZoomModal } from "@/features/stickers/components/StickerPreviewModals";
import { StickerVisual } from "@/features/stickers/components/StickerVisual";
import { UnifiedEmojiText } from "@/features/stickers/components/UnifiedEmojiText";
import { resolveFallbackAvatarForName } from "@/lib/avatars";
import { formatDeviceBadge } from "@/lib/deviceMeta";
import { SecureImage, SecureVideo, downloadEncryptedMedia } from "@/lib/secureMedia";
import { isRichPreviewSupported } from "@/lib/filePreviewer";

interface ChatMessageListProps {
  messages: ChatMessage[];
  identityDeviceId: string;
  identityName?: string;
  systemSettings: SystemSettings;
  isDark?: boolean;
  isWithinWindow: (msg: ChatMessage) => boolean;
  editingMsgId: number | null;
  editingText: string;
  setEditingMsgId: (id: number | null) => void;
  setEditingText: (val: string) => void;
  onSaveEdit: (msgId: number) => void;
  onOpenDeleteConfirm: (msg: ChatMessage, attachments: ChatAttachment[], mode: 'self' | 'request_admin') => void;
  onOpenLightbox: (items: ChatAttachment[], index: number) => void;
  onOpenAlbumModal: (items: ChatAttachment[], initialFilter?: 'all' | 'media' | 'files') => void;
  onOpenPreviewFile: (file: PreviewableFile) => void;
  onOpenEditHistory: (modal: EditHistoryModalState) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessageList({
  messages,
  identityDeviceId,
  identityName,
  systemSettings,
  isDark = false,
  isWithinWindow,
  editingMsgId,
  editingText,
  setEditingMsgId,
  setEditingText,
  onSaveEdit,
  onOpenDeleteConfirm,
  onOpenLightbox,
  onOpenAlbumModal,
  onOpenPreviewFile,
  onOpenEditHistory,
  messagesEndRef,
}: ChatMessageListProps) {
  const [zoomedSticker, setZoomedSticker] = React.useState<ChatMessage['stickerMeta']>(null);

  return (
    <div className="flex-1 min-h-0 px-2.5 py-3 md:px-4 md:py-4 overflow-y-auto overflow-x-hidden flex flex-col">
      <div className="w-full max-w-5xl flex flex-col gap-3.5">
        <div className="text-center my-4">
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full ${
              isDark ? 'text-slate-400 bg-slate-800 border border-slate-700' : 'text-gray-400 bg-gray-100'
            }`}
          >
            Today
          </span>
        </div>

        {messages.map((msg, i) => {
          const isMe = Boolean(
            (msg.senderDeviceId && identityDeviceId && msg.senderDeviceId === identityDeviceId) ||
              (!msg.senderDeviceId && identityName && msg.sender === identityName)
          );
          const isAdmin = Boolean(msg.isAdmin);
          const senderStatus = isAdmin ? 'active' : msg.senderStatus || 'active';
          const isBannedSender = !isAdmin && (senderStatus === 'banned' || senderStatus === 'ip_banned');
          const isDeletedSender = !isAdmin && senderStatus === 'deleted';
          const msgAvatarSrc = isAdmin
            ? msg.senderAvatarUrl || systemSettings.adminAvatarUrl
            : isDeletedSender
              ? undefined
              : msg.senderAvatarUrl || resolveFallbackAvatarForName(msg.sender || 'Peer');
          const senderOsBadge = !isAdmin && !isDeletedSender ? formatDeviceBadge(msg.senderOs) : null;

        // Soft-deleted tombstone
        if (msg.isDeleted) {
          return (
            <div
              key={msg.id || i}
              className={`flex items-start gap-2 max-w-[92%] md:max-w-[78%] min-w-0 ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`}
            >
              {!isMe && (
                <UserAvatar
                  src={msgAvatarSrc}
                  name={msg.sender}
                  size={34}
                  isAdmin={isAdmin}
                  adminRingColor={systemSettings.adminRingColor}
                  status={senderStatus}
                  className="mt-0.5 opacity-60"
                />
              )}
              <div className={`flex flex-col min-w-0 max-w-full ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className={`text-xs ml-0.5 mb-1 font-semibold flex items-center gap-1.5 flex-wrap ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    <span>{msg.sender}</span>
                    {senderOsBadge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${
                          isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                      >
                        {senderOsBadge}
                      </span>
                    )}
                    {isBannedSender && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-50 text-red-600 border border-red-200 font-bold">
                        🚫 ถูกแบน
                      </span>
                    )}
                    {isDeletedSender && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200 font-semibold">
                        ถูกลบออกจากระบบ
                      </span>
                    )}
                  </span>
                )}
                <div
                  data-testid={`soft-deleted-msg-${msg.id}`}
                  className={`px-4 py-2 rounded-2xl border border-dashed text-xs italic flex items-center gap-1.5 max-w-full [overflow-wrap:anywhere] ${
                    isDark ? 'border-slate-700 bg-slate-800/70 text-slate-400' : 'border-gray-300 bg-gray-100/80 text-gray-500'
                  }`}
                >
                  <Trash2 size={12} className="shrink-0" /> ข้อความนี้ถูกลบโดย {msg.deletedBy || msg.sender}
                </div>
                <div className={`text-[11px] mt-0.5 px-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{msg.time}</div>
              </div>
            </div>
          );
        }

        const attachments = normalizeAttachments(msg);
        const mediaItems = attachments.filter(isVisualMediaAttachment);
        const audioItems = attachments.filter((a) => !isVisualMediaAttachment(a) && isAudioAttachment(a));
        const docItems = attachments.filter((a) => !isVisualMediaAttachment(a) && !isAudioAttachment(a));

        const canUserManage = isMe && !isAdmin && Boolean(msg.id);
        const editableNow = canUserManage && msg.type === 'text' && Boolean(msg.text) && isWithinWindow(msg);
        const deletableNow =
          canUserManage &&
          (systemSettings.deletePolicy === 'self_always' ||
            (systemSettings.deletePolicy === 'hybrid_15m' && isWithinWindow(msg)));

        // Borderless Shared Sticker Message
        const isStickerMsg = msg.type === 'sticker' && Boolean(msg.stickerMeta?.url);

        return (
          <div
            key={msg.id || i}
            data-testid={`chat-msg-${msg.id || i}`}
            className={`flex items-start gap-2 max-w-[92%] md:max-w-[78%] min-w-0 ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`}
          >
            {!isMe && (
              <UserAvatar
                src={msgAvatarSrc}
                name={msg.sender}
                size={36}
                isAdmin={isAdmin}
                adminRingColor={systemSettings.adminRingColor}
                status={senderStatus}
                className="mt-0.5"
              />
            )}

            <div className={`flex flex-col min-w-0 max-w-full ${isMe ? 'items-end' : 'items-start'}`}>
              {!isMe && (
                <span
                  className="text-xs ml-0.5 mb-1 font-semibold flex items-center gap-1.5 flex-wrap"
                  style={{
                    color: isAdmin
                      ? isDark
                        ? '#c4b5fd'
                        : '#7c3aed'
                      : isDeletedSender
                        ? isDark
                          ? '#94a3b8'
                          : '#64748b'
                        : isDark
                          ? '#cbd5e1'
                          : '#6b7280',
                  }}
                >
                  {isAdmin && <Shield size={11} style={{ color: systemSettings.adminRingColor || '#7c3aed' }} />}
                  <span>{msg.sender}</span>
                  {senderOsBadge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${
                        isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {senderOsBadge}
                    </span>
                  )}
                  {isBannedSender && (
                    <span
                      data-testid={`sender-banned-badge-${msg.id}`}
                      className={`text-[10px] px-1.5 py-0.2 rounded border font-bold ${
                        isDark ? 'bg-red-950/70 text-red-300 border-red-800' : 'bg-red-50 text-red-600 border-red-200'
                      }`}
                    >
                      🚫 ถูกแบน
                    </span>
                  )}
                  {isDeletedSender && (
                    <span
                      data-testid={`sender-deleted-badge-${msg.id}`}
                      className={`text-[10px] px-1.5 py-0.2 rounded border font-semibold ${
                        isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      ถูกลบออกจากระบบ
                    </span>
                  )}
                  {isAdmin && (
                    <span
                      style={{
                        background: systemSettings.adminRingColor || '#ef4444',
                        color: 'white',
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        letterSpacing: '0.5px',
                      }}
                    >
                      ADMIN
                    </span>
                  )}
                </span>
              )}

              {isStickerMsg && msg.stickerMeta ? (
                <div
                  data-testid={`sticker-bubble-${msg.id}`}
                  onClick={() => setZoomedSticker(msg.stickerMeta || null)}
                  onContextMenu={(e) => e.preventDefault()}
                  title="คลิกเพื่อดูสติกเกอร์ขนาดใหญ่"
                  className="relative group p-1 select-none cursor-pointer hover:scale-105 transition-transform"
                >
                  <StickerVisual meta={msg.stickerMeta} variant="bubble" />
                </div>
              ) : (
                <div
                  className={`max-w-full rounded-2xl shadow-sm relative group overflow-hidden ${
                    isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'
                  }`}
                  style={{
                    background: isAdmin
                      ? isMe
                        ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                        : isDark
                          ? 'linear-gradient(135deg, #2e1065, #1e1b4b)'
                          : 'linear-gradient(135deg, #f5f3ff, #ede9fe)'
                      : isMe
                        ? '#2563eb'
                        : isDark
                          ? '#1e293b'
                          : '#ffffff',
                    color: isAdmin
                      ? isMe
                        ? 'white'
                        : isDark
                          ? '#ede9fe'
                          : '#3730a3'
                      : isMe
                        ? 'white'
                        : isDark
                          ? '#f1f5f9'
                          : '#1f2937',
                    border:
                      isAdmin && !isMe
                        ? isDark
                          ? '1px solid #6d28d9'
                          : '1px solid #c4b5fd'
                        : isMe
                          ? 'none'
                          : isDark
                            ? '1px solid #334155'
                            : '1px solid #e5e7eb',
                  }}
                >
                  {/* Multi-Media Album Grid */}
                  {mediaItems.length > 0 && (() => {
                    const activeMediaItems = mediaItems.filter((m) => !m.isDeleted);
                    const deletedMediaCount = mediaItems.length - activeMediaItems.length;
                    return (
                    <div className="p-1.5" style={{ width: mediaItems.length === 1 ? '290px' : '320px', maxWidth: '100%' }}>
                      <div
                        className={`grid gap-1.5 overflow-hidden rounded-xl ${
                          mediaItems.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                        }`}
                      >
                        {mediaItems.slice(0, 4).map((item, idx) => {
                          const isVid = isVideoAttachment(item);
                          const isItemDeleted = Boolean(item.isDeleted);
                          const isThreeFirst = mediaItems.length === 3 && idx === 0;
                          const extraCount = mediaItems.length - 4;
                          const showOverlay = idx === 3 && extraCount > 0;
                          const activeIdx = isItemDeleted
                            ? -1
                            : activeMediaItems.findIndex((a) => a === item || (a.mediaToken && a.mediaToken === item.mediaToken));

                          return (
                            <div
                              key={idx}
                              data-testid={
                                isItemDeleted
                                  ? `chat-media-deleted-tile-${msg.id}-${idx}`
                                  : isVid
                                    ? `chat-video-tile-${msg.id}-${idx}`
                                    : `chat-image-tile-${msg.id}-${idx}`
                              }
                              onClick={() => {
                                if (showOverlay) {
                                  onOpenAlbumModal(attachments, 'all');
                                  return;
                                }
                                if (isItemDeleted || activeMediaItems.length === 0) return;
                                onOpenLightbox(activeMediaItems, activeIdx >= 0 ? activeIdx : 0);
                              }}
                              className={`relative overflow-hidden rounded-lg bg-black/10 group/tile ${
                                isItemDeleted && !showOverlay ? 'cursor-default' : 'cursor-pointer'
                              } ${
                                isThreeFirst ? 'col-span-2 aspect-[16/9]' : mediaItems.length === 1 ? '' : 'aspect-square'
                              }`}
                            >
                              {isItemDeleted ? (
                                <div
                                  className={`w-full h-full flex flex-col items-center justify-center gap-1.5 p-3 text-center select-none ${
                                    isDark ? 'bg-slate-800/80 text-slate-400' : 'bg-slate-100 text-slate-500'
                                  }`}
                                  style={{ minHeight: mediaItems.length === 1 ? '140px' : '120px' }}
                                >
                                  {isVid ? (
                                    <VideoOff size={22} className="opacity-70 shrink-0" />
                                  ) : (
                                    <ImageOff size={22} className="opacity-70 shrink-0" />
                                  )}
                                  <span className="text-[11px] font-medium leading-tight">
                                    {isVid ? 'วิดีโอนี้ถูกลบแล้ว' : 'รูปภาพนี้ถูกลบแล้ว'}
                                  </span>
                                </div>
                              ) : !isVid ? (
                                <SecureImage
                                  token={item.mediaToken}
                                  thumbnail
                                  alt={item.fileName}
                                  fileName={item.fileName}
                                  className="w-full h-full object-cover transition-transform duration-200 group-hover/tile:scale-105"
                                  style={{
                                    maxHeight: mediaItems.length === 1 ? '240px' : '150px',
                                    width: '100%',
                                    display: 'block',
                                  }}
                                />
                              ) : (
                                <div
                                  className="relative w-full h-full bg-black flex items-center justify-center"
                                  style={{ minHeight: mediaItems.length === 1 ? '180px' : '140px' }}
                                >
                                  <SecureVideo
                                    token={item.mediaToken}
                                    controls={false}
                                    muted
                                    className="w-full h-full object-cover transition-transform duration-200 group-hover/tile:scale-105"
                                    style={{ maxHeight: mediaItems.length === 1 ? '260px' : '150px' }}
                                  />
                                  <div className="absolute inset-0 bg-black/25 group-hover/tile:bg-black/35 transition-colors flex items-center justify-center pointer-events-none">
                                    <div className={`${mediaItems.length === 1 ? 'w-12 h-12' : 'w-10 h-10'} rounded-full bg-black/65 text-white flex items-center justify-center shadow-lg`}>
                                      <Play size={mediaItems.length === 1 ? 22 : 18} fill="white" className="ml-0.5" />
                                    </div>
                                  </div>
                                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-bold tracking-wide pointer-events-none">
                                    VIDEO
                                  </span>
                                </div>
                              )}
                              {showOverlay && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-xl">
                                  +{extraCount}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {mediaItems.length === 1 && mediaItems[0].fileName && !mediaItems[0].isDeleted && (
                        <TruncatedFileName fileName={mediaItems[0].fileName} className="px-1 py-0.5" />
                      )}
                      {mediaItems.length > 1 && (
                        <div className="flex items-center justify-between px-1.5 pt-1 text-[11px] opacity-80 gap-2">
                          <span data-testid={`msg-album-summary-${msg.id}`} className="truncate">
                            {deletedMediaCount > 0
                              ? `อัลบั้มสื่อ (${activeMediaItems.length}/${mediaItems.length} รายการ · ถูกลบ ${deletedMediaCount})`
                              : `อัลบั้มสื่อ (${mediaItems.length} รายการ)`}
                          </span>
                          <button
                            type="button"
                            data-testid={`msg-album-view-all-${msg.id}`}
                            onClick={() => onOpenAlbumModal(attachments, 'all')}
                            className="underline hover:opacity-100 font-semibold cursor-pointer shrink-0"
                          >
                            ดูทั้งหมด
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* Voice & Audio Cards */}
                  {audioItems.length > 0 && (
                    <div className="flex flex-col gap-1.5 p-2" style={{ width: '295px', maxWidth: '100%' }}>
                      {audioItems.map((aud, idx) => (
                        <AudioAttachmentCard key={idx} aud={aud} />
                      ))}
                    </div>
                  )}

                  {/* Document Cards + Rich File Preview (Collapsed after first 2 docs) */}
                  {docItems.length > 0 && (
                    <div
                      className="flex flex-col gap-1.5 p-2.5"
                      style={{
                        borderTop: mediaItems.length > 0 ? '1px solid rgba(255,255,255,0.18)' : 'none',
                        width: '280px',
                        maxWidth: '100%',
                      }}
                    >
                      {docItems.slice(0, 2).map((doc, idx) => {
                        if (doc.isDeleted) {
                          return (
                            <div
                              key={idx}
                              data-testid={`chat-doc-deleted-${msg.id}-${idx}`}
                              className="flex items-center gap-2.5 rounded-xl bg-black/10 p-2.5 opacity-75 select-none"
                            >
                              <div className="p-2 rounded-lg bg-white/15 shrink-0">
                                <FileX size={18} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate line-through opacity-80">{doc.fileName}</p>
                                <p className="text-[11px] opacity-75">ไฟล์นี้ถูกลบแล้ว</p>
                              </div>
                            </div>
                          );
                        }
                        const previewable = isRichPreviewSupported(doc.fileName, doc.mimeType);
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2 rounded-xl bg-black/10 p-2.5 hover:bg-black/15 transition-colors group/doc"
                          >
                            <div
                              onClick={() =>
                                previewable
                                  ? onOpenPreviewFile({
                                      fileName: doc.fileName,
                                      fileSize: doc.fileSize,
                                      mimeType: doc.mimeType,
                                      mediaToken: doc.mediaToken,
                                    })
                                  : downloadEncryptedMedia(doc.mediaToken, doc.fileName)
                              }
                              className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                            >
                              <div className="p-2 rounded-lg bg-white/20 shrink-0">
                                <FileIcon size={18} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate group-hover/doc:underline">{doc.fileName}</p>
                                <p className="text-[11px] opacity-75">
                                  {formatBytes(doc.fileSize)} · {previewable ? 'คลิกเพื่อพรีวิว' : 'คลิกเพื่อดาวน์โหลด'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {previewable && (
                                <button
                                  type="button"
                                  data-testid={`preview-btn-${doc.fileName}`}
                                  onClick={() =>
                                    onOpenPreviewFile({
                                      fileName: doc.fileName,
                                      fileSize: doc.fileSize,
                                      mimeType: doc.mimeType,
                                      mediaToken: doc.mediaToken,
                                    })
                                  }
                                  className="p-1.5 rounded-lg bg-white/15 hover:bg-white/30 transition-colors cursor-pointer"
                                  title="พรีวิวไฟล์"
                                >
                                  <Eye size={14} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => downloadEncryptedMedia(doc.mediaToken, doc.fileName)}
                                className="p-1.5 rounded-lg bg-white/15 hover:bg-white/30 transition-colors cursor-pointer"
                                title="ดาวน์โหลด"
                              >
                                <Download size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {docItems.length > 2 && (
                        <div className="flex items-center justify-between gap-2 rounded-xl bg-black/15 px-3 py-2 text-[11px]">
                          <span className="font-medium opacity-90">
                            ไฟล์ทั้งหมด {docItems.length} รายการ (ซ่อนอยู่ {docItems.length - 2} ไฟล์)
                          </span>
                          <button
                            type="button"
                            data-testid={`msg-docs-view-all-${msg.id}`}
                            onClick={() => onOpenAlbumModal(attachments, 'files')}
                            className="font-bold underline shrink-0 hover:opacity-85 cursor-pointer"
                          >
                            ดูทั้งหมด
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inline Edit Form OR Unified Twemoji + @mention Text */}
                  {editingMsgId === msg.id ? (
                    <div className="p-2.5 flex flex-col gap-2 min-w-[220px] sm:min-w-[260px]">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg p-2 text-sm text-gray-900 bg-white border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        autoFocus
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsgId(null);
                            setEditingText('');
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded bg-black/20 hover:bg-black/30 cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={() => onSaveEdit(msg.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded bg-white text-blue-700 hover:bg-blue-50 cursor-pointer"
                        >
                          บันทึก
                        </button>
                      </div>
                    </div>
                  ) : (
                    msg.text && (
                      <p
                        className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] break-words"
                        style={{ padding: attachments.length > 0 ? '6px 14px 12px' : '12px 14px' }}
                      >
                        <UnifiedEmojiText text={msg.text} isMe={isMe} />
                      </p>
                    )
                  )}
                </div>
              )}

              {/* Timestamp + Edit/Delete Action Footer */}
              <div className={`flex flex-wrap items-center gap-1.5 mt-1 mr-1 text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                <span>{msg.time}</span>
                {((msg.editCount ?? 0) > 0 || msg.editedAt) && (
                  <button
                    type="button"
                    onClick={async () => {
                      let edits = Array.isArray(msg.editHistory) ? msg.editHistory : [];
                      if (edits.length === 0 && msg.id) {
                        const r = await fetch(`/api/messages/${msg.id}/history`).then((x) => x.json()).catch(() => null);
                        if (r?.history) edits = r.history;
                      }
                      onOpenEditHistory({ sender: msg.sender, currentText: msg.text, edits });
                    }}
                    className={`inline-flex items-center gap-0.5 hover:underline font-semibold cursor-pointer ${
                      isDark ? 'text-amber-400' : 'text-amber-600'
                    }`}
                    data-testid={`edit-history-btn-${msg.id}`}
                  >
                    <History size={11} /> แก้ไขแล้ว ({msg.editCount || msg.editHistory?.length || 1})
                  </button>
                )}
                {editableNow && editingMsgId !== msg.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMsgId(msg.id);
                      setEditingText(msg.text || '');
                    }}
                    className={`inline-flex items-center gap-0.5 cursor-pointer ${isDark ? 'hover:text-blue-400' : 'hover:text-blue-600'}`}
                    title={`แก้ไขข้อความได้ภายใน ${systemSettings.editWindowMinutes} นาที`}
                    data-testid={`edit-msg-btn-${msg.id}`}
                  >
                    <Edit2 size={11} /> แก้ไข
                  </button>
                )}
                {canUserManage &&
                  (deletableNow ? (
                    <button
                      type="button"
                      onClick={() => onOpenDeleteConfirm(msg, attachments, 'self')}
                      className={`inline-flex items-center gap-0.5 cursor-pointer ${isDark ? 'hover:text-red-400' : 'hover:text-red-600'}`}
                      title="ลบข้อความของตนเอง"
                      data-testid={`delete-msg-btn-${msg.id}`}
                    >
                      <Trash2 size={11} /> ลบ
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenDeleteConfirm(msg, attachments, 'request_admin')}
                      className={`inline-flex items-center gap-0.5 cursor-pointer ${isDark ? 'hover:text-amber-400' : 'hover:text-amber-600'}`}
                      title="แจ้ง Admin ขอลบข้อความ"
                      data-testid={`req-delete-btn-${msg.id}`}
                    >
                      <Bell size={11} /> ขอลบ
                    </button>
                  ))}
                {isMe && (
                  <span
                    data-testid={`msg-read-status-${msg.id}`}
                    className={`ml-0.5 inline-flex items-center gap-0.5 font-semibold ${
                      msg.isRead
                        ? isDark
                          ? 'text-blue-400'
                          : 'text-blue-600'
                        : isDark
                          ? 'text-slate-500'
                          : 'text-gray-400'
                    }`}
                  >
                    {msg.isRead ? (
                      <>
                        <CheckCheck size={12} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                        <span>อ่านแล้ว</span>
                      </>
                    ) : (
                      <>
                        <Check size={12} className={isDark ? 'text-slate-500' : 'text-gray-400'} />
                        <span>ส่งแล้ว</span>
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
        <div ref={messagesEndRef} />
      </div>
      <StickerZoomModal sticker={zoomedSticker || null} onClose={() => setZoomedSticker(null)} />
    </div>
  );
}
