"use client";

import { useRef } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, File as FileIcon, FileUp,
  Image as ImageIcon, Paperclip, Video, X, XCircle
} from "lucide-react";
import type { PeerInfo, TransferItem } from "@/types/chat";
import { formatBytes } from "@/features/chat/lib/formatters";

interface P2PSendModalProps {
  targetPeer: PeerInfo | null;
  selectedFiles: File[];
  duplicateFileNames: string[];
  duplicateCountdown: number;
  fileError: string;
  errorCountdown: number;
  isWaitingForReply: boolean;
  isTransferring: boolean;
  isTransferCancelled: boolean;
  transfers: TransferItem[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (fileName: string) => void;
  onStartSend: () => void;
  onCancelTransfer: () => void;
  onClose: () => void;
}

export function P2PSendModal({
  targetPeer,
  selectedFiles,
  duplicateFileNames,
  duplicateCountdown,
  fileError,
  errorCountdown,
  isWaitingForReply,
  isTransferring,
  isTransferCancelled,
  transfers,
  onFileSelect,
  onRemoveFile,
  onStartSend,
  onCancelTransfer,
  onClose,
}: P2PSendModalProps) {
  const p2pMediaInputRef = useRef<HTMLInputElement>(null);
  const p2pAnyFileInputRef = useRef<HTMLInputElement>(null);

  const targetPeerKey = targetPeer ? targetPeer.deviceId || targetPeer.ip : '';
  const myUploadTransfers = transfers.filter(
    (t) => targetPeer && (t.peerKey ? t.peerKey === targetPeerKey : t.peerName === targetPeer.name) && t.direction === 'upload'
  );
  const isUploadFinished =
    myUploadTransfers.length > 0 &&
    myUploadTransfers.length === selectedFiles.length &&
    myUploadTransfers.every((t) => t.status === 'completed' || t.status === 'error');

  return (
    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <FileUp size={18} className="text-blue-600" />
            ส่งโดยตรง (P2P) ไปที่ {targetPeer?.name}
          </h3>
          {!(isWaitingForReply || isTransferring) && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 hover:bg-gray-200 p-1.5 rounded-full transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-4 md:p-6 flex flex-col gap-4 overflow-y-auto relative">
          {isTransferCancelled ? (
            <div className="flex flex-col w-full max-h-full">
              <div className="flex flex-col items-center justify-center text-center w-full mb-4 shrink-0 mt-4">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <XCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">ยกเลิกการส่ง</h3>
                <p className="text-sm text-gray-500">การส่งไฟล์ถูกยกเลิกแล้ว</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-gray-100 text-gray-800 rounded-xl font-bold hover:bg-gray-200 transition-colors shrink-0 mt-auto cursor-pointer"
              >
                ปิด
              </button>
            </div>
          ) : isUploadFinished ? (
            <div className="flex flex-col w-full max-h-full">
              <div className="flex flex-col items-center justify-center text-center w-full mb-4 shrink-0 mt-4">
                <div className="w-16 h-16 bg-green-500 text-white rounded-xl flex items-center justify-center mb-4 shadow-md">
                  <CheckCircle2 size={36} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">ส่งไฟล์สำเร็จ!</h3>
                <p className="text-sm text-gray-500">ส่งไฟล์ทั้งหมด ({selectedFiles.length} ไฟล์) เรียบร้อยแล้ว</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm shrink-0 mt-auto cursor-pointer"
              >
                ตกลง
              </button>
            </div>
          ) : isTransferring ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4 shadow-inner ring-4 ring-white shrink-0">
                <FileUp size={32} className="animate-bounce" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1 shrink-0">กำลังส่งไฟล์ P2P</h3>
              <p className="text-sm text-gray-500 mb-4 shrink-0">กำลังส่งไปยัง {targetPeer?.name}</p>

              {(() => {
                const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
                const uploadedSize = myUploadTransfers.reduce((sum, t) => sum + t.fileSize * (t.progress / 100), 0);
                const totalProgress = totalSize > 0 ? Math.round((uploadedSize / totalSize) * 100) : 0;

                return (
                  <div className="w-full flex flex-col gap-2 mb-4 shrink-0">
                    <div className="flex justify-between items-center text-sm font-bold text-blue-600">
                      <span>ภาพรวมการส่ง...</span>
                      <span>{totalProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${totalProgress}%` }}></div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex-1 overflow-y-auto w-full bg-gray-50 rounded-xl border border-gray-100 p-2 mb-4 min-h-[150px]">
                {selectedFiles.map((f, i) => {
                  const t = myUploadTransfers.find((tx) => tx.fileName === f.name);
                  const progress = t ? t.progress : 0;
                  const status = t ? t.status : 'pending';

                  return (
                    <div key={i} className="flex flex-col gap-1.5 p-3 bg-white rounded-lg border border-gray-100 shadow-sm mb-2 text-left">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-800 truncate pr-2">{f.name}</span>
                        {status === 'completed' ? (
                          <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                        ) : status === 'transferring' ? (
                          <span className="text-xs font-bold text-blue-600 shrink-0">{progress}%</span>
                        ) : (
                          <Clock size={16} className="text-gray-400 shrink-0" />
                        )}
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${status === 'completed' ? 100 : progress}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={onCancelTransfer}
                className="px-6 py-3 w-full bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors shrink-0 cursor-pointer"
              >
                ยกเลิกการส่ง
              </button>
            </div>
          ) : isWaitingForReply ? (
            <div className="flex flex-col w-full max-h-full">
              <div className="flex flex-col items-center justify-center text-center w-full mb-4 shrink-0 mt-4">
                <div className="text-5xl mb-4">⏳</div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">กำลังรอการตอบกลับ</h3>
                <p className="text-sm text-gray-500">กำลังขอส่งไฟล์ไปยังเครื่องปลายทาง...</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-gray-100 text-gray-800 rounded-xl font-bold hover:bg-gray-200 transition-colors shrink-0 mt-auto cursor-pointer"
              >
                ยกเลิกการส่ง
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => p2pMediaInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 transition-colors cursor-pointer"
                  >
                    <ImageIcon size={16} />
                    เลือกรูปภาพ / วิดีโอ (หลายไฟล์)
                  </button>
                  <button
                    type="button"
                    onClick={() => p2pAnyFileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs border border-purple-200 transition-colors cursor-pointer"
                  >
                    <Paperclip size={16} />
                    เลือกไฟล์ทุกประเภท (หลายไฟล์)
                  </button>
                </div>

                <input ref={p2pMediaInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={onFileSelect} />
                <input ref={p2pAnyFileInputRef} type="file" multiple accept="*/*" className="hidden" onChange={onFileSelect} />

                <div className="border-2 border-dashed border-blue-200 rounded-xl p-5 flex flex-col items-center justify-center gap-2 bg-blue-50/30 hover:bg-blue-50/50 transition-colors relative cursor-pointer group shrink-0">
                  <input type="file" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={onFileSelect} />
                  <div className="bg-blue-100 text-blue-600 p-2.5 rounded-full group-hover:scale-110 transition-transform">
                    <Paperclip size={22} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-700 text-sm">คลิกหรือลากหลายไฟล์มาวางรวมกันที่นี่</p>
                    <p className="text-xs text-gray-500 mt-0.5">รวมรูป วิดีโอ และไฟล์ได้สูงสุด 10 ไฟล์</p>
                  </div>
                </div>

                {fileError && (
                  <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl border border-red-100 font-medium flex flex-col items-center justify-center text-center gap-1.5 shadow-sm w-full">
                    {fileError.split('\n').map((msg, idx) => (
                      <span key={idx} className="leading-relaxed">{msg.replace('⚠️ ', '')}</span>
                    ))}
                    {errorCountdown > 0 && (
                      <span className="text-xs text-red-500 mt-1">ข้อความจะหายไปใน {errorCountdown}</span>
                    )}
                  </div>
                )}

                {selectedFiles.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex-1 flex flex-col min-h-0">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1 shrink-0">
                      ไฟล์ที่เลือก ({selectedFiles.length}/10)
                    </h4>
                    <div className="flex flex-col gap-2 overflow-y-auto pr-1 max-h-52">
                      {selectedFiles.map((f, i) => {
                        const isDuplicate = duplicateFileNames.includes(f.name);
                        const isImg = f.type.startsWith('image/');
                        const isVid = f.type.startsWith('video/');
                        return (
                          <div
                            key={i}
                            className={`flex flex-col gap-1 bg-white p-2 rounded-lg border shadow-sm group ${
                              isDuplicate ? 'border-red-300 bg-red-50/50 animate-[shake_0.5s_ease-in-out]' : 'border-gray-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                {isImg ? <ImageIcon size={15} /> : isVid ? <Video size={15} /> : <FileIcon size={15} />}
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <p className={`text-sm font-semibold truncate ${isDuplicate ? 'text-red-700' : 'text-gray-800'}`}>{f.name}</p>
                                <p className="text-[11px] text-gray-400">{formatBytes(f.size)}</p>
                              </div>
                              <button
                                onClick={() => onRemoveFile(f.name)}
                                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                  isDuplicate ? 'text-red-400 hover:text-red-600 hover:bg-red-100' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                                }`}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            {isDuplicate && (
                              <div className="text-xs text-red-500 font-medium px-1 flex items-center gap-1">
                                <AlertTriangle size={12} />
                                ไฟล์ซ้ำซ้อน ข้อความจะหายไปใน {duplicateCountdown}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white flex justify-end gap-3 pt-4 border-t border-gray-100 shrink-0">
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-none sm:w-32 px-4 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={onStartSend}
                  disabled={selectedFiles.length === 0}
                  className={`flex-1 sm:flex-none sm:w-32 px-4 py-2.5 text-sm font-bold rounded-xl transition-colors ${
                    selectedFiles.length > 0
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm cursor-pointer'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  ส่ง ({selectedFiles.length})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
