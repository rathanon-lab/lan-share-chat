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
import { evictMediaCache } from "@/lib/secureMedia";

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
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesOldestId, setMessagesOldestId] = useState<number | null>(null);
  const [messagesTotalCount, setMessagesTotalCount] = useState(0);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
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
    stickerPickerGifMode: "live_viewport",
  });

  const activeTabRef = useRef<AdminTab>(activeTab);
  const searchQueryRef = useRef<string>(searchQuery);
  const messagesOldestIdRef = useRef<number | null>(null);
  const messagesHasMoreRef = useRef<boolean>(false);
  const loadingOlderRef = useRef<boolean>(false);
  const incomingMsgBufferRef = useRef<ChatMessage[]>([]);
  const incomingAlertBufferRef = useRef<AdminAlertItem[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAlertToastAtRef = useRef<number>(0);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

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

  const loadMessages = useCallback(
    async (searchOverride?: string, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const q = (searchOverride !== undefined ? searchOverride : searchQueryRef.current).trim();
        const qs = new URLSearchParams({ limit: "60" });
        if (q) qs.set("search", q);
        const res = await apiFetch(`/api/admin/messages?${qs.toString()}`);
        if (Array.isArray(res)) {
          setMessages(res);
          messagesHasMoreRef.current = false;
          setMessagesHasMore(false);
          messagesOldestIdRef.current = res.length > 0 ? Number(res[0]?.id || 0) || null : null;
          setMessagesOldestId(messagesOldestIdRef.current);
          setMessagesTotalCount(res.length);
        } else {
          const list: ChatMessage[] = Array.isArray(res?.messages) ? res.messages : [];
          const hasMore = Boolean(res?.hasMore);
          const oldestId = typeof res?.oldestId === "number" ? res.oldestId : null;
          setMessages(list);
          messagesHasMoreRef.current = hasMore;
          setMessagesHasMore(hasMore);
          messagesOldestIdRef.current = oldestId;
          setMessagesOldestId(oldestId);
          setMessagesTotalCount(typeof res?.totalCount === "number" ? res.totalCount : list.length);
        }
      } catch (e: unknown) {
        if (!silent) notify(e instanceof Error ? e.message : "Load failed", "error");
      }
      if (!silent) setLoading(false);
    },
    [apiFetch, notify]
  );

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current || !messagesHasMoreRef.current) return;
    const beforeId = messagesOldestIdRef.current;
    if (!beforeId || beforeId <= 0) return;
    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const q = searchQueryRef.current.trim();
      const qs = new URLSearchParams({ limit: "60", beforeId: String(beforeId) });
      if (q) qs.set("search", q);
      const res = await apiFetch(`/api/admin/messages?${qs.toString()}`);
      const older: ChatMessage[] = Array.isArray(res?.messages) ? res.messages : [];
      const nextHasMore = Boolean(res?.hasMore);
      const nextOldest = typeof res?.oldestId === "number" ? res.oldestId : null;
      messagesHasMoreRef.current = nextHasMore;
      setMessagesHasMore(nextHasMore);
      if (nextOldest !== null) {
        messagesOldestIdRef.current = nextOldest;
        setMessagesOldestId(nextOldest);
      }
      if (typeof res?.totalCount === "number") {
        setMessagesTotalCount(res.totalCount);
      }
      if (older.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const uniqueOlder = older.filter((m) => !seen.has(m.id));
          return uniqueOlder.length > 0 ? [...uniqueOlder, ...prev] : prev;
        });
      }
    } catch {
      // ignore transient error on reverse scroll
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [apiFetch]);

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

  const purgeEnvCache = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/env-clear-cache", { method: "POST" });
      if (data && typeof data === "object") setEnvStatus(data);
      const freedMb = data?.purged?.freedMb ?? 0;
      const deletedFiles = data?.purged?.deletedFiles ?? 0;
      notify(`ล้างแคชชั่วคราวแล้ว ${deletedFiles} ไฟล์ (${freedMb} MB)`);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Purge cache failed", "error");
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

    const scheduleCoalescedFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        const msgBatch = incomingMsgBufferRef.current.splice(0);
        if (msgBatch.length > 0) {
          setMessagesTotalCount((c) => c + msgBatch.length);
          if (activeTabRef.current === "chat") {
            const q = searchQueryRef.current.trim().toLowerCase();
            const matching = q
              ? msgBatch.filter(
                  (m) =>
                    m.sender?.toLowerCase().includes(q) ||
                    m.text?.toLowerCase().includes(q)
                )
              : msgBatch;
            if (matching.length > 0) {
              setMessages((prev) => {
                const seen = new Set(prev.map((m) => m.id));
                const unique = matching.filter((m) => {
                  if (seen.has(m.id)) return false;
                  seen.add(m.id);
                  return true;
                });
                if (unique.length === 0) return prev;
                return [...prev, ...unique];
              });
            }
          }
        }

        const alertBatch = incomingAlertBufferRef.current.splice(0);
        if (alertBatch.length > 0) {
          setAlerts((prev) => {
            const incomingIds = new Set(alertBatch.map((a) => a.id));
            const merged = [...alertBatch.reverse(), ...prev.filter((a) => !incomingIds.has(a.id))];
            return merged.slice(0, 500);
          });
          const now = Date.now();
          if (now - lastAlertToastAtRef.current >= 1500) {
            lastAlertToastAtRef.current = now;
            const latest = alertBatch[0];
            if (alertBatch.length > 1) {
              notify(`มีแจ้งเตือนใหม่ ${alertBatch.length} รายการ (ล่าสุดจาก ${latest.sender || "User"})`, latest.alertType === "security_spam" ? "error" : "success");
            } else {
              notify(
                latest.alertType === "delete_request"
                  ? `คำขอลบข้อความจาก ${latest.sender}`
                  : latest.alertType === "security_spam"
                    ? `ตรวจพบสแปม/Flood จาก ${latest.sender}`
                    : `มีการแท็ก @admin จาก ${latest.sender}`,
                latest.alertType === "security_spam" ? "error" : "success"
              );
            }
          }
        }
      }, 300);
    };

    const sock = io({ auth: { isAdmin: true } });
    sock.on("receive_message", (msg: ChatMessage) => {
      incomingMsgBufferRef.current.push(msg);
      scheduleCoalescedFlush();
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
      incomingAlertBufferRef.current.push(alert);
      scheduleCoalescedFlush();
    });
    sock.on("admin_alert_resolved", (updated: AdminAlertItem) => {
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    });
    sock.on("admin_alerts_cleared", (payload?: { resolvedCount?: number }) => {
      incomingAlertBufferRef.current = [];
      if (payload && typeof payload.resolvedCount === "number") {
        setAlerts((prev) => prev.map((a) => (a.status === "pending" ? { ...a, status: "resolved" } : a)));
      } else {
        setAlerts([]);
      }
    });
    sock.on("settings_update", (s: SystemSettings) => setSystemSettings(s));
    sock.on("chat_reset", () => {
      incomingMsgBufferRef.current = [];
      setMessages([]);
      messagesHasMoreRef.current = false;
      setMessagesHasMore(false);
      messagesOldestIdRef.current = null;
      setMessagesOldestId(null);
      setMessagesTotalCount(0);
    });
    sock.on("message_deleted", ({ id }: { id: number }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
    sock.on("messages_batch_deleted", ({ ids }: { ids: number[] }) => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const idSet = new Set(ids);
      setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
    });
    sock.on(
      "message_attachments_updated",
      ({
        updates,
      }: {
        updates?: Array<{ id: number; attachments: ChatMessage["attachments"]; removedTokens?: string[] }>;
      }) => {
        if (!Array.isArray(updates) || updates.length === 0) return;
        const allTokens: string[] = [];
        const byId = new Map<number, ChatMessage["attachments"]>();
        for (const u of updates) {
          if (typeof u.id === "number" && Array.isArray(u.attachments)) {
            byId.set(u.id, u.attachments);
          }
          if (Array.isArray(u.removedTokens)) {
            for (const tok of u.removedTokens) {
              if (tok) allTokens.push(tok);
            }
          }
        }
        if (allTokens.length > 0) evictMediaCache(allTokens, true);
        if (byId.size > 0) {
          setMessages((prev) =>
            prev.map((m) => (byId.has(m.id) ? { ...m, attachments: byId.get(m.id) } : m))
          );
        }
      }
    );
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
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      sock.disconnect();
    };
  }, [loadAlerts, loadEnvStatus, loadServerInfo, loadSettings, loadStickers, notify, token]);

  // Server-side debounced search for Admin Chat pagination
  const didInitSearchRef = useRef(false);
  useEffect(() => {
    if (!didInitSearchRef.current) {
      didInitSearchRef.current = true;
      return;
    }
    if (activeTab !== "chat") return;
    const t = setTimeout(() => {
      loadMessages(searchQuery, true);
    }, 260);
    return () => clearTimeout(t);
  }, [searchQuery, activeTab, loadMessages]);

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
      await Promise.all([loadAlerts(), loadMessages(undefined, true)]);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function resolveAllAlerts() {
    try {
      const res = await apiFetch("/api/admin/alerts/resolve-all", { method: "POST" });
      setAlerts((prev) => prev.map((a) => (a.status === "pending" ? { ...a, status: "resolved" } : a)));
      notify(`ปิดแจ้งเตือนค้างทั้งหมดแล้ว (${res?.resolvedCount ?? 0} รายการ)`);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function saveSettings(patch: Partial<SystemSettings>) {
    let snapshot: SystemSettings | null = null;
    setSystemSettings((prev) => {
      snapshot = prev;
      return { ...prev, ...patch };
    });
    try {
      const updated = await apiFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify(patch) });
      setSystemSettings(updated);
      notify("บันทึกการตั้งค่าแล้ว");
    } catch (e: unknown) {
      if (snapshot) setSystemSettings(snapshot);
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
      await loadMessages(undefined, true);
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
    messagesHasMore,
    messagesOldestId,
    messagesTotalCount,
    loadingOlderMessages,
    loadOlderMessages,
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
    purgeEnvCache,
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
    resolveAllAlerts,
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
