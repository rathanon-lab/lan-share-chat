"use client";

import { useRef, useState } from "react";
import { validateUploadFileName } from "@/lib/fileNameGuard";
import { pickSupportedRecorderMime, transcodeAudioBlobToMp3 } from "@/lib/voiceRecorder";

export interface StagedAdminAttachment {
  id: string;
  file: File;
  url: string;
  type: "image" | "video" | "file";
}

export function useAdminComposerMedia(params: {
  token: string;
  maxUploadMb: number;
  notify: (text: string, type?: "success" | "error") => void;
  onUploadSuccess: () => Promise<void>;
}) {
  const { token, maxUploadMb, notify, onUploadSuccess } = params;

  const [adminMessage, setAdminMessage] = useState("");
  const [attachPreviews, setAttachPreviews] = useState<StagedAdminAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isEncodingVoice, setIsEncodingVoice] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [recordedVoice, setRecordedVoice] = useState<{
    file: File;
    previewUrl: string;
    durationSec: number;
  } | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordStartMsRef = useRef(0);

  function clearRecordedVoice() {
    setRecordedVoice((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  function clearAllAttachPreviews() {
    setAttachPreviews((prev) => {
      prev.forEach((p) => {
        if (p.url) URL.revokeObjectURL(p.url);
      });
      return [];
    });
  }

  async function startRecording(voiceEnabled: boolean, canUseMicContext: boolean) {
    if (!canUseMicContext || !voiceEnabled || isRecording || isEncodingVoice) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        notify("ต้องเปิดผ่าน HTTPS หรือ localhost เพื่ออัดเสียงไมโครโฟน", "error");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recordStartMsRef.current = Date.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) {
          clearInterval(recTimerRef.current);
          recTimerRef.current = null;
        }
        setIsRecording(false);
        setRecordSec(0);
        const durationSec = Math.max(1, Math.round((Date.now() - recordStartMsRef.current) / 1000));
        const rawBlob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/mp4" });
        if (rawBlob.size === 0) return;

        setIsEncodingVoice(true);
        try {
          const voiceFile = await transcodeAudioBlobToMp3(rawBlob);
          setRecordedVoice((prev) => {
            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            return { file: voiceFile, previewUrl: URL.createObjectURL(voiceFile), durationSec };
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          notify("แปลงไฟล์เสียง MP3 ไม่สำเร็จ: " + msg, "error");
        } finally {
          setIsEncodingVoice(false);
        }
      };
      mediaRecRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordSec(0);
      recTimerRef.current = setInterval(() => {
        setRecordSec(Math.max(1, Math.floor((Date.now() - recordStartMsRef.current) / 1000)));
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify("ไม่สามารถเปิดไมโครโฟนได้: " + msg, "error");
    }
  }

  function stopRecording() {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
  }

  function cancelAdminUpload() {
    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort();
      uploadXhrRef.current = null;
    }
    setUploadProgress(null);
  }

  async function uploadAdminFiles(filesToUpload: File[], caption?: string, isVoiceRecording = false) {
    try {
      setUploadProgress(0);
      const formData = new FormData();
      filesToUpload.forEach((f) => formData.append("files", f));
      if (caption) formData.append("caption", caption);

      const xhr = new XMLHttpRequest();
      uploadXhrRef.current = xhr;
      xhr.open("POST", "/api/admin/upload_file");
      xhr.setRequestHeader("x-admin-token", token);
      if (isVoiceRecording) xhr.setRequestHeader("x-voice-recording", "1");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = async () => {
        uploadXhrRef.current = null;
        setUploadProgress(null);
        if (xhr.status === 200) {
          clearAllAttachPreviews();
          clearRecordedVoice();
          setAdminMessage("");
          notify(isVoiceRecording ? "ส่งข้อความเสียง MP3 แล้ว" : `ส่งไฟล์แล้ว (${filesToUpload.length} ไฟล์)`);
          await onUploadSuccess();
        } else {
          notify("เกิดข้อผิดพลาดในการอัปโหลด", "error");
        }
      };
      xhr.onabort = () => {
        uploadXhrRef.current = null;
        setUploadProgress(null);
        notify("ยกเลิกการอัปโหลดแล้ว", "error");
      };
      xhr.onerror = () => {
        uploadXhrRef.current = null;
        setUploadProgress(null);
        notify("เกิดข้อผิดพลาดในการอัปโหลด", "error");
      };
      xhr.send(formData);
    } catch (e: unknown) {
      uploadXhrRef.current = null;
      setUploadProgress(null);
      notify(e instanceof Error ? e.message : "เกิดข้อผิดพลาด", "error");
    }
  }

  function addAdminFiles(selectedFiles: FileList | File[]) {
    const selected = Array.from(selectedFiles);
    if (selected.length === 0) return;
    const maxBytes = maxUploadMb * 1024 * 1024;
    const valid = selected.filter((f) => {
      const nameCheck = validateUploadFileName(f.name);
      if (!nameCheck.valid) {
        notify(nameCheck.reason || `ชื่อไฟล์ "${f.name}" ไม่ถูกต้อง`, "error");
        return false;
      }
      if (f.size > maxBytes) {
        notify(`ข้ามไฟล์ "${f.name}" เนื่องจากมีขนาดเกิน ${maxUploadMb}MB`, "error");
        return false;
      }
      return true;
    });
    const newItems: StagedAdminAttachment[] = valid.map((file) => {
      const type: "image" | "video" | "file" = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";
      const url = type === "image" || type === "video" ? URL.createObjectURL(file) : "";
      return { id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, file, url, type };
    });
    setAttachPreviews((prev) => {
      const next = [...prev, ...newItems];
      if (next.length > 10) notify("เลือกส่งได้สูงสุด 10 ไฟล์ต่อครั้ง", "error");
      return next.slice(0, 10);
    });
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addAdminFiles(e.target.files);
    e.target.value = "";
  }

  function removeAttachPreview(id: string) {
    setAttachPreviews((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found?.url) URL.revokeObjectURL(found.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  return {
    adminMessage,
    setAdminMessage,
    attachPreviews,
    uploadProgress,
    isRecording,
    isEncodingVoice,
    recordSec,
    recordedVoice,
    clearRecordedVoice,
    clearAllAttachPreviews,
    startRecording,
    stopRecording,
    cancelAdminUpload,
    uploadAdminFiles,
    addAdminFiles,
    handleFilesSelected,
    removeAttachPreview,
  };
}
