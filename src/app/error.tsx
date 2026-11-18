"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh w-full bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white border border-red-200 rounded-2xl shadow-lg p-6 max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">เกิดข้อผิดพลาดในการแสดงผล</h2>
          <p className="text-xs text-slate-500 break-words">{error?.message || "Unexpected rendering error"}</p>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
        >
          <RotateCcw size={14} /> ลองใหม่อีกครั้ง
        </button>
      </div>
    </div>
  );
}
