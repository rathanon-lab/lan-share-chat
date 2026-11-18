"use client";

import React from "react";
import { Shield } from "lucide-react";

export function BannedOverlay({ isDark, reason }: { isDark: boolean; reason?: string }) {
  return (
    <div
      data-testid="banned-overlay"
      className={`absolute inset-0 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center ${
        isDark ? "bg-slate-950/92" : "bg-white/90"
      }`}
    >
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
          isDark ? "bg-red-950 text-red-400" : "bg-red-100 text-red-600"
        }`}
      >
        <Shield size={28} />
      </div>
      <h3 className={`text-lg font-bold ${isDark ? "text-slate-100" : "text-gray-900"}`}>
        บัญชี/อุปกรณ์ของคุณถูกระงับการใช้งาน
      </h3>
      <p className={`text-sm mt-1 max-w-md ${isDark ? "text-slate-400" : "text-gray-600"}`}>
        {reason || "ผู้ดูแลระบบได้จำกัดการเข้าถึงของอุปกรณ์หรือ IP นี้ชั่วคราว"}
      </p>
    </div>
  );
}
