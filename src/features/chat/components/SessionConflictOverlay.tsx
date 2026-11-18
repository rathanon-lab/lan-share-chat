"use client";

import React from "react";
import { AlertTriangle, Lock, RefreshCw } from "lucide-react";

export interface SessionConflictState {
  mode: "taken_over" | "blocked";
  reason: string;
  peerBrowser?: string;
}

export function SessionConflictOverlay({
  conflict,
  isDark,
  onTakeoverHere,
}: {
  conflict: SessionConflictState;
  isDark: boolean;
  onTakeoverHere: () => void;
}) {
  const isBlocked = conflict.mode === "blocked";

  return (
    <div
      data-testid="session-conflict-overlay"
      data-conflict-mode={conflict.mode}
      className={`absolute inset-0 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center ${
        isDark ? "bg-slate-950/95" : "bg-white/95"
      }`}
    >
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-sm ${
          isBlocked
            ? isDark
              ? "bg-red-950 text-red-400"
              : "bg-red-100 text-red-600"
            : isDark
              ? "bg-amber-950 text-amber-400"
              : "bg-amber-100 text-amber-600"
        }`}
      >
        {isBlocked ? <Lock size={28} /> : <AlertTriangle size={28} />}
      </div>

      <h3 className={`text-lg font-bold ${isDark ? "text-slate-100" : "text-gray-900"}`}>
        {isBlocked
          ? "ไม่สามารถใช้งานพร้อมกันจากเครื่องเดียวกันได้"
          : "เซสชันถูกสลับไปใช้งานในหน้าต่างอื่นแล้ว"}
      </h3>

      <p className={`text-sm mt-1.5 max-w-md ${isDark ? "text-slate-400" : "text-gray-600"}`}>
        {conflict.reason}
        {conflict.peerBrowser ? ` (${conflict.peerBrowser})` : ""}
      </p>

      {!isBlocked && (
        <button
          type="button"
          data-testid="session-takeover-btn"
          onClick={onTakeoverHere}
          className="mt-5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer"
        >
          <RefreshCw size={15} /> ดึงสิทธิ์กลับมาใช้งานหน้านี้
        </button>
      )}

      {isBlocked && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`mt-5 px-4 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
            isDark
              ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <RefreshCw size={14} /> ลองเชื่อมต่อใหม่อีกครั้ง
        </button>
      )}
    </div>
  );
}
