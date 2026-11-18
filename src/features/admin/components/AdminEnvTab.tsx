"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Container, HardDrive, Lock, Monitor, Terminal, Trash2, XCircle } from "lucide-react";
import type { AdminEnvStatusPayload } from "@/types/chat";
import { FB, css } from "@/features/admin/theme";

export function AdminEnvTab({
  envStatus,
  onClearEnvLogs,
  onPurgeEnvCache,
}: {
  envStatus: AdminEnvStatusPayload | null;
  onClearEnvLogs: () => void;
  onPurgeEnvCache?: () => void;
}) {
  if (!envStatus) {
    return (
      <div style={{ ...css.card, padding: "28px", textAlign: "center", color: FB.textSecondary }}>
        กำลังตรวจสอบสถานะ Environment ของเซิร์ฟเวอร์...
      </div>
    );
  }

  const runtime = envStatus.runtime;
  const isDocker = runtime?.executionMode === "docker";
  const diskLow = Boolean(runtime && runtime.minDiskFreeMb > 0 && runtime.diskFreeMb < runtime.minDiskFreeMb);

  return (
    <div data-testid="admin-env-tab" style={{ maxWidth: "860px", display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Read-Only Security Banner */}
      <div
        style={{
          ...css.card,
          background: "#F8FAFC",
          border: `1px solid ${FB.border}`,
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "#E0E7FF",
            color: "#3730A3",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Lock size={18} />
        </div>
        <div>
          <div style={{ fontWeight: "700", fontSize: "14px", color: FB.textPrimary }}>
            Environment &amp; .env Status (Read-Only)
          </div>
          <div style={{ fontSize: "13px", color: FB.textSecondary, marginTop: "2px", lineHeight: 1.5 }}>
            หน้านี้แสดงสถานะการตั้งค่าสภาพแวดล้อมจริงของเซิร์ฟเวอร์เพื่อตรวจสอบความพร้อม (ไม่สามารถแก้ไขผ่านหน้าเว็บได้
            หากต้องการปรับปรุงค่าใน <code>.env</code> หรือติดตั้ง FFmpeg ให้ปิดเซิร์ฟเวอร์ แก้ไขไฟล์ <code>.env</code> แล้วเปิดเซิร์ฟเวอร์ใหม่)
          </div>
        </div>
      </div>

      {/* Runtime Environment & 6-Zone Segregated Storage Panel */}
      {runtime && (
        <div
          data-testid="env-runtime-panel"
          style={{
            ...css.card,
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            border: `1px solid ${diskLow ? "#FCA5A5" : FB.border}`,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: isDocker ? "#DBEAFE" : "#EDE9FE",
                  color: isDocker ? "#1D4ED8" : "#6D28D9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {isDocker ? <Container size={18} /> : <Monitor size={18} />}
              </div>
              <div>
                <div style={{ fontWeight: "700", fontSize: "14px", color: FB.textPrimary, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span>Runtime &amp; Storage Self-Awareness</span>
                  <span
                    data-testid="env-execution-mode-badge"
                    style={{
                      padding: "2px 9px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: "700",
                      background: isDocker ? "#DBEAFE" : "#F3E8FF",
                      color: isDocker ? "#1E40AF" : "#5B21B6",
                    }}
                  >
                    {runtime.platformLabel}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: FB.textSecondary, marginTop: "2px" }}>
                  Node {runtime.nodeVersion} · คงเหลือ {runtime.diskFreeMb.toLocaleString()} MB / {runtime.diskTotalGb} GB
                  {" "}(ใช้แล้ว {runtime.diskUsedPercent}% · เกณฑ์ป้องกันดิสก์เต็ม ≥ {runtime.minDiskFreeMb} MB)
                </div>
              </div>
            </div>

            {onPurgeEnvCache && (
              <button
                type="button"
                data-testid="env-purge-cache-btn"
                onClick={onPurgeEnvCache}
                style={{ ...css.btn("secondary"), fontSize: "12px" }}
              >
                <Trash2 size={14} /> ล้างแคชวิดีโอ &amp; Chunk ชั่วคราว
              </button>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: "10px",
            }}
          >
            {runtime.zones.map((zone) => (
              <div
                key={zone.id}
                data-testid={`storage-zone-${zone.id}`}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "#F8FAFC",
                  border: `1px solid ${zone.writable ? FB.border : "#FECACA"}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                  <span style={{ fontWeight: "700", fontSize: "12px", color: FB.textPrimary, display: "flex", alignItems: "center", gap: "5px" }}>
                    <HardDrive size={13} /> {zone.label}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "700",
                      padding: "1px 6px",
                      borderRadius: "999px",
                      background: zone.distinctMount ? "#DBEAFE" : "#E2E8F0",
                      color: zone.distinctMount ? "#1E40AF" : "#334155",
                    }}
                  >
                    {zone.distinctMount ? "Isolated Mount" : "Local Zone"}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: FB.textSecondary }}>
                  ใช้ไป {zone.usedMb.toLocaleString()} MB · ว่าง {zone.freeMb.toLocaleString()} MB
                </div>
                <div
                  title={zone.path}
                  style={{
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: FB.textMuted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {zone.path}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Environment Table */}
      <div style={{ ...css.card, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${FB.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#F8FAFC",
          }}
        >
          <span style={{ fontWeight: "700", fontSize: "14px", color: FB.textPrimary, display: "flex", alignItems: "center", gap: "8px" }}>
            <Terminal size={16} /> รายการตรวจสอบ Environment (.env &amp; System Tools)
          </span>
          <span
            data-testid="env-missing-summary"
            style={{
              padding: "3px 10px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "700",
              background: envStatus.missingCount > 0 ? FB.redLight : "#DCFCE7",
              color: envStatus.missingCount > 0 ? FB.red : "#166534",
            }}
          >
            {envStatus.missingCount > 0 ? `พบค่าว่าง / ยังไม่ติดตั้ง ${envStatus.missingCount} รายการ` : "ติดตั้งครบสมบูรณ์"}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${FB.border}`, color: FB.textSecondary, fontSize: "12px" }}>
                <th style={{ padding: "10px 14px" }}>คีย์ / เครื่องมือ</th>
                <th style={{ padding: "10px 14px" }}>สถานะ</th>
                <th style={{ padding: "10px 14px" }}>ค่าที่ตรวจพบ</th>
                <th style={{ padding: "10px 14px" }}>หมายเหตุ / การตั้งค่า</th>
              </tr>
            </thead>
            <tbody>
              {envStatus.items.map((item) => {
                const isMissing = item.status === "missing";
                const isWarning = item.status === "warning";
                const rowBg = isMissing ? "#FEF2F2" : isWarning ? "#FFFBEB" : "transparent";

                return (
                  <tr
                    key={item.key}
                    data-testid={`env-row-${item.key}`}
                    data-env-status={item.status}
                    style={{ borderBottom: `1px solid ${FB.border}`, background: rowBg }}
                  >
                    <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                      <div style={{ fontWeight: "700", fontFamily: "monospace", color: isMissing ? "#991B1B" : FB.textPrimary }}>
                        {item.key}
                      </div>
                      <div style={{ fontSize: "11px", color: FB.textSecondary, marginTop: "2px" }}>{item.label}</div>
                    </td>
                    <td style={{ padding: "12px 14px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {isMissing ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 9px",
                            borderRadius: "999px",
                            background: "#FEE2E2",
                            color: "#B91C1C",
                            fontWeight: "700",
                            fontSize: "11px",
                          }}
                        >
                          <XCircle size={13} /> NULL / ไม่พบ
                        </span>
                      ) : isWarning ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 9px",
                            borderRadius: "999px",
                            background: "#FEF3C7",
                            color: "#92400E",
                            fontWeight: "700",
                            fontSize: "11px",
                          }}
                        >
                          <AlertTriangle size={13} /> ค่าเริ่มต้น
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 9px",
                            borderRadius: "999px",
                            background: "#DCFCE7",
                            color: "#166534",
                            fontWeight: "700",
                            fontSize: "11px",
                          }}
                        >
                          <CheckCircle2 size={13} /> พร้อมใช้งาน
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", verticalAlign: "top", fontFamily: "monospace", fontSize: "12px" }}>
                      {item.valuePreview ? (
                        <span style={{ color: FB.textPrimary }}>{item.valuePreview}</span>
                      ) : (
                        <span style={{ color: "#DC2626", fontWeight: "700" }}>null</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", verticalAlign: "top", fontSize: "12px", color: FB.textSecondary, maxWidth: "320px" }}>
                      {item.hint}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dismissible Boot Diagnostic Log (no alert spam) */}
      <div style={{ ...css.card }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: FB.textPrimary }}>
              บันทึกการตรวจสอบสภาพแวดล้อมเมื่อเริ่มต้นระบบ (System Boot Diagnostics)
            </div>
            <div style={{ fontSize: "12px", color: FB.textSecondary }}>
              แสดงรายการตั้งค่าที่ยังไม่สมบูรณ์จากการตรวจสอบรอบล่าสุด
            </div>
          </div>
          {envStatus.envLogs.length > 0 && (
            <button
              type="button"
              data-testid="env-clear-logs-btn"
              onClick={onClearEnvLogs}
              style={{ ...css.btn("secondary"), color: FB.red }}
            >
              <Trash2 size={14} /> ล้างประวัติการแจ้งเตือน
            </button>
          )}
        </div>

        {envStatus.envLogs.length === 0 ? (
          <div data-testid="env-logs-empty" style={{ padding: "12px", borderRadius: "8px", background: "#F8FAFC", fontSize: "12px", color: FB.textMuted }}>
            ไม่มีข้อความแจ้งเตือนค้างอยู่
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {envStatus.envLogs.map((log) => (
              <div
                key={log.id}
                data-testid="env-boot-log-item"
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#991B1B",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>
                  <strong>[{log.key}]</strong> {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
