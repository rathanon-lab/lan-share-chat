"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Camera, ChevronRight, File as FileIcon, Image as ImageIcon,
  Keyboard, Lock, Menu, Mic, Plus, SendHorizontal, Shield, Smile,
  Square, Trash2, Video, Volume2, X
} from "lucide-react";
import type {
  PeerInfo,
  RuntimeConfig,
  StagedChatFile,
  StickerItem,
  StickerMessageMeta,
  StickerPack,
  SystemSettings,
} from "@/types/chat";
import { CameraCaptureModal } from "@/features/stickers/components/CameraCaptureModal";
import { DockedStickerPreviewTray } from "@/features/stickers/components/DockedStickerPreviewTray";
import {
  type DockedStickerDraft,
  draftBuildMessagePayload,
  draftSelectSticker,
} from "@/features/stickers/lib/stickerDraft";

const EmojiStickerPicker = dynamic(
  () => import("@/features/stickers/components/EmojiStickerPicker").then((m) => m.EmojiStickerPicker),
  { ssr: false }
);

interface ChatComposerProps {
  inputText: string;
  setInputText: (val: string) => void;
  composerRef: React.RefObject<HTMLDivElement | null>;
  mentionCandidates: PeerInfo[];
  mentionQuery: string | null;
  mentionDismissed: boolean;
  setMentionDismissed: (v: boolean) => void;
  stagedChatFiles: StagedChatFile[];
  addFilesToChatStage: (files: FileList | File[]) => void;
  removeStagedChatFile: (id: string) => void;
  clearAllStagedChatFiles: () => void;
  chatUploadProgress: number | null;
  onCancelUpload: () => void;
  recordedVoice: { file: File; previewUrl: string; durationSec: number } | null;
  clearRecordedVoice: () => void;
  isRecording: boolean;
  recordSeconds: number;
  isEncodingVoice: boolean;
  canUseMicContext: boolean;
  startVoiceRecording: () => void;
  stopVoiceRecording: () => void;
  systemSettings: SystemSettings;
  runtimeConfig: RuntimeConfig;
  stickerPacks: StickerPack[];
  onSendMessageOrFiles: () => void;
  onSendSticker: (pack: StickerPack, item: StickerItem, customMeta?: StickerMessageMeta) => void;
  isComposerDisabled?: boolean;
  blockedBanner?: string | null;
  isDark?: boolean;
}

export function ChatComposer({
  inputText,
  setInputText,
  composerRef,
  mentionCandidates,
  mentionQuery,
  mentionDismissed,
  setMentionDismissed,
  stagedChatFiles,
  addFilesToChatStage,
  removeStagedChatFile,
  clearAllStagedChatFiles,
  chatUploadProgress,
  onCancelUpload,
  recordedVoice,
  clearRecordedVoice,
  isRecording,
  recordSeconds,
  isEncodingVoice,
  canUseMicContext,
  startVoiceRecording,
  stopVoiceRecording,
  systemSettings,
  runtimeConfig,
  stickerPacks,
  onSendMessageOrFiles,
  onSendSticker,
  isComposerDisabled = false,
  blockedBanner = null,
  isDark = false,
}: ChatComposerProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'sticker'>('sticker');
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [toolsExpandedWhileTyping, setToolsExpandedWhileTyping] = useState(false);
  const [stagedDockedSticker, setStagedDockedSticker] = useState<DockedStickerDraft | null>(null);

  const isDockedPreviewMode = systemSettings.stickerPreviewMode === "docked_tray";
  const isCollageEnabled = systemSettings.stickerCollageEnabled !== false;
  const activeDockedDraft = isDockedPreviewMode && !isComposerDisabled ? stagedDockedSticker : null;

  const chatMediaInputRef = useRef<HTMLInputElement>(null);
  const chatAnyFileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inputText.trim()) setToolsExpandedWhileTyping(false);
  }, [inputText]);

  const canSendChat =
    !isComposerDisabled &&
    (inputText.trim().length > 0 || stagedChatFiles.length > 0 || recordedVoice !== null || activeDockedDraft !== null) &&
    chatUploadProgress === null &&
    !isRecording &&
    !isEncodingVoice;

  const sendActiveDockedDraft = () => {
    if (!activeDockedDraft) return;
    const payload = draftBuildMessagePayload(activeDockedDraft);
    if (!payload) return;
    onSendSticker(payload.pack, payload.item, payload.customMeta);
    setStagedDockedSticker(null);
  };

  const handlePrimarySendClick = () => {
    if (
      activeDockedDraft &&
      !inputText.trim() &&
      stagedChatFiles.length === 0 &&
      recordedVoice === null
    ) {
      sendActiveDockedDraft();
      return;
    }
    onSendMessageOrFiles();
  };

  const isTyping = inputText.trim().length > 0;
  const collapseToolsOnMobile = isTyping && !toolsExpandedWhileTyping;

  const insertTextIntoComposer = (insertStr: string) => {
    const el = composerRef.current;
    if (!el) {
      setInputText(inputText + insertStr);
      return;
    }
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(insertStr);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);
      const next = (el.innerText || "").replace(/\r\n/g, "\n").replace(/^\n$/, "");
      setInputText(next);
    } else {
      const next = (el.innerText || "") + insertStr;
      el.innerText = next;
      setInputText(next);
      // Move caret to end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const applyMentionSuggestion = (mentionToken: string) => {
    const updated = inputText.replace(/(?:^|\s)@([^\s@]{0,24})$/, (m) => {
      const leading = m.startsWith(" ") || m.startsWith("\n") ? m[0] : "";
      return `${leading}@${mentionToken} `;
    });
    setInputText(updated);
    if (composerRef.current) {
      composerRef.current.innerText = updated;
      composerRef.current.focus();
    }
    setMentionDismissed(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && mentionQuery !== null) {
      e.preventDefault();
      setMentionDismissed(true);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSendChat) onSendMessageOrFiles();
    }
  };

  const handleChatBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    const native = e.nativeEvent as InputEvent;
    if (native.inputType === "insertLineBreak" || native.inputType === "insertParagraph") {
      e.preventDefault();
      if (canSendChat) onSendMessageOrFiles();
    }
  };

  const handleChatPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardFiles = e.clipboardData?.files;
    if (clipboardFiles && clipboardFiles.length > 0) {
      e.preventDefault();
      addFilesToChatStage(clipboardFiles);
    }
  };

  const handleCameraClick = () => {
    // On mobile touch viewports (< 768px), native capture="environment" launches the phone camera directly cleanly over HTTP or HTTPS
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      mobileCameraInputRef.current?.click();
    } else {
      setIsCameraModalOpen(true);
    }
  };

  return (
    <div className={`relative border-t shrink-0 flex flex-col ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-gray-200'}`}>
      <DockedStickerPreviewTray
        draft={activeDockedDraft}
        setDraft={setStagedDockedSticker}
        collageEnabled={isCollageEnabled}
        onSend={sendActiveDockedDraft}
        onClose={() => setStagedDockedSticker(null)}
      />
      {blockedBanner && (
        <div
          data-testid="composer-blocked-banner"
          className={`px-4 py-2 border-b text-xs font-semibold flex items-center justify-center gap-2 ${
            isDark
              ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <Lock size={13} className={`shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <span>{blockedBanner}</span>
        </div>
      )}
      <div className={`p-2.5 md:px-4 md:py-3 ${isComposerDisabled ? 'opacity-60 pointer-events-none select-none' : ''}`}>
        {/* Upload Progress Bar */}
        {chatUploadProgress !== null && (
          <div className="mb-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold text-blue-700 mb-1">
                <span>กำลังอัปโหลดไฟล์เข้าห้องแชท...</span>
                <span>{chatUploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-150"
                  style={{ width: `${chatUploadProgress}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelUpload}
              className="text-xs font-bold text-red-600 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              ยกเลิก
            </button>
          </div>
        )}

        {/* Voice Note MP3 Preview Strip */}
        {recordedVoice && (
          <div className="mb-2.5 p-2.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Volume2 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-blue-900 mb-1 flex items-center gap-2">
                <span>ข้อความเสียง (.mp3 พร้อมส่ง · {recordedVoice.durationSec}s)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-blue-700 border border-blue-200">
                  Cross-Browser MP3
                </span>
              </div>
              <audio src={recordedVoice.previewUrl} controls className="w-full h-8" />
            </div>
            <button
              type="button"
              onClick={clearRecordedVoice}
              className="p-2 rounded-full hover:bg-red-100 text-red-600 shrink-0 cursor-pointer"
              title="ลบเสียงที่บันทึก"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {isEncodingVoice && (
          <div className="mb-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
            กำลังแปลงไฟล์เสียงเป็น .mp3 เพื่อเล่นได้บน iOS / Safari / Chrome...
          </div>
        )}

        {/* Multi-File Staging Tray */}
        {stagedChatFiles.length > 0 && (
          <div className="mb-2.5 p-2.5 bg-gray-50 border border-gray-200 rounded-2xl">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-gray-600">
                รอส่ง {stagedChatFiles.length}/{runtimeConfig.maxChatFilesBatch} ไฟล์
              </span>
              <button
                type="button"
                onClick={clearAllStagedChatFiles}
                className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} /> ล้างทั้งหมด
              </button>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {stagedChatFiles.map((item) => (
                <div
                  key={item.id}
                  className="relative shrink-0 w-20 h-20 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm group"
                >
                  {item.kind === 'image' && (
                    <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                  )}
                  {item.kind === 'video' && (
                    <div className="relative w-full h-full bg-black flex items-center justify-center">
                      <video src={item.previewUrl} className="w-full h-full object-cover opacity-80" muted />
                      <Video size={20} className="text-white absolute" />
                    </div>
                  )}
                  {item.kind === 'file' && (
                    <div className="w-full h-full flex flex-col items-center justify-center p-1.5 bg-blue-50/70 text-center">
                      <FileIcon size={20} className="text-blue-600 mb-1 shrink-0" />
                      <span className="text-[10px] font-semibold text-gray-700 line-clamp-2 break-all leading-tight">
                        {item.file.name}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeStagedChatFile(item.id)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {stagedChatFiles.length < runtimeConfig.maxChatFilesBatch && (
                <button
                  type="button"
                  onClick={() => chatAnyFileInputRef.current?.click()}
                  className="shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/60 text-gray-400 hover:text-blue-600 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="เพิ่มไฟล์อีก"
                >
                  <Plus size={20} />
                  <span className="text-[10px] font-semibold">เพิ่มอีก</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Composer Controls Container */}
        <div className="relative">
          {/* @mention Autocomplete Popup */}
          {mentionQuery !== null && !mentionDismissed && (
            <div
              data-testid="mention-autocomplete-popup"
              className="absolute bottom-full left-2 mb-2 bg-white border border-gray-200 rounded-2xl shadow-xl py-1.5 w-72 max-w-[90vw] z-40 overflow-hidden"
            >
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                แท็กในห้องแชท (@mention)
              </div>
              {('admin'.includes(mentionQuery) || mentionQuery === '') && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyMentionSuggestion('admin');
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-bold text-red-600">
                    <Shield size={14} /> @admin
                  </span>
                  <span className="text-[10px] text-gray-500">แจ้งแอดมินทันที</span>
                </button>
              )}
              {mentionCandidates.map((p) => (
                <button
                  key={p.deviceId}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyMentionSuggestion(p.name);
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span className="font-semibold text-gray-800 truncate">@{p.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{p.ip}</span>
                </button>
              ))}
            </div>
          )}

          {/* Hidden File Inputs */}
          <input
            ref={chatMediaInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFilesToChatStage(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={chatAnyFileInputRef}
            type="file"
            multiple
            accept="*/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFilesToChatStage(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={mobileCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFilesToChatStage(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Bottom Composer Row: [ + 📷 🖼️ ] | [ Input Pill + 😊 ] | [ 🎤 / ➤ ] */}
          <div className="flex items-end gap-1.5 sm:gap-2">
            {/* Collapsible Narrow Mobile Expand Trigger (`≡ >`) */}
            {collapseToolsOnMobile && (
              <button
                type="button"
                data-testid="composer-expand-tools-btn"
                onClick={() => setToolsExpandedWhileTyping(true)}
                title="เปิดปุ่มแนบไฟล์และกล้อง"
                className="sm:hidden flex items-center gap-0.5 px-2 h-10 rounded-full text-gray-600 hover:bg-gray-100 border border-gray-200 shrink-0 cursor-pointer"
              >
                <Menu size={16} />
                <ChevronRight size={14} />
              </button>
            )}

            {/* Quick Action Icons: [+ All Files] [📷 Camera] [🖼️ Gallery] */}
            <div
              className={`items-center gap-0.5 sm:gap-1 shrink-0 pb-0.5 ${
                collapseToolsOnMobile ? 'hidden sm:flex' : 'flex'
              }`}
            >
              {/* + Direct All-File Attachment Picker */}
              <button
                type="button"
                data-testid="composer-attach-btn"
                onClick={() => chatAnyFileInputRef.current?.click()}
                className="p-2 md:p-2.5 rounded-full text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors cursor-pointer"
                title={`แนบไฟล์ทุกประเภท (สูงสุด ${runtimeConfig.maxChatFilesBatch} ไฟล์ / ${runtimeConfig.maxChatFileSizeMb}MB)`}
              >
                <Plus size={19} />
              </button>

              {/* 📷 Camera Button */}
              <button
                type="button"
                data-testid="composer-camera-btn"
                onClick={handleCameraClick}
                className="p-2 md:p-2.5 rounded-full text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors cursor-pointer"
                title="ถ่ายรูปส่งเข้าห้องแชท"
              >
                <Camera size={19} />
              </button>

              {/* 🖼️ Quick Gallery Picker */}
              <button
                type="button"
                data-testid="composer-gallery-btn"
                onClick={() => chatMediaInputRef.current?.click()}
                className="p-2 md:p-2.5 rounded-full text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors cursor-pointer"
                title="เลือกรูปภาพหรือวิดีโอหลายไฟล์"
              >
                <ImageIcon size={19} />
              </button>
            </div>

            {/* Center Input Pill (`contentEditable` + Inline 😊/⌨️ Emoji/Sticker Toggle) */}
            <div
              className={`flex-1 min-w-0 border focus-within:border-blue-500 focus-within:ring-2 rounded-3xl flex items-end pl-3.5 pr-1.5 transition-all ${
                isDark
                  ? 'bg-slate-800 border-slate-700 focus-within:bg-slate-800 focus-within:ring-blue-900/50'
                  : 'bg-gray-100 border-transparent focus-within:bg-white focus-within:ring-blue-100'
              }`}
            >
              <div
                ref={composerRef}
                role="textbox"
                aria-multiline="true"
                contentEditable={isComposerDisabled ? false : "plaintext-only"}
                suppressContentEditableWarning
                data-testid="chat-composer"
                data-placeholder={
                  isComposerDisabled
                    ? "ถูกจำกัดการส่งชั่วคราว..."
                    : isRecording
                      ? `กำลังอัดเสียง (${recordSeconds} วินาที)... กดปุ่มหยุดเมื่อเสร็จ`
                      : "พิมพ์ข้อความ..."
                }
                onInput={(e) => {
                  const txt = (e.currentTarget.innerText || "").replace(/\r\n/g, "\n").replace(/^\n$/, "");
                  setInputText(txt);
                  setMentionDismissed(false);
                }}
                onBeforeInput={handleChatBeforeInput}
                onKeyDown={handleKeyDown}
                onPaste={handleChatPaste}
                className={`chat-editable flex-1 min-w-0 bg-transparent max-h-32 overflow-y-auto min-h-[40px] md:min-h-[42px] py-2.5 px-0.5 text-sm outline-none whitespace-pre-wrap break-words ${
                  isDark ? 'text-slate-100' : 'text-gray-800'
                }`}
              />

              {/* Inside Pill: Toggle Emoji & Sticker Tray */}
              <button
                type="button"
                data-testid="composer-emoji-btn"
                onClick={() => setIsPickerOpen((v) => !v)}
                title={isPickerOpen ? "ซ่อนถาดอีโมจิและสติกเกอร์" : "เปิดอีโมจิและสติกเกอร์"}
                className={`mb-1 p-2 rounded-full shrink-0 transition-colors cursor-pointer ${
                  isPickerOpen
                    ? isDark
                      ? 'bg-blue-900/70 text-blue-300'
                      : 'bg-blue-100 text-blue-600'
                    : isDark
                      ? 'text-slate-400 hover:text-blue-300 hover:bg-slate-700'
                      : 'text-gray-500 hover:text-blue-600 hover:bg-gray-200/70'
                }`}
              >
                {isPickerOpen ? <Keyboard size={18} /> : <Smile size={18} />}
              </button>
            </div>

            {/* Right Action Area: Mic + Send */}
            <div className="flex items-center gap-1 pb-0.5 shrink-0">
              {systemSettings.voiceMessageEnabled && (
                isRecording ? (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    data-testid="voice-stop-btn"
                    className="px-2.5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 flex items-center gap-1.5 text-xs font-bold animate-pulse cursor-pointer"
                    title="หยุดอัดเสียง"
                  >
                    <Square size={13} fill="white" /> {recordSeconds}s
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    disabled={!canUseMicContext || isEncodingVoice || chatUploadProgress !== null}
                    data-testid="voice-record-btn"
                    className={`p-2 md:p-2.5 rounded-full transition-colors cursor-pointer ${
                      !canUseMicContext
                        ? 'text-gray-300 bg-gray-100/80 cursor-not-allowed opacity-60'
                        : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                    }`}
                    title={
                      canUseMicContext
                        ? 'บันทึกเสียงส่งเข้าแชท (.mp3 รองรับทุก OS/Safari)'
                        : 'ปิดใช้งานชั่วคราวบน HTTP (กรุณาเข้าผ่าน HTTPS / Reverse Proxy เพื่อใช้ไมโครโฟน)'
                    }
                  >
                    <Mic size={19} />
                  </button>
                )
              )}

              <button
                type="button"
                data-testid="chat-send-btn"
                onClick={handlePrimarySendClick}
                disabled={!canSendChat}
                className={`p-2.5 md:p-3 rounded-full flex items-center justify-center transition-all ${
                  canSendChat
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg cursor-pointer'
                    : isDark
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <SendHorizontal size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Emoji & Sticker Drawer */}
      {isPickerOpen && !isComposerDisabled && (
        <EmojiStickerPicker
          packs={stickerPacks}
          initialTab={pickerTab}
          isDark={isDark}
          previewMode={systemSettings.stickerPreviewMode || "fullscreen_modal"}
          collageEnabled={isCollageEnabled}
          gifMode={systemSettings.stickerPickerGifMode || "live_viewport"}
          onSelectEmoji={(char) => {
            setPickerTab('emoji');
            insertTextIntoComposer(char);
          }}
          onSendSticker={(pack, item) => {
            setPickerTab('sticker');
            onSendSticker(pack, item);
          }}
          onStageStickerForTray={(pack, item, enterCollage) => {
            setPickerTab('sticker');
            setStagedDockedSticker((prev) =>
              draftSelectSticker(prev, pack, item, Boolean(enterCollage), isCollageEnabled)
            );
          }}
          onClose={() => setIsPickerOpen(false)}
          showAdminShortcut
        />
      )}

      {/* Desktop Camera Snapshot Modal */}
      {isCameraModalOpen && (
        <CameraCaptureModal
          onCaptureFile={(file) => addFilesToChatStage([file])}
          onFallbackFilePick={() => chatMediaInputRef.current?.click()}
          onClose={() => setIsCameraModalOpen(false)}
        />
      )}
    </div>
  );
}
