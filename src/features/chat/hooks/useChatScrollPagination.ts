"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types/chat";

interface UseChatScrollPaginationOptions {
  messages: ChatMessage[];
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder?: () => Promise<void> | void;
  storageKey: string;
  pauseAutoLoad?: boolean;
  externalEndRef?: React.RefObject<HTMLDivElement | null>;
}

const NEAR_BOTTOM_THRESHOLD_PX = 140;

function readSavedLastReadId(storageKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeSavedLastReadId(storageKey: string, id: number): void {
  if (typeof window === "undefined" || !Number.isFinite(id) || id <= 0) return;
  try {
    const cur = readSavedLastReadId(storageKey);
    if (id > cur) {
      window.localStorage.setItem(storageKey, String(id));
    }
  } catch {}
}

function clearSavedLastReadId(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {}
}

export function useChatScrollPagination({
  messages,
  hasMore,
  loadingOlder,
  onLoadOlder,
  storageKey,
  pauseAutoLoad = false,
  externalEndRef,
}: UseChatScrollPaginationOptions) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const unreadDividerRef = useRef<HTMLDivElement | null>(null);
  const internalEndRef = useRef<HTMLDivElement | null>(null);
  const endRef = externalEndRef || internalEndRef;

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);
  const [unreadDividerMsgId, setUnreadDividerMsgId] = useState<number | null>(null);

  const isNearBottomRef = useRef(true);
  const didInitialPositionRef = useRef(false);
  const prevFirstIdRef = useRef<number>(0);
  const prevLastIdRef = useRef<number>(0);
  const prevLenRef = useRef<number>(0);
  const pendingAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const onLoadOlderRef = useRef(onLoadOlder);

  useEffect(() => {
    onLoadOlderRef.current = onLoadOlder;
  }, [onLoadOlder]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (smooth && distance < 3200) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance <= NEAR_BOTTOM_THRESHOLD_PX;
    isNearBottomRef.current = nearBottom;
    setIsNearBottom(nearBottom);

    if (nearBottom) {
      setUnreadBelowCount(0);
      const latestId = messages.length > 0 ? Number(messages[messages.length - 1]?.id || 0) : 0;
      if (latestId > 0) {
        writeSavedLastReadId(storageKey, latestId);
      }
    }
  }, [messages, storageKey]);

  const jumpToLatest = useCallback(() => {
    scrollToBottom(true);
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    setUnreadBelowCount(0);
    setUnreadDividerMsgId(null);
    const latestId = messages.length > 0 ? Number(messages[messages.length - 1]?.id || 0) : 0;
    if (latestId > 0) {
      writeSavedLastReadId(storageKey, latestId);
    }
  }, [messages, scrollToBottom, storageKey]);

  const dismissUnreadDivider = useCallback(() => {
    setUnreadDividerMsgId(null);
    setUnreadBelowCount(0);
    const latestId = messages.length > 0 ? Number(messages[messages.length - 1]?.id || 0) : 0;
    if (latestId > 0) {
      writeSavedLastReadId(storageKey, latestId);
    }
  }, [messages, storageKey]);

  // Auto-reverse infinite scroll via top sentinel IntersectionObserver
  useEffect(() => {
    if (!hasMore || loadingOlder || pauseAutoLoad || !onLoadOlderRef.current) return;
    const root = scrollContainerRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!didInitialPositionRef.current) return;
        if (entries.some((e) => e.isIntersecting)) {
          const el = scrollContainerRef.current;
          if (el) {
            pendingAnchorRef.current = {
              scrollHeight: el.scrollHeight,
              scrollTop: el.scrollTop,
            };
          }
          onLoadOlderRef.current?.();
        }
      },
      { root, rootMargin: "220px 0px 0px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingOlder, pauseAutoLoad, messages.length]);

  // Scroll anchoring on prepend + initial unread positioning + non-intrusive append
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const firstId = messages.length > 0 ? Number(messages[0]?.id || 0) : 0;
    const lastId = messages.length > 0 ? Number(messages[messages.length - 1]?.id || 0) : 0;

    // Reset state when chat is cleared
    if (messages.length === 0) {
      const hadMessages = prevLenRef.current > 0;
      didInitialPositionRef.current = false;
      prevFirstIdRef.current = 0;
      prevLastIdRef.current = 0;
      prevLenRef.current = 0;
      pendingAnchorRef.current = null;
      if (hadMessages) {
        clearSavedLastReadId(storageKey);
      }
      queueMicrotask(() => {
        setUnreadBelowCount(0);
        setUnreadDividerMsgId(null);
      });
      return;
    }

    // 1. Initial load positioning (resume at unread divider OR jump to bottom)
    if (!didInitialPositionRef.current) {
      didInitialPositionRef.current = true;
      prevFirstIdRef.current = firstId;
      prevLastIdRef.current = lastId;
      prevLenRef.current = messages.length;

      const savedReadId = readSavedLastReadId(storageKey);
      const firstUnread = savedReadId > 0 ? messages.find((m) => Number(m.id || 0) > savedReadId) : undefined;

      if (firstUnread && firstUnread.id && firstUnread.id !== firstId) {
        const unreadIdx = messages.findIndex((m) => m.id === firstUnread.id);
        const unreadCount = unreadIdx >= 0 ? messages.length - unreadIdx : 0;
        queueMicrotask(() => {
          setUnreadDividerMsgId(firstUnread.id);
          setUnreadBelowCount(unreadCount);
          requestAnimationFrame(() => {
            if (unreadDividerRef.current) {
              unreadDividerRef.current.scrollIntoView({ block: "center", behavior: "auto" });
              handleScroll();
            } else {
              scrollToBottom(false);
            }
          });
        });
      } else {
        if (el) el.scrollTop = el.scrollHeight;
        isNearBottomRef.current = true;
        writeSavedLastReadId(storageKey, lastId);
      }
      return;
    }

    // 2. Older messages prepended -> preserve exact scroll position (zero jump)
    if (pendingAnchorRef.current && firstId > 0 && prevFirstIdRef.current > 0 && firstId < prevFirstIdRef.current) {
      if (el) {
        const delta = el.scrollHeight - pendingAnchorRef.current.scrollHeight;
        el.scrollTop = pendingAnchorRef.current.scrollTop + Math.max(0, delta);
      }
      pendingAnchorRef.current = null;
      prevFirstIdRef.current = firstId;
      prevLastIdRef.current = lastId;
      prevLenRef.current = messages.length;
      return;
    }

    // 3. New messages appended at the bottom
    if (lastId > prevLastIdRef.current && prevLastIdRef.current > 0) {
      const prevLast = prevLastIdRef.current;
      const newlyAppended = messages.filter((m) => Number(m.id || 0) > prevLast);
      const addedCount = Math.max(1, newlyAppended.length);

      if (isNearBottomRef.current) {
        if (el) el.scrollTop = el.scrollHeight;
        writeSavedLastReadId(storageKey, lastId);
        queueMicrotask(() => setUnreadBelowCount(0));
      } else {
        const firstNewId = newlyAppended[0]?.id ?? lastId;
        queueMicrotask(() => {
          setUnreadBelowCount((c) => c + addedCount);
          setUnreadDividerMsgId((cur) => cur ?? firstNewId);
        });
      }
    }

    prevFirstIdRef.current = firstId;
    prevLastIdRef.current = lastId;
    prevLenRef.current = messages.length;
  }, [messages, handleScroll, scrollToBottom, storageKey]);

  return {
    scrollContainerRef,
    topSentinelRef,
    unreadDividerRef,
    endRef,
    isNearBottom,
    showJumpToLatest: !isNearBottom || unreadBelowCount > 0,
    unreadBelowCount,
    unreadDividerMsgId,
    handleScroll,
    jumpToLatest,
    dismissUnreadDivider,
  };
}
