"use client";

import React from "react";
import { Ban, Clock, Download, Eye, File as FileIcon, History, Play, Shield, Trash2 } from "lucide-react";
import type { ChatMessage, SenderDeviceStatus, SystemSettings } from "@/types/chat";
import type { PreviewableFile } from "@/lib/filePreviewer";
import { isRichPreviewSupported } from "@/lib/filePreviewer";
import { formatDeviceBadge } from "@/lib/deviceMeta";
import { FB, css, formatAdminDate } from "@/features/admin/theme";
import { UserAvatar } from "@/components/UserAvatar";
import { SecureAudio, SecureImage, SecureVideo, downloadEncryptedMedia } from "@/lib/secureMedia";
import { UnifiedEmojiText } from "@/features/stickers/components/UnifiedEmojiText";
import { StickerVisual } from "@/features/stickers/components/StickerVisual";

interface AdminChatMessageRowProps {
  msg: ChatMessage;
  token: string;
  systemSettings: SystemSettings;
  isChecked: boolean;
  showCheckbox: boolean;
  purgeMenuOpen: boolean;
  onToggleSelect: (id: number) => void;
  onTogglePurgeMenu: (id: number) => void;
  onClosePurgeMenu: () => void;
  onDeleteMsg: (id: number) => void;
  onPurgeDeviceMessages?: (deviceId: string, senderName: string, windowMinutes?: number) => void;
  onQuickMuteDevice?: (deviceId: string, senderName: string, unmute?: boolean) => void;
  onQuickBanDevice?: (deviceId: string, senderName: string, unban?: boolean) => void;
  onPreviewFile: (f: PreviewableFile) => void;
}

export function AdminChatMessageRow({
  msg,
  token,
  systemSettings,
  isChecked,
  showCheckbox,
  purgeMenuOpen,
  onToggleSelect,
  onTogglePurgeMenu,
  onClosePurgeMenu,
  onDeleteMsg,
  onPurgeDeviceMessages,
  onQuickMuteDevice,
  onQuickBanDevice,
  onPreviewFile,
}: AdminChatMessageRowProps) {
  const attachments =
    Array.isArray(msg.attachments) && msg.attachments.length > 0
      ? msg.attachments
      : msg.mediaToken
        ? [{ fileName: msg.fileName || "file", fileSize: msg.fileSize || 0, mimeType: msg.mimeType || "application/octet-stream", mediaToken: msg.mediaToken }]
        : [];
  const isAdm = !!msg.isAdmin;
  const senderStatus: SenderDeviceStatus = isAdm ? "active" : msg.senderStatus || "active";
  const isSenderDeleted = !isAdm && senderStatus === "deleted";
  const isSenderBanned = !isAdm && (senderStatus === "banned" || senderStatus === "ip_banned");
  const isSenderMuted = !isAdm && senderStatus === "muted";
  const osBadge = !isAdm && !isSenderDeleted ? formatDeviceBadge(msg.senderOs) : null;

  return (
    <div
      data-testid={`admin-chat-msg-${msg.id}`}
      style={{
        display: "flex",
        flexDirection: isAdm ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: "10px",
        background: isChecked ? "rgba(24, 119, 242, 0.08)" : undefined,
        borderRadius: "10px",
        padding: isChecked ? "4px" : undefined,
      }}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          data-testid={`chat-select-${msg.id}`}
          checked={isChecked}
          onChange={() => onToggleSelect(Number(msg.id))}
          style={{ width: "16px", height: "16px", marginTop: "10px", accentColor: FB.blue, cursor: "pointer", flexShrink: 0 }}
          title="เลือกข้อความนี้"
        />
      )}
      <UserAvatar
        src={isAdm ? msg.senderAvatarUrl || systemSettings.adminAvatarUrl : isSenderDeleted ? undefined : msg.senderAvatarUrl}
        name={msg.sender}
        size={36}
        isAdmin={isAdm}
        adminRingColor={systemSettings.adminRingColor}
        status={senderStatus}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: isAdm ? "flex-end" : "flex-start", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: isAdm ? "flex-end" : "flex-start" }}>
          <span
            style={{
              fontSize: "12px",
              fontWeight: "700",
              color: isAdm ? FB.blue : isSenderDeleted ? "#64748B" : FB.textPrimary,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {isAdm && <Shield size={11} />}
            {msg.sender}
          </span>
          {osBadge && (
            <span style={{ padding: "1px 6px", borderRadius: "999px", fontSize: "10px", fontWeight: "600", background: "#E2E8F0", color: "#475569" }}>
              {osBadge}
            </span>
          )}
          {!isAdm && senderStatus === "ip_banned" && (
            <span
              data-testid={`admin-msg-status-${msg.id}`}
              style={{
                padding: "1px 7px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: "700",
                background: "linear-gradient(90deg, #FEE2E2, #F3E8FF)",
                color: "#991B1B",
                border: "1px solid #C084FC",
              }}
            >
              🌐🚫 แบน+IP
            </span>
          )}
          {!isAdm && senderStatus === "banned" && (
            <span
              data-testid={`admin-msg-status-${msg.id}`}
              style={{ padding: "1px 7px", borderRadius: "999px", fontSize: "10px", fontWeight: "700", background: "#FEE2E2", color: "#DC2626", border: "1px solid #FECACA" }}
            >
              🚫 ถูกแบน
            </span>
          )}
          {!isAdm && senderStatus === "muted" && (
            <span
              data-testid={`admin-msg-status-${msg.id}`}
              style={{ padding: "1px 7px", borderRadius: "999px", fontSize: "10px", fontWeight: "700", background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" }}
            >
              ⏳ ถูก Mute
            </span>
          )}
          {!isAdm && senderStatus === "deleted" && (
            <span
              data-testid={`admin-msg-status-${msg.id}`}
              style={{ padding: "1px 7px", borderRadius: "999px", fontSize: "10px", fontWeight: "600", background: "#E2E8F0", color: "#475569", border: "1px solid #CBD5E1" }}
            >
              🗑️ ถูกลบแล้ว
            </span>
          )}
          <span style={{ fontSize: "11px", color: FB.textMuted }}>{msg.time}</span>
          <span style={{ fontSize: "11px", color: FB.textMuted }}>#{msg.id}</span>
          {!!msg.mentionAdmin && (
            <span style={{ padding: "1px 7px", borderRadius: "10px", fontSize: "10px", fontWeight: "700", background: "#FFF8E1", color: "#E65100", border: "1px solid #FFE082" }}>
              @admin
            </span>
          )}
          {!!msg.editedAt && (
            <span style={{ padding: "1px 7px", borderRadius: "10px", fontSize: "10px", fontWeight: "600", background: FB.white, color: FB.textSecondary, border: `1px solid ${FB.border}` }}>
              <History size={10} style={{ display: "inline", marginRight: 3 }} />
              แก้ไขแล้ว ({msg.editCount || 1})
            </span>
          )}
          {!!msg.isDeleted && (
            <span style={{ padding: "1px 7px", borderRadius: "10px", fontSize: "10px", fontWeight: "700", background: FB.redLight, color: FB.red }}>
              ลบโดยผู้ใช้ ({msg.deletedBy || "User"})
            </span>
          )}
          {isAdm && !msg.isDeleted && (
            <span style={{ fontSize: "10px", fontWeight: "700", color: msg.isRead ? FB.blue : FB.textMuted }}>
              {msg.isRead ? "✓✓ อ่านแล้ว" : "✓ ส่งแล้ว"}
            </span>
          )}
          {!isAdm && !isSenderDeleted && msg.senderDeviceId && onQuickMuteDevice && (
            <button
              type="button"
              data-testid={`chat-mute-btn-${msg.id}`}
              onClick={() => onQuickMuteDevice(msg.senderDeviceId!, msg.sender, isSenderMuted)}
              style={{
                ...css.btn("ghost"),
                padding: "2px 6px",
                fontSize: "10px",
                color: isSenderMuted ? FB.green : "#B45309",
                borderRadius: "6px",
                background: isSenderMuted ? "#F0FDF4" : "#FFFBEB",
                border: `1px solid ${isSenderMuted ? "#BBF7D0" : "#FDE68A"}`,
              }}
              title={isSenderMuted ? "ปลด Mute อุปกรณ์นี้ทันที" : `จำกัดการส่งชั่วคราว (${systemSettings.spamMuteMinutes || 5} นาที)`}
            >
              <Clock size={11} /> {isSenderMuted ? "ปลด Mute" : "Mute"}
            </button>
          )}
          {!isAdm && !isSenderDeleted && msg.senderDeviceId && onQuickBanDevice && (
            <button
              type="button"
              data-testid={`chat-ban-btn-${msg.id}`}
              onClick={() => onQuickBanDevice(msg.senderDeviceId!, msg.sender, isSenderBanned)}
              style={{
                ...css.btn("ghost"),
                padding: "2px 6px",
                fontSize: "10px",
                color: isSenderBanned ? FB.green : FB.red,
                borderRadius: "6px",
                background: isSenderBanned ? "#F0FDF4" : FB.redLight,
                border: `1px solid ${isSenderBanned ? "#BBF7D0" : "#FECACA"}`,
              }}
              title={isSenderBanned ? "ปลดแบนอุปกรณ์ (และ IP)" : "ระงับการใช้งานอุปกรณ์/IP นี้"}
            >
              <Ban size={11} /> {isSenderBanned ? "ปลดแบน" : "Ban"}
            </button>
          )}
          {!isAdm && msg.senderDeviceId && onPurgeDeviceMessages && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                data-testid={`chat-purge-btn-${msg.id}`}
                onClick={() => onTogglePurgeMenu(msg.id)}
                style={{
                  ...css.btn("ghost"),
                  padding: "2px 6px",
                  fontSize: "10px",
                  color: "#9333EA",
                  borderRadius: "6px",
                  background: "#FAF5FF",
                  border: "1px solid #E9D5FF",
                }}
                title="ลบข้อความสแปมของผู้ใช้นี้"
              >
                <Trash2 size={11} /> ลบข้อความสแปม
              </button>
              {purgeMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: "4px",
                    background: FB.white,
                    border: `1px solid ${FB.border}`,
                    borderRadius: "8px",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                    zIndex: 30,
                    minWidth: "185px",
                    padding: "4px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <button
                    type="button"
                    data-testid={`chat-purge-15m-${msg.id}`}
                    onClick={() => {
                      onClosePurgeMenu();
                      onPurgeDeviceMessages(msg.senderDeviceId!, msg.sender, 15);
                    }}
                    style={{ ...css.btn("ghost"), justifyContent: "flex-start", padding: "6px 8px", fontSize: "11px", color: FB.textPrimary, width: "100%" }}
                  >
                    ลบข้อความใน 15 นาทีล่าสุด
                  </button>
                  <button
                    type="button"
                    data-testid={`chat-purge-all-${msg.id}`}
                    onClick={() => {
                      onClosePurgeMenu();
                      onPurgeDeviceMessages(msg.senderDeviceId!, msg.sender, undefined);
                    }}
                    style={{ ...css.btn("ghost"), justifyContent: "flex-start", padding: "6px 8px", fontSize: "11px", color: FB.red, width: "100%" }}
                  >
                    ลบข้อความทั้งหมดของผู้ใช้นี้
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => onDeleteMsg(msg.id)}
            style={{ ...css.btn("ghost"), padding: "2px 6px", color: FB.red, borderRadius: "6px", background: "rgba(255,255,255,0.8)", border: `1px solid ${FB.border}` }}
            title="ลบข้อความถาวร"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {msg.type === "sticker" && msg.stickerMeta?.url && !msg.isDeleted ? (
          <StickerVisual meta={msg.stickerMeta} variant="admin" />
        ) : (
          <div
            style={{
              maxWidth: "min(680px, 100%)",
              borderRadius: isAdm ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              background: isAdm ? "#EEF2FF" : FB.white,
              border: `1px solid ${isAdm ? "#C7D2FE" : FB.border}`,
              padding: attachments.length > 0 && !msg.text ? "8px" : "10px 14px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            {attachments.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: msg.text ? "8px" : 0 }}>
                {attachments.map((att, idx) => {
                  const isImg = att.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/i.test(att.fileName || "");
                  const isVid = att.mimeType?.startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv)$/i.test(att.fileName || "");
                  const isAud = att.mimeType?.startsWith("audio/") || /\.(mp3|wav|m4a|ogg)$/i.test(att.fileName || "");
                  return (
                    <div key={idx} style={{ border: `1px solid ${FB.border}`, borderRadius: "10px", padding: "6px", background: "#F8FAFC", width: isAud ? "250px" : "195px" }}>
                      {isImg && att.mediaToken && (
                        <div
                          onClick={() => onPreviewFile({ fileName: att.fileName, fileSize: att.fileSize, mimeType: att.mimeType, mediaToken: att.mediaToken })}
                          style={{ cursor: "pointer", width: "100%", height: "132px", borderRadius: "8px", overflow: "hidden", background: "#E2E8F0", marginBottom: "6px" }}
                        >
                          <SecureImage token={att.mediaToken} thumbnail alt={att.fileName} fileName={att.fileName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      )}
                      {isVid && att.mediaToken && (
                        <div
                          onClick={() => onPreviewFile({ fileName: att.fileName, fileSize: att.fileSize, mimeType: att.mimeType, mediaToken: att.mediaToken })}
                          data-testid={`admin-chat-video-card-${msg.id}-${idx}`}
                          title="คลิกเพื่อเล่นวิดีโอเต็มจอ"
                          style={{ position: "relative", cursor: "pointer", width: "100%", height: "132px", borderRadius: "8px", overflow: "hidden", background: "#0F172A", marginBottom: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <SecureVideo token={att.mediaToken} controls={false} muted style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                          <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(24,119,242,0.92)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
                              <Play size={18} fill="white" />
                            </div>
                          </div>
                          <span style={{ position: "absolute", top: "6px", right: "6px", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "700", background: "rgba(0,0,0,0.65)", color: "white" }}>
                            VIDEO
                          </span>
                        </div>
                      )}
                      {isAud && att.mediaToken && (
                        <div style={{ marginBottom: "6px" }}>
                          <SecureAudio token={att.mediaToken} style={{ width: "100%", height: "38px" }} />
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <FileIcon size={13} style={{ color: FB.blue, flexShrink: 0 }} />
                        <span style={{ fontSize: "12px", color: FB.blue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={att.fileName}>
                          {att.fileName}
                        </span>
                        {att.mediaToken && isRichPreviewSupported(att.fileName, att.mimeType) && (
                          <button
                            type="button"
                            onClick={() => onPreviewFile({ fileName: att.fileName, fileSize: att.fileSize, mimeType: att.mimeType, mediaToken: att.mediaToken })}
                            style={{ ...css.btn("ghost"), padding: "2px 4px", color: FB.blue }}
                            title="พรีวิวไฟล์"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                        {att.mediaToken && (
                          <button
                            type="button"
                            onClick={() => downloadEncryptedMedia(att.mediaToken, att.fileName, { adminToken: token })}
                            style={{ ...css.btn("ghost"), padding: "2px 4px" }}
                            title="ดาวน์โหลด"
                          >
                            <Download size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {msg.text && (
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: msg.isDeleted ? FB.textMuted : FB.textPrimary,
                  textDecoration: msg.isDeleted ? "line-through" : "none",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  lineHeight: "1.5",
                }}
              >
                <UnifiedEmojiText text={msg.text} />
              </p>
            )}

            {Array.isArray(msg.editHistory) && msg.editHistory.length > 0 && (
              <details style={{ marginTop: "6px", fontSize: "12px", color: FB.textSecondary }}>
                <summary style={{ cursor: "pointer", fontWeight: "600", color: FB.blue }}>
                  ดูประวัติการแก้ไข ({msg.editHistory.length})
                </summary>
                <div style={{ marginTop: "4px", padding: "6px 8px", background: FB.bg, borderRadius: "6px", border: `1px solid ${FB.border}` }}>
                  {msg.editHistory.map((h, idx) => (
                    <div key={idx} style={{ padding: "2px 0", borderBottom: idx < msg.editHistory!.length - 1 ? `1px dashed ${FB.border}` : "none" }}>
                      <span style={{ color: FB.textMuted, fontSize: "11px" }}>{formatAdminDate(h.editedAt)}: </span>
                      <span>{h.previousText}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
