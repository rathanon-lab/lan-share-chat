"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

const blobUrlCache = new Map<string, string>();
const blobCache = new Map<string, Blob>();
const inFlightRequests = new Map<string, Promise<string>>();
const streamUrlCache = new Map<string, { url: string; exp: number }>();
let cachedVideoTranscodeAvail: boolean | null = null;

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
  if (blobUrlCache.has(token)) {
    return blobUrlCache.get(token)!;
  }
  if (inFlightRequests.has(token)) {
    return inFlightRequests.get(token)!;
  }

  const headers = resolveAuthHeaders(opts);
  const promise = (async () => {
    const res = await fetch('/api/media/fetch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    });
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
    return objectUrl;
  })();

  inFlightRequests.set(token, promise);
  promise.catch(() => {
    inFlightRequests.delete(token);
  });

  return promise;
}

/**
 * Obtains a short-lived byte-range (HTTP 206) stream URL for Video & Audio.
 * Ensures Safari iOS and large 5-minute MP4 files seek/play immediately without buffering entire file in RAM.
 */
export async function fetchMediaStreamUrl(
  token: string,
  opts?: { deviceId?: string; adminToken?: string }
): Promise<string> {
  if (!token) throw new Error('Missing media token');
  const cached = streamUrlCache.get(token);
  if (cached && cached.exp > Date.now() + 30_000) {
    return cached.url;
  }

  const res = await fetch('/api/media/stream-ticket', {
    method: 'POST',
    headers: resolveAuthHeaders(opts),
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    return fetchEncryptedMediaBlobUrl(token, opts);
  }
  const data = await res.json();
  if (!data?.streamUrl) {
    return fetchEncryptedMediaBlobUrl(token, opts);
  }
  streamUrlCache.set(token, { url: data.streamUrl, exp: Date.now() + 12 * 60 * 1000 });
  return data.streamUrl;
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
  a.download = fileName || 'download';
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
}: {
  token: string;
  alt?: string;
  fileName?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => blobUrlCache.get(token) || null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!token) return;
    if (blobUrlCache.has(token)) {
      setBlobUrl(blobUrlCache.get(token)!);
      return;
    }
    fetchEncryptedMediaBlobUrl(token, { fileName: fileName || alt })
      .then((url) => {
        if (mounted) setBlobUrl(url);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [token, fileName, alt]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 text-gray-400 text-xs gap-1.5 p-4 rounded-xl ${className || ''}`}
        style={style}
      >
        <AlertCircle size={14} /> โหลดสื่อไม่สำเร็จ
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-black/10 animate-pulse rounded-xl min-h-[120px] ${className || ''}`}
        style={style}
      >
        <Loader2 size={20} className="animate-spin opacity-60" />
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt || 'media'}
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
  const [srcUrl, setSrcUrl] = useState<string | null>(() => streamUrlCache.get(token)?.url || blobUrlCache.get(token) || null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!token) return;
    fetchMediaStreamUrl(token)
      .then((url) => {
        if (mounted) setSrcUrl(url);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-900 text-gray-400 text-xs gap-1.5 p-4 rounded-xl ${className || ''}`}
        style={style}
      >
        <AlertCircle size={14} /> โหลดวิดีโอไม่สำเร็จ
      </div>
    );
  }

  if (!srcUrl) {
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
      src={srcUrl}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      playsInline
      preload="metadata"
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
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!token) return;
    fetchMediaStreamUrl(token)
      .then((url) => {
        if (mounted) setSrcUrl(url);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [token]);

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
