"use client";

import React, { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Clock, EyeOff, Lock, MessageSquare,
  Shield, ShieldAlert, ShieldCheck, Upload, Users, Zap
} from "lucide-react";
import type {
  AdminOverviewStats,
  AdminTab,
  SystemSettings,
  TelemetryDailyRow,
  TelemetryHourlyRow,
} from "@/types/chat";
import { FB, css, formatAdminBytes, formatAdminDate } from "@/features/admin/theme";
import { DEFAULT_ADMIN_RING_COLOR } from "@/lib/avatars";

function formatUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

function formatHourRange(hour: number | null | undefined): string {
  if (hour === null || hour === undefined || hour < 0 || hour > 23) return "-";
  return `${String(hour).padStart(2, "0")}:00`;
}

export function AdminOverviewTab({
  overview,
  systemSettings,
  onSaveSettings,
  onNavigateTab,
}: {
  overview: AdminOverviewStats | null;
  systemSettings: SystemSettings;
  onSaveSettings: (patch: Partial<SystemSettings>) => Promise<void> | void;
  onNavigateTab: (tab: AdminTab) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!overview) {
    return (
      <div style={{ ...css.card, textAlign: "center", padding: "48px", color: FB.textMuted }}>
        กำลังโหลดข้อมูลภาพรวมระบบ...
      </div>
    );
  }

  const liveUptimeMs = overview.serverStartedAt
    ? Math.max(0, nowMs - overview.serverStartedAt)
    : Number(overview.uptimeSeconds || 0) * 1000;
  const dailyRows: TelemetryDailyRow[] = Array.isArray(overview.daily) ? overview.daily : [];
  const todayRow = dailyRows[0];
  const todayKey = todayRow?.dayKey || new Date(nowMs).toISOString().slice(0, 10);

  const hourlyByHour = new Map<number, TelemetryHourlyRow>();
  for (const row of Array.isArray(overview.todayHourly) ? overview.todayHourly : []) {
    hourlyByHour.set(Number(row.hour), row);
  }
  const full24Hours: TelemetryHourlyRow[] = Array.from({ length: 24 }, (_, hour) => {
    return hourlyByHour.get(hour) || { dayKey: todayKey, hour, peakOnline: 0, messageCount: 0 };
  });

  const maxHourlyPeak = Math.max(1, ...full24Hours.map((h) => Number(h.peakOnline || 0)));
  const currentHour = new Date(nowMs).getHours();
  const ringColor = systemSettings.adminRingColor || DEFAULT_ADMIN_RING_COLOR;
  const totalBlockedToday =
    Number(todayRow?.spamBlockedCount || 0) + Number(todayRow?.p2pBlockedCount || 0);

  return (
    <div data-testid="admin-overview-tab" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Top 4 Anonymous KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "12px",
        }}
      >
        {/* Uptime */}
        <div style={{ ...css.card, marginBottom: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: FB.textSecondary }}>
              อัปไทม์เซิร์ฟเวอร์ (Uptime)
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: "700",
                background: "#DCFCE7",
                color: "#15803D",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16A34A", display: "inline-block" }} />
              Online
            </span>
          </div>
          <div
            data-testid="overview-uptime-value"
            style={{ fontSize: "24px", fontWeight: "800", color: FB.textPrimary, fontFamily: "monospace" }}
          >
            {formatUptime(liveUptimeMs)}
          </div>
          <div style={{ fontSize: "11px", color: FB.textMuted, display: "flex", alignItems: "center", gap: "4px" }}>
            <Clock size={12} /> เริ่มทำงาน: {formatAdminDate(overview.serverStartedAt)}
          </div>
        </div>

        {/* Live Online */}
        <div style={{ ...css.card, marginBottom: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: FB.textSecondary }}>กำลังใช้งานตอนนี้</span>
            <Users size={16} style={{ color: FB.blue }} />
          </div>
          <div data-testid="overview-online-now" style={{ fontSize: "26px", fontWeight: "800", color: FB.blue }}>
            {overview.onlinePeersCount}{" "}
            <span style={{ fontSize: "13px", fontWeight: "600", color: FB.textSecondary }}>เครื่อง</span>
          </div>
          <div style={{ fontSize: "11px", color: FB.textMuted }}>
            บันทึกทั้งหมด {overview.totalDevices} เครื่อง · {overview.totalFiles} ไฟล์ ({formatAdminBytes(overview.totalFileBytes)})
          </div>
        </div>

        {/* Today Peak */}
        <div style={{ ...css.card, marginBottom: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: FB.textSecondary }}>ออนไลน์สูงสุดวันนี้</span>
            <Zap size={16} style={{ color: "#D97706" }} />
          </div>
          <div data-testid="overview-today-peak" style={{ fontSize: "26px", fontWeight: "800", color: "#B45309" }}>
            {overview.todayPeakOnline}{" "}
            <span style={{ fontSize: "13px", fontWeight: "600", color: FB.textSecondary }}>เครื่อง</span>
          </div>
          <div style={{ fontSize: "11px", color: FB.textMuted }}>
            ช่วงเวลาพีควันนี้:{" "}
            <strong>{overview.todayPeakOnline > 0 ? `${formatHourRange(overview.todayPeakHour)} น.` : "-"}</strong>
          </div>
        </div>

        {/* Activity & Security Summary */}
        <div style={{ ...css.card, marginBottom: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: FB.textSecondary }}>ปริมาณการใช้งานวันนี้</span>
            <Activity size={16} style={{ color: totalBlockedToday > 0 ? FB.red : FB.green }} />
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: "20px", fontWeight: "800", color: FB.textPrimary }}>
              {todayRow?.messageCount ?? 0}{" "}
              <span style={{ fontSize: "12px", fontWeight: "500", color: FB.textSecondary }}>ข้อความ</span>
            </span>
            <span style={{ fontSize: "20px", fontWeight: "800", color: FB.textPrimary }}>
              {todayRow?.uploadCount ?? 0}{" "}
              <span style={{ fontSize: "12px", fontWeight: "500", color: FB.textSecondary }}>ไฟล์</span>
            </span>
          </div>
          <div
            style={{
              fontSize: "11px",
              color: totalBlockedToday > 0 ? FB.red : FB.textMuted,
              fontWeight: totalBlockedToday > 0 ? "700" : "400",
            }}
          >
            กันสแปม/Flood วันนี้: {totalBlockedToday} ครั้ง · ข้อความสะสม {overview.totalMessages}
          </div>
        </div>
      </div>

      {/* Live Admin Controls & Quick Navigation */}
      <div style={{ ...css.card, marginBottom: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Shield size={18} style={{ color: ringColor }} />
            <span style={{ fontSize: "15px", fontWeight: "700", color: FB.textPrimary }}>
              ควบคุมห้องแชท &amp; สถานะ Admin Spotlight
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="overview-toggle-hold-btn"
              onClick={() => onSaveSettings({ adminHoldActive: !systemSettings.adminHoldActive })}
              style={{
                ...css.btn(systemSettings.adminHoldActive ? "primary" : "secondary"),
                minWidth: "168px",
                height: "36px",
                justifyContent: "center",
                background: systemSettings.adminHoldActive ? ringColor : FB.bg,
                color: systemSettings.adminHoldActive ? "white" : FB.textPrimary,
                border: `1px solid ${systemSettings.adminHoldActive ? ringColor : FB.border}`,
              }}
            >
              <ShieldAlert size={15} />
              {systemSettings.adminHoldActive ? "Spotlight: เปิดอยู่" : "Spotlight ตรวจสอบ"}
            </button>

            <button
              type="button"
              data-testid="overview-toggle-lock-btn"
              onClick={() => onSaveSettings({ chatLocked: !systemSettings.chatLocked })}
              style={{
                ...css.btn(systemSettings.chatLocked ? "danger" : "secondary"),
                minWidth: "168px",
                height: "36px",
                justifyContent: "center",
                background: systemSettings.chatLocked ? FB.red : FB.bg,
                color: systemSettings.chatLocked ? "white" : FB.textPrimary,
                border: `1px solid ${systemSettings.chatLocked ? FB.red : FB.border}`,
              }}
            >
              <Lock size={15} />
              {systemSettings.chatLocked ? "ล็อกการพิมพ์: เปิดอยู่" : "ล็อกการพิมพ์แชทรวม"}
            </button>

            <button
              type="button"
              data-testid="overview-toggle-blur-btn"
              onClick={() => onSaveSettings({ chatBlurred: !systemSettings.chatBlurred })}
              style={{
                ...css.btn(systemSettings.chatBlurred ? "danger" : "secondary"),
                minWidth: "168px",
                height: "36px",
                justifyContent: "center",
                background: systemSettings.chatBlurred ? "#0F172A" : FB.bg,
                color: systemSettings.chatBlurred ? "white" : FB.textPrimary,
                border: `1px solid ${systemSettings.chatBlurred ? "#0F172A" : FB.border}`,
              }}
            >
              <EyeOff size={15} />
              {systemSettings.chatBlurred ? "เบลอแชทรวม: เปิดอยู่" : "เบลอหน้าแชทรวม"}
            </button>
          </div>
        </div>

        {/* Security Queue Pills */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "8px", borderTop: `1px solid ${FB.border}` }}>
          <button
            type="button"
            onClick={() => onNavigateTab("alerts")}
            style={{
              ...css.btn("secondary"),
              fontSize: "12px",
              background: overview.pendingAlerts > 0 ? "#FEF2F2" : FB.bg,
              color: overview.pendingAlerts > 0 ? FB.red : FB.textSecondary,
              border: `1px solid ${overview.pendingAlerts > 0 ? "#FECACA" : FB.border}`,
            }}
          >
            <AlertTriangle size={13} /> แจ้งเตือนรอดำเนินการ: <strong>{overview.pendingAlerts}</strong>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("devices")}
            style={{
              ...css.btn("secondary"),
              fontSize: "12px",
              background: overview.mutedDevicesCount > 0 ? "#FFFBEB" : FB.bg,
              color: overview.mutedDevicesCount > 0 ? "#B45309" : FB.textSecondary,
              border: `1px solid ${overview.mutedDevicesCount > 0 ? "#FDE68A" : FB.border}`,
            }}
          >
            ⏳ ถูก Mute อยู่: <strong>{overview.mutedDevicesCount}</strong>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("devices")}
            style={{
              ...css.btn("secondary"),
              fontSize: "12px",
              background: overview.bannedDevicesCount > 0 || overview.bannedIpsCount > 0 ? "#FEF2F2" : FB.bg,
              color: overview.bannedDevicesCount > 0 || overview.bannedIpsCount > 0 ? FB.red : FB.textSecondary,
              border: `1px solid ${overview.bannedDevicesCount > 0 || overview.bannedIpsCount > 0 ? "#FECACA" : FB.border}`,
            }}
          >
            🚫 แบนอุปกรณ์: <strong>{overview.bannedDevicesCount}</strong> · แบน IP: <strong>{overview.bannedIpsCount}</strong>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("settings")}
            style={{ ...css.btn("secondary"), fontSize: "12px" }}
          >
            <ShieldCheck size={13} style={{ color: systemSettings.antiSpamEnabled !== false ? FB.green : FB.textMuted }} />
            Anti-Spam &amp; P2P Guard: <strong>{systemSettings.antiSpamEnabled !== false ? "ทำงานอยู่" : "ปิดอยู่"}</strong>
          </button>
        </div>
      </div>

      {/* 24-Hour Anonymous Peak Online Bar Chart */}
      <div style={{ ...css.card, marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <BarChart3 size={18} style={{ color: FB.blue }} />
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: FB.textPrimary }}>
                สถิติผู้ใช้งานรายชั่วโมงวันนี้ ({todayKey})
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: FB.textSecondary }}>
                แสดงยอดออนไลน์สูงสุดต่อชั่วโมง (00:00 – 23:00 น.) แบบไม่ระบุชื่อเครื่อง
              </p>
            </div>
          </div>
          <span style={css.badge(false)}>Peak วันนี้: {overview.todayPeakOnline} เครื่อง</span>
        </div>

        <div
          data-testid="overview-hourly-chart"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(24, minmax(12px, 1fr))",
            gap: "4px",
            alignItems: "end",
            height: "150px",
            padding: "16px 8px 6px",
            background: "#F8FAFC",
            borderRadius: "10px",
            border: `1px solid ${FB.border}`,
            overflowX: "auto",
          }}
        >
          {full24Hours.map((slot) => {
            const val = Number(slot.peakOnline || 0);
            const pct = val > 0 ? Math.max(10, Math.round((val / maxHourlyPeak) * 100)) : 4;
            const isPeakHour = overview.todayPeakHour === slot.hour && val > 0;
            const isNowHour = slot.hour === currentHour;
            return (
              <div
                key={slot.hour}
                title={`${formatHourRange(slot.hour)} น. · Peak ${val} เครื่อง · ข้อความ ${slot.messageCount}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  height: "100%",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "10px", fontWeight: "700", color: isPeakHour ? "#B45309" : FB.textMuted, minHeight: "14px" }}>
                  {val > 0 ? val : ""}
                </span>
                <div
                  style={{
                    width: "100%",
                    maxWidth: "22px",
                    height: `${pct}%`,
                    borderRadius: "4px 4px 2px 2px",
                    background: isPeakHour ? "#F59E0B" : isNowHour ? FB.blue : val > 0 ? "#93C5FD" : "#E2E8F0",
                    transition: "height 0.25s ease",
                  }}
                />
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: isNowHour ? "800" : "500",
                    color: isNowHour ? FB.blue : FB.textMuted,
                    fontFamily: "monospace",
                  }}
                >
                  {String(slot.hour).padStart(2, "0")}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 14-Day Daily Telemetry Table */}
      <div style={{ ...css.card, padding: 0, overflowX: "auto", marginBottom: 0 }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${FB.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: FB.textPrimary }}>
              📅 สรุปสถิติรายวัน (ย้อนหลังสูงสุด 14 วัน)
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: FB.textSecondary }}>
              บันทึกเฉพาะตัวเลขสถิติรวม (Anonymous Aggregates) เพื่อใช้วางแผนโหลดระบบและตรวจสอบเหตุผิดปกติ
            </p>
          </div>
          <span style={{ fontSize: "11px", color: FB.textMuted }}>
            🔒 P2P Zero-Storage: ไม่เก็บชื่อไฟล์หรือเนื้อหา P2P ปกติ
          </span>
        </div>

        <table data-testid="overview-daily-table" style={{ width: "100%", minWidth: "660px", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: FB.bg, borderBottom: `1px solid ${FB.border}` }}>
              {["วันที่", "ออนไลน์สูงสุด", "ช่วงเวลาพีค", "ข้อความ", "อัปโหลดไฟล์", "กันสแปมแชท", "กัน P2P Flood"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: FB.textSecondary, fontWeight: "600", fontSize: "12px" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dailyRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: FB.textMuted }}>
                  ยังไม่มีข้อมูลสถิติรายวัน
                </td>
              </tr>
            ) : (
              dailyRows.map((row, idx) => (
                <tr key={row.dayKey} style={{ borderBottom: `1px solid ${FB.border}`, background: idx % 2 === 0 ? FB.white : FB.bg }}>
                  <td style={{ padding: "10px 14px", fontWeight: "700", color: FB.textPrimary, fontFamily: "monospace" }}>
                    {row.dayKey}
                    {row.dayKey === todayKey && (
                      <span style={{ marginLeft: "6px", fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: FB.blueLight, color: FB.blue, fontFamily: "sans-serif" }}>
                        วันนี้
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: "700", color: FB.blue }}>{row.peakOnline} เครื่อง</td>
                  <td style={{ padding: "10px 14px", color: FB.textSecondary }}>
                    {row.peakOnline > 0 ? `${formatHourRange(row.peakHour)} น.` : "-"}
                  </td>
                  <td style={{ padding: "10px 14px", color: FB.textPrimary }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <MessageSquare size={12} style={{ color: FB.textMuted }} /> {row.messageCount}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", color: FB.textPrimary }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Upload size={12} style={{ color: FB.textMuted }} /> {row.uploadCount}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", color: row.spamBlockedCount > 0 ? FB.red : FB.textMuted, fontWeight: row.spamBlockedCount > 0 ? "700" : "400" }}>
                    {row.spamBlockedCount}
                  </td>
                  <td style={{ padding: "10px 14px", color: row.p2pBlockedCount > 0 ? FB.red : FB.textMuted, fontWeight: row.p2pBlockedCount > 0 ? "700" : "400" }}>
                    {row.p2pBlockedCount}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
