"use client";

import React, { useMemo, useState } from "react";
import { Eye, Search, X } from "lucide-react";
import { FB, css, formatAdminDate } from "@/features/admin/theme";

export interface AdminLogEntry {
  id: number;
  action: string;
  actor: string;
  actorIp: string;
  details: string;
  timestamp: string;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatLogSummary(log: AdminLogEntry): string {
  const parsed = tryParseJson(log?.details);
  if (!parsed) return String(log?.details || "-");
  if (log.action === "UPDATE_SETTINGS") {
    const policy =
      parsed.deletePolicy === "self_always"
        ? "เจ้าของลบได้ตลอด"
        : parsed.deletePolicy === "admin_only"
          ? "เฉพาะ Admin"
          : "Hybrid 15 นาที";
    return `Voice: ${parsed.voiceMessageEnabled ? "เปิด" : "ปิด"} · นโยบายลบ: ${policy} · แก้ไขภายใน ${String(parsed.editWindowMinutes ?? 15)} นาที`;
  }
  if (log.action === "BATCH_DELETE_FILES") {
    const fileArr = Array.isArray(parsed.files) ? parsed.files.map(String) : [];
    const names = fileArr.slice(0, 3).join(", ");
    return `ลบแบบเลือก ${String(parsed.count ?? 0)} ไฟล์${names ? ` (${names}${fileArr.length > 3 ? "..." : ""})` : ""}`;
  }
  if (log.action === "DELETE_FILE") {
    return `ลบไฟล์ "${String(parsed.originalName || parsed.storedName)}" (#${String(parsed.id ?? "-")})`;
  }
  if (log.action === "DELETE_DEVICE") {
    return `ลบอุปกรณ์ "${String(parsed.name || parsed.deviceId)}" (${String(parsed.os || "Unknown")} · ${String(parsed.lastIp || "-")})`;
  }
  return JSON.stringify(parsed);
}

type LogCategory = "all" | "security" | "chat" | "file" | "device" | "sticker" | "settings";

function getLogCategory(action: string): Exclude<LogCategory, "all"> {
  const a = String(action || "").toUpperCase();
  if (
    a.includes("SPAM") ||
    a.includes("FLOOD") ||
    a.includes("MUTE") ||
    a.includes("BAN") ||
    a.includes("LOCK") ||
    a.includes("HOLD") ||
    a.includes("BRUTE") ||
    a.includes("RATE")
  ) {
    return "security";
  }
  if (a.includes("STICKER")) return "sticker";
  if (a.includes("FILE") || a.includes("UPLOAD")) return "file";
  if (a.includes("DEVICE") || a.includes("PROFILE") || a.includes("AVATAR")) return "device";
  if (a.includes("SETTING") || a.includes("BACKUP") || a.includes("RESET")) return "settings";
  return "chat";
}

function isWarningAction(action: string): boolean {
  return (
    action.includes("DELETE") ||
    action.includes("RESET") ||
    action.includes("SPAM") ||
    action.includes("BAN") ||
    action.includes("MUTE")
  );
}

export function AdminLogsTab({ logs }: { logs: AdminLogEntry[] }) {
  const [logCategory, setLogCategory] = useState<LogCategory>("all");
  const [logQuery, setLogQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AdminLogEntry | null>(null);

  const filteredLogs = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (logCategory !== "all" && getLogCategory(log.action) !== logCategory) return false;
      if (!q) return true;
      return (
        String(log.action || "").toLowerCase().includes(q) ||
        String(log.actor || "").toLowerCase().includes(q) ||
        String(log.actorIp || "").toLowerCase().includes(q) ||
        String(log.details || "").toLowerCase().includes(q)
      );
    });
  }, [logs, logCategory, logQuery]);

  const parsedSelected = selectedLog ? tryParseJson(selectedLog.details) : null;

  return (
    <div data-testid="admin-logs-tab">
      <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={css.badge(false)}>
            {filteredLogs.length} / {logs.length} รายการ (เก็บ 90 วัน)
          </span>
          {(
            [
              { id: "all", label: "ทั้งหมด" },
              { id: "security", label: "🛡️ ความปลอดภัย/สแปม" },
              { id: "chat", label: "แชท/แจ้งเตือน" },
              { id: "file", label: "ไฟล์" },
              { id: "device", label: "อุปกรณ์/โปรไฟล์" },
              { id: "sticker", label: "สติกเกอร์" },
              { id: "settings", label: "ตั้งค่า/สำรอง" },
            ] as const
          ).map((c) => {
            const active = logCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setLogCategory(c.id)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "999px",
                  border: `1px solid ${active ? FB.blue : FB.border}`,
                  background: active ? FB.blueLight : FB.white,
                  color: active ? FB.blue : FB.textSecondary,
                  fontSize: "12px",
                  fontWeight: active ? "700" : "500",
                  cursor: "pointer",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div style={{ position: "relative", minWidth: "220px", flex: "0 1 280px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: FB.textMuted }} />
          <input
            style={{ ...css.input, paddingLeft: "32px", borderRadius: "20px", fontSize: "13px" }}
            placeholder="ค้นหา Action / ผู้ดำเนินการ / IP / ข้อความ..."
            value={logQuery}
            onChange={(e) => setLogQuery(e.target.value)}
          />
        </div>
      </div>

      <div style={{ ...css.card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: "700px", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: FB.bg, borderBottom: `1px solid ${FB.border}` }}>
              {["เวลา", "Action", "ผู้ดำเนินการ", "IP", "สรุปรายละเอียด", "ตรวจสอบ"].map((h) => (
                <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: FB.textSecondary, fontWeight: "600", fontSize: "12px" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log, i) => {
              const warn = isWarningAction(log.action);
              return (
                <tr
                  key={log.id}
                  data-testid={`log-row-${log.id}`}
                  onClick={() => setSelectedLog(log)}
                  style={{ borderBottom: `1px solid ${FB.border}`, background: i % 2 === 0 ? FB.white : FB.bg, cursor: "pointer" }}
                >
                  <td style={{ padding: "10px 14px", color: FB.textSecondary, whiteSpace: "nowrap", fontSize: "12px" }}>
                    {formatAdminDate(log.timestamp)}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: warn ? FB.redLight : FB.blueLight,
                        color: warn ? FB.red : FB.blue,
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", color: FB.blue, fontWeight: "500" }}>{log.actor}</td>
                  <td style={{ padding: "10px 14px", color: FB.textMuted, fontFamily: "monospace", fontSize: "12px" }}>{log.actorIp}</td>
                  <td style={{ padding: "10px 14px", color: FB.textPrimary, maxWidth: "340px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {formatLogSummary(log)}
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLog(log);
                      }}
                      style={{ ...css.btn("secondary"), padding: "4px 9px", fontSize: "11px", color: FB.blue }}
                    >
                      <Eye size={12} /> ดูละเอียด
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedLog && (
        <div
          data-testid="log-detail-modal"
          onClick={() => setSelectedLog(null)}
          style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.58)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: FB.white, borderRadius: "14px", width: "100%", maxWidth: "640px", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.28)", border: `1px solid ${FB.border}` }}
          >
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${FB.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: FB.bg }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: "700",
                    background: selectedLog.action?.includes("DELETE") || selectedLog.action?.includes("RESET") ? FB.redLight : FB.blueLight,
                    color: selectedLog.action?.includes("DELETE") || selectedLog.action?.includes("RESET") ? FB.red : FB.blue,
                  }}
                >
                  {selectedLog.action}
                </span>
                <span style={{ fontSize: "12px", color: FB.textMuted }}>Log #{selectedLog.id}</span>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} style={{ ...css.btn("ghost"), padding: "4px" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: FB.bg, border: `1px solid ${FB.border}` }}>
                  <div style={{ fontSize: "11px", color: FB.textMuted }}>ผู้ดำเนินการ</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: FB.blue, marginTop: "2px" }}>{selectedLog.actor}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: FB.bg, border: `1px solid ${FB.border}` }}>
                  <div style={{ fontSize: "11px", color: FB.textMuted }}>IP Address</div>
                  <div style={{ fontSize: "13px", fontWeight: "600", fontFamily: "monospace", color: FB.textPrimary, marginTop: "2px" }}>{selectedLog.actorIp || "-"}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: FB.bg, border: `1px solid ${FB.border}` }}>
                  <div style={{ fontSize: "11px", color: FB.textMuted }}>เวลา (Local / ISO)</div>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: FB.textPrimary, marginTop: "2px" }}>{formatAdminDate(selectedLog.timestamp)}</div>
                  <div style={{ fontSize: "10px", color: FB.textMuted, fontFamily: "monospace" }}>{selectedLog.timestamp}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: FB.textSecondary, marginBottom: "4px" }}>สรุปรายการ</div>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#F8FBFF", border: "1px solid #DBEAFE", fontSize: "13px", color: FB.textPrimary }}>
                  {formatLogSummary(selectedLog)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: FB.textSecondary, marginBottom: "4px" }}>ข้อมูลเต็ม (Full Payload / Details)</div>
                <pre
                  style={{
                    margin: 0,
                    padding: "12px",
                    borderRadius: "8px",
                    background: "#0F172A",
                    color: "#E2E8F0",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: "280px",
                    overflowY: "auto",
                  }}
                >
                  {parsedSelected ? JSON.stringify(parsedSelected, null, 2) : String(selectedLog.details || "")}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
