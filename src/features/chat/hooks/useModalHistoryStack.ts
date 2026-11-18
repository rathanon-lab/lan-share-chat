"use client";

import { useEffect, useRef } from "react";

/**
 * Syncs open overlay modals/lightbox/mobile-subtab layers with browser History entries so that
 * hardware/gesture Back on Android Chrome & iOS Safari closes the topmost overlay first.
 * When at the root chat layer (depth 0), arms a single gesture-backed sentinel (satisfying
 * Chrome's History Manipulation Intervention) that notifies the user they are at the top-level
 * root screen without looping or bouncing back to /admin.
 */
export function useModalHistoryStack(
  closersBottomToTop: Array<() => void>,
  onRootBackAttempt?: () => void
) {
  const closersRef = useRef(closersBottomToTop);
  const onRootBackRef = useRef(onRootBackAttempt);
  const pushedDepthRef = useRef(0);
  const ignoringPopRef = useRef(0);
  const rootGuardArmedRef = useRef(false);

  useEffect(() => {
    closersRef.current = closersBottomToTop;
    onRootBackRef.current = onRootBackAttempt;
  }, [closersBottomToTop, onRootBackAttempt]);

  const desiredDepth = closersBottomToTop.length;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const armSentinel = () => {
      if (rootGuardArmedRef.current || pushedDepthRef.current > 0) return;
      const st = window.history.state as { __lanRootGuard?: boolean; __lanShareModalLayer?: number } | null;
      if (st?.__lanRootGuard || (st?.__lanShareModalLayer ?? 0) > 0) {
        rootGuardArmedRef.current = true;
        return;
      }
      rootGuardArmedRef.current = true;
      window.history.pushState({ __lanRootGuard: true }, "");
    };
    window.addEventListener("pointerdown", armSentinel, { passive: true });
    window.addEventListener("touchstart", armSentinel, { passive: true });
    window.addEventListener("keydown", armSentinel, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", armSentinel);
      window.removeEventListener("touchstart", armSentinel);
      window.removeEventListener("keydown", armSentinel);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (desiredDepth > pushedDepthRef.current) {
      const diff = desiredDepth - pushedDepthRef.current;
      for (let i = 0; i < diff; i++) {
        pushedDepthRef.current += 1;
        window.history.pushState({ __lanShareModalLayer: pushedDepthRef.current }, "");
      }
    } else if (desiredDepth < pushedDepthRef.current) {
      const diff = pushedDepthRef.current - desiredDepth;
      pushedDepthRef.current = desiredDepth;
      const currentLayer = Number(
        (window.history.state as { __lanShareModalLayer?: number } | null)?.__lanShareModalLayer || 0
      );
      if (currentLayer > 0) {
        const stepsBack = Math.min(diff, currentLayer);
        ignoringPopRef.current += 1;
        window.history.go(-stepsBack);
      }
    }
  }, [desiredDepth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      if (ignoringPopRef.current > 0) {
        ignoringPopRef.current -= 1;
        return;
      }
      const list = closersRef.current;
      if (list.length > 0 || pushedDepthRef.current > 0) {
        if (pushedDepthRef.current > 0) {
          pushedDepthRef.current -= 1;
        }
        const topCloser = list[list.length - 1];
        if (topCloser) {
          topCloser();
        }
        return;
      }

      rootGuardArmedRef.current = false;
      if (onRootBackRef.current) {
        onRootBackRef.current();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
