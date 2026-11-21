"use client";

import React, { useEffect, useState } from 'react';
import { Download, FileX, Music, Volume2 } from 'lucide-react';
import type { ChatAttachment } from '@/types/chat';
import { formatBytes } from '@/features/chat/lib/formatters';
import { extractAudioMetadata, type AudioMetadata } from '@/lib/audioMetadata';
import { SecureAudio, downloadEncryptedMedia } from '@/lib/secureMedia';

export function AudioAttachmentCard({ aud }: { aud: ChatAttachment }) {
  const [meta, setMeta] = useState<AudioMetadata | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!aud.mediaToken || aud.isDeleted) return;
    extractAudioMetadata(aud.mediaToken).then((res) => {
      if (mounted && res) setMeta(res);
    });
    return () => {
      mounted = false;
    };
  }, [aud.mediaToken, aud.isDeleted]);

  if (aud.isDeleted) {
    return (
      <div
        data-testid="audio-attachment-deleted"
        className="rounded-xl bg-black/10 p-2.5 flex items-center gap-2.5 opacity-75 select-none"
      >
        <div className="w-9 h-9 rounded-lg bg-black/15 flex items-center justify-center shrink-0">
          <FileX size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate line-through opacity-80">{aud.fileName}</div>
          <div className="text-[11px] opacity-75">ไฟล์เสียงนี้ถูกลบแล้ว</div>
        </div>
      </div>
    );
  }

  const displayTitle = meta?.title || aud.fileName;
  const subParts = [meta?.artist, meta?.album].filter(Boolean);
  const subtitle = subParts.length > 0 ? subParts.join(' · ') : 'Audio Track';

  return (
    <div
      data-testid="audio-attachment-card"
      className="rounded-xl bg-black/10 p-2.5 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {meta?.coverUrl ? (
            <img
              src={meta.coverUrl}
              alt={displayTitle}
              data-testid="audio-cover-art"
              className="w-11 h-11 rounded-lg object-cover shrink-0 shadow-sm border border-white/20"
            />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-black/15 flex items-center justify-center shrink-0">
              {meta?.title ? <Music size={18} /> : <Volume2 size={18} />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-bold truncate leading-tight" title={displayTitle} data-testid="audio-track-title">
              {displayTitle}
            </div>
            <div className="text-[11px] opacity-80 truncate mt-0.5" title={subtitle}>
              {subtitle}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => downloadEncryptedMedia(aud.mediaToken, aud.fileName)}
          className="p-1.5 rounded-lg hover:bg-black/15 shrink-0 cursor-pointer"
          title="ดาวน์โหลดไฟล์เสียง"
        >
          <Download size={14} />
        </button>
      </div>

      <SecureAudio token={aud.mediaToken} className="w-full h-9" />

      <div className="text-[10px] opacity-75 flex items-center justify-between gap-2">
        <span className="truncate">{aud.fileName}</span>
        <span className="shrink-0">{formatBytes(aud.fileSize)}</span>
      </div>
    </div>
  );
}
