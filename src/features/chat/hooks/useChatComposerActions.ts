"use client";

import { useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type {
  ChatAttachment,
  ChatMessage,
  RuntimeConfig,
  StagedChatFile,
  StickerItem,
  StickerMessageMeta,
  StickerPack,
  SystemSettings,
} from "@/types/chat";
import type { ConfirmDeleteModalState } from "@/features/chat/components/ChatModals";
import { pickSupportedRecorderMime, transcodeAudioBlobToMp3 } from "@/lib/voiceRecorder";

export function useChatComposerActions(params: {
  socket: Socket | null;
  identityRef: React.MutableRefObject<{ deviceId: string; name: string; ip: string }>;
  runtimeConfig: RuntimeConfig;
  systemSettings: SystemSettings;
  canUseMicContext: boolean;
  showToast: (text: string, type?: "info" | "error" | "success") => void;
}) {
  const { socket, identityRef, runtimeConfig, systemSettings, canUseMicContext, showToast } = params;

  const [inputText, setInputText] = useState("");
  const composerRef = useRef<HTMLDivElement>(null);

  const [stagedChatFiles, setStagedChatFiles] = useState<StagedChatFile[]>([]);
  const [chatUploadProgress, setChatUploadProgress] = useState<number | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<ConfirmDeleteModalState | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isEncodingVoice, setIsEncodingVoice] = useState(false);
  const [recordedVoice, setRecordedVoice] = useState<{ file: File; previewUrl: string; durationSec: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordStartMsRef = useRef(0);

  const addFilesToChatStage = (incomingFiles: FileList | File[]) => {
    const arr = Array.from(incomingFiles);
    if (arr.length === 0) return;

    const MAX_PER_FILE = runtimeConfig.maxChatFileBytes;
    const MAX_FILES = runtimeConfig.maxChatFilesBatch || 10;
    const valid: StagedChatFile[] = [];
    const oversized: string[] = [];

    for (const file of arr) {
      if (file.size > MAX_PER_FILE) {
        oversized.push(file.name);
        continue;
      }
      const kind: "image" | "video" | "file" = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";
      const previewUrl = kind === "image" || kind === "video" ? URL.createObjectURL(file) : "";
      valid.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, file, previewUrl, kind });
    }

    if (oversized.length > 0) {
      showToast(`ข้ามไฟล์ขนาดเกิน ${runtimeConfig.maxChatFileSizeMb}MB: ${oversized.join(", ")}`, "error");
    }

    setStagedChatFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        showToast(`เลือกส่งได้สูงสุด ${MAX_FILES} ไฟล์ต่อครั้ง`, "error");
        combined.slice(MAX_FILES).forEach((d) => {
          if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
        });
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  const removeStagedChatFile = (id: string) => {
    setStagedChatFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearAllStagedChatFiles = () => {
    stagedChatFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setStagedChatFiles([]);
  };

  const clearRecordedVoice = () => {
    if (recordedVoice?.previewUrl) URL.revokeObjectURL(recordedVoice.previewUrl);
    setRecordedVoice(null);
  };

  const startVoiceRecording = async () => {
    if (!canUseMicContext || !systemSettings.voiceMessageEnabled || isRecording || isEncodingVoice) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      showToast("เบราว์เซอร์หรือบริบท HTTP ปัจจุบันไม่รองรับไมโครโฟน (กรุณาเปิดผ่าน HTTPS)", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      recordStartMsRef.current = Date.now();
      setRecordSeconds(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);

        const durationSec = Math.max(1, Math.round((Date.now() - recordStartMsRef.current) / 1000));
        const rawBlob = new Blob(recordChunksRef.current, { type: recorder.mimeType || mimeType || "audio/mp4" });
        if (rawBlob.size === 0) return;

        setIsEncodingVoice(true);
        try {
          const mp3File = await transcodeAudioBlobToMp3(rawBlob);
          setRecordedVoice({ file: mp3File, previewUrl: URL.createObjectURL(mp3File), durationSec });
        } finally {
          setIsEncodingVoice(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(Math.max(1, Math.floor((Date.now() - recordStartMsRef.current) / 1000)));
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Permission denied / ต้องใช้ผ่าน HTTPS";
      showToast("ไม่สามารถเปิดไมโครโฟนได้: " + msg, "error");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const isWithinWindow = (msg: ChatMessage) => {
    const createdAt = Number(msg.createdAt) || 0;
    return createdAt > 0 && Date.now() - createdAt <= systemSettings.editWindowMinutes * 60 * 1000;
  };

  const saveEditedMessage = async (msgId: number) => {
    const newText = editingText.trim();
    if (!newText) return showToast("ข้อความต้องไม่ว่างเปล่า", "error");
    const deviceId = localStorage.getItem("deviceId") || identityRef.current.deviceId;
    try {
      const res = await fetch(`/api/messages/${msgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({ text: newText }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || "แก้ไขไม่สำเร็จ", "error");
      setEditingMsgId(null);
      setEditingText("");
      showToast("แก้ไขข้อความแล้ว (บันทึกประวัติไว้เรียบร้อย)", "success");
    } catch {
      showToast("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์", "error");
    }
  };

  const requestAdminDeleteMessage = async (msgId: number) => {
    const deviceId = localStorage.getItem("deviceId") || identityRef.current.deviceId;
    try {
      const res = await fetch(`/api/messages/${msgId}/request-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({ reason: "ผู้ใช้ร้องขอให้แอดมินลบข้อความนี้" }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || "ส่งคำขอลบไม่สำเร็จ", "error");
      showToast("ส่งคำขอลบถึง Admin แล้ว", "info");
    } catch {
      showToast("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์", "error");
    }
  };

  const deleteOwnMessage = async (msgId: number) => {
    const deviceId = localStorage.getItem("deviceId") || identityRef.current.deviceId;
    try {
      const res = await fetch(`/api/messages/${msgId}`, { method: "DELETE", headers: { "x-device-id": deviceId } });
      const data = await res.json();
      if (!res.ok) {
        if (data.requireAdminRequest) await requestAdminDeleteMessage(msgId);
        else showToast(data.error || "ลบไม่สำเร็จ", "error");
        return;
      }
      showToast("ลบข้อความของคุณออกจากห้องแชทแล้ว", "success");
    } catch {
      showToast("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์", "error");
    }
  };

  const openDeleteConfirm = (msg: ChatMessage, attachmentsList: ChatAttachment[], mode: "self" | "request_admin") => {
    if (!msg?.id) return;
    setConfirmDeleteModal({
      msgId: msg.id,
      mode,
      textPreview: (msg.text || "").trim(),
      fileCount: attachmentsList.length,
      fileNames: attachmentsList.map((a) => a.fileName).filter(Boolean),
      isSubmitting: false,
    });
  };

  const executeConfirmedDelete = async () => {
    if (!confirmDeleteModal || confirmDeleteModal.isSubmitting) return;
    const { msgId, mode } = confirmDeleteModal;
    setConfirmDeleteModal((prev) => (prev ? { ...prev, isSubmitting: true } : null));
    try {
      if (mode === "self") await deleteOwnMessage(msgId);
      else await requestAdminDeleteMessage(msgId);
    } finally {
      setConfirmDeleteModal(null);
    }
  };

  const handleSendSticker = (pack: StickerPack, item: StickerItem, customMeta?: StickerMessageMeta) => {
    if (!socket) return;
    const stickerMeta = customMeta || {
      packId: pack.packId,
      stickerId: item.stickerId,
      url: item.url,
      alt: item.alt || item.stickerId,
    };
    socket.emit("send_message", {
      type: "sticker",
      text: stickerMeta.alt || item.alt || item.stickerId,
      stickerMeta,
    });
  };

  const resetInput = () => {
    setInputText("");
    if (composerRef.current) composerRef.current.innerText = "";
  };

  const handleSendMessageOrFiles = async () => {
    if (!socket || chatUploadProgress !== null) return;
    const pendingText = inputText.trim();

    if (recordedVoice && stagedChatFiles.length === 0) {
      const deviceId = localStorage.getItem("deviceId") || identityRef.current.deviceId || "unknown";
      setChatUploadProgress(15);
      try {
        const fd = new FormData();
        fd.append("files", recordedVoice.file);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "x-device-id": deviceId,
            "x-sender-name": encodeURIComponent(identityRef.current.name),
            "x-voice-recording": "1",
          },
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        setChatUploadProgress(100);
        clearRecordedVoice();
        resetInput();
        if (pendingText) socket.emit("send_message", { text: pendingText, type: "text" });
      } catch (err: unknown) {
        showToast("ส่งข้อความเสียงไม่สำเร็จ: " + (err instanceof Error ? err.message : "Unknown error"), "error");
      } finally {
        setChatUploadProgress(null);
      }
      return;
    }

    if (stagedChatFiles.length > 0) {
      const deviceId = localStorage.getItem("deviceId") || identityRef.current.deviceId || "unknown";
      const senderName = identityRef.current.name;
      const totalBatchBytes = stagedChatFiles.reduce((sum, item) => sum + item.file.size, 0);

      setChatUploadProgress(0);
      const controller = new AbortController();
      uploadAbortRef.current = controller;

      try {
        if (totalBatchBytes > 2 * 1024 * 1024 || stagedChatFiles.length > 1) {
          const CHUNK_BYTES = 2 * 1024 * 1024;
          const uploadIds: string[] = [];
          let uploadedBytes = 0;

          for (const item of stagedChatFiles) {
            const f = item.file;
            const uploadId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const totalChunks = Math.max(1, Math.ceil(f.size / CHUNK_BYTES));

            for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
              const start = chunkIdx * CHUNK_BYTES;
              const slice = f.slice(start, start + CHUNK_BYTES);
              const res = await fetch("/api/upload/chunk", {
                method: "POST",
                signal: controller.signal,
                headers: {
                  "Content-Type": "application/octet-stream",
                  "x-upload-id": uploadId,
                  "x-chunk-index": String(chunkIdx),
                  "x-total-chunks": String(totalChunks),
                  "x-file-size": String(f.size),
                  "x-file-name": encodeURIComponent(f.name),
                  "x-mime-type": f.type || "application/octet-stream",
                },
                body: slice,
              });
              if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error || `Chunk ${chunkIdx} failed (${res.status})`);
              }
              uploadedBytes += slice.size;
              setChatUploadProgress(totalBatchBytes > 0 ? Math.min(99, Math.round((uploadedBytes / totalBatchBytes) * 100)) : 99);
            }
            uploadIds.push(uploadId);
          }

          const completeRes = await fetch("/api/upload/complete", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "x-device-id": deviceId,
              "x-sender-name": encodeURIComponent(senderName),
            },
            body: JSON.stringify({ uploadIds, caption: "" }),
          });
          if (!completeRes.ok) {
            const errBody = await completeRes.json().catch(() => ({}));
            throw new Error(errBody.error || `Complete upload failed (${completeRes.status})`);
          }
          setChatUploadProgress(100);
        } else {
          const formData = new FormData();
          stagedChatFiles.forEach((item) => formData.append("files", item.file));
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/upload");
            xhr.setRequestHeader("x-device-id", deviceId);
            xhr.setRequestHeader("x-sender-name", encodeURIComponent(senderName));
            controller.signal.addEventListener("abort", () => xhr.abort());
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) setChatUploadProgress(Math.round((ev.loaded / ev.total) * 100));
            };
            xhr.onload = () => {
              if (xhr.status === 200) resolve();
              else {
                try {
                  reject(new Error(JSON.parse(xhr.responseText).error || xhr.responseText));
                } catch {
                  reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
                }
              }
            };
            xhr.onerror = () => reject(new Error("Network error"));
            xhr.onabort = () => reject(new Error("ยกเลิกการอัปโหลด"));
            xhr.send(formData);
          });
        }

        clearAllStagedChatFiles();
        resetInput();
        if (pendingText) socket.emit("send_message", { text: pendingText, type: "text" });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        const errName = err instanceof Error ? err.name : "";
        if (errName === "AbortError" || errMsg === "ยกเลิกการอัปโหลด") {
          showToast("ยกเลิกการอัปโหลดแล้ว", "info");
        } else {
          showToast("อัปโหลดไม่สำเร็จ: " + errMsg, "error");
        }
      } finally {
        uploadAbortRef.current = null;
        setChatUploadProgress(null);
      }
      return;
    }

    if (!pendingText) return;
    socket.emit("send_message", { text: pendingText, type: "text" });
    resetInput();
  };

  return {
    inputText,
    setInputText,
    composerRef,
    stagedChatFiles,
    addFilesToChatStage,
    removeStagedChatFile,
    clearAllStagedChatFiles,
    chatUploadProgress,
    onCancelUpload: () => uploadAbortRef.current?.abort(),
    editingMsgId,
    setEditingMsgId,
    editingText,
    setEditingText,
    confirmDeleteModal,
    setConfirmDeleteModal,
    isRecording,
    recordSeconds,
    isEncodingVoice,
    recordedVoice,
    clearRecordedVoice,
    startVoiceRecording,
    stopVoiceRecording,
    isWithinWindow,
    saveEditedMessage,
    openDeleteConfirm,
    executeConfirmedDelete,
    handleSendSticker,
    handleSendMessageOrFiles,
  };
}
