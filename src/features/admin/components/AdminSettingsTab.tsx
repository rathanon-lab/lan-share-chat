"use client";

import React, { useRef } from "react";
import { Camera, RotateCcw, Save } from "lucide-react";
import type { SystemSettings } from "@/types/chat";
import { FB, css } from "@/features/admin/theme";
import { ADMIN_RING_SWATCHES, DEFAULT_ADMIN_RING_COLOR } from "@/lib/avatars";
import { UserAvatar } from "@/components/UserAvatar";
import { AdminResetSettingsSection, type ResetSystemOptions } from "./AdminResetSettingsSection";

export function AdminSettingsTab({
  systemSettings,
  setSystemSettings,
  onSaveSettings,
  onResetAdminAvatar,
  onPickAdminCropFile,
  onDownloadBackup,
  onResetSystem,
  onClearLogsWithPassword,
}: {
  systemSettings: SystemSettings;
  setSystemSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
  onSaveSettings: (patch: Partial<SystemSettings>) => void;
  onResetAdminAvatar: () => void;
  onPickAdminCropFile: (file: File) => void;
  onDownloadBackup: () => void;
  onResetSystem: (opts: ResetSystemOptions) => void;
  onClearLogsWithPassword: (password: string) => Promise<void>;
}) {
  const adminAvatarInputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ maxWidth: "680px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ color: FB.textPrimary, fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>
          🛡️ โปรไฟล์แอดมิน &amp; ขอบสีพิเศษ (1 เดียวในระบบ)
        </h3>
        <div style={{ ...css.card, display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <UserAvatar src={systemSettings.adminAvatarUrl} name="Admin" size={68} isAdmin adminRingColor={systemSettings.adminRingColor} />
            <div style={{ flex: 1, minWidth: "200px" }}>
              <div style={{ fontWeight: "700", color: FB.textPrimary, marginBottom: "4px" }}>อวตารและขอบวงกลมพิเศษของ Admin</div>
              <div style={{ fontSize: "12px", color: FB.textSecondary, marginBottom: "10px" }}>
                มีเพียง Admin เท่านั้นที่มีกรอบสีรอบอวตารในห้องแชท ผู้ใช้ทั่วไปไม่สามารถเลือกสีกรอบได้
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => adminAvatarInputRef.current?.click()} style={css.btn("primary")}>
                  <Camera size={14} /> อัปโหลดรูปแอดมิน (ตัดขอบกลม)
                </button>
                <button type="button" onClick={onResetAdminAvatar} style={css.btn("secondary")}>
                  <RotateCcw size={14} /> คืนค่ารูป Admin พิเศษ
                </button>
                <input
                  ref={adminAvatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickAdminCropFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px" }}>
            <div style={{ fontWeight: "600", fontSize: "13px", color: FB.textPrimary, marginBottom: "8px" }}>
              เลือกสีกรอบวงกลมพิเศษของ Admin
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {ADMIN_RING_SWATCHES.map((sw) => {
                const active = systemSettings.adminRingColor?.toLowerCase() === sw.color.toLowerCase();
                return (
                  <button
                    key={sw.color}
                    type="button"
                    onClick={() => onSaveSettings({ adminRingColor: sw.color })}
                    title={sw.label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 10px",
                      borderRadius: "999px",
                      cursor: "pointer",
                      border: active ? `2px solid ${sw.color}` : `1px solid ${FB.border}`,
                      background: active ? "#F8FAFC" : FB.white,
                      fontSize: "12px",
                      fontWeight: active ? "700" : "500",
                      color: FB.textPrimary,
                    }}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: sw.color, display: "inline-block" }} />
                    {sw.label}
                  </button>
                );
              })}
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: FB.textSecondary, cursor: "pointer" }}>
                <span>กำหนดเอง:</span>
                <input
                  type="color"
                  value={systemSettings.adminRingColor || DEFAULT_ADMIN_RING_COLOR}
                  onChange={(e) => onSaveSettings({ adminRingColor: e.target.value })}
                  style={{ width: "30px", height: "26px", border: "none", background: "transparent", cursor: "pointer" }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ color: FB.textPrimary, fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>
          🎙️ การสื่อสารและนโยบายข้อความ (Governance)
        </h3>
        <div style={{ ...css.card, display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>เปิดใช้งานบันทึกเสียง (Voice MP3)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>แปลงเสียงไมโครโฟนเป็น MP3 ในเบราว์เซอร์สำหรับ Safari / iOS / Android</div>
            </div>
            <button
              type="button"
              onClick={() => onSaveSettings({ voiceMessageEnabled: !systemSettings.voiceMessageEnabled })}
              style={{ ...css.btn(systemSettings.voiceMessageEnabled ? "primary" : "secondary"), minWidth: "90px", justifyContent: "center" }}
            >
              {systemSettings.voiceMessageEnabled ? "เปิดอยู่" : "ปิดอยู่"}
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: "600", color: FB.textPrimary }}>รูปแบบพรีวิวสติกเกอร์ก่อนส่ง (Sticker Pre-Send Mode)</div>
                <div style={{ fontSize: "13px", color: FB.textSecondary }}>
                  เลือกแบบป๊อปอัปเต็มจอซูมได้ หรือแถบพรีวิวโปร่งแสงลอยเหนือช่องพิมพ์ (สกรอลบาร์ไม่กระตุก + ผสมสติกเกอร์)
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  data-testid="setting-sticker-mode-fullscreen"
                  onClick={() => onSaveSettings({ stickerPreviewMode: "fullscreen_modal" })}
                  style={css.btn((systemSettings.stickerPreviewMode || "fullscreen_modal") === "fullscreen_modal" ? "primary" : "secondary")}
                >
                  แบบ 1: เต็มจอซูมได้
                </button>
                <button
                  type="button"
                  data-testid="setting-sticker-mode-docked"
                  onClick={() => onSaveSettings({ stickerPreviewMode: "docked_tray" })}
                  style={css.btn(systemSettings.stickerPreviewMode === "docked_tray" ? "primary" : "secondary")}
                >
                  แบบ 2: แถบเหนือช่องพิมพ์ + ผสม
                </button>
              </div>
            </div>

            {systemSettings.stickerPreviewMode === "docked_tray" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "#F8FAFC", border: `1px solid ${FB.border}`, borderRadius: "10px", padding: "10px 12px" }}>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: FB.textPrimary }}>
                    อนุญาตให้ผสม/วางสติกเกอร์หลายตัวข้างๆ กัน (Sticker Collage)
                  </div>
                  <div style={{ fontSize: "12px", color: FB.textSecondary }}>
                    แตะค้างที่สติกเกอร์หรือกด &ldquo;ผสมสติกเกอร์ (+)&rdquo; เพื่อวางหลายตัว ย่อ-ขยาย หมุน แล้วส่งรวมเป็น 1 ชิ้น
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="setting-sticker-collage-toggle"
                  onClick={() => onSaveSettings({ stickerCollageEnabled: systemSettings.stickerCollageEnabled === false })}
                  style={{ ...css.btn(systemSettings.stickerCollageEnabled !== false ? "primary" : "secondary"), minWidth: "90px", justifyContent: "center" }}
                >
                  {systemSettings.stickerCollageEnabled !== false ? "เปิดอยู่" : "ปิดอยู่"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", background: "#F8FAFC", border: `1px solid ${FB.border}`, borderRadius: "10px", padding: "10px 12px" }}>
              <div style={{ flex: "1 1 260px" }}>
                <div style={{ fontWeight: "600", fontSize: "13px", color: FB.textPrimary }}>
                  โหมดสติกเกอร์เคลื่อนไหว (.gif) ในถาดเลือก (Viewport &amp; Lossy Poster)
                </div>
                <div style={{ fontSize: "12px", color: FB.textSecondary }}>
                  ช่วยป้องกัน iPad/มือถือค้างเวลาแพ็กสติกเกอร์ .gif เยอะ — โหมดขยับเฉพาะในจอจะพักตัวที่เลื่อนพ้นจออัตโนมัติ หรือเลือกโหมดภาพนิ่ง Lossy WebP เพื่อประหยัด RAM สูงสุด
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  data-testid="setting-sticker-gif-viewport"
                  onClick={() => onSaveSettings({ stickerPickerGifMode: "live_viewport" })}
                  style={css.btn((systemSettings.stickerPickerGifMode || "live_viewport") === "live_viewport" ? "primary" : "secondary")}
                >
                  ขยับเฉพาะที่อยู่ในจอ (แนะนำ)
                </button>
                <button
                  type="button"
                  data-testid="setting-sticker-gif-poster"
                  onClick={() => onSaveSettings({ stickerPickerGifMode: "static_poster" })}
                  style={css.btn(systemSettings.stickerPickerGifMode === "static_poster" ? "primary" : "secondary")}
                >
                  ภาพนิ่ง Lossy (ขยับเมื่อชี้/ส่ง)
                </button>
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>นโยบายการลบข้อความของผู้ใช้</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>กำหนดสิทธิ์การลบข้อความของตัวเองในห้องแชท</div>
            </div>
            <select
              value={systemSettings.deletePolicy}
              onChange={(e) => onSaveSettings({ deletePolicy: e.target.value as SystemSettings["deletePolicy"] })}
              style={{ ...css.input, width: "100%", maxWidth: "340px", height: "38px", borderRadius: "8px", padding: "6px 12px" }}
            >
              <option value="hybrid_15m">ลบเองในเวลาที่กำหนด (เกินเวลาส่งคำขอผู้ดูแล)</option>
              <option value="self_always">ลบข้อความตัวเองได้ตลอดเวลา</option>
              <option value="admin_only">ต้องแจ้งผู้ดูแลระบบอนุมัติลบเสมอ</option>
            </select>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>การเปิดซ้อนจากเครื่อง / IP เดียวกัน (รวม Incognito)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>ล็อก 1 เครื่อง = 1 ตัวตนเสมอ และกำหนดพฤติกรรมเมื่อเปิดแท็บ/หน้าต่างซ้อน</div>
            </div>
            <select
              data-testid="settings-session-policy-select"
              value={systemSettings.sessionPolicy || "takeover"}
              onChange={(e) => onSaveSettings({ sessionPolicy: e.target.value as SystemSettings["sessionPolicy"] })}
              style={{ ...css.input, width: "100%", maxWidth: "340px", height: "38px", borderRadius: "8px", padding: "6px 12px" }}
            >
              <option value="takeover">Auto-Takeover: สลับมาหน้าใหม่ &amp; ล็อกหน้าเก่า</option>
              <option value="block">Strict Block: ไม่อนุญาตให้เปิดซ้อน/Incognito</option>
              <option value="multi_allow">Allow Multi-Tab: อนุญาตเปิดหลายแท็บ (Dev)</option>
            </select>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>เวลาอนุญาตให้แก้ไขข้อความ (นาที)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>ค่าเริ่มต้น 15 นาที (ทุกการแก้ไขเก็บประวัติย้อนหลัง)</div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                min={1}
                max={1440}
                value={systemSettings.editWindowMinutes}
                onChange={(e) => setSystemSettings((s) => ({ ...s, editWindowMinutes: Math.max(1, parseInt(e.target.value || "15", 10)) }))}
                style={{ ...css.input, width: "96px", height: "38px", borderRadius: "8px", padding: "6px 10px", textAlign: "center" }}
              />
              <button type="button" onClick={() => onSaveSettings({ editWindowMinutes: systemSettings.editWindowMinutes })} style={{ ...css.btn("primary"), height: "38px" }}>
                <Save size={14} /> บันทึก
              </button>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>จำกัดผู้ใช้ออนไลน์พร้อมกันสูงสุด (Max Users, 0=ไม่จำกัด)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>ป้องกันเซิร์ฟเวอร์โหลดหนักเกินไป (แนะนำ 64–100 เครื่อง)</div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                data-testid="settings-max-users-input"
                min={0}
                max={1000}
                value={systemSettings.maxConcurrentUsers ?? 100}
                onChange={(e) => {
                  const raw = parseInt(e.target.value || "0", 10);
                  setSystemSettings((s) => ({ ...s, maxConcurrentUsers: Number.isFinite(raw) ? Math.max(0, Math.min(1000, raw)) : 100 }));
                }}
                style={{ ...css.input, width: "96px", height: "38px", borderRadius: "8px", padding: "6px 10px", textAlign: "center" }}
              />
              <button
                type="button"
                data-testid="settings-save-max-users-btn"
                onClick={() => onSaveSettings({ maxConcurrentUsers: systemSettings.maxConcurrentUsers ?? 100 })}
                style={{ ...css.btn("primary"), height: "38px" }}
              >
                <Save size={14} /> บันทึก
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ color: FB.textPrimary, fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>
          🛡️ การควบคุมแชท การป้องกันสแปม และ P2P Flood Guard
        </h3>
        <div style={{ ...css.card, display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>สถานะ Admin กำลังตรวจสอบระบบ (Spotlight Hold)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>แสดงป้ายแจ้งและกรอบไฟสี Admin บนหน้าแชทหลัก (ทำงานอัตโนมัติเมื่อเปิดล็อกหรือเบลอแชท)</div>
            </div>
            <button
              type="button"
              data-testid="settings-toggle-hold-btn"
              onClick={() => onSaveSettings({ adminHoldActive: !systemSettings.adminHoldActive })}
              style={{ ...css.btn(systemSettings.adminHoldActive ? "primary" : "secondary"), minWidth: "105px", height: "36px", justifyContent: "center" }}
            >
              {systemSettings.adminHoldActive ? "เปิดอยู่" : "ปิดอยู่"}
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>ล็อกการพิมพ์ห้องแชทรวมชั่วคราว (Lock Public Chat)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>พักการส่งข้อความและไฟล์ในห้องแชทรวมชั่วคราว (ผู้ใช้ยังอ่านแชทและส่ง P2P ได้)</div>
            </div>
            <button
              type="button"
              data-testid="settings-toggle-lock-btn"
              onClick={() => onSaveSettings({ chatLocked: !systemSettings.chatLocked })}
              style={{ ...css.btn(systemSettings.chatLocked ? "danger" : "secondary"), minWidth: "105px", height: "36px", justifyContent: "center" }}
            >
              {systemSettings.chatLocked ? "ล็อกอยู่" : "ปกติ"}
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>เบลอหน้าจอห้องแชทรวมชั่วคราว (Public Chat Privacy Blur)</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>ซ่อนเนื้อหาห้องแชทรวมและล็อกการพิมพ์ชั่วคราวระหว่างตรวจสอบ (ยังส่งไฟล์ LAN Share P2P ได้ปกติ)</div>
            </div>
            <button
              type="button"
              data-testid="settings-toggle-blur-btn"
              onClick={() => onSaveSettings({ chatBlurred: !systemSettings.chatBlurred })}
              style={{ ...css.btn(systemSettings.chatBlurred ? "danger" : "secondary"), minWidth: "105px", height: "36px", justifyContent: "center" }}
            >
              {systemSettings.chatBlurred ? "เบลออยู่" : "ปกติ"}
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontWeight: "600", color: FB.textPrimary }}>เปิดระบบกันสแปมแชท &amp; P2P Flood อัตโนมัติ</div>
              <div style={{ fontSize: "13px", color: FB.textSecondary }}>จับการยิงสคริปต์/รัวข้อความ/รัว P2P Offer (ไม่ตรวจเนื้อหาไฟล์ P2P ปกติ)</div>
            </div>
            <button
              type="button"
              data-testid="settings-toggle-antispam-btn"
              onClick={() => onSaveSettings({ antiSpamEnabled: !(systemSettings.antiSpamEnabled !== false) })}
              style={{ ...css.btn(systemSettings.antiSpamEnabled !== false ? "primary" : "secondary"), minWidth: "105px", height: "36px", justifyContent: "center" }}
            >
              {systemSettings.antiSpamEnabled !== false ? "เปิดอยู่" : "ปิดอยู่"}
            </button>
          </div>

          <div
            style={{
              borderTop: `1px solid ${FB.border}`,
              paddingTop: "14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <label style={{ fontSize: "12px", color: FB.textSecondary, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: "600", color: FB.textPrimary }}>แชทสูงสุดต่อรอบ</span>
              <input
                type="number"
                min={2}
                max={60}
                value={systemSettings.spamMaxMessages ?? 8}
                onChange={(e) => setSystemSettings((s) => ({ ...s, spamMaxMessages: Math.max(2, parseInt(e.target.value || "8", 10)) }))}
                style={{ ...css.input, height: "38px", borderRadius: "8px", padding: "6px 10px" }}
              />
            </label>
            <label style={{ fontSize: "12px", color: FB.textSecondary, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: "600", color: FB.textPrimary }}>ข้อความ/สติกเกอร์ซ้ำสูงสุด (0=ปิด)</span>
              <input
                type="number"
                data-testid="settings-max-duplicates-input"
                min={0}
                max={50}
                value={systemSettings.spamMaxDuplicates ?? 5}
                onChange={(e) => {
                  const raw = parseInt(e.target.value || "0", 10);
                  setSystemSettings((s) => ({ ...s, spamMaxDuplicates: Number.isFinite(raw) ? Math.max(0, Math.min(50, raw)) : 5 }));
                }}
                style={{ ...css.input, height: "38px", borderRadius: "8px", padding: "6px 10px" }}
              />
            </label>
            <label style={{ fontSize: "12px", color: FB.textSecondary, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: "600", color: FB.textPrimary }}>ช่วงเวลานับความถี่ (วินาที)</span>
              <input
                type="number"
                min={2}
                max={120}
                value={systemSettings.spamWindowSeconds ?? 10}
                onChange={(e) => setSystemSettings((s) => ({ ...s, spamWindowSeconds: Math.max(2, parseInt(e.target.value || "10", 10)) }))}
                style={{ ...css.input, height: "38px", borderRadius: "8px", padding: "6px 10px" }}
              />
            </label>
            <label style={{ fontSize: "12px", color: FB.textSecondary, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: "600", color: FB.textPrimary }}>ระงับส่งชั่วคราวอัตโนมัติ (นาที)</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={systemSettings.spamMuteMinutes ?? 5}
                onChange={(e) => setSystemSettings((s) => ({ ...s, spamMuteMinutes: Math.max(1, parseInt(e.target.value || "5", 10)) }))}
                style={{ ...css.input, height: "38px", borderRadius: "8px", padding: "6px 10px" }}
              />
            </label>
            <label style={{ fontSize: "12px", color: FB.textSecondary, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: "600", color: FB.textPrimary }}>คำขอส่งไฟล์ P2P สูงสุดต่อรอบ</span>
              <input
                type="number"
                min={2}
                max={40}
                value={systemSettings.p2pMaxOffersPerWindow ?? 6}
                onChange={(e) => setSystemSettings((s) => ({ ...s, p2pMaxOffersPerWindow: Math.max(2, parseInt(e.target.value || "6", 10)) }))}
                style={{ ...css.input, height: "38px", borderRadius: "8px", padding: "6px 10px" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              data-testid="settings-save-antispam-btn"
              onClick={() =>
                onSaveSettings({
                  spamMaxMessages: systemSettings.spamMaxMessages ?? 8,
                  spamMaxDuplicates: systemSettings.spamMaxDuplicates ?? 5,
                  spamWindowSeconds: systemSettings.spamWindowSeconds ?? 10,
                  spamMuteMinutes: systemSettings.spamMuteMinutes ?? 5,
                  p2pMaxOffersPerWindow: systemSettings.p2pMaxOffersPerWindow ?? 6,
                })
              }
              style={css.btn("primary")}
            >
              <Save size={14} /> บันทึกเกณฑ์ป้องกันสแปม
            </button>
          </div>
        </div>
      </div>

      <AdminResetSettingsSection
        onDownloadBackup={onDownloadBackup}
        onResetSystem={onResetSystem}
        onClearLogsWithPassword={onClearLogsWithPassword}
      />
    </div>
  );
}
