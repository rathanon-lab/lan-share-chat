"use client";

import React from "react";
import { EyeOff, Share2, ShieldAlert } from "lucide-react";
import type { AppLang } from "@/lib/i18n";

export function ChatBlurredOverlay({
  isDark,
  lang = "th",
}: {
  isDark: boolean;
  lang?: AppLang;
}) {
  const isEn = lang === "en";

  return (
    <div
      data-testid="chat-blurred-overlay"
      className={`absolute inset-0 z-30 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center select-none transition-all ${
        isDark ? "bg-slate-950/75" : "bg-white/75"
      }`}
    >
      <div
        className={`max-w-md w-full rounded-2xl border p-6 shadow-2xl flex flex-col items-center ${
          isDark
            ? "bg-slate-900/95 border-slate-700 text-slate-100"
            : "bg-white/95 border-gray-200 text-gray-900"
        }`}
      >
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3.5 ${
            isDark ? "bg-amber-950/80 text-amber-400" : "bg-amber-100 text-amber-600"
          }`}
        >
          <EyeOff size={28} />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white mb-2">
          <ShieldAlert size={13} />
          {isEn ? "Public Chat Under Admin Review" : "ผู้ดูแลระบบกำลังตรวจสอบเนื้อหาห้องแชท"}
        </div>

        <h3 className="text-base sm:text-lg font-bold">
          {isEn
            ? "Public Chat Feed is Temporarily Hidden"
            : "ซ่อนเนื้อหาห้องแชทรวมชั่วคราว"}
        </h3>

        <p className={`text-xs sm:text-sm mt-1.5 leading-relaxed ${isDark ? "text-slate-300" : "text-gray-600"}`}>
          {isEn
            ? "An administrator has temporarily blurred the public chat feed and paused public messages for content inspection."
            : "ผู้ดูแลระบบได้สั่งซ่อนหน้าจอแชทรวมและพักการส่งข้อความชั่วคราวเพื่อตรวจสอบความเรียบร้อยของเนื้อหา"}
        </p>

        <div
          className={`mt-4 w-full rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border ${
            isDark
              ? "bg-blue-950/50 border-blue-800/70 text-blue-300"
              : "bg-blue-50 border-blue-200 text-blue-700"
          }`}
        >
          <Share2 size={14} className="shrink-0" />
          <span>
            {isEn
              ? "Direct P2P file transfer (LAN Share) remains available"
              : "ระบบรับ-ส่งไฟล์ตรงระหว่างเครื่อง (LAN Share P2P) ยังใช้งานได้ตามปกติ"}
          </span>
        </div>
      </div>
    </div>
  );
}
