"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Film, ImageOff, Loader2, RefreshCw, VideoOff } from 'lucide-react';
import { sanitizeDownloadFileName } from '@/lib/fileNameGuard';

const blobUrlCache = new Map<string, string>();
const blobCache = new Map<string, Blob>();
const inFlightRequests = new Map<string, Promise<string>>();
const thumbUrlCache = new Map<string, string | null>();
const inFlightThumbs = new Map<string, Promise<string | null>>();
const streamUrlCache = new Map<string, { url: string; exp: number }>();
const goneMediaTokens = new Set<string>();
const mediaResolvedListeners = new Map<string, Set<() => void>>();
let cachedVideoTranscodeAvail: boolean | null = null;

export class MediaGoneError extends Error {
  readonly status: number;
  constructor(status = 410, message = 'Media file has been deleted') {
    super(message);
    this.name = 'MediaGoneError';
    this.status = status;
  }
}

export function isMediaGoneError(err: unknown): boolean {
  return err instanceof MediaGoneError || (err instanceof Error && err.name === 'MediaGoneError');
}

export function isMediaTokenGone(token: string): boolean {
  return Boolean(token) && goneMediaTokens.has(token);
}

export function evictMediaCache(tokens: string[], markGone = true): void {
  if (!Array.isArray(tokens) || tokens.length === 0) return;
  for (const token of tokens) {
    if (!token) continue;
    const blobUrl = blobUrlCache.get(token);
    if (blobUrl) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {}
      blobUrlCache.delete(token);
    }
    blobCache.delete(token);
    const thumbUrl = thumbUrlCache.get(token);
    if (thumbUrl) {
      try {
        URL.revokeObjectURL(thumbUrl);
      } catch {}
    }
    thumbUrlCache.delete(token);
    streamUrlCache.delete(token);
    if (markGone) goneMediaTokens.add(token);
    notifyMediaResolved(token);
  }
}

const MAX_CONCURRENT_MEDIA = 6;
let activeMediaLoads = 0;
const mediaLoadQueue: Array<() => void> = [];

function runWithMediaQueue<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      activeMediaLoads += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeMediaLoads = Math.max(0, activeMediaLoads - 1);
          const next = mediaLoadQueue.shift();
          if (next) next();
        });
    };
    if (activeMediaLoads < MAX_CONCURRENT_MEDIA) {
      start();
    } else {
      mediaLoadQueue.push(start);
    }
  });
}

async function fetchWithRetryOn429(input: RequestInfo | URL, init: RequestInit, maxRetries = 3): Promise<Response> {
  const backoffMs = [350, 800, 1600];
  let attempt = 0;
  while (true) {
    const res = await fetch(input, init);
    if (res.status !== 429 || attempt >= maxRetries) {
      return res;
    }
    const waitMs = backoffMs[Math.min(attempt, backoffMs.length - 1)];
    attempt += 1;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

function notifyMediaResolved(token: string): void {
  const subs = mediaResolvedListeners.get(token);
  if (!subs) return;
  for (const cb of Array.from(subs)) {
    try {
      cb();
    } catch {}
  }
}

export function subscribeMediaResolved(token: string, cb: () => void): () => void {
  let set = mediaResolvedListeners.get(token);
  if (!set) {
    set = new Set();
    mediaResolvedListeners.set(token, set);
  }
  set.add(cb);
  return () => {
    const cur = mediaResolvedListeners.get(token);
    if (!cur) return;
    cur.delete(cb);
    if (cur.size === 0) mediaResolvedListeners.delete(token);
  };
}

function useInViewport(rootMargin = '280px'): { ref: React.RefObject<HTMLDivElement | null>; inView: boolean } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState<boolean>(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

export async function getVideoTranscodeAvailable(): Promise<boolean> {
  if (cachedVideoTranscodeAvail !== null) return cachedVideoTranscodeAvail;
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      cachedVideoTranscodeAvail = Boolean(cfg?.videoTranscodeAvailable);
      return cachedVideoTranscodeAvail;
    }
  } catch {}
  return false;
}

function resolveAuthHeaders(opts?: { deviceId?: string; adminToken?: string }): Record<string, string> {
  const deviceId =
    opts?.deviceId ||
    (typeof window !== 'undefined' ? localStorage.getItem('deviceId') || 'browser_client' : 'browser_client');
  const adminToken =
    opts?.adminToken ||
    (typeof window !== 'undefined' ? localStorage.getItem('adminToken') || '' : '');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-id': deviceId,
  };
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
  }
  return headers;
}

export async function fetchEncryptedMediaBlob(
  token: string,
  opts?: { deviceId?: string; adminToken?: string; fileName?: string; mimeType?: string }
): Promise<{ blob: Blob; url: string }> {
  if (!token) throw new Error('Missing media token');
  if (blobCache.has(token) && blobUrlCache.has(token)) {
    return { blob: blobCache.get(token)!, url: blobUrlCache.get(token)! };
  }

  const url = await fetchEncryptedMediaBlobUrl(token, opts);
  let blob = blobCache.get(token);
  if (!blob) {
    const res = await fetch(url);
    blob = await res.blob();
    blobCache.set(token, blob);
  }
  return { blob, url };
}

export async function fetchEncryptedMediaBlobUrl(
  token: string,
  opts?: { deviceId?: string; adminToken?: string; fileName?: string; mimeType?: string }
): Promise<string> {
  if (!token) throw new Error('Missing media token');
  if (goneMediaTokens.has(token)) {
    throw new MediaGoneError(410);
  }
  if (blobUrlCache.has(token)) {
    return blobUrlCache.get(token)!;
  }
  if (inFlightRequests.has(token)) {
    return inFlightRequests.get(token)!;
  }

  const headers = resolveAuthHeaders(opts);
  const promise = runWithMediaQueue(async () => {
    const res = await fetchWithRetryOn429('/api/media/fetch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    });
    if (res.status === 410 || res.status === 404) {
      goneMediaTokens.add(token);
      throw new MediaGoneError(res.status);
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch encrypted media (${res.status})`);
    }
    let blob = await res.blob();

    const lowerName = String(opts?.fileName || '').toLowerCase();
    const isHeic =
      lowerName.endsWith('.heic') ||
      lowerName.endsWith('.heif') ||
      blob.type === 'image/heic' ||
      blob.type === 'image/heif';

    if (isHeic && typeof window !== 'undefined') {
      try {
        const heic2any = (await import('heic2any')).default;
        const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 });
        blob = Array.isArray(converted) ? converted[0] : converted;
      } catch {
        // Native Safari supports HEIC directly even if client decode fails
      }
    }

    blobCache.set(token, blob);
    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache.set(token, objectUrl);
    inFlightRequests.delete(token);
    notifyMediaResolved(token);
    return objectUrl;
  });

  inFlightRequests.set(token, promise);
  promise.catch(() => {
    inFlightRequests.delete(token);
  });

  return promise;
}

/**
 * Fetches a compact server-generated JPEG thumbnail via /api/media/thumb with
 * bounded concurrency and 429 retry backoff. Returns null when 204 No Content.
 */
export async function fetchEncryptedThumbnailUrl(
  token: string,
  opts?: { deviceId?: string; adminToken?: string }
): Promise<string | null> {
  if (!token) throw new Error('Missing media token');
  if (goneMediaTokens.has(token)) {
    throw new MediaGoneError(410);
  }
  if (thumbUrlCache.has(token)) {
    return thumbUrlCache.get(token) ?? null;
  }
  if (inFlightThumbs.has(token)) {
    return inFlightThumbs.get(token)!;
  }

  const headers = resolveAuthHeaders(opts);
  const promise = runWithMediaQueue(async () => {
    const res = await fetchWithRetryOn429('/api/media/thumb', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    });
    if (res.status === 204) {
      thumbUrlCache.set(token, null);
      inFlightThumbs.delete(token);
      return null;
    }
    if (res.status === 410 || res.status === 404) {
      goneMediaTokens.add(token);
      throw new MediaGoneError(res.status);
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch thumbnail (${res.status})`);
    }
    const blob = await res.blob();
    if (blob.size === 0) {
      thumbUrlCache.set(token, null);
      inFlightThumbs.delete(token);
      return null;
    }
    const objectUrl = URL.createObjectURL(blob);
    thumbUrlCache.set(token, objectUrl);
    inFlightThumbs.delete(token);
    notifyMediaResolved(token);
    return objectUrl;
  });

  inFlightThumbs.set(token, promise);
  promise.catch(() => {
    inFlightThumbs.delete(token);
  });

  return promise;
}

/**
 * Obtains a short-lived byte-range (HTTP 206) stream URL for Video & Audio.
 * Ensures Safari iOS and large 5-minute MP4 files seek/play without buffering entire file in RAM.
 */
export async function fetchMediaStreamUrl(
  token: string,
  opts?: { deviceId?: string; adminToken?: string }
): Promise<string> {
  if (!token) throw new Error('Missing media token');
  if (goneMediaTokens.has(token)) {
    throw new MediaGoneError(410);
  }
  const cached = streamUrlCache.get(token);
  if (cached && cached.exp > Date.now() + 30_000) {
    return cached.url;
  }

  return runWithMediaQueue(async () => {
    const res = await fetchWithRetryOn429('/api/media/stream-ticket', {
      method: 'POST',
      headers: resolveAuthHeaders(opts),
      body: JSON.stringify({ token }),
    });
    if (res.status === 410 || res.status === 404) {
      goneMediaTokens.add(token);
      throw new MediaGoneError(res.status);
    }
    if (!res.ok) {
      throw new Error(`Failed to create stream ticket (${res.status})`);
    }
    const data = await res.json();
    if (!data?.streamUrl) {
      throw new Error('Missing streamUrl in response');
    }
    streamUrlCache.set(token, { url: data.streamUrl, exp: Date.now() + 12 * 60 * 1000 });
    notifyMediaResolved(token);
    return data.streamUrl;
  });
}

export async function downloadEncryptedMedia(
  token: string,
  fileName: string,
  opts?: { deviceId?: string; adminToken?: string }
) {
  const res = await fetch('/api/media/fetch', {
    method: 'POST',
    headers: resolveAuthHeaders(opts),
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const rawBlob = await res.blob();
  const url = URL.createObjectURL(rawBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeDownloadFileName(fileName || 'download');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadMultipleEncryptedMedia(
  items: { mediaToken: string; fileName: string }[],
  opts?: { deviceId?: string; adminToken?: string },
  onProgress?: (done: number, total: number) => void
) {
  const valid = items.filter((i) => Boolean(i.mediaToken));
  for (let i = 0; i < valid.length; i++) {
    await downloadEncryptedMedia(valid[i].mediaToken, valid[i].fileName, opts);
    onProgress?.(i + 1, valid.length);
    if (i < valid.length - 1) {
      await new Promise((r) => setTimeout(r, 240));
    }
  }
}

export async function downloadMediaZip(
  tokens: string[],
  zipName = 'lan-share-files.zip',
  opts?: { deviceId?: string; adminToken?: string }
) {
  const cleanTokens = tokens.filter(Boolean);
  if (cleanTokens.length === 0) throw new Error('ไม่มีไฟล์สำหรับสร้าง ZIP');
  const res = await fetch('/api/media/zip-ticket', {
    method: 'POST',
    headers: resolveAuthHeaders(opts),
    body: JSON.stringify({ tokens: cleanTokens, zipName }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || `ZIP ticket failed (${res.status})`);
  }
  const data = await res.json();
  if (!data?.downloadUrl) throw new Error('Missing ZIP downloadUrl');
  const a = document.createElement('a');
  a.href = data.downloadUrl;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function SecureImage({
  token,
  alt,
  fileName,
  className,
  style,
  onClick,
  thumbnail = false,
}: {
  token: string;
  alt?: string;
  fileName?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  thumbnail?: boolean;
}) {
  const { ref, inView } = useInViewport('280px');
  const cachedUrl = (thumbnail ? thumbUrlCache.get(token) : null) || blobUrlCache.get(token) || null;
  const [blobUrl, setBlobUrl] = useState<string | null>(cachedUrl);
  const [gone, setGone] = useState<boolean>(() => goneMediaTokens.has(token));
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const isGone = gone || goneMediaTokens.has(token);
  const effectiveUrl = isGone ? null : cachedUrl || blobUrl;

  useEffect(() => {
    if (!token) return;
    return subscribeMediaResolved(token, () => {
      if (goneMediaTokens.has(token)) {
        setGone(true);
        setBlobUrl(null);
        setError(false);
        return;
      }
      const next = (thumbnail ? thumbUrlCache.get(token) : null) || blobUrlCache.get(token) || null;
      if (next) {
        setBlobUrl(next);
        setGone(false);
        setError(false);
      }
    });
  }, [token, thumbnail]);

  useEffect(() => {
    let mounted = true;
    if (!token || cachedUrl || !inView || isGone) return;

    const loadPromise = thumbnail
      ? fetchEncryptedThumbnailUrl(token).then((u) => u || fetchEncryptedMediaBlobUrl(token, { fileName: fileName || alt }))
      : fetchEncryptedMediaBlobUrl(token, { fileName: fileName || alt });

    loadPromise
      .then((url) => {
        if (mounted) {
          setBlobUrl(url);
          setGone(false);
          setError(false);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        if (isMediaGoneError(err)) {
          setGone(true);
          setError(false);
        } else {
          setError(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, [token, cachedUrl, fileName, alt, thumbnail, inView, isGone, retryTick]);

  if (isGone) {
    return (
      <div
        ref={ref}
        data-testid="media-deleted-placeholder"
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-500 text-xs gap-1.5 p-3 rounded-xl text-center select-none min-h-[110px] ${className || ''}`}
        style={style}
      >
        <ImageOff size={20} className="opacity-65 shrink-0" />
        <span className="font-medium leading-tight">รูปภาพนี้ถูกลบแล้ว</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        ref={ref}
        className={`flex items-center justify-center bg-gray-100 text-gray-500 text-xs gap-1.5 p-3 rounded-xl ${className || ''}`}
        style={style}
      >
        <AlertCircle size={14} /> โหลดสื่อไม่สำเร็จ
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setError(false);
            setRetryTick((n) => n + 1);
          }}
          title="ลองโหลดใหม่"
          className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-gray-300 text-[10px] text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={10} /> ลองใหม่
        </button>
      </div>
    );
  }

  if (!effectiveUrl) {
    return (
      <div
        ref={ref}
        className={`flex items-center justify-center bg-black/10 animate-pulse rounded-xl min-h-[120px] ${className || ''}`}
        style={style}
      >
        {inView && <Loader2 size={20} className="animate-spin opacity-60" />}
      </div>
    );
  }

  return (
    <img
      src={effectiveUrl}
      alt={alt || 'media'}
      loading="lazy"
      decoding="async"
      className={className}
      style={style}
      onClick={onClick}
    />
  );
}

export function SecureVideo({
  token,
  className,
  style,
  controls = true,
  autoPlay = false,
  muted = false,
  onClick,
}: {
  token: string;
  className?: string;
  style?: React.CSSProperties;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  const { ref, inView } = useInViewport('280px');
  const isPosterMode = !controls;
  const hasCachedThumb = isPosterMode && thumbUrlCache.has(token);
  const cachedThumb = hasCachedThumb ? (thumbUrlCache.get(token) ?? null) : undefined;
  const cachedStream = !isPosterMode ? (streamUrlCache.get(token)?.url || null) : null;

  const [thumbUrl, setThumbUrl] = useState<string | null>(cachedThumb ?? null);
  const [thumbLoaded, setThumbLoaded] = useState<boolean>(hasCachedThumb);
  const [srcUrl, setSrcUrl] = useState<string | null>(cachedStream);
  const [gone, setGone] = useState<boolean>(() => goneMediaTokens.has(token));
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const isGone = gone || goneMediaTokens.has(token);
  const effectiveThumb = isGone ? null : cachedThumb !== undefined ? cachedThumb : thumbUrl;
  const effectiveThumbLoaded = !isGone && (hasCachedThumb || thumbLoaded);
  const effectiveSrcUrl = isGone ? null : cachedStream || srcUrl;

  useEffect(() => {
    if (!token) return;
    return subscribeMediaResolved(token, () => {
      if (goneMediaTokens.has(token)) {
        setGone(true);
        setThumbUrl(null);
        setSrcUrl(null);
        setError(false);
        return;
      }
      if (isPosterMode) {
        if (thumbUrlCache.has(token)) {
          setThumbUrl(thumbUrlCache.get(token) ?? null);
          setThumbLoaded(true);
          setGone(false);
          setError(false);
        }
      } else {
        const nextStream = streamUrlCache.get(token)?.url;
        if (nextStream) {
          setSrcUrl(nextStream);
          setGone(false);
          setError(false);
        }
      }
    });
  }, [token, isPosterMode]);

  useEffect(() => {
    let mounted = true;
    if (!token || isGone) return;

    if (isPosterMode) {
      if (hasCachedThumb || !inView) return;
      fetchEncryptedThumbnailUrl(token)
        .then((url) => {
          if (mounted) {
            setThumbUrl(url);
            setThumbLoaded(true);
            setGone(false);
            setError(false);
          }
        })
        .catch((err) => {
          if (!mounted) return;
          if (isMediaGoneError(err)) {
            setGone(true);
            setError(false);
          } else {
            setError(true);
          }
        });
    } else {
      fetchMediaStreamUrl(token)
        .then((url) => {
          if (mounted) {
            setSrcUrl(url);
            setGone(false);
            setError(false);
          }
        })
        .catch((err) => {
          if (!mounted) return;
          if (isMediaGoneError(err)) {
            setGone(true);
            setError(false);
          } else {
            setError(true);
          }
        });
    }

    return () => {
      mounted = false;
    };
  }, [token, isPosterMode, hasCachedThumb, inView, isGone, retryTick]);

  if (isGone) {
    return (
      <div
        ref={ref}
        data-testid="media-deleted-placeholder"
        className={`flex flex-col items-center justify-center bg-slate-800/90 text-slate-300 text-xs gap-1.5 p-3 rounded-xl text-center select-none min-h-[110px] ${className || ''}`}
        style={style}
      >
        <VideoOff size={20} className="opacity-70 shrink-0" />
        <span className="font-medium leading-tight">วิดีโอนี้ถูกลบแล้ว</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        ref={ref}
        className={`flex items-center justify-center bg-gray-900 text-gray-300 text-xs gap-1.5 p-3 rounded-xl ${className || ''}`}
        style={style}
      >
        <AlertCircle size={14} /> โหลดวิดีโอไม่สำเร็จ
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setError(false);
            setRetryTick((n) => n + 1);
          }}
          title="ลองโหลดใหม่"
          className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600 text-[10px] text-gray-200 hover:bg-gray-700"
        >
          <RefreshCw size={10} /> ลองใหม่
        </button>
      </div>
    );
  }

  // Grid / Feed Poster Mode: NEVER mount raw <video> tags inside lists or grids (Netflix NIO / RAM guard)
  if (isPosterMode) {
    if (!effectiveThumbLoaded) {
      return (
        <div
          ref={ref}
          className={`flex items-center justify-center bg-slate-900 text-slate-400 rounded-xl min-h-[120px] ${className || ''}`}
          style={style}
          onClick={onClick}
        >
          {inView ? <Loader2 size={20} className="animate-spin opacity-60" /> : <Film size={22} className="opacity-40" />}
        </div>
      );
    }
    if (effectiveThumb) {
      return (
        <img
          src={effectiveThumb}
          alt="video thumbnail"
          loading="lazy"
          decoding="async"
          className={className}
          style={style}
          onClick={onClick}
        />
      );
    }
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-900 text-slate-400 gap-1 min-h-[120px] ${className || ''}`}
        style={style}
        onClick={onClick}
      >
        <Film size={24} className="opacity-50" />
      </div>
    );
  }

  if (!effectiveSrcUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-black/80 text-white animate-pulse rounded-xl min-h-[140px] ${className || ''}`}
        style={style}
      >
        <Loader2 size={22} className="animate-spin opacity-70" />
      </div>
    );
  }

  return (
    <video
      src={effectiveSrcUrl}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      playsInline
      preload="none"
      className={className}
      style={style}
      onClick={onClick}
    />
  );
}

export function SecureAudio({
  token,
  className,
  style,
}: {
  token: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [srcUrl, setSrcUrl] = useState<string | null>(() => streamUrlCache.get(token)?.url || blobUrlCache.get(token) || null);
  const [gone, setGone] = useState<boolean>(() => goneMediaTokens.has(token));
  const [error, setError] = useState(false);
  const isGone = gone || goneMediaTokens.has(token);

  useEffect(() => {
    if (!token) return;
    return subscribeMediaResolved(token, () => {
      if (goneMediaTokens.has(token)) {
        setGone(true);
        setSrcUrl(null);
        setError(false);
      }
    });
  }, [token]);

  useEffect(() => {
    let mounted = true;
    if (!token || isGone) return;
    fetchMediaStreamUrl(token)
      .then((url) => {
        if (mounted) setSrcUrl(url);
      })
      .catch((err) => {
        if (!mounted) return;
        if (isMediaGoneError(err)) {
          setGone(true);
          setError(false);
        } else {
          setError(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, [token, isGone]);

  if (isGone) {
    return (
      <div className="flex items-center gap-1.5 text-xs opacity-75 px-2 py-1" data-testid="media-deleted-placeholder">
        <AlertCircle size={14} /> ไฟล์เสียงนี้ถูกลบแล้ว
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-500 px-2 py-1">
        <AlertCircle size={14} /> โหลดไฟล์เสียงไม่สำเร็จ
      </div>
    );
  }

  if (!srcUrl) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-70 px-2 py-1.5">
        <Loader2 size={14} className="animate-spin" /> กำลังโหลดเสียง...
      </div>
    );
  }

  return (
    <audio
      src={srcUrl}
      controls
      preload="metadata"
      className={className || 'w-full max-w-[260px] h-9'}
      style={style}
    />
  );
}
