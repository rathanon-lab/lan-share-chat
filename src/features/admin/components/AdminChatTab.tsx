"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ArrowDown, Bot, Clock, EyeOff, Loader2, Lock, Search, ShieldAlert, Trash2, Users } from "lucide-react";
import type { ChatMessage, StickerItem, StickerMessageMeta, StickerPack, SystemSettings } from "@/types/chat";
import type { PreviewableFile } from "@/lib/filePreviewer";
import { FB, css } from "@/features/admin/theme";
import { useChatScrollPagination } from "@/features/chat/hooks/useChatScrollPagination";
import { AdminChatMessageRow } from "./AdminChatMessageRow";
import { AdminChatComposer } from "./AdminChatComposer";
import { AdminChatPurgeModal, type PurgeModalMode } from "./AdminChatPurgeModal";

interface AdminChatTabProps {
  token: string;
  messages: ChatMessage[];
  totalMessagesCount?: number;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => Promise<void> | void;
  systemSettings: SystemSettings;
  stickerPacks: StickerPack[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
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
  onDeleteMsg: (id: number) => void;
  onBatchDeleteMessages?: (ids: number[]) => void;
  onPurgeDeviceMessages?: (deviceId: string, senderName: string, windowMinutes?: number) => void;
  onPreviewFile: (f: PreviewableFile, gallery?: PreviewableFile[], index?: number) => void;
  onToggleAdminHold?: () => void;
  onToggleChatLocked?: () => void;
  onToggleChatBlurred?: () => void;
  onQuickMuteDevice?: (deviceId: string, senderName: string, unmute?: boolean) => void;
  onQuickBanDevice?: (deviceId: string, senderName: string, unban?: boolean) => void;
  apiFetch?: (url: string, opts?: RequestInit) => Promise<any>;
  notify?: (text: string, type?: "success" | "error") => void;
  onMessagesPurged?: (deletedIds: number[]) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function AdminChatTab(props: AdminChatTabProps) {
  const {
    token,
    messages,
    totalMessagesCount,
    hasMoreOlder = false,
    loadingOlder = false,
    onLoadOlder,
    systemSettings,
    searchQuery,
    setSearchQuery,
    onDeleteMsg,
    onBatchDeleteMessages,
    onPurgeDeviceMessages,
    onPreviewFile,
    onToggleAdminHold,
    onToggleChatLocked,
    onToggleChatBlurred,
    onQuickMuteDevice,
    onQuickBanDevice,
    messagesEndRef,
  } = props;

  const [selectedMsgIds, setSelectedMsgIds] = useState<number[]>([]);
  const [purgeMenuMsgId, setPurgeMenuMsgId] = useState<number | null>(null);
  const [purgeModalMode, setPurgeModalMode] = useState<PurgeModalMode | null>(null);

  const validIdSet = useMemo(() => new Set(messages.map((m) => Number(m.id))), [messages]);
  const activeSelectedIds = useMemo(
    () => selectedMsgIds.filter((id) => validIdSet.has(id)),
    [selectedMsgIds, validIdSet]
  );

  const filteredMessages = useMemo(
    () =>
      messages.filter(
        (m) =>
          !searchQuery ||
          m.sender?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.text?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [messages, searchQuery]
  );

  const {
    scrollContainerRef,
    topSentinelRef,
    unreadDividerRef,
    endRef,
    showJumpToLatest,
    unreadBelowCount,
    unreadDividerMsgId,
    handleScroll,
    jumpToLatest,
  } = useChatScrollPagination({
    messages: filteredMessages,
    hasMore: hasMoreOlder,
    loadingOlder,
    onLoadOlder,
    storageKey: "lan_admin_last_read_id",
    externalEndRef: messagesEndRef,
  });

  const chatMediaGallery = useMemo<PreviewableFile[]>(() => {
    const list: PreviewableFile[] = [];
    for (const msg of filteredMessages) {
      if (msg.isDeleted) continue;
      const atts =
        Array.isArray(msg.attachments) && msg.attachments.length > 0
          ? msg.attachments
          : msg.mediaToken
            ? [{ fileName: msg.fileName || "file", fileSize: msg.fileSize || 0, mimeType: msg.mimeType || "application/octet-stream", mediaToken: msg.mediaToken }]
            : [];
      for (const att of atts) {
        if (!att.isDeleted && att.mediaToken) {
          list.push({
            fileName: att.fileName,
            fileSize: att.fileSize,
            mimeType: att.mimeType,
            mediaToken: att.mediaToken,
          });
        }
      }
    }
    return list;
  }, [filteredMessages]);

  const handlePreviewFromChat = useCallback(
    (file: PreviewableFile) => {
      const idx = chatMediaGallery.findIndex((item) => item.mediaToken === file.mediaToken);
      onPreviewFile(file, chatMediaGallery.length > 1 ? chatMediaGallery : undefined, idx >= 0 ? idx : 0);
    },
    [chatMediaGallery, onPreviewFile]
  );

  const visibleMsgIds = filteredMessages.map((m) => Number(m.id)).filter((id) => Number.isFinite(id) && id > 0);
  const selectedVisibleCount = activeSelectedIds.filter((id) => visibleMsgIds.includes(id)).length;
  const allVisibleSelected = visibleMsgIds.length > 0 && selectedVisibleCount === visibleMsgIds.length;

  const toggleSelectMsg = (id: number) => {
    setSelectedMsgIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: "12px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: FB.textMuted }} />
          <input
            style={{ ...css.input, paddingLeft: "36px", borderRadius: "20px" }}
            placeholder="ค้นหาข้อความหรือชื่อผู้ส่ง..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {onToggleAdminHold && (
          <button
            type="button"
            data-testid="chat-toggle-hold-btn"
            onClick={onToggleAdminHold}
            title="เปิด/ปิดแถบแจ้งว่า Admin กำลังตรวจสอบระบบบนหน้าแชทหลัก"
            style={{
              ...css.btn(systemSettings.adminHoldActive ? "primary" : "secondary"),
              minWidth: "136px",
              height: "36px",
              justifyContent: "center",
              padding: "7px 12px",
              fontSize: "12px",
              background: systemSettings.adminHoldActive ? systemSettings.adminRingColor || "#EF4444" : FB.white,
              color: systemSettings.adminHoldActive ? "white" : FB.textPrimary,
              border: `1px solid ${systemSettings.adminHoldActive ? systemSettings.adminRingColor || "#EF4444" : FB.border}`,
            }}
          >
            <ShieldAlert size={14} />
            {systemSettings.adminHoldActive ? "Spotlight: เปิดอยู่" : "Spotlight ตรวจสอบ"}
          </button>
        )}
        {onToggleChatLocked && (
          <button
            type="button"
            data-testid="chat-toggle-lock-btn"
            onClick={onToggleChatLocked}
            title="ล็อกไม่ให้ผู้ใช้ทั่วไปส่งข้อความ/ไฟล์ในห้องแชทรวมชั่วคราว (ส่ง P2P ได้ปกติ)"
            style={{
              ...css.btn(systemSettings.chatLocked ? "danger" : "secondary"),
              minWidth: "136px",
              height: "36px",
              justifyContent: "center",
              padding: "7px 12px",
              fontSize: "12px",
              background: systemSettings.chatLocked ? FB.red : FB.white,
              color: systemSettings.chatLocked ? "white" : FB.textPrimary,
              border: `1px solid ${systemSettings.chatLocked ? FB.red : FB.border}`,
            }}
          >
            <Lock size={14} />
            {systemSettings.chatLocked ? "แชทถูกล็อก" : "ล็อกแชทรวม"}
          </button>
        )}
        {onToggleChatBlurred && (
          <button
            type="button"
            data-testid="chat-toggle-blur-btn"
            onClick={onToggleChatBlurred}
            title="ซ่อน/เบลอหน้าจอห้องแชทรวมของผู้ใช้ทุกคนชั่วคราว (ยังส่งไฟล์ LAN Share P2P ได้ปกติ)"
            style={{
              ...css.btn(systemSettings.chatBlurred ? "danger" : "secondary"),
              minWidth: "136px",
              height: "36px",
              justifyContent: "center",
              padding: "7px 12px",
              fontSize: "12px",
              background: systemSettings.chatBlurred ? "#0F172A" : FB.white,
              color: systemSettings.chatBlurred ? "white" : FB.textPrimary,
              border: `1px solid ${systemSettings.chatBlurred ? "#0F172A" : FB.border}`,
            }}
          >
            <EyeOff size={14} />
            {systemSettings.chatBlurred ? "เบลอแชทอยู่" : "เบลอหน้าแชทรวม"}
          </button>
        )}
        <span style={{ ...css.badge(false), whiteSpace: "nowrap" }}>
          {typeof totalMessagesCount === "number" && totalMessagesCount > messages.length
            ? `แสดง ${messages.length} / ${totalMessagesCount} ข้อความ`
            : `${messages.length} ข้อความ`}
        </span>
      </div>

      {(visibleMsgIds.length > 0 || props.apiFetch) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            flexWrap: "wrap",
            padding: "8px 12px",
            borderRadius: "10px",
            background: activeSelectedIds.length > 0 ? "#FEF2F2" : FB.white,
            border: `1px solid ${activeSelectedIds.length > 0 ? "#FECACA" : FB.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {visibleMsgIds.length > 0 && onBatchDeleteMessages && (
              <button
                type="button"
                data-testid="chat-select-all-btn"
                onClick={() => setSelectedMsgIds(allVisibleSelected ? [] : visibleMsgIds)}
                style={{ ...css.btn("secondary"), padding: "5px 10px", fontSize: "12px" }}
              >
                {allVisibleSelected ? "ยกเลิกเลือกทั้งหมด" : `เลือกทั้งหมด (${visibleMsgIds.length})`}
              </button>
            )}
            {activeSelectedIds.length > 0 && (
              <button type="button" onClick={() => setSelectedMsgIds([])} style={{ ...css.btn("ghost"), padding: "5px 8px", fontSize: "12px", color: FB.textSecondary }}>
                ล้าง ({activeSelectedIds.length})
              </button>
            )}
            {props.apiFetch && (
              <>
                <button
                  type="button"
                  data-testid="chat-purge-time-btn"
                  onClick={() => setPurgeModalMode("time")}
                  title="ตั้งช่วงวัน-เวลาเพื่อลบข้อความสแปมในช่วงที่เกิดปัญหา"
                  style={{ ...css.btn("secondary"), padding: "5px 10px", fontSize: "12px", color: FB.blue }}
                >
                  <Clock size={13} /> ลบตามช่วงเวลา
                </button>
                <button
                  type="button"
                  data-testid="chat-purge-users-btn"
                  onClick={() => setPurgeModalMode("users")}
                  title="เลือกผู้ใช้หลายคน/เป็นกลุ่มเพื่อลบเฉพาะข้อความของกลุ่มนั้น"
                  style={{ ...css.btn("secondary"), padding: "5px 10px", fontSize: "12px", color: "#7C3AED" }}
                >
                  <Users size={13} /> ลบเฉพาะผู้ใช้ / กลุ่ม
                </button>
                <button
                  type="button"
                  data-testid="chat-purge-bots-btn"
                  onClick={() => setPurgeModalMode("bots")}
                  title="สแกนและลบเฉพาะข้อความของบอท/สแปม โดยเก็บข้อความคุยปกติไว้ครบ"
                  style={{ ...css.btn("danger"), padding: "5px 10px", fontSize: "12px" }}
                >
                  <Bot size={13} /> กวาดเฉพาะบอท/สแปม
                </button>
              </>
            )}
          </div>
          {activeSelectedIds.length > 0 && onBatchDeleteMessages && (
            <button
              type="button"
              data-testid="chat-batch-delete-btn"
              onClick={() => {
                const idsToDelete = [...activeSelectedIds];
                onBatchDeleteMessages(idsToDelete);
                setSelectedMsgIds([]);
              }}
              style={{ ...css.btn("danger"), background: FB.red, color: "white", border: "none", padding: "6px 12px", fontSize: "12px" }}
            >
              <Trash2 size={13} /> ลบที่เลือก ({activeSelectedIds.length} ข้อความ)
            </button>
          )}
        </div>
      )}

      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            minHeight: 0,
            background: "#F0F2F5",
            padding: "14px",
            borderRadius: "12px",
            border: `1px solid ${FB.border}`,
          }}
        >
          <div ref={topSentinelRef} style={{ height: "1px", width: "100%", flexShrink: 0 }} />
          {loadingOlder && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "6px 0", fontSize: "12px", color: FB.blue, fontWeight: "600" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              <span>กำลังโหลดข้อความเก่ากว่า...</span>
            </div>
          )}
          {filteredMessages.map((msg) => (
            <React.Fragment key={msg.id}>
              {unreadDividerMsgId && msg.id === unreadDividerMsgId && (
                <div
                  ref={unreadDividerRef}
                  data-testid="admin-chat-unread-divider"
                  style={{ display: "flex", alignItems: "center", gap: "10px", margin: "4px 0", userSelect: "none" }}
                >
                  <div style={{ flex: 1, height: "1px", background: "rgba(239,68,68,0.65)" }} />
                  <span style={{ fontSize: "11px", fontWeight: "700", color: FB.red, background: FB.redLight, border: "1px solid rgba(250,56,62,0.3)", borderRadius: "999px", padding: "2px 10px" }}>
                    ข้อความใหม่ตั้งแต่ตรงนี้
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "rgba(239,68,68,0.65)" }} />
                </div>
              )}
              <AdminChatMessageRow
                msg={msg}
                token={token}
                systemSettings={systemSettings}
                isChecked={activeSelectedIds.includes(Number(msg.id))}
                showCheckbox={Boolean(onBatchDeleteMessages)}
                purgeMenuOpen={purgeMenuMsgId === msg.id}
                onToggleSelect={toggleSelectMsg}
                onTogglePurgeMenu={(id) => setPurgeMenuMsgId((cur) => (cur === id ? null : id))}
                onClosePurgeMenu={() => setPurgeMenuMsgId(null)}
                onDeleteMsg={onDeleteMsg}
                onPurgeDeviceMessages={onPurgeDeviceMessages}
                onQuickMuteDevice={onQuickMuteDevice}
                onQuickBanDevice={onQuickBanDevice}
                onPreviewFile={handlePreviewFromChat}
              />
            </React.Fragment>
          ))}
          <div ref={endRef} />
        </div>

        {showJumpToLatest && (
          <button
            type="button"
            data-testid="admin-chat-jump-latest-btn"
            onClick={jumpToLatest}
            style={{
              position: "absolute",
              bottom: "14px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
              border: unreadBelowCount > 0 ? `1px solid ${FB.blue}` : `1px solid ${FB.border}`,
              background: unreadBelowCount > 0 ? FB.blue : "rgba(255,255,255,0.96)",
              color: unreadBelowCount > 0 ? "white" : FB.textPrimary,
              boxShadow: "0 4px 14px rgba(0,0,0,0.16)",
            }}
          >
            <ArrowDown size={14} />
            <span>
              {unreadBelowCount > 0
                ? `ข้อความใหม่ ${unreadBelowCount} รายการ · ไปล่าสุด`
                : "ไปข้อความล่าสุด"}
            </span>
          </button>
        )}
      </div>

      <AdminChatComposer
        systemSettings={systemSettings}
        stickerPacks={props.stickerPacks}
        adminMessage={props.adminMessage}
        setAdminMessage={props.setAdminMessage}
        attachPreviews={props.attachPreviews}
        uploadProgress={props.uploadProgress}
        onCancelUpload={props.onCancelUpload}
        isRecording={props.isRecording}
        isEncodingVoice={props.isEncodingVoice}
        recordSec={props.recordSec}
        recordedVoice={props.recordedVoice}
        onClearRecordedVoice={props.onClearRecordedVoice}
        canUseMicContext={props.canUseMicContext}
        onStartRecording={props.onStartRecording}
        onStopRecording={props.onStopRecording}
        onSendMessage={props.onSendMessage}
        onSendSticker={props.onSendSticker}
        onFilesSelected={props.onFilesSelected}
        onAddFiles={props.onAddFiles}
        onRemoveAttachPreview={props.onRemoveAttachPreview}
        onClearAllAttachPreviews={props.onClearAllAttachPreviews}
      />

      {purgeModalMode && props.apiFetch && props.notify && (
        <AdminChatPurgeModal
          mode={purgeModalMode}
          apiFetch={props.apiFetch}
          notify={props.notify}
          onPurgeSuccess={(deletedIds) => {
            setSelectedMsgIds([]);
            props.onMessagesPurged?.(deletedIds);
          }}
          onClose={() => setPurgeModalMode(null)}
        />
      )}
    </div>
  );
}
