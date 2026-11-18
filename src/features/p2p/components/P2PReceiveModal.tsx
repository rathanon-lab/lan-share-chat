"use client";

import { CheckCircle2, Clock, Download, Paperclip, XCircle } from "lucide-react";
import type { TransferItem } from "@/types/chat";
import type { IncomingP2PRequest } from "@/features/p2p/hooks/useWebRTCTransfer";

interface P2PReceiveModalProps {
  incomingRequest: IncomingP2PRequest;
  isReceiving: boolean;
  isTransferCancelled: boolean;
  transferTransport: 'webrtc' | 'relay';
  transfers: TransferItem[];
  completedDownloads: { name: string; size: number; url: string }[];
  onAccept: () => void;
  onReject: () => void;
  onCancelReceiving: () => void;
  onClose: () => void;
}

export function P2PReceiveModal({
  incomingRequest,
  isReceiving,
  isTransferCancelled,
  transferTransport,
  transfers,
  completedDownloads,
  onAccept,
  onReject,
  onCancelReceiving,
  onClose,
}: P2PReceiveModalProps) {
  const myDownloadTransfers = transfers.filter(
    (t) => t.peerName === incomingRequest.senderName && t.direction === 'download'
  );
  const isDownloadFinished =
    myDownloadTransfers.length > 0 &&
    myDownloadTransfers.length === incomingRequest.files.length &&
    myDownloadTransfers.every((t) => t.status === 'completed' || t.status === 'error');

  return (
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Download size={18} className="text-blue-600" />
            รับไฟล์จาก {incomingRequest.senderName}
          </h3>
        </div>

        <div className="p-4 md:p-6 flex flex-col items-center text-center relative overflow-hidden">
          {isTransferCancelled ? (
            <div className="flex flex-col w-full max-h-full">
              <div className="flex flex-col items-center justify-center text-center w-full mb-4 shrink-0 mt-4">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <XCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">ยกเลิกการรับไฟล์</h3>
                <p className="text-sm text-gray-500">การรับไฟล์ถูกยกเลิกแล้ว</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 mt-auto shrink-0 bg-gray-100 text-gray-800 rounded-xl font-bold hover:bg-gray-200 transition-colors cursor-pointer"
              >
                ปิด
              </button>
            </div>
          ) : isDownloadFinished ? (
            <div className="flex flex-col w-full max-h-full">
              <div className="flex flex-col items-center justify-center text-center w-full mb-4 shrink-0 mt-4">
                <div className="w-16 h-16 bg-green-500 text-white rounded-xl flex items-center justify-center mb-4 shadow-md">
                  <CheckCircle2 size={36} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">ดาวน์โหลดเสร็จสมบูรณ์!</h3>
                <p className="text-sm text-gray-500">
                  รับไฟล์จาก {incomingRequest.senderName} เรียบร้อยแล้ว ({transferTransport === 'webrtc' ? 'Direct WebRTC P2P' : 'LAN Secure Relay'})
                </p>
              </div>
              {completedDownloads.length > 0 && (
                <div className="w-full max-h-40 overflow-y-auto bg-gray-50 border border-gray-100 rounded-xl p-2 mb-4 space-y-1.5 text-left">
                  {completedDownloads.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-gray-100 text-xs">
                      <span className="font-semibold text-gray-800 truncate pr-2">{item.name}</span>
                      <a href={item.url} download={item.name} className="text-blue-600 hover:underline font-bold shrink-0">
                        บันทึกซ้ำ
                      </a>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 mt-auto shrink-0 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
              >
                ตกลง
              </button>
            </div>
          ) : isReceiving ? (
            <div className="flex flex-col items-center justify-center text-center w-full max-h-full">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4 shadow-inner ring-4 ring-white shrink-0">
                <Download size={32} className="animate-bounce" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1 shrink-0">กำลังรับไฟล์</h3>
              <p className="text-sm text-gray-500 mb-4 shrink-0">
                รับจาก {incomingRequest.senderName} ({incomingRequest.senderIp})
              </p>

              {(() => {
                const totalSize = incomingRequest.totalSize || 1;
                const downloadedSize = myDownloadTransfers.reduce((sum, t) => sum + t.fileSize * (t.progress / 100), 0);
                const totalProgress = Math.round((downloadedSize / totalSize) * 100);

                return (
                  <div className="w-full flex flex-col gap-2 mb-4 shrink-0 mt-2">
                    <div className="flex justify-between items-center text-sm font-bold text-blue-600">
                      <span>ภาพรวมการดาวน์โหลด...</span>
                      <span>{totalProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${totalProgress}%` }}></div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex-1 overflow-y-auto w-full bg-gray-50 rounded-xl border border-gray-100 p-2 mb-4 min-h-[150px]">
                {incomingRequest.files.map((f, i) => {
                  const t = myDownloadTransfers.find((tx) => tx.fileName === f.name);
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
                onClick={onCancelReceiving}
                className="px-6 py-3 w-full bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors shrink-0 mt-auto cursor-pointer"
              >
                ยกเลิกการรับ
              </button>
            </div>
          ) : (
            <div className="flex flex-col w-full max-h-full">
              <div className="flex flex-col items-center justify-center text-center w-full mb-4 shrink-0 mt-2">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-3 shadow-sm">
                  <Download size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{incomingRequest.senderName} ต้องการส่งไฟล์ให้คุณ</h3>
                <p className="text-xs text-gray-500 mt-1">
                  จำนวน {incomingRequest.files.length} ไฟล์ · ขนาดรวม {(incomingRequest.totalSize / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>

              <div className="flex-1 overflow-y-auto w-full bg-gray-50 rounded-xl border border-gray-100 p-3 mb-4 min-h-[140px] max-h-60 text-left">
                <div className="flex flex-col gap-2">
                  {incomingRequest.files.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm">
                      <div className="bg-blue-50 text-blue-500 p-2 rounded-md shrink-0">
                        <Paperclip size={16} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-semibold text-gray-800 truncate">{f.name}</p>
                        <p className="text-xs text-gray-500">{(f.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 w-full shrink-0">
                <button
                  onClick={onReject}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  ปฏิเสธ
                </button>
                <button
                  onClick={onAccept}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                >
                  ตอบรับไฟล์
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
