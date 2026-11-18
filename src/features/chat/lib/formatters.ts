import type { ChatAttachment, ChatMessage } from '@/types/chat';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function normalizeAttachments(msg: ChatMessage): ChatAttachment[] {
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    return msg.attachments;
  }
  if (msg.mediaToken) {
    return [
      {
        fileName: msg.fileName || 'attachment',
        fileSize: Number(msg.fileSize) || 0,
        mimeType: msg.mimeType || 'application/octet-stream',
        mediaToken: msg.mediaToken,
      },
    ];
  }
  return [];
}

export function isVideoAttachment(a?: Pick<ChatAttachment, 'mimeType' | 'fileName'> | null): boolean {
  if (!a) return false;
  const ext = a.fileName?.toLowerCase() || '';
  return Boolean(a.mimeType?.startsWith('video/')) || /\.(mp4|m4v|mov|webm|ogv)$/i.test(ext);
}

export function isVisualMediaAttachment(a: ChatAttachment): boolean {
  const ext = a.fileName?.toLowerCase() || '';
  return (
    Boolean(a.mimeType?.startsWith('image/') && !a.mimeType?.includes('svg') && !ext.endsWith('.svg')) ||
    isVideoAttachment(a) ||
    /\.(heic|heif|jpg|jpeg|png|gif|webp|bmp)$/i.test(ext)
  );
}

export function isAudioAttachment(a: ChatAttachment): boolean {
  const ext = a.fileName?.toLowerCase() || '';
  return Boolean(a.mimeType?.startsWith('audio/')) || /\.(mp3|m4a|mp4a|wav|aac|ogg)$/i.test(ext);
}
