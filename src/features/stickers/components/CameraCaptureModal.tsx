"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Check, RotateCcw, ImagePlus } from "lucide-react";

interface CameraCaptureModalProps {
  onCaptureFile: (file: File) => void;
  onFallbackFilePick: () => void;
  onClose: () => void;
}

export function CameraCaptureModal({
  onCaptureFile,
  onFallbackFilePick,
  onClose,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [isStarting, setIsStarting] = useState(true);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      stopStream();
      setErrorMsg(null);
      setIsStarting(true);

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setIsStarting(false);
        setErrorMsg("เบราว์เซอร์หรือโหมด HTTP ปัจจุบันไม่รองรับการเปิดกล้องสด (ต้องใช้ HTTPS หรือเลือกไฟล์รูปจากเครื่องแทน)");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message ? `ไม่สามารถเข้าถึงกล้องได้: ${err.message}` : "ไม่พบกล้องหรือไม่ได้รับอนุญาตให้ใช้กล้อง");
        }
      } finally {
        if (!cancelled) setIsStarting(false);
      }
    }

    if (!snapshotUrl) {
      startCamera();
    }

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facingMode, snapshotUrl]);

  useEffect(() => {
    return () => {
      stopStream();
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
    };
  }, [snapshotUrl]);

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
        setSnapshotBlob(blob);
        setSnapshotUrl(URL.createObjectURL(blob));
        stopStream();
      },
      "image/jpeg",
      0.92
    );
  };

  const handleUsePhoto = () => {
    if (!snapshotBlob) return;
    const file = new File([snapshotBlob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
    onCaptureFile(file);
    onClose();
  };

  return (
    <div
      data-testid="camera-capture-modal"
      className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <Camera size={18} className="text-blue-600" />
            <span>ถ่ายภาพส่งเข้าห้องแชท</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-black relative flex items-center justify-center min-h-[280px] max-h-[60dvh]">
          {errorMsg ? (
            <div className="p-6 text-center text-white space-y-3 max-w-sm">
              <Camera size={36} className="mx-auto text-slate-400" />
              <p className="text-sm text-slate-200 leading-relaxed">{errorMsg}</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onFallbackFilePick();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
              >
                <ImagePlus size={16} /> เลือกรูปจากเครื่อง / กล้องระบบ
              </button>
            </div>
          ) : snapshotUrl ? (
            <img src={snapshotUrl} alt="Captured photo" className="max-h-[58dvh] w-auto object-contain" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-[58dvh] w-full object-contain"
              />
              {isStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs">
                  กำลังเปิดกล้อง...
                </div>
              )}
            </>
          )}
        </div>

        {!errorMsg && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
            {snapshotUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
                    setSnapshotUrl(null);
                    setSnapshotBlob(null);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={15} /> ถ่ายใหม่
                </button>
                <button
                  type="button"
                  onClick={handleUsePhoto}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Check size={16} /> ใช้รูปนี้แนบแชท
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} /> สลับกล้อง
                </button>
                <button
                  type="button"
                  onClick={takeSnapshot}
                  disabled={isStarting}
                  className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-sm font-bold flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Camera size={17} /> กดถ่ายรูป
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFallbackFilePick();
                  }}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-medium cursor-pointer"
                >
                  เลือกไฟล์แทน
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
