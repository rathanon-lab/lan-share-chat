"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, BarChart3, Bell, CheckCircle2, FileText, Globe, Loader2, LogOut,
  MessageSquare, RefreshCw, Settings, Sticker, Terminal, Users,
} from "lucide-react";
import type { AdminTab } from "@/types/chat";
import { useLanguage } from "@/lib/i18n";
import { PreviewableFile, UniversalFilePreviewModal } from "@/lib/filePreviewer";
import { UserAvatar } from "@/components/UserAvatar";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { FB, css } from "@/features/admin/theme";
import { LoginScreen } from "@/features/admin/components/LoginScreen";
import { AdminOverviewTab } from "@/features/admin/components/AdminOverviewTab";
import { AdminChatTab } from "@/features/admin/components/AdminChatTab";
import { StickerManagerTab } from "@/features/admin/components/StickerManagerTab";
import {
  AdminAlertsTab,
  AdminDevicesTab,
  AdminEnvTab,
  AdminFilesTab,
  AdminLogsTab,
  AdminSettingsTab,
} from "@/features/admin/components/AdminManagementTabs";
import { AdminConfirmModal } from "@/features/admin/components/AdminConfirmModal";
import { useAdminDashboard } from "@/features/admin/hooks/useAdminDashboard";
import { useAdminComposerMedia } from "@/features/admin/hooks/useAdminComposerMedia";

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const dash = useAdminDashboard(token);
  const { isEn, toggleLang, tx } = useLanguage();
  const media = useAdminComposerMedia({
    token,
    maxUploadMb: dash.maxUploadMb,
    notify: dash.notify,
    onUploadSuccess: dash.loadMessages,
  });

  const [adminCropFile, setAdminCropFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dash.messages]);

  async function sendAdminMessage(e: React.FormEvent) {
    e.preventDefault();
    if (media.isRecording || media.isEncodingVoice || media.uploadProgress !== null) return;
    if (media.attachPreviews.length > 0 || media.recordedVoice) {
      const filesToSend = [
        ...media.attachPreviews.map((a) => a.file),
        ...(media.recordedVoice ? [media.recordedVoice.file] : []),
      ];
      const isVoiceOnly = !!media.recordedVoice && media.attachPreviews.length === 0;
      await media.uploadAdminFiles(filesToSend, media.adminMessage.trim() || undefined, isVoiceOnly);
      return;
    }
    const text = media.adminMessage.trim();
    if (!text) return;
    try {
      await dash.apiFetch("/api/admin/send_message", { method: "POST", body: JSON.stringify({ text }) });
      media.setAdminMessage("");
      dash.notify(tx("ส่งข้อความแล้ว", "Message sent"));
      await dash.loadMessages();
    } catch (err: unknown) {
      dash.notify(err instanceof Error ? err.message : tx("ส่งข้อความไม่สำเร็จ", "Failed to send message"), "error");
    }
  }

  const pendingAlertCount = dash.alerts.filter((a) => a.status === "pending").length;
  const envMissingCount = dash.envStatus?.missingCount ?? 0;

  const sidebarItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: tx("ภาพรวมระบบ", "Dashboard"), icon: <BarChart3 size={18} /> },
    { id: "chat", label: tx("ห้องแชท", "Chat Channel"), icon: <MessageSquare size={18} /> },
    { id: "alerts", label: tx("แจ้งเตือน (@admin)", "Admin Alerts (@admin)"), icon: <Bell size={18} />, badge: pendingAlertCount },
    { id: "files", label: tx("ไฟล์อัปโหลด", "Uploaded Files"), icon: <FileText size={18} /> },
    { id: "devices", label: tx("อุปกรณ์", "Devices"), icon: <Users size={18} /> },
    { id: "stickers", label: tx("ชุดสติกเกอร์", "Sticker Packs"), icon: <Sticker size={18} /> },
    { id: "logs", label: "Activity Log", icon: <Activity size={18} /> },
    { id: "env", label: tx(".env / ระบบ", ".env / System"), icon: <Terminal size={18} />, badge: envMissingCount },
    { id: "settings", label: tx("ตั้งค่า", "Settings"), icon: <Settings size={18} /> },
  ];

  return (
    <div style={css.container} className="flex flex-col md:flex-row h-dvh overflow-hidden safe-area-shell admin-shell">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .sidebar-item:hover { background: ${FB.bg} !important; }
        .fb-btn-primary:hover { background: ${FB.blueDark} !important; }
        .admin-pill-bar::-webkit-scrollbar { height: 0px; display: none; }
        @media (max-width: 767px) {
          .admin-desktop-header { display: none !important; }
          .admin-main-content { padding: 10px !important; }
          .admin-shell [data-testid^="overview-toggle-"],
          .admin-shell [data-testid^="chat-toggle-"] {
            flex: 1 1 calc(50% - 6px) !important;
            min-width: 135px !important;
            font-size: 12px !important;
            padding: 7px 10px !important;
          }
          .admin-shell [data-testid^="device-card-"] {
            padding: 12px 12px 12px 18px !important;
            gap: 10px !important;
          }
        }
      `}</style>

      {dash.notification && (
        <div
          style={{
            position: "fixed",
            top: "14px",
            right: "14px",
            left: "14px",
            maxWidth: "420px",
            marginLeft: "auto",
            zIndex: 9999,
            background: dash.notification.type === "success" ? "#E8F5E9" : FB.redLight,
            border: `1px solid ${dash.notification.type === "success" ? "#C8E6C9" : "rgba(250,56,62,0.3)"}`,
            borderRadius: "10px",
            padding: "11px 16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: dash.notification.type === "success" ? "#2E7D32" : FB.red,
            fontSize: "13px",
            fontWeight: "600",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {dash.notification.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {dash.notification.text}
        </div>
      )}

      {/* Mobile Header + Scrollable Pill Tab Bar */}
      <div className="flex md:hidden flex-col shrink-0 bg-white border-b shadow-xs" style={{ borderColor: FB.border }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderBottom: `1px solid ${FB.border}`, gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <UserAvatar src={dash.systemSettings.adminAvatarUrl} name="Admin" size={30} isAdmin adminRingColor={dash.systemSettings.adminRingColor} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: "700", color: FB.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {sidebarItems.find((i) => i.id === dash.activeTab)?.label || "Admin"}
              </div>
              <div style={{ fontSize: "10px", color: FB.textSecondary }}>Admin · LAN Share</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
            <button
              type="button"
              data-testid="mobile-admin-lang-btn"
              onClick={toggleLang}
              style={{ ...css.btn("secondary"), padding: "5px 8px", fontSize: "11px", fontWeight: "700" }}
              title={tx("สลับภาษา (TH / EN)", "Toggle Language (TH / EN)")}
            >
              <Globe size={13} /> {isEn ? "EN" : "TH"}
            </button>
            <button
              type="button"
              onClick={dash.refreshActiveTab}
              style={{ ...css.btn("secondary"), padding: "5px 8px", fontSize: "11px" }}
              title={tx("รีเฟรช", "Refresh")}
            >
              <RefreshCw size={13} />
            </button>
            <Link href="/" replace style={{ ...css.btn("secondary"), padding: "5px 9px", fontSize: "11px", textDecoration: "none" }}>
              <MessageSquare size={13} /> {tx("แชท", "Chat")}
            </Link>
            <button onClick={onLogout} style={{ ...css.btn("danger"), padding: "5px 9px", fontSize: "11px" }}>
              <LogOut size={13} /> {tx("ออก", "Exit")}
            </button>
          </div>
        </div>
        <div className="admin-pill-bar" style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "7px 10px", WebkitOverflowScrolling: "touch" }}>
          {sidebarItems.map((item) => {
            const active = dash.activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`mobile-admin-tab-${item.id}`}
                onClick={() => dash.setActiveTab(item.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: `1.5px solid ${active ? FB.blue : FB.border}`,
                  background: active ? FB.blue : FB.bg,
                  color: active ? FB.white : FB.textPrimary,
                  fontSize: "12px",
                  fontWeight: active ? "700" : "600",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  cursor: "pointer",
                  boxShadow: active ? "0 2px 6px rgba(24,119,242,0.25)" : "none",
                }}
              >
                {item.icon}
                <span>{item.label}</span>
                {!!item.badge && item.badge > 0 && (
                  <span style={{ padding: "1px 6px", borderRadius: "999px", background: active ? FB.white : FB.red, color: active ? FB.blue : "white", fontSize: "10px", fontWeight: "700" }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside style={css.sidebar} className="hidden md:flex flex-col shrink-0">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 12px 16px", borderBottom: `1px solid ${FB.border}`, marginBottom: "8px" }}>
          <UserAvatar src={dash.systemSettings.adminAvatarUrl} name="Admin" size={42} isAdmin adminRingColor={dash.systemSettings.adminRingColor} />
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: FB.textPrimary }}>Admin</div>
            <div style={{ fontSize: "12px", color: FB.textSecondary }}>LAN Share Chat</div>
          </div>
        </div>

        {sidebarItems.map((item) => (
          <button
            type="button"
            key={item.id}
            data-testid={`admin-tab-${item.id}`}
            className="sidebar-item"
            style={{ ...css.sidebarItem(dash.activeTab === item.id), justifyContent: "space-between", width: "100%", border: "none", textAlign: "left" }}
            onClick={() => dash.setActiveTab(item.id)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ opacity: dash.activeTab === item.id ? 1 : 0.7 }}>{item.icon}</span>
              {item.label}
            </span>
            {!!item.badge && item.badge > 0 && (
              <span style={{ padding: "2px 7px", borderRadius: "999px", background: FB.red, color: "white", fontSize: "11px", fontWeight: "700" }}>
                {item.badge}
              </span>
            )}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button onClick={onLogout} style={{ ...css.btn("danger"), width: "100%", justifyContent: "center", borderRadius: "8px", padding: "10px" }}>
          <LogOut size={16} /> {tx("ออกจากระบบ", "Logout")}
        </button>
      </aside>

      <main style={css.main}>
        <div style={css.header} className="admin-desktop-header">
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: FB.textPrimary }}>
              {sidebarItems.find((i) => i.id === dash.activeTab)?.label}
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: FB.textSecondary }}>
              Admin Dashboard — Encrypted Media Token (AES-256-GCM)
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              data-testid="admin-lang-toggle-btn"
              onClick={toggleLang}
              style={{ ...css.btn("secondary"), fontWeight: "700" }}
              title={tx("สลับภาษา (TH / EN)", "Toggle Language (TH / EN)")}
            >
              <Globe size={15} /> {isEn ? "EN" : "TH"}
            </button>
            <Link href="/" replace style={{ ...css.btn("secondary"), textDecoration: "none" }}>
              <MessageSquare size={15} /> {tx("ห้องแชทหลัก", "Main Chat")}
            </Link>
            <button onClick={dash.refreshActiveTab} style={css.btn("secondary")}>
              <RefreshCw size={15} /> {tx("รีเฟรช", "Refresh")}
            </button>
          </div>
        </div>

        <div style={css.content} className="admin-main-content">
          {dash.loading && (
            <div style={{ textAlign: "center", padding: "60px", color: FB.textMuted }}>
              <Loader2 size={28} style={{ animation: "spin 1s linear infinite", marginBottom: "8px" }} />
              <p style={{ margin: 0, fontSize: "14px" }}>{tx("กำลังโหลด...", "Loading...")}</p>
            </div>
          )}

          {dash.activeTab === "overview" && !dash.loading && (
            <AdminOverviewTab
              overview={dash.overview}
              systemSettings={dash.systemSettings}
              onSaveSettings={dash.saveSettings}
              onNavigateTab={(tab) => dash.setActiveTab(tab)}
            />
          )}

          {dash.activeTab === "chat" && !dash.loading && (
            <AdminChatTab
              token={token}
              messages={dash.messages}
              systemSettings={dash.systemSettings}
              stickerPacks={dash.stickerPacks}
              searchQuery={dash.searchQuery}
              setSearchQuery={dash.setSearchQuery}
              adminMessage={media.adminMessage}
              setAdminMessage={media.setAdminMessage}
              attachPreviews={media.attachPreviews}
              uploadProgress={media.uploadProgress}
              onCancelUpload={media.cancelAdminUpload}
              isRecording={media.isRecording}
              isEncodingVoice={media.isEncodingVoice}
              recordSec={media.recordSec}
              recordedVoice={media.recordedVoice}
              onClearRecordedVoice={media.clearRecordedVoice}
              canUseMicContext={dash.canUseMicContext}
              onStartRecording={() => media.startRecording(dash.systemSettings.voiceMessageEnabled, dash.canUseMicContext)}
              onStopRecording={media.stopRecording}
              onSendMessage={sendAdminMessage}
              onSendSticker={dash.sendAdminSticker}
              onFilesSelected={media.handleFilesSelected}
              onAddFiles={media.addAdminFiles}
              onRemoveAttachPreview={media.removeAttachPreview}
              onClearAllAttachPreviews={media.clearAllAttachPreviews}
              onDeleteMsg={(id) =>
                dash.setConfirmModal({
                  title: "ยืนยันการลบข้อความ",
                  description: "คุณต้องการลบข้อความนี้ออกจากห้องแชทอย่างถาวรใช่หรือไม่?",
                  confirmLabel: "ลบข้อความ",
                  onConfirm: async () => {
                    await dash.apiFetch(`/api/admin/message/${id}`, { method: "DELETE" });
                    dash.setMessages((prev) => prev.filter((m) => m.id !== id));
                    dash.notify("ลบข้อความแล้ว");
                  },
                })
              }
              onBatchDeleteMessages={(ids) =>
                dash.setConfirmModal({
                  title: `ยืนยันการลบ ${ids.length} ข้อความที่เลือก`,
                  description: `ต้องการลบข้อความที่เลือกจำนวน ${ids.length} รายการออกจากห้องแชทอย่างถาวรใช่หรือไม่?`,
                  confirmLabel: `ลบ ${ids.length} ข้อความ`,
                  onConfirm: async () => {
                    const res = await dash.apiFetch("/api/admin/messages/batch-delete", {
                      method: "POST",
                      body: JSON.stringify({ ids }),
                    });
                    const deletedSet = new Set<number>(res?.deletedIds || ids);
                    dash.setMessages((prev) => prev.filter((m) => !deletedSet.has(Number(m.id))));
                    dash.notify(`ลบ ${(res?.deletedIds || ids).length} ข้อความแล้ว`);
                  },
                })
              }
              onPurgeDeviceMessages={(deviceId, senderName, windowMinutes) =>
                dash.setConfirmModal({
                  title: windowMinutes
                    ? `ลบข้อความ ${windowMinutes} นาทีล่าสุดของ "${senderName}"`
                    : `ลบข้อความทั้งหมดของ "${senderName}"`,
                  description: windowMinutes
                    ? `ต้องการลบข้อความทั้งหมดของอุปกรณ์ ${deviceId} ที่ส่งภายใน ${windowMinutes} นาทีที่ผ่านมาใช่หรือไม่?`
                    : `ต้องการลบข้อความทั้งหมดในประวัติแชทของอุปกรณ์ ${deviceId} ใช่หรือไม่?`,
                  confirmLabel: "ยืนยันกวาดข้อความ",
                  onConfirm: async () => {
                    const res = await dash.apiFetch("/api/admin/messages/purge-device", {
                      method: "POST",
                      body: JSON.stringify({ deviceId, windowMinutes }),
                    });
                    const deletedSet = new Set<number>(res?.deletedIds || []);
                    if (deletedSet.size > 0) {
                      dash.setMessages((prev) => prev.filter((m) => !deletedSet.has(Number(m.id))));
                    }
                    dash.notify(`ลบข้อความของ ${senderName} จำนวน ${deletedSet.size} รายการแล้ว`);
                  },
                })
              }
              onPreviewFile={setPreviewFile}
              onToggleAdminHold={() => dash.saveSettings({ adminHoldActive: !dash.systemSettings.adminHoldActive })}
              onToggleChatLocked={() => dash.saveSettings({ chatLocked: !dash.systemSettings.chatLocked })}
              onToggleChatBlurred={() => dash.saveSettings({ chatBlurred: !dash.systemSettings.chatBlurred })}
              onQuickMuteDevice={(deviceId, senderName, unmute) =>
                dash.muteDevice(deviceId, senderName, unmute ? 0 : dash.systemSettings.spamMuteMinutes || 5)
              }
              onQuickBanDevice={(deviceId, senderName, unban) =>
                unban
                  ? dash.banDevice(deviceId, senderName, false, false)
                  : dash.setConfirmModal({
                      title: `ยืนยันระงับการใช้งาน "${senderName}"`,
                      description: `ต้องการแบนอุปกรณ์ ${deviceId} (ปิดกั้นแชท + อัปโหลด + P2P) ใช่หรือไม่?`,
                      confirmLabel: "ยืนยันแบน",
                      onConfirm: async () => {
                        await dash.banDevice(deviceId, senderName, true, false);
                      },
                    })
              }
              messagesEndRef={messagesEndRef}
            />
          )}

          {dash.activeTab === "alerts" && !dash.loading && (
            <AdminAlertsTab
              alerts={dash.alerts}
              pendingAlertCount={pendingAlertCount}
              onResolveAlert={dash.resolveAlert}
              onResetAlerts={() => dash.resetSystem({ alerts: true })}
              onGoToChat={() => dash.setActiveTab("chat")}
            />
          )}

          {dash.activeTab === "files" && !dash.loading && (
            <AdminFilesTab
              token={token}
              files={dash.files}
              onResetFiles={() => dash.resetSystem({ files: true })}
              onDeleteFile={(id) =>
                dash.setConfirmModal({
                  title: "ยืนยันการลบไฟล์",
                  description: "คุณต้องการลบไฟล์นี้ออกจากเซิร์ฟเวอร์อย่างถาวรใช่หรือไม่?",
                  confirmLabel: "ลบไฟล์",
                  onConfirm: async () => {
                    await dash.apiFetch(`/api/admin/file/${id}`, { method: "DELETE" });
                    dash.setFiles((prev) => prev.filter((f) => f.id !== id));
                    dash.notify("ลบไฟล์แล้ว");
                  },
                })
              }
              onBatchDeleteFiles={(ids, names) =>
                dash.setConfirmModal({
                  title: `ยืนยันการลบ ${ids.length} ไฟล์ที่เลือก`,
                  description: `ต้องการลบไฟล์ที่เลือกถาวรใช่หรือไม่? (${names.slice(0, 3).join(", ")}${names.length > 3 ? ` และอีก ${names.length - 3} ไฟล์` : ""})`,
                  confirmLabel: `ลบ ${ids.length} ไฟล์`,
                  onConfirm: async () => {
                    const res = await dash.apiFetch("/api/admin/files/batch-delete", {
                      method: "POST",
                      body: JSON.stringify({ ids }),
                    });
                    const deletedSet = new Set<number>(res?.deletedIds || ids);
                    dash.setFiles((prev) => prev.filter((f) => !deletedSet.has(Number(f.id))));
                    dash.notify(`ลบ ${res?.deletedCount ?? ids.length} ไฟล์แล้ว`);
                  },
                })
              }
              onPreviewFile={setPreviewFile}
            />
          )}

          {dash.activeTab === "devices" && !dash.loading && (
            <AdminDevicesTab
              devices={dash.devices}
              bannedIps={dash.bannedIps}
              adminCallerIp={dash.adminCallerIp}
              adminCallerDeviceId={dash.adminCallerDeviceId}
              presenceMap={dash.presenceMap}
              inlineEditId={dash.inlineEditId}
              inlineEditValue={dash.inlineEditValue}
              setInlineEditValue={dash.setInlineEditValue}
              onStartEdit={(id, name) => {
                dash.setInlineEditId(id);
                dash.setInlineEditValue(name);
              }}
              onSaveEdit={dash.saveInlineEdit}
              onCancelEdit={() => {
                dash.setInlineEditId(null);
                dash.setInlineEditValue("");
              }}
              onGenerateAlias={dash.generateDeviceAlias}
              onMuteDevice={(deviceId, name, minutes) => dash.muteDevice(deviceId, name, minutes)}
              onBanDevice={(deviceId, name, banned, banIpToo) => {
                if (!banned) {
                  dash.banDevice(deviceId, name, false, false);
                  return;
                }
                dash.setConfirmModal({
                  title: `ยืนยันระงับการใช้งาน "${name}"`,
                  description: `ต้องการแบนอุปกรณ์ ${deviceId}${banIpToo ? " พร้อม IP ล่าสุด" : ""} ใช่หรือไม่? (จะปิดกั้นแชท อัปโหลด และ P2P ทันที)`,
                  confirmLabel: banIpToo ? "แบนอุปกรณ์ + IP" : "แบนอุปกรณ์",
                  onConfirm: async () => {
                    await dash.banDevice(deviceId, name, true, Boolean(banIpToo));
                  },
                });
              }}
              onUnbanIp={dash.unbanIpAddress}
              onDeleteDevice={(deviceId, name) =>
                dash.setConfirmModal({
                  title: `ยืนยันลบอุปกรณ์ "${name}"`,
                  description: `ต้องการลบประวัติอุปกรณ์ ${deviceId} ออกจากรายชื่อใช่หรือไม่? (ข้อความเก่าในแชทจะยังอยู่)`,
                  confirmLabel: "ลบอุปกรณ์",
                  onConfirm: async () => {
                    await dash.apiFetch(`/api/admin/device/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
                    dash.setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
                    dash.notify(`ลบอุปกรณ์ "${name}" แล้ว`);
                  },
                })
              }
              onResetDevices={() => dash.resetSystem({ devices: true })}
            />
          )}

          {dash.activeTab === "stickers" && !dash.loading && (
            <StickerManagerTab
              token={token}
              packs={dash.stickerPacks}
              limits={dash.stickerLimits}
              onRefreshPacks={dash.loadStickers}
              notify={dash.notify}
              requestConfirm={dash.setConfirmModal}
            />
          )}

          {dash.activeTab === "logs" && !dash.loading && <AdminLogsTab logs={dash.logs} />}

          {dash.activeTab === "env" && !dash.loading && (
            <AdminEnvTab
              envStatus={dash.envStatus}
              onClearEnvLogs={dash.clearEnvLogs}
              onPurgeEnvCache={dash.purgeEnvCache}
            />
          )}

          {dash.activeTab === "settings" && (
            <AdminSettingsTab
              systemSettings={dash.systemSettings}
              setSystemSettings={dash.setSystemSettings}
              onSaveSettings={dash.saveSettings}
              onResetAdminAvatar={() => dash.saveAdminAvatar({ reset: true })}
              onPickAdminCropFile={setAdminCropFile}
              onDownloadBackup={dash.downloadBackup}
              onResetSystem={dash.resetSystem}
              onClearLogsWithPassword={dash.clearLogsWithPassword}
            />
          )}
        </div>
      </main>

      {previewFile && <UniversalFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}

      {adminCropFile && (
        <AvatarCropModal
          file={adminCropFile}
          title="ปรับแต่งรูปโปรไฟล์ Admin (ตัดขอบกลม)"
          onCancel={() => setAdminCropFile(null)}
          onConfirm={async (dataUrl) => {
            setAdminCropFile(null);
            await dash.saveAdminAvatar({ imageDataUrl: dataUrl });
          }}
        />
      )}

      <AdminConfirmModal
        confirmModal={dash.confirmModal}
        onClose={() => dash.setConfirmModal(null)}
        onError={(msg) => dash.notify(msg, "error")}
      />
    </div>
  );
}

function subscribeAdminToken(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("admin-token-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("admin-token-change", callback);
  };
}

export default function AdminPage() {
  const token = useSyncExternalStore(
    subscribeAdminToken,
    () => sessionStorage.getItem("adminToken"),
    () => null
  );
  const kickedReason = useSyncExternalStore(
    subscribeAdminToken,
    () => sessionStorage.getItem("adminKickedReason"),
    () => null
  );

  useEffect(() => {
    const onKicked = () => {
      sessionStorage.removeItem("adminToken");
      localStorage.removeItem("adminToken");
      sessionStorage.setItem("adminKickedReason", "1");
      window.dispatchEvent(new Event("admin-token-change"));
    };
    window.addEventListener("admin-session-kicked", onKicked);
    return () => window.removeEventListener("admin-session-kicked", onKicked);
  }, []);

  function handleLogin(nextToken: string) {
    sessionStorage.setItem("adminToken", nextToken);
    sessionStorage.removeItem("adminKickedReason");
    localStorage.setItem("adminToken", nextToken);
    window.dispatchEvent(new Event("admin-token-change"));
  }

  function handleLogout() {
    const curr = sessionStorage.getItem("adminToken") || localStorage.getItem("adminToken") || "";
    if (curr) {
      fetch("/api/admin/logout", {
        method: "POST",
        headers: { "x-admin-token": curr },
      }).catch(() => {});
    }
    sessionStorage.removeItem("adminToken");
    sessionStorage.removeItem("adminKickedReason");
    localStorage.removeItem("adminToken");
    window.dispatchEvent(new Event("admin-token-change"));
  }

  if (!token) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        kickedReason={kickedReason}
        onClearKickedReason={() => {
          sessionStorage.removeItem("adminKickedReason");
          window.dispatchEvent(new Event("admin-token-change"));
        }}
      />
    );
  }
  return <AdminDashboard token={token} onLogout={handleLogout} />;
}
