"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type {
  AdminEnvStatusPayload,
  AdminOverviewStats,
  AdminTab,
  ChatMessage,
  PresenceStatus,
  SenderDeviceStatus,
  StickerItem,
  StickerMessageMeta,
  StickerPack,
  SystemSettings,
} from "@/types/chat";
import type { AdminAlertItem } from "@/features/admin/components/AdminAlertsTab";
import type { AdminUploadedFileItem } from "@/features/admin/components/AdminFilesTab";
import type { AdminDeviceItem } from "@/features/admin/components/AdminDevicesTab";
import type { AdminLogEntry } from "@/features/admin/components/AdminLogsTab";
import { ADMIN_DEFAULT_AVATAR_URL, DEFAULT_ADMIN_RING_COLOR } from "@/lib/avatars";

export interface AdminConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

export function useAdminDashboard(token: string) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<AdminUploadedFileItem[]>([]);
  const [devices, setDevices] = useState<AdminDeviceItem[]>([]);
  const [bannedIps, setBannedIps] = useState<Array<{ ip: string; reason: string; bannedAt: number }>>([]);
  const [adminCallerIp, setAdminCallerIp] = useState<string>("");
  const [adminCallerDeviceId, setAdminCallerDeviceId] = useState<string>("");
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [envStatus, setEnvStatus] = useState<AdminEnvStatusPayload | null>(null);
  const [alerts, setAlerts] = useState<AdminAlertItem[]>([]);
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [stickerLimits, setStickerLimits] = useState({ min: 4, recommended: 16, max: 40 });
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceStatus>>({});

  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState("");
  const [canUseMicContext, setCanUseMicContext] = useState(false);
  const [maxUploadMb, setMaxUploadMb] = useState(1024);
  const [confirmModal, setConfirmModal] = useState<AdminConfirmState | null>(null);

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    voiceMessageEnabled: true,
    deletePolicy: "hybrid_15m",
    editWindowMinutes: 15,
    adminRingColor: DEFAULT_ADMIN_RING_COLOR,
    adminAvatarUrl: ADMIN_DEFAULT_AVATAR_URL,
    adminHoldActive: false,
    chatLocked: false,
    antiSpamEnabled: true,
    spamMaxMessages: 8,
    spamMaxDuplicates: 5,
    spamWindowSeconds: 10,
    spamMuteMinutes: 5,
    p2pMaxOffersPerWindow: 6,
    maxConcurrentUsers: 100,
    stickerPreviewMode: "fullscreen_modal",
    stickerCollageEnabled: true,
  });

  const activeTabRef = useRef<AdminTab>(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const notify = useCallback((text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const apiFetch = useCallback(
    async (url: string, opts?: RequestInit) => {
      const myDevId = typeof window !== "undefined" ? localStorage.getItem("deviceId") || "" : "";
      const res = await fetch(url, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
          "x-device-id": myDevId,
          ...opts?.headers,
        },
      });
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("admin-session-kicked", { detail: body }));
        }
        throw new Error(body.error || "Unauthorized");
      }
      if (!res.ok) throw new Error((await res.json()).error || "Request failed");
      return res.json();
    },
    [token]
  );

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await apiFetch("/api/admin/overview");
        setOverview(data);
        if (Array.isArray(data?.bannedIps)) setBannedIps(data.bannedIps);
      } catch (e: unknown) {
        if (!silent) notify(e instanceof Error ? e.message : "Load failed", "error");
      }
      if (!silent) setLoading(false);
    },
    [apiFetch, notify]
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      setMessages(await apiFetch("/api/admin/messages"));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Load failed", "error");
    }
    setLoading(false);
  }, [apiFetch, notify]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await apiFetch("/api/admin/files"));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Load failed", "error");
    }
    setLoading(false);
  }, [apiFetch, notify]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/devices");
      if (Array.isArray(res)) {
        setDevices(res);
      } else {
        setDevices(Array.isArray(res?.devices) ? res.devices : []);
        if (Array.isArray(res?.bannedIps)) setBannedIps(res.bannedIps);
        if (typeof res?.callerIp === "string") setAdminCallerIp(res.callerIp);
        if (typeof res?.callerDeviceId === "string") setAdminCallerDeviceId(res.callerDeviceId);
      }
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Load failed", "error");
    }
    setLoading(false);
  }, [apiFetch, notify]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await apiFetch("/api/admin/logs"));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Load failed", "error");
    }
    setLoading(false);
  }, [apiFetch, notify]);

  const loadPresence = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/presence");
      if (data && typeof data === "object") setPresenceMap(data);
    } catch {}
  }, [apiFetch]);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/alerts");
      if (Array.isArray(data)) setAlerts(data);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Load failed", "error");
    }
  }, [apiFetch, notify]);

  const loadStickers = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/stickers");
      if (Array.isArray(data?.packs)) setStickerPacks(data.packs);
      if (data?.limits) setStickerLimits(data.limits);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Load failed", "error");
    }
  }, [apiFetch, notify]);

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/settings");
      if (data && typeof data === "object") setSystemSettings(data);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Load failed", "error");
    }
  }, [apiFetch, notify]);

  const loadEnvStatus = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/env-status");
      if (data && typeof data === "object") setEnvStatus(data);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Load failed", "error");
    }
  }, [apiFetch, notify]);

  const clearEnvLogs = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/env-logs", { method: "DELETE" });
      if (data && typeof data === "object") setEnvStatus(data);
      notify("ลบ Environment Log แล้ว");
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Clear failed", "error");
    }
  }, [apiFetch, notify]);

  const loadServerInfo = useCallback(async () => {
    setCanUseMicContext(
      typeof window !== "undefined" &&
        window.isSecureContext &&
        (window.location.protocol === "https:" ||
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1")
    );
    try {
      const [infoRes, cfgRes] = await Promise.all([fetch("/api/server-info"), fetch("/api/config")]);
      if (infoRes.ok) {
        const info = await infoRes.json();
        if (info.settings) setSystemSettings(info.settings);
      }
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (typeof cfg.maxChatFileSizeMb === "number" && cfg.maxChatFileSizeMb > 0) {
          setMaxUploadMb(cfg.maxChatFileSizeMb);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const paramTab = new URLSearchParams(window.location.search).get("tab");
    if (
      paramTab === "overview" ||
      paramTab === "chat" ||
      paramTab === "stickers" ||
      paramTab === "alerts" ||
      paramTab === "files" ||
      paramTab === "devices" ||
      paramTab === "logs" ||
      paramTab === "env" ||
      paramTab === "settings"
    ) {
      queueMicrotask(() => setActiveTab(paramTab));
    }

    queueMicrotask(() => {
      loadAlerts();
      loadSettings();
      loadEnvStatus();
      loadServerInfo();
      loadStickers();
    });

    const sock = io({ auth: { isAdmin: true } });
    sock.on("receive_message", (msg: ChatMessage) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    sock.on("messages_read", ({ upToId, readAt }: { upToId: number; readAt: number }) => {
      if (!upToId) return;
      setMessages((prev) => prev.map((m) => (m.id <= upToId && !m.isDeleted ? { ...m, isRead: 1, readAt: m.readAt || readAt } : m)));
    });
    sock.on("message_edited", (ev: { id: number; text: string; editedAt: number; editCount: number; editHistory: ChatMessage["editHistory"] }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === ev.id ? { ...m, text: ev.text, editedAt: ev.editedAt, editCount: ev.editCount, editHistory: ev.editHistory } : m))
      );
    });
    sock.on("message_soft_deleted", (ev: { id: number; deletedAt: number; deletedBy: string }) => {
      setMessages((prev) => prev.map((m) => (m.id === ev.id ? { ...m, isDeleted: 1, deletedAt: ev.deletedAt, deletedBy: ev.deletedBy } : m)));
    });
    sock.on("admin_alert", (alert: AdminAlertItem) => {
      setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)]);
      notify(
        alert.alertType === "delete_request"
          ? `คำขอลบข้อความจาก ${alert.sender}`
          : alert.alertType === "security_spam"
            ? `ตรวจพบสแปม/Flood จาก ${alert.sender}`
            : `มีการแท็ก @admin จาก ${alert.sender}`,
        alert.alertType === "security_spam" ? "error" : "success"
      );
    });
    sock.on("admin_alert_resolved", (updated: AdminAlertItem) => {
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    });
    sock.on("admin_alerts_cleared", () => setAlerts([]));
    sock.on("settings_update", (s: SystemSettings) => setSystemSettings(s));
    sock.on("chat_reset", () => setMessages([]));
    sock.on("message_deleted", ({ id }: { id: number }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
    sock.on("messages_batch_deleted", ({ ids }: { ids: number[] }) => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const idSet = new Set(ids);
      setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
    });
    sock.on("device_status_changed", ({ deviceId: targetId, status }: { deviceId: string; status: SenderDeviceStatus }) => {
      if (!targetId) return;
      setMessages((prev) =>
        prev.map((m) =>
          !m.isAdmin && m.senderDeviceId === targetId
            ? {
                ...m,
                senderStatus: status,
                ...(status === "deleted" ? { senderAvatarUrl: "", senderOs: undefined } : {}),
              }
            : m
        )
      );
    });
    sock.on("admin_session_kicked", (ev: { replacedToken?: string; newClientId?: string }) => {
      const myCid = typeof window !== "undefined" ? sessionStorage.getItem("adminClientId") : null;
      if (
        (ev?.replacedToken && ev.replacedToken === token) ||
        (ev?.newClientId && myCid && ev.newClientId !== myCid)
      ) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("admin-session-kicked", { detail: ev }));
        }
      }
    });
    return () => {
      sock.disconnect();
    };
  }, [loadAlerts, loadEnvStatus, loadServerInfo, loadSettings, loadStickers, notify, token]);

  useEffect(() => {
    let iv: ReturnType<typeof setInterval> | null = null;
    queueMicrotask(() => {
      if (activeTab === "overview") {
        loadOverview();
      } else if (activeTab === "chat") {
        loadMessages();
      } else if (activeTab === "alerts") {
        loadAlerts();
      } else if (activeTab === "files") {
        loadFiles();
      } else if (activeTab === "devices") {
        loadDevices();
        loadPresence();
      } else if (activeTab === "stickers") {
        loadStickers();
      } else if (activeTab === "logs") {
        loadLogs();
      } else if (activeTab === "env") {
        loadEnvStatus();
      } else if (activeTab === "settings") {
        loadSettings();
        loadServerInfo();
      }
    });
    if (activeTab === "overview") {
      iv = setInterval(() => loadOverview(true), 15000);
    }
    return () => {
      if (iv) clearInterval(iv);
    };
  }, [activeTab, loadAlerts, loadDevices, loadEnvStatus, loadFiles, loadLogs, loadMessages, loadOverview, loadPresence, loadServerInfo, loadSettings, loadStickers]);

  async function resolveAlert(alertId: number, action: "approve_delete" | "reject" | "resolved") {
    try {
      await apiFetch(`/api/admin/alerts/${alertId}/resolve`, { method: "POST", body: JSON.stringify({ action }) });
      notify(action === "approve_delete" ? "อนุมัติลบข้อความแล้ว" : action === "reject" ? "ปฏิเสธคำขอลบแล้ว" : "ปิดแจ้งเตือนแล้ว");
      await Promise.all([loadAlerts(), loadMessages()]);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function saveSettings(patch: Partial<SystemSettings>) {
    try {
      const updated = await apiFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify(patch) });
      setSystemSettings(updated);
      notify("บันทึกการตั้งค่าแล้ว");
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function generateDeviceAlias(deviceId: string) {
    try {
      const res = await apiFetch(`/api/admin/device/${encodeURIComponent(deviceId)}/generate-name`, { method: "POST" });
      notify(`สุ่มชื่อใหม่: ${res.name}`);
      await loadDevices();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function muteDevice(deviceId: string, name: string, minutes: number) {
    try {
      await apiFetch(`/api/admin/device/${encodeURIComponent(deviceId)}/mute`, {
        method: "POST",
        body: JSON.stringify({ minutes, reason: minutes > 0 ? "Admin quick mute" : "" }),
      });
      notify(minutes > 0 ? `จำกัดการส่ง ${name} เป็นเวลา ${minutes} นาทีแล้ว` : `ปลด Mute ${name} แล้ว`);
      setMessages((prev) =>
        prev.map((m) =>
          !m.isAdmin && m.senderDeviceId === deviceId && m.senderStatus !== "banned" && m.senderStatus !== "ip_banned"
            ? { ...m, senderStatus: minutes > 0 ? "muted" : "active" }
            : m
        )
      );
      if (activeTabRef.current === "devices") await loadDevices();
      if (activeTabRef.current === "overview") await loadOverview(true);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function banDevice(deviceId: string, name: string, banned: boolean, banIpToo = false) {
    try {
      await apiFetch(`/api/admin/device/${encodeURIComponent(deviceId)}/ban`, {
        method: "POST",
        body: JSON.stringify({ banned, banIpToo, unbanIp: !banned, reason: banned ? "Admin moderation ban" : "" }),
      });
      notify(banned ? `ระงับการใช้งาน ${name}${banIpToo ? " (+IP)" : ""} แล้ว` : `ปลดแบน ${name} แล้ว`);
      setMessages((prev) =>
        prev.map((m) =>
          !m.isAdmin && m.senderDeviceId === deviceId
            ? { ...m, senderStatus: banned ? (banIpToo ? "ip_banned" : "banned") : "active" }
            : m
        )
      );
      if (activeTabRef.current === "devices") await loadDevices();
      if (activeTabRef.current === "overview") await loadOverview(true);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function unbanIpAddress(ip: string) {
    try {
      await apiFetch("/api/admin/banned-ip", { method: "DELETE", body: JSON.stringify({ ip }) });
      notify(`ปลดแบน IP ${ip} แล้ว`);
      await loadDevices();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function saveAdminAvatar(params: { imageDataUrl?: string; reset?: boolean }) {
    try {
      const res = await apiFetch("/api/admin/avatar", { method: "POST", body: JSON.stringify(params) });
      if (res?.settings) setSystemSettings((prev) => ({ ...prev, ...res.settings }));
      notify(params.reset ? "คืนค่ารูป Admin พิเศษแล้ว" : "อัปเดตรูปโปรไฟล์ Admin แล้ว");
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function sendAdminSticker(pack: StickerPack, item: StickerItem, customMeta?: StickerMessageMeta) {
    const stickerMeta = customMeta || {
      packId: pack.packId,
      stickerId: item.stickerId,
      url: item.url,
      alt: item.alt || item.stickerId,
    };
    try {
      await apiFetch("/api/admin/send_message", {
        method: "POST",
        body: JSON.stringify({
          type: "sticker",
          text: stickerMeta.alt || item.alt || item.stickerId,
          stickerMeta,
        }),
      });
      await loadMessages();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function saveInlineEdit(deviceId: string) {
    const name = inlineEditValue.trim();
    if (!name) {
      setInlineEditId(null);
      return;
    }
    try {
      await apiFetch(`/api/admin/device/${encodeURIComponent(deviceId)}/name`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      setInlineEditId(null);
      notify("เปลี่ยนชื่อแล้ว");
      await loadDevices();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function downloadBackup() {
    try {
      const res = await fetch("/api/admin/backup", { headers: { "x-admin-token": token } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${Date.now()}.json`;
      a.click();
      notify("ดาวน์โหลด Backup แล้ว");
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  function resetSystem(opts: {
    messages?: boolean;
    files?: boolean;
    devices?: boolean;
    settings?: boolean;
    alerts?: boolean;
    telemetry?: boolean;
    stickers?: boolean;
  }) {
    const what = [
      opts.messages && "ข้อความทั้งหมด",
      opts.files && "ไฟล์ทั้งหมด",
      opts.devices && "รายชื่ออุปกรณ์",
      opts.alerts && "ประวัติแจ้งเตือน",
      opts.telemetry && "สถิติภาพรวม",
      opts.stickers && "ชุดสติกเกอร์ที่อัปโหลด",
      opts.settings && "การตั้งค่าเริ่มต้น",
    ]
      .filter(Boolean)
      .join(" และ ");
    setConfirmModal({
      title: `ยืนยันรีเซ็ต${what}`,
      description: `ต้องการลบ/รีเซ็ต${what} ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`,
      confirmLabel: "ยืนยันรีเซ็ต",
      onConfirm: async () => {
        try {
          await apiFetch("/api/admin/reset", {
            method: "POST",
            body: JSON.stringify({
              resetMessages: !!opts.messages,
              resetFiles: !!opts.files,
              resetDevices: !!opts.devices,
              resetSettings: !!opts.settings,
              resetAlerts: !!opts.alerts,
              resetTelemetry: !!opts.telemetry,
              resetStickers: !!opts.stickers,
            }),
          });
          notify(`รีเซ็ต ${what} เรียบร้อย`);
          if (opts.messages) await loadMessages();
          if (opts.files) await loadFiles();
          if (opts.devices) await loadDevices();
          if (opts.alerts) await loadAlerts();
          if (opts.settings) await loadSettings();
          if (opts.stickers || (opts.messages && opts.files && opts.settings)) await loadStickers();
          if (opts.telemetry || opts.messages || opts.files || opts.devices) await loadOverview(true);
        } catch (e: unknown) {
          notify(e instanceof Error ? e.message : "Failed", "error");
        }
      },
    });
  }

  async function clearLogsWithPassword(confirmPassword: string) {
    await apiFetch("/api/admin/reset", {
      method: "POST",
      body: JSON.stringify({ resetLogs: true, confirmPassword }),
    });
    notify("ล้างประวัติ Activity Log เรียบร้อยแล้ว");
    await loadLogs();
  }

  function refreshActiveTab() {
    if (activeTab === "overview") loadOverview();
    if (activeTab === "chat") loadMessages();
    if (activeTab === "alerts") loadAlerts();
    if (activeTab === "files") loadFiles();
    if (activeTab === "devices") {
      loadDevices();
      loadPresence();
    }
    if (activeTab === "stickers") loadStickers();
    if (activeTab === "logs") loadLogs();
    if (activeTab === "env") loadEnvStatus();
    if (activeTab === "settings") {
      loadSettings();
      loadServerInfo();
    }
  }

  return {
    activeTab,
    setActiveTab,
    overview,
    messages,
    setMessages,
    files,
    setFiles,
    devices,
    setDevices,
    bannedIps,
    adminCallerIp,
    adminCallerDeviceId,
    logs,
    envStatus,
    clearEnvLogs,
    alerts,
    stickerPacks,
    stickerLimits,
    presenceMap,
    loading,
    notification,
    notify,
    searchQuery,
    setSearchQuery,
    inlineEditId,
    setInlineEditId,
    inlineEditValue,
    setInlineEditValue,
    canUseMicContext,
    maxUploadMb,
    confirmModal,
    setConfirmModal,
    systemSettings,
    setSystemSettings,
    apiFetch,
    loadMessages,
    loadStickers,
    resolveAlert,
    saveSettings,
    generateDeviceAlias,
    muteDevice,
    banDevice,
    unbanIpAddress,
    saveAdminAvatar,
    sendAdminSticker,
    saveInlineEdit,
    downloadBackup,
    resetSystem,
    clearLogsWithPassword,
    refreshActiveTab,
  };
}
