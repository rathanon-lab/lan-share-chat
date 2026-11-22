"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ChatMessage,
  PeerInfo,
  RuntimeConfig,
  SenderDeviceStatus,
  StickerPack,
  SystemSettings,
} from "@/types/chat";
import {
  ANIMAL_AVATAR_PRESETS,
  ADMIN_DEFAULT_AVATAR_URL,
  DEFAULT_ADMIN_RING_COLOR,
} from "@/lib/avatars";
import { useWebRTCTransfer } from "@/features/p2p/hooks/useWebRTCTransfer";
import { evictMediaCache } from "@/lib/secureMedia";
import type { SessionConflictState } from "@/features/chat/components/SessionConflictOverlay";

export interface ChatIdentity {
  deviceId: string;
  name: string;
  ip: string;
  avatarUrl?: string;
  os?: string;
  browser?: string;
}

export interface ClientRestriction {
  banned: boolean;
  mutedUntil: number | null;
  reason?: string;
}

const subscribeNoop = () => () => {};
const getMicContextSnapshot = () =>
  typeof window !== "undefined" && window.isSecureContext && window.location.protocol === "https:";

export function useChatSocket(showToast: (text: string, type?: "info" | "error" | "success") => void) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const canUseMicContext = useSyncExternalStore(subscribeNoop, getMicContextSnapshot, () => false);

  const [identity, setIdentity] = useState<ChatIdentity>({ deviceId: "", name: "Loading...", ip: "..." });
  const identityRef = useRef<{ deviceId: string; name: string; ip: string }>({
    deviceId: "",
    name: "Loading...",
    ip: "...",
  });

  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>({
    maxChatFileSizeMb: 1024,
    maxChatFileBytes: 1024 * 1024 * 1024,
    maxP2pFileSizeMb: 1024,
    maxP2pFileBytes: 1024 * 1024 * 1024,
    maxChatFilesBatch: 10,
    minStickersPerPack: 1,
    recommendedStickersPerPack: 16,
    maxStickersPerPack: 40,
    avatarPresets: ANIMAL_AVATAR_PRESETS,
  });

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
    stickerPreviewMode: "fullscreen_modal",
    stickerCollageEnabled: true,
  });

  const [restriction, setRestriction] = useState<ClientRestriction | null>(null);
  const [sessionConflict, setSessionConflict] = useState<SessionConflictState | null>(null);
  const sessionConflictRef = useRef<SessionConflictState | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isTabVisible, setIsTabVisible] = useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );
  const lastEmittedReadIdRef = useRef(0);

  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const peersRef = useRef<PeerInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesOldestId, setMessagesOldestId] = useState<number | null>(null);
  const [messagesTotalCount, setMessagesTotalCount] = useState(0);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const loadingOlderRef = useRef(false);
  const oldestIdRef = useRef<number | null>(null);
  const hasMoreRef = useRef(false);
  const incomingQueueRef = useRef<ChatMessage[]>([]);
  const incomingFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);

  const showToastRef = useRef(showToast);
  const webrtc = useWebRTCTransfer({ socket, peersRef, runtimeConfig, showToast });
  const webrtcHandlersRef = useRef({
    handleSignalingEvent: webrtc.handleSignalingEvent,
    handleDirectRelayEvent: webrtc.handleDirectRelayEvent,
    closeAllConnections: webrtc.closeAllConnections,
  });

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    webrtcHandlersRef.current = {
      handleSignalingEvent: webrtc.handleSignalingEvent,
      handleDirectRelayEvent: webrtc.handleDirectRelayEvent,
      closeAllConnections: webrtc.closeAllConnections,
    };
  }, [webrtc.handleSignalingEvent, webrtc.handleDirectRelayEvent, webrtc.closeAllConnections]);

  useEffect(() => {
    const savedDeviceId = localStorage.getItem("deviceId") || "";

    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg) return;
        setRuntimeConfig((prev) => ({
          ...prev,
          maxChatFileSizeMb: cfg.maxChatFileSizeMb || prev.maxChatFileSizeMb,
          maxChatFileBytes: cfg.maxChatFileBytes || prev.maxChatFileBytes,
          maxP2pFileSizeMb: cfg.maxP2pFileSizeMb || prev.maxP2pFileSizeMb,
          maxP2pFileBytes: cfg.maxP2pFileBytes || prev.maxP2pFileBytes,
          maxChatFilesBatch: cfg.maxChatFilesBatch || prev.maxChatFilesBatch,
          minStickersPerPack: cfg.minStickersPerPack ?? prev.minStickersPerPack,
          recommendedStickersPerPack: cfg.recommendedStickersPerPack ?? prev.recommendedStickersPerPack,
          maxStickersPerPack: cfg.maxStickersPerPack ?? prev.maxStickersPerPack,
          avatarPresets:
            Array.isArray(cfg.avatarPresets) && cfg.avatarPresets.length > 0 ? cfg.avatarPresets : prev.avatarPresets,
        }));
        if (cfg.settings) setSystemSettings((prev) => ({ ...prev, ...cfg.settings }));
      })
      .catch(() => {});

    fetch("/api/stickers")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.packs)) setStickerPacks(data.packs);
      })
      .catch(() => {});

    let clientHint = "";
    try {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
      if (nav.platform === "MacIntel" && nav.maxTouchPoints > 1) {
        clientHint = "iPadOS";
      } else if (nav.userAgentData?.platform) {
        clientHint = String(nav.userAgentData.platform);
      } else if (nav.platform) {
        clientHint = String(nav.platform);
      }
    } catch {}

    const tabInstanceId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const newSocket = io({ query: { deviceId: savedDeviceId, clientHint, tabInstanceId } });
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    newSocket.on("connect", () => {
      setIsConnected(true);
      sessionConflictRef.current = null;
      setSessionConflict(null);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });
    newSocket.on("disconnect", (reason) => {
      setIsConnected(false);
      if (reason === "io server disconnect" && !sessionConflictRef.current) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => newSocket.connect(), 2500);
      }
    });

    newSocket.on("session_conflict", (payload: SessionConflictState) => {
      if (!payload || !payload.mode) return;
      sessionConflictRef.current = payload;
      setSessionConflict(payload);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });

    newSocket.on("identity", (data: ChatIdentity) => {
      const resolvedId = data.deviceId || savedDeviceId || "";
      setIdentity({
        deviceId: resolvedId,
        name: data.name,
        ip: data.ip,
        avatarUrl: data.avatarUrl,
        os: data.os,
        browser: data.browser,
      });
      identityRef.current = { deviceId: resolvedId, name: data.name, ip: data.ip };
      if (data.deviceId) localStorage.setItem("deviceId", data.deviceId);
    });

    newSocket.on(
      "device_profile_updated",
      ({ deviceId: updatedId, name: nextName, avatarUrl: nextAvatar }: { deviceId: string; name?: string; avatarUrl?: string }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderDeviceId === updatedId
              ? { ...m, sender: nextName || m.sender, senderAvatarUrl: nextAvatar || m.senderAvatarUrl }
              : m
          )
        );
      }
    );

    newSocket.on("settings_update", (nextSettings: Partial<SystemSettings>) => {
      if (nextSettings) setSystemSettings((prev) => ({ ...prev, ...nextSettings }));
    });

    newSocket.on("sticker_packs_update", (packs: StickerPack[]) => {
      if (Array.isArray(packs)) setStickerPacks(packs);
    });

    newSocket.on("message_deleted", ({ id }: { id: number }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    newSocket.on("messages_batch_deleted", ({ ids }: { ids: number[] }) => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const idSet = new Set(ids);
      setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
    });

    newSocket.on(
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

    newSocket.on("device_status_changed", ({ deviceId: targetId, status }: { deviceId: string; status: SenderDeviceStatus }) => {
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

    newSocket.on(
      "message_edited",
      ({
        id,
        text,
        editedAt,
        editCount,
        editHistory,
      }: {
        id: number;
        text: string;
        editedAt: number;
        editCount: number;
        editHistory: ChatMessage["editHistory"];
      }) => {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text, editedAt, editCount, editHistory } : m)));
      }
    );

    newSocket.on("message_soft_deleted", ({ id, deletedAt, deletedBy }: { id: number; deletedAt: number; deletedBy: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                isDeleted: 1,
                deletedAt,
                deletedBy,
                text: "",
                attachments: [],
                stickerMeta: null,
                mediaToken: null,
                fileName: null,
                fileSize: null,
                mimeType: null,
              }
            : m
        )
      );
    });

    newSocket.on("chat_reset", () => {
      incomingQueueRef.current = [];
      setMessages([]);
      setMessagesHasMore(false);
      hasMoreRef.current = false;
      setMessagesOldestId(null);
      oldestIdRef.current = null;
      setMessagesTotalCount(0);
    });
    newSocket.on("chat_history", (history: ChatMessage[]) => {
      incomingQueueRef.current = [];
      setMessages(history);
      const firstId = history.length > 0 ? Number(history[0]?.id || 0) : 0;
      if (firstId > 0 && oldestIdRef.current === null) {
        oldestIdRef.current = firstId;
        setMessagesOldestId(firstId);
      }
    });
    newSocket.on(
      "chat_history_meta",
      (meta: { hasMore?: boolean; oldestId?: number | null; totalCount?: number }) => {
        const hm = Boolean(meta?.hasMore);
        const oid = typeof meta?.oldestId === "number" ? meta.oldestId : null;
        hasMoreRef.current = hm;
        oldestIdRef.current = oid;
        setMessagesHasMore(hm);
        setMessagesOldestId(oid);
        if (typeof meta?.totalCount === "number") setMessagesTotalCount(meta.totalCount);
      }
    );
    newSocket.on("peers_update", (updatedPeers: PeerInfo[]) => {
      setPeers(updatedPeers);
      peersRef.current = updatedPeers;
    });
    newSocket.on("receive_message", (msg: ChatMessage) => {
      incomingQueueRef.current.push(msg);
      if (!incomingFlushTimerRef.current) {
        incomingFlushTimerRef.current = setTimeout(() => {
          incomingFlushTimerRef.current = null;
          const batch = incomingQueueRef.current.splice(0);
          if (batch.length === 0) return;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const uniqueNew = batch.filter((m) => {
              if (seen.has(m.id)) return false;
              seen.add(m.id);
              return true;
            });
            if (uniqueNew.length === 0) return prev;
            return [...prev, ...uniqueNew];
          });
          setMessagesTotalCount((c) => c + batch.length);
        }, 120);
      }
    });

    newSocket.on("messages_read", ({ upToId, readAt }: { upToId: number; readAt: number }) => {
      if (!upToId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id && m.id <= upToId && !m.isDeleted ? { ...m, isRead: 1, readAt: m.readAt || readAt } : m))
      );
    });

    newSocket.on("client_restricted", (data: { banned?: boolean; mutedUntil?: number | null; reason?: string }) => {
      const hasBan = Boolean(data?.banned);
      const hasMute = Boolean(data?.mutedUntil && data.mutedUntil > Date.now());
      if (!hasBan && !hasMute) {
        setRestriction(null);
      } else {
        setRestriction({
          banned: hasBan,
          mutedUntil: data?.mutedUntil ?? null,
          reason: data?.reason,
        });
        if (hasBan) {
          setPeers([]);
          peersRef.current = [];
        }
        setNowMs(Date.now());
      }
    });

    const handleGuardError = (fallback: string) => (err: { message?: string; mutedUntil?: number }) => {
      showToastRef.current(err?.message || fallback, "error");
      if (err?.mutedUntil) {
        setRestriction((prev) => ({
          banned: prev?.banned || false,
          mutedUntil: err.mutedUntil!,
          reason: err.message,
        }));
        setNowMs(Date.now());
      }
    };
    newSocket.on("chat_error", handleGuardError("ไม่สามารถส่งข้อความได้"));
    newSocket.on("p2p_error", handleGuardError("การส่งไฟล์ P2P ถูกจำกัดชั่วคราว"));

    newSocket.on("webrtc_signaling", (data) => webrtcHandlersRef.current.handleSignalingEvent(data, newSocket));
    newSocket.on("direct_relay", (data) => webrtcHandlersRef.current.handleDirectRelayEvent(data));

    setSocket(newSocket);

    const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let currentPresence: "online" | "idle" | "offline" = "online";

    const emitPresence = (status: "online" | "idle" | "offline") => {
      if (status === currentPresence) return;
      currentPresence = status;
      newSocket.emit("presence_update", { status });
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (document.visibilityState === "visible" && currentPresence !== "online") emitPresence("online");
      idleTimer = setTimeout(() => {
        if (document.visibilityState === "visible") emitPresence("idle");
      }, IDLE_TIMEOUT_MS);
    };

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsTabVisible(visible);
      if (!visible) {
        emitPresence("idle");
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      } else {
        currentPresence = "idle";
        emitPresence("online");
        resetIdleTimer();
      }
    };

    const handleWindowFocus = () => setIsTabVisible(document.visibilityState === "visible");
    const handleBeforeUnload = () => newSocket.emit("presence_update", { status: "offline" });

    resetIdleTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("mousemove", resetIdleTimer, { passive: true });
    document.addEventListener("keydown", resetIdleTimer, { passive: true });
    document.addEventListener("touchstart", resetIdleTimer, { passive: true });
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (incomingFlushTimerRef.current) {
        clearTimeout(incomingFlushTimerRef.current);
        incomingFlushTimerRef.current = null;
      }
      newSocket.disconnect();
      webrtcHandlersRef.current.closeAllConnections();
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("mousemove", resetIdleTimer);
      document.removeEventListener("keydown", resetIdleTimer);
      document.removeEventListener("touchstart", resetIdleTimer);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (!restriction?.mutedUntil || restriction.mutedUntil <= nowMs) return;
    const t = setInterval(() => {
      const cur = Date.now();
      setNowMs(cur);
      if (restriction.mutedUntil && cur >= restriction.mutedUntil && !restriction.banned) {
        setRestriction(null);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [restriction, nowMs]);

  useEffect(() => {
    if (!socket || !isConnected || !isTabVisible || !identity.deviceId || restriction?.banned) return;
    const latestUnreadFromOther = [...messages]
      .reverse()
      .find((m) => m.id && !m.isDeleted && m.senderDeviceId !== identity.deviceId && !m.isRead);
    if (latestUnreadFromOther?.id && latestUnreadFromOther.id > lastEmittedReadIdRef.current) {
      lastEmittedReadIdRef.current = latestUnreadFromOther.id;
      socket.emit("mark_messages_read", { upToId: latestUnreadFromOther.id });
    }
  }, [messages, identity.deviceId, socket, isConnected, isTabVisible, restriction?.banned]);

  const handleSaveProfile = useCallback(
    async (params: { name: string; avatarUrl?: string; croppedDataUrl?: string }) => {
      if (params.croppedDataUrl) {
        const res = await fetch("/api/profile/avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: identity.deviceId, name: params.name, imageDataUrl: params.croppedDataUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ");
        return;
      }
      if (socket) socket.emit("update_identity", { name: params.name, avatarUrl: params.avatarUrl });
    },
    [identity.deviceId, socket]
  );

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const beforeId = oldestIdRef.current;
    if (!beforeId || beforeId <= 0) return;
    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const res = await fetch(`/api/messages/page?limit=60&beforeId=${beforeId}`);
      if (!res.ok) return;
      const data = await res.json();
      const older: ChatMessage[] = Array.isArray(data?.messages) ? data.messages : [];
      const nextHasMore = Boolean(data?.hasMore);
      const nextOldest = typeof data?.oldestId === "number" ? data.oldestId : null;
      hasMoreRef.current = nextHasMore;
      setMessagesHasMore(nextHasMore);
      if (nextOldest !== null) {
        oldestIdRef.current = nextOldest;
        setMessagesOldestId(nextOldest);
      }
      if (typeof data?.totalCount === "number") {
        setMessagesTotalCount(data.totalCount);
      }
      if (older.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const uniqueOlder = older.filter((m) => !existingIds.has(m.id));
          return uniqueOlder.length > 0 ? [...uniqueOlder, ...prev] : prev;
        });
      }
    } catch {
      // ignore transient network errors on reverse scroll
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, []);

  const reclaimSession = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    socket,
    isConnected,
    canUseMicContext,
    identity,
    identityRef,
    runtimeConfig,
    systemSettings,
    restriction,
    sessionConflict,
    nowMs,
    peers,
    messages,
    messagesHasMore,
    messagesOldestId,
    messagesTotalCount,
    loadingOlderMessages,
    loadOlderMessages,
    stickerPacks,
    webrtc,
    handleSaveProfile,
    reclaimSession,
  };
}
