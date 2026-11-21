"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Globe, Image as ImageIcon, Lock, MessageSquare, Moon, Share2, Shield, Sun, X } from "lucide-react";
import type { ChatAttachment } from "@/types/chat";
import { DEFAULT_ADMIN_RING_COLOR, resolveFallbackAvatarForName } from "@/lib/avatars";
import { useLanguage } from "@/lib/i18n";
import { PreviewableFile, UniversalFilePreviewModal } from "@/lib/filePreviewer";
import { ProfileModal } from "@/components/ProfileModal";
import { ChatSidebar } from "@/features/chat/components/ChatSidebar";
import { ChatMessageList } from "@/features/chat/components/ChatMessageList";
import { AlbumGalleryModal } from "@/features/chat/components/AlbumGalleryModal";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { BannedOverlay } from "@/features/chat/components/BannedOverlay";
import { ChatBlurredOverlay } from "@/features/chat/components/ChatBlurredOverlay";
import { SessionConflictOverlay } from "@/features/chat/components/SessionConflictOverlay";
import { useModalHistoryStack } from "@/features/chat/hooks/useModalHistoryStack";
import {
  ConfirmDeleteModal,
  EditHistoryModal,
  EditHistoryModalState,
  LightboxModal,
} from "@/features/chat/components/ChatModals";
import { P2PSendModal } from "@/features/p2p/components/P2PSendModal";
import { P2PReceiveModal } from "@/features/p2p/components/P2PReceiveModal";
import { useChatSocket } from "@/features/chat/hooks/useChatSocket";
import { useChatComposerActions } from "@/features/chat/hooks/useChatComposerActions";

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("lan-chat-theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("lan-chat-theme-change", callback);
  };
}

function getIsDarkSnapshot(): boolean {
  try {
    return localStorage.getItem("lan_chat_theme") === "dark";
  } catch {
    return false;
  }
}

export default function ChatApp() {
  const isDark = useSyncExternalStore(subscribeTheme, getIsDarkSnapshot, () => false);
  const { lang, isEn, toggleLang } = useLanguage();
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"chat" | "peers">("chat");
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: ChatAttachment[]; index: number } | null>(null);
  const [albumModal, setAlbumModal] = useState<{ items: ChatAttachment[]; initialFilter: 'all' | 'media' | 'files' } | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const [editHistoryModal, setEditHistoryModal] = useState<EditHistoryModalState | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "info" | "error" | "success" } | null>(null);
  const [showExitConfirmToast, setShowExitConfirmToast] = useState(false);
  const exitBackConfirmUntilRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleDarkMode = () => {
    try {
      const next = !getIsDarkSnapshot();
      localStorage.setItem("lan_chat_theme", next ? "dark" : "light");
      window.dispatchEvent(new Event("lan-chat-theme-change"));
    } catch {}
  };

  const showToast = useCallback((text: string, type: "info" | "error" | "success" = "info") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg((cur) => (cur?.text === text ? null : cur)), 4500);
  }, []);

  const chat = useChatSocket(showToast);
  const actions = useChatComposerActions({
    socket: chat.socket,
    identityRef: chat.identityRef,
    runtimeConfig: chat.runtimeConfig,
    systemSettings: chat.systemSettings,
    canUseMicContext: chat.canUseMicContext,
    showToast,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.webrtc.transfers]);

  const mentionMatch = actions.inputText.match(/(?:^|\s)@([^\s@]{0,24})$/);
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : null;

  const myPeerData = chat.peers.find((p) =>
    chat.identity.deviceId ? p.deviceId === chat.identity.deviceId : p.ip === chat.identity.ip
  );
  const isDuplicateSession = Boolean(myPeerData && (myPeerData.tabCount ?? 1) > 1);
  const myTabCount = myPeerData?.tabCount ?? 1;
  const otherPeers = chat.peers.filter((p) =>
    chat.identity.deviceId ? p.deviceId !== chat.identity.deviceId : p.ip !== chat.identity?.ip
  );

  const mentionCandidates =
    mentionQuery === null
      ? []
      : otherPeers.filter((p) => p.name.toLowerCase().includes(mentionQuery)).slice(0, 5);

  const isBanned = Boolean(chat.restriction?.banned);
  const isSessionConflict = Boolean(chat.sessionConflict);
  const isMuted = Boolean(chat.restriction?.mutedUntil && chat.restriction.mutedUntil > chat.nowMs);
  const isRoomLocked = Boolean(chat.systemSettings.chatLocked);
  const isChatBlurred = Boolean(chat.systemSettings.chatBlurred);
  const isComposerDisabled = isBanned || isSessionConflict || isMuted || isRoomLocked || isChatBlurred;
  const isP2pRestricted = isBanned || isSessionConflict || isMuted;
  const muteSecondsLeft =
    isMuted && chat.restriction?.mutedUntil
      ? Math.max(0, Math.ceil((chat.restriction.mutedUntil - chat.nowMs) / 1000))
      : 0;
  const modalClosers: Array<() => void> = [];
  if (activeMobileTab === "peers") modalClosers.push(() => setActiveMobileTab("chat"));
  if (isProfileModalOpen) modalClosers.push(() => setIsProfileModalOpen(false));
  if (chat.webrtc.isDirectSendModalOpen) modalClosers.push(() => chat.webrtc.closeDirectSendModal());
  if (chat.webrtc.incomingRequest) modalClosers.push(() => chat.webrtc.closeReceiverModal());
  if (actions.confirmDeleteModal) modalClosers.push(() => actions.setConfirmDeleteModal(null));
  if (editHistoryModal) modalClosers.push(() => setEditHistoryModal(null));
  if (albumModal) modalClosers.push(() => setAlbumModal(null));
  if (lightbox) modalClosers.push(() => setLightbox(null));
  if (previewFile) modalClosers.push(() => setPreviewFile(null));

  const handleRootBackAttempt = useCallback(() => {
    if (exitBackConfirmUntilRef.current > Date.now()) {
      setShowExitConfirmToast(false);
      return;
    }
    exitBackConfirmUntilRef.current = Date.now() + 2500;
    setShowExitConfirmToast(true);
    setTimeout(() => {
      if (Date.now() >= exitBackConfirmUntilRef.current) {
        setShowExitConfirmToast(false);
      }
    }, 2550);
  }, []);

  useModalHistoryStack(modalClosers, handleRootBackAttempt);

  const blockedBanner = isBanned
    ? `อุปกรณ์ของคุณถูกระงับการใช้งาน${chat.restriction?.reason ? ` (${chat.restriction.reason})` : ""}`
    : isSessionConflict
      ? "เซสชันนี้ถูกสลับไปใช้งานในหน้าต่างอื่นแล้ว กรุณากด 'ดึงสิทธิ์กลับมาใช้งานหน้านี้'"
      : isMuted
        ? `คุณถูกจำกัดการส่งข้อความและไฟล์ชั่วคราว (เหลือ ${muteSecondsLeft} วินาที)`
        : isChatBlurred
          ? "Admin ซ่อนเนื้อหาห้องแชทรวมและล็อกการพิมพ์ชั่วคราวเพื่อตรวจสอบ (ยังส่งไฟล์ LAN Share P2P ได้)"
          : isRoomLocked
            ? "Admin ล็อกการส่งข้อความชั่วคราวระหว่างตรวจสอบระบบ"
            : null;
  const ringColor = chat.systemSettings.adminRingColor || DEFAULT_ADMIN_RING_COLOR;
  const visibleOtherPeers = isBanned ? [] : otherPeers;

  return (
    <div
      data-theme={isDark ? "dark" : "light"}
      className={`h-dvh w-full font-sans flex items-center justify-center overflow-hidden safe-area-shell ultrawide-shell ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-gray-200 text-gray-900"
      }`}
    >
      <div
        className={`flex flex-col h-full min-h-0 overflow-hidden relative ultrawide-card ${
          isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-300"
        }`}
      >
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <ChatSidebar
            activeMobileTab={activeMobileTab}
            identity={chat.identity}
            otherPeers={visibleOtherPeers}
            onOpenProfileModal={() => setIsProfileModalOpen(true)}
            onOpenDirectSendModal={chat.webrtc.openDirectSendModal}
            isRestricted={isP2pRestricted}
            isDark={isDark}
          />

          <div
            className={`flex-1 min-h-0 flex-col relative w-full md:w-auto overflow-hidden ${
              isDark ? "bg-slate-950" : "bg-[#F8FAFC]"
            } ${activeMobileTab === "chat" ? "flex" : "hidden md:flex"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOverChat(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setIsDraggingOverChat(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOverChat(false);
              if (isComposerDisabled) {
                showToast(blockedBanner || "การส่งไฟล์ถูกจำกัดชั่วคราว", "error");
                return;
              }
              if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) actions.addFilesToChatStage(e.dataTransfer.files);
            }}
          >
            {isDraggingOverChat && !isComposerDisabled && (
              <div className="absolute inset-0 bg-blue-600/15 backdrop-blur-[2px] border-4 border-dashed border-blue-500 z-40 flex flex-col items-center justify-center pointer-events-none">
                <div className="bg-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 text-blue-600 font-bold">
                  <ImageIcon size={24} />
                  <span>วางรูปภาพ วิดีโอ หรือไฟล์ที่นี่เพื่อแนบในแชท (สูงสุด 10 ไฟล์)</span>
                </div>
              </div>
            )}

            <div
              className={`h-16 backdrop-blur-md border-b flex items-center px-4 md:px-6 justify-between sticky top-0 z-10 shrink-0 gap-2 ${
                isDark ? "bg-slate-900/90 border-slate-800" : "bg-white/80 border-gray-200"
              }`}
            >
              <div className="min-w-0">
                <h2 className={`font-bold flex items-center gap-2 flex-wrap ${isDark ? "text-slate-100" : "text-gray-800"}`}>
                  ห้องแชทส่วนรวม
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold border px-2 py-0.5 rounded-full ${
                      isDark
                        ? "bg-emerald-950/70 text-emerald-300 border-emerald-800"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                    title="สื่อทุกไฟล์เข้ารหัสด้วย AES-256-GCM และดึงผ่าน Encrypted API"
                  >
                    <Lock size={10} /> Encrypted Media
                  </span>
                </h2>
                <p className={`text-xs font-medium flex items-center gap-1 ${chat.isConnected ? "text-green-600" : "text-amber-600"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${chat.isConnected ? "bg-green-500" : "bg-amber-500 animate-pulse"}`}></span>
                  {chat.isConnected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ..."}
                </p>
              </div>

              {chat.systemSettings.adminHoldActive && (
                <div
                  data-testid="admin-hold-pill"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-sm border animate-pulse truncate max-w-[320px]"
                  style={{ color: ringColor, borderColor: ringColor, backgroundColor: `${ringColor}14` }}
                >
                  <Shield size={13} className="shrink-0" />
                  <span className="truncate">Admin กำลังตรวจสอบระบบ...</span>
                </div>
              )}

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="lang-toggle-btn"
                  onClick={toggleLang}
                  title={isEn ? "Switch to Thai (สลับเป็นภาษาไทย)" : "สลับเป็นภาษาอังกฤษ (Switch to English)"}
                  className={`inline-flex items-center gap-1 text-xs font-bold border px-2.5 h-8 rounded-lg transition-colors cursor-pointer ${
                    isDark
                      ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                      : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  <Globe size={13} />
                  <span>{isEn ? "EN" : "TH"}</span>
                </button>
                <button
                  type="button"
                  data-testid="theme-toggle-btn"
                  onClick={toggleDarkMode}
                  title={isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดกลางคืน (Dark Mode)"}
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors cursor-pointer ${
                    isDark
                      ? "bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  {isDark ? <Sun size={15} /> : <Moon size={15} />}
                </button>
                <Link
                  href="/admin"
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold border px-3 py-1.5 rounded-lg transition-colors ${
                    isDark
                      ? "text-slate-200 hover:text-blue-300 bg-slate-800 hover:bg-slate-700 border-slate-700"
                      : "text-gray-600 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 border-gray-200 hover:border-blue-200"
                  }`}
                  title="เปิดหน้าผู้ดูแลระบบ"
                >
                  <Shield size={13} />
                  Admin
                </Link>
              </div>
            </div>

            {chat.systemSettings.adminHoldActive && (
              <div
                className="sm:hidden px-3 py-1.5 border-b text-[11px] font-bold flex items-center justify-center gap-1.5 shrink-0"
                style={{ color: ringColor, borderColor: `${ringColor}40`, backgroundColor: `${ringColor}12` }}
              >
                <Shield size={12} className="shrink-0" />
                <span>Admin กำลังตรวจสอบระบบ...</span>
              </div>
            )}

            {toastMsg && (
              <div
                className={`px-6 py-2.5 border-b flex items-center justify-between gap-3 text-sm font-medium shrink-0 ${
                  toastMsg.type === "error"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : toastMsg.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-blue-50 border-blue-200 text-blue-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  {toastMsg.type === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  <span>{toastMsg.text}</span>
                </div>
                <button onClick={() => setToastMsg(null)} className="p-1 rounded hover:bg-black/5 cursor-pointer">
                  <X size={14} />
                </button>
              </div>
            )}

            {isDuplicateSession && (
              <div className="bg-red-50 border-b border-red-200 p-3 px-6 flex items-center gap-3 shrink-0">
                <AlertTriangle className="text-red-600 shrink-0" size={20} />
                <p className="text-sm text-red-800 font-medium">พบการเปิดใช้งานซ้ำกันหลายหน้าต่างในเครื่องนี้ ({myTabCount} แท็บ)</p>
              </div>
            )}

            <div
              data-testid="admin-hold-spotlight"
              data-hold-active={chat.systemSettings.adminHoldActive ? "true" : "false"}
              className="flex-1 min-h-0 flex flex-col relative overflow-hidden transition-all"
              style={
                chat.systemSettings.adminHoldActive
                  ? { border: `2px solid ${ringColor}`, boxShadow: `inset 0 0 22px ${ringColor}1a` }
                  : undefined
              }
            >
              {isBanned && <BannedOverlay isDark={isDark} reason={chat.restriction?.reason} />}
              {!isBanned && chat.sessionConflict && (
                <SessionConflictOverlay
                  conflict={chat.sessionConflict}
                  isDark={isDark}
                  onTakeoverHere={chat.reclaimSession}
                />
              )}
              {!isBanned && !chat.sessionConflict && isChatBlurred && (
                <ChatBlurredOverlay isDark={isDark} lang={lang} />
              )}

              {showExitConfirmToast && (
                <div
                  data-testid="exit-confirm-toast"
                  className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-full bg-red-600 text-white text-xs sm:text-sm font-bold shadow-2xl flex items-center gap-2 whitespace-nowrap animate-bounce"
                >
                  <AlertTriangle size={15} />
                  <span>
                    {isEn
                      ? "At top-level Main Chat — swipe tab away or press Back again to leave"
                      : "อยู่หน้าแชทหลักสูงสุดแล้ว — กด Home/ปัดแท็บ หรือกดย้อนกลับอีกครั้งเพื่อออก"}
                  </span>
                </div>
              )}

              <ChatMessageList
                messages={chat.messages}
                identityDeviceId={chat.identity.deviceId}
                identityName={chat.identity.name}
                systemSettings={chat.systemSettings}
                isDark={isDark}
                isWithinWindow={actions.isWithinWindow}
                editingMsgId={actions.editingMsgId}
                editingText={actions.editingText}
                setEditingMsgId={actions.setEditingMsgId}
                setEditingText={actions.setEditingText}
                onSaveEdit={actions.saveEditedMessage}
                onOpenDeleteConfirm={actions.openDeleteConfirm}
                onOpenLightbox={(items, index) => setLightbox({ items, index })}
                onOpenAlbumModal={(items, initialFilter = "all") => setAlbumModal({ items, initialFilter })}
                onOpenPreviewFile={setPreviewFile}
                onOpenEditHistory={setEditHistoryModal}
                messagesEndRef={messagesEndRef}
              />
            </div>

            <ChatComposer
              inputText={actions.inputText}
              setInputText={actions.setInputText}
              composerRef={actions.composerRef}
              mentionCandidates={mentionCandidates}
              mentionQuery={mentionQuery}
              mentionDismissed={mentionDismissed}
              setMentionDismissed={setMentionDismissed}
              stagedChatFiles={actions.stagedChatFiles}
              addFilesToChatStage={actions.addFilesToChatStage}
              removeStagedChatFile={actions.removeStagedChatFile}
              clearAllStagedChatFiles={actions.clearAllStagedChatFiles}
              chatUploadProgress={actions.chatUploadProgress}
              onCancelUpload={actions.onCancelUpload}
              recordedVoice={actions.recordedVoice}
              clearRecordedVoice={actions.clearRecordedVoice}
              isRecording={actions.isRecording}
              recordSeconds={actions.recordSeconds}
              isEncodingVoice={actions.isEncodingVoice}
              canUseMicContext={chat.canUseMicContext}
              startVoiceRecording={actions.startVoiceRecording}
              stopVoiceRecording={actions.stopVoiceRecording}
              systemSettings={chat.systemSettings}
              runtimeConfig={chat.runtimeConfig}
              stickerPacks={chat.stickerPacks}
              onSendMessageOrFiles={actions.handleSendMessageOrFiles}
              onSendSticker={actions.handleSendSticker}
              isComposerDisabled={isComposerDisabled}
              blockedBanner={blockedBanner}
              isDark={isDark}
            />
          </div>
        </div>

        <div
          className={`md:hidden shrink-0 border-t flex justify-around p-1.5 shadow-[0_-4px_10px_rgba(0,0,0,0.04)] z-20 h-14 ${
            isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <button
            data-testid="mobile-tab-chat"
            onClick={() => setActiveMobileTab("chat")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-colors cursor-pointer ${
              activeMobileTab === "chat" ? "text-blue-600 bg-blue-50" : "text-gray-500"
            }`}
          >
            <MessageSquare size={20} />
            <span className="text-[10px] font-bold">แชทส่วนรวม</span>
          </button>
          <button
            data-testid="mobile-tab-peers"
            onClick={() => setActiveMobileTab("peers")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-colors cursor-pointer ${
              activeMobileTab === "peers" ? "text-blue-600 bg-blue-50" : "text-gray-500"
            }`}
          >
            <Share2 size={20} />
            <span className="text-[10px] font-bold">LAN Share</span>
          </button>
        </div>

        {lightbox && (
          <LightboxModal
            lightbox={lightbox}
            setLightbox={setLightbox}
            onOpenGrid={() => {
              const curItems = lightbox.items;
              setLightbox(null);
              setAlbumModal((prev) => prev ?? { items: curItems, initialFilter: "media" });
            }}
            onClose={() => setLightbox(null)}
          />
        )}

        {albumModal && (
          <AlbumGalleryModal
            items={albumModal.items.map((item) => {
              if (item.isDeleted || !item.mediaToken) return item;
              for (const m of chat.messages) {
                const match = m.attachments?.find((a) => a.mediaToken === item.mediaToken);
                if (match?.isDeleted) return match;
              }
              return item;
            })}
            initialFilter={albumModal.initialFilter}
            onClose={() => setAlbumModal(null)}
            onOpenLightbox={(visualItems, index) => setLightbox({ items: visualItems, index })}
            onOpenPreviewFile={setPreviewFile}
          />
        )}

        {chat.webrtc.isDirectSendModalOpen && (
          <P2PSendModal
            targetPeer={chat.webrtc.targetPeer}
            selectedFiles={chat.webrtc.selectedFiles}
            duplicateFileNames={chat.webrtc.duplicateFileNames}
            duplicateCountdown={chat.webrtc.duplicateCountdown}
            fileError={chat.webrtc.fileError}
            errorCountdown={chat.webrtc.errorCountdown}
            isWaitingForReply={chat.webrtc.isWaitingForReply}
            isTransferring={chat.webrtc.isTransferring}
            isTransferCancelled={chat.webrtc.isTransferCancelled}
            transfers={chat.webrtc.transfers}
            onFileSelect={chat.webrtc.handleDirectFileSelect}
            onRemoveFile={chat.webrtc.removeSelectedFile}
            onStartSend={chat.webrtc.startSendingFiles}
            onCancelTransfer={chat.webrtc.cancelOutgoingTransfer}
            onClose={chat.webrtc.closeDirectSendModal}
          />
        )}

        {chat.webrtc.incomingRequest && (
          <P2PReceiveModal
            incomingRequest={chat.webrtc.incomingRequest}
            isReceiving={chat.webrtc.isReceiving}
            isTransferCancelled={chat.webrtc.isTransferCancelled}
            transferTransport={chat.webrtc.transferTransport}
            transfers={chat.webrtc.transfers}
            completedDownloads={chat.webrtc.completedDownloads}
            onAccept={chat.webrtc.handleAcceptTransfer}
            onReject={chat.webrtc.handleRejectTransfer}
            onCancelReceiving={chat.webrtc.handleCancelReceiving}
            onClose={chat.webrtc.closeReceiverModal}
          />
        )}

        {previewFile && <UniversalFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}

        {editHistoryModal && <EditHistoryModal modal={editHistoryModal} onClose={() => setEditHistoryModal(null)} />}

        {actions.confirmDeleteModal && (
          <ConfirmDeleteModal
            modal={actions.confirmDeleteModal}
            editWindowMinutes={chat.systemSettings.editWindowMinutes}
            onClose={() => actions.setConfirmDeleteModal(null)}
            onConfirm={actions.executeConfirmedDelete}
          />
        )}

        {isProfileModalOpen && (
          <ProfileModal
            deviceId={chat.identity.deviceId}
            currentName={chat.identity.name}
            currentAvatarUrl={chat.identity.avatarUrl || resolveFallbackAvatarForName(chat.identity.name)}
            presets={chat.runtimeConfig.avatarPresets}
            onClose={() => setIsProfileModalOpen(false)}
            onSaveProfile={chat.handleSaveProfile}
          />
        )}
      </div>
    </div>
  );
}
