"use client";

import React, { useState } from "react";
import { BarChart3, Bell, Database, FileDown, KeyRound, Loader2, RotateCcw, Settings, Trash2, Users, X } from "lucide-react";
import { FB, css } from "@/features/admin/theme";

export interface ResetSystemOptions {
  messages?: boolean;
  files?: boolean;
  devices?: boolean;
  settings?: boolean;
  alerts?: boolean;
  telemetry?: boolean;
  stickers?: boolean;
}

export function AdminResetSettingsSection({
  onDownloadBackup,
  onResetSystem,
  onClearLogsWithPassword,
}: {
  onDownloadBackup: () => void;
  onResetSystem: (opts: ResetSystemOptions) => void;
  onClearLogsWithPassword: (password: string) => Promise<void>;
}) {
  const [logResetOpen, setLogResetOpen] = useState(false);
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [clearingLogs, setClearingLogs] = useState(false);

  async function handleConfirmClearLogs(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmPw.trim()) {
      setPwError("กรุณากรอกรหัสผ่าน Admin เพื่อยืนยัน");
      return;
    }
    setClearingLogs(true);
    setPwError("");
    try {
      await onClearLogsWithPassword(confirmPw);
      setConfirmPw("");
      setLogResetOpen(false);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : "รหัสผ่านไม่ถูกต้อง");
    } finally {
      setClearingLogs(false);
    }
  }

  return (
    <>
      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ color: FB.textPrimary, fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>💾 สำรองข้อมูล</h3>
        <div style={{ ...css.card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontWeight: "600", marginBottom: "4px", color: FB.textPrimary }}>ดาวน์โหลด Backup</div>
            <div style={{ fontSize: "13px", color: FB.textSecondary }}>บันทึกข้อความและ metadata ไฟล์ทั้งหมดเป็น JSON</div>
          </div>
          <button onClick={onDownloadBackup} style={{ ...css.btn("secondary"), color: FB.green, border: "1px solid #C8E6C9" }}>
            <FileDown size={16} /> Backup
          </button>
        </div>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ color: FB.textPrimary, fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>🗑️ รีเซ็ตระบบ (เฉพาะส่วนหรือทั้งหมด)</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { title: "ลบข้อความทั้งหมด", desc: "ล้างประวัติแชทและประวัติแก้ไขทั้งหมด (ไม่ลบไฟล์)", action: () => onResetSystem({ messages: true }), icon: <RotateCcw size={15} />, label: "รีเซ็ต", testId: "settings-reset-messages-btn" },
            { title: "ลบไฟล์อัปโหลดทั้งหมด", desc: "ลบไฟล์ทั้งหมดออกจาก server (ไม่ลบข้อความ)", action: () => onResetSystem({ files: true }), icon: <Trash2 size={15} />, label: "ลบ", testId: "settings-reset-files-btn" },
            { title: "ล้างรายชื่ออุปกรณ์ที่บันทึกไว้", desc: "รีเซ็ตชื่ออุปกรณ์ทั้งหมดกลับเป็นค่าสุ่มเมื่อเชื่อมต่อใหม่", action: () => onResetSystem({ devices: true }), icon: <Users size={15} />, label: "ล้าง", testId: "settings-reset-devices-btn" },
            { title: "ล้างคิวแจ้งเตือน @admin", desc: "ลบรายการแท็ก @admin และคำขอลบข้อความทั้งหมด", action: () => onResetSystem({ alerts: true }), icon: <Bell size={15} />, label: "ล้าง", testId: "settings-reset-alerts-btn" },
            { title: "ล้างสถิติภาพรวม (Telemetry & IP Ban)", desc: "รีเซ็ตตัวเลขสถิติรายวัน/รายชั่วโมง กราฟ Peak และ IP ที่ถูกแบนเป็น 0", action: () => onResetSystem({ telemetry: true }), icon: <BarChart3 size={15} />, label: "ล้างสถิติ", testId: "settings-reset-telemetry-btn" },
            { title: "ล้างชุดสติกเกอร์ที่อัปโหลดทั้งหมด", desc: "ลบชุดสติกเกอร์ที่เพิ่มเข้ามาใหม่ทั้งหมด และเปิดเฉพาะชุดเริ่มต้น (Built-in Starter)", action: () => onResetSystem({ stickers: true }), icon: <Trash2 size={15} />, label: "ล้างสติกเกอร์", testId: "settings-reset-stickers-btn" },
            { title: "คืนค่าตั้งต้นระบบ (Settings)", desc: "คืนค่านโยบาย Voice, Edit 15 นาที โลโก้แอดมิน และ Delete Hybrid", action: () => onResetSystem({ settings: true }), icon: <Settings size={15} />, label: "คืนค่า", testId: "settings-reset-defaults-btn" },
          ].map((item) => (
            <div key={item.title} style={{ ...css.card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ fontWeight: "600", marginBottom: "4px", color: FB.textPrimary }}>{item.title}</div>
                <div style={{ fontSize: "13px", color: FB.textSecondary }}>{item.desc}</div>
              </div>
              <button type="button" data-testid={item.testId} onClick={item.action} style={css.btn("danger")}>
                {item.icon} {item.label}
              </button>
            </div>
          ))}

          <div style={{ ...css.card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", border: "1px solid rgba(250,56,62,0.3)" }}>
            <div>
              <div style={{ fontWeight: "700", marginBottom: "4px", color: FB.red }}>⚠️ รีเซ็ตทั้งหมด (Factory Reset)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>ลบข้อความ + ไฟล์ + อุปกรณ์ + แจ้งเตือน + สถิติภาพรวม + ชุดสติกเกอร์ที่อัปโหลด + คืนค่าโลโก้/ตั้งต้น</div>
            </div>
            <button
              type="button"
              data-testid="settings-reset-all-btn"
              onClick={() => onResetSystem({ messages: true, files: true, devices: true, alerts: true, telemetry: true, stickers: true, settings: true })}
              style={{ ...css.btn("danger"), background: FB.red, color: "white", border: "none" }}
            >
              <RotateCcw size={15} /> รีเซ็ตทั้งหมด
            </button>
          </div>

          <div style={{ ...css.card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", border: "1px solid #FCA5A5", background: "#FFFBFB" }}>
            <div>
              <div style={{ fontWeight: "700", marginBottom: "4px", color: "#B91C1C" }}>🔐 ล้าง Activity Log (Audit Trail)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>ล้างประวัติการใช้งานระบบทั้งหมด (ต้องยืนยันรหัสผ่าน Admin อีกครั้งเพื่อความปลอดภัย)</div>
            </div>
            <button
              type="button"
              data-testid="settings-reset-logs-btn"
              onClick={() => {
                setConfirmPw("");
                setPwError("");
                setLogResetOpen(true);
              }}
              style={{ ...css.btn("danger"), border: "1px solid #EF4444" }}
            >
              <KeyRound size={15} /> ล้าง Activity Log
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ color: FB.textPrimary, fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>📋 ข้อมูล PDPA &amp; Security</h3>
        <div style={css.card}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <Database size={20} style={{ color: FB.blue }} />
            <span style={{ fontWeight: "600", color: FB.textPrimary }}>นโยบายความปลอดภัยสื่อและการเก็บข้อมูล</span>
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 20px", color: FB.textSecondary, fontSize: "13px", lineHeight: "1.8" }}>
            <li>ปิดกั้นการเข้าถึงไฟล์ผ่านพาร์ท URL ตรง (`/uploads/*` ถูกบล็อก 100%)</li>
            <li>เข้ารหัสโทเคนสื่อด้วย <strong style={{ color: FB.blue }}>AES-256-GCM</strong> และรองรับ Byte-Range Streaming + บล็อกการรันไฟล์ `.html` / `.svg`</li>
            <li>เก็บประวัติการใช้งานระบบ (Activity Log) ไว้ <strong style={{ color: FB.blue }}>90 วัน</strong></li>
          </ul>
        </div>
      </div>

      {logResetOpen && (
        <div
          data-testid="clear-logs-password-modal"
          onClick={() => !clearingLogs && setLogResetOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmClearLogs}
            style={{ background: FB.white, borderRadius: "14px", width: "100%", maxWidth: "400px", padding: "20px", boxShadow: "0 20px 50px rgba(0,0,0,0.3)", border: `1px solid ${FB.border}` }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "15px", fontWeight: "700", color: FB.red }}>ยืนยันรหัสผ่าน Admin เพื่อล้าง Activity Log</span>
              <button type="button" onClick={() => setLogResetOpen(false)} style={{ ...css.btn("ghost"), padding: "4px" }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: FB.textSecondary }}>
              กรอกรหัสผ่านผู้ดูแลระบบอีกครั้งเพื่อยืนยันการล้างประวัติ Audit Log ทั้งหมด
            </p>
            <input
              type="password"
              data-testid="clear-logs-password-input"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="กรอกรหัสผ่าน Admin..."
              autoFocus
              style={{ ...css.input, borderRadius: "8px", marginBottom: "10px" }}
            />
            {pwError && (
              <div style={{ color: FB.red, fontSize: "12px", fontWeight: "600", marginBottom: "10px" }}>{pwError}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button type="button" onClick={() => setLogResetOpen(false)} disabled={clearingLogs} style={css.btn("secondary")}>
                ยกเลิก
              </button>
              <button
                type="submit"
                data-testid="clear-logs-confirm-btn"
                disabled={clearingLogs}
                style={{ ...css.btn("danger"), background: FB.red, color: "white", border: "none" }}
              >
                {clearingLogs ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
                ยืนยันล้าง Activity Log
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
