"use client";

import { fetchMediaStreamUrl } from './secureMedia';

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
}

const audioMetaCache = new Map<string, AudioMetadata | null>();
const inFlightMeta = new Map<string, Promise<AudioMetadata | null>>();

function readSyncsafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function decodeId3Text(bytes: Uint8Array, encodingByte: number): string {
  if (bytes.length === 0) return '';
  try {
    let text = '';
    if (encodingByte === 0) {
      text = new TextDecoder('iso-8859-1').decode(bytes);
    } else if (encodingByte === 1) {
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
      } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
      } else {
        text = new TextDecoder('utf-16le').decode(bytes);
      }
    } else if (encodingByte === 2) {
      text = new TextDecoder('utf-16be').decode(bytes);
    } else {
      text = new TextDecoder('utf-8').decode(bytes);
    }
    return text.replace(/\0+$/g, '').trim();
  } catch {
    return '';
  }
}

function findNullTerminator(bytes: Uint8Array, start: number, encodingByte: number): number {
  const isWide = encodingByte === 1 || encodingByte === 2;
  if (isWide) {
    for (let i = start; i + 1 < bytes.length; i += 2) {
      if (bytes[i] === 0 && bytes[i + 1] === 0) return i + 2;
    }
    return bytes.length;
  }
  for (let i = start; i < bytes.length; i++) {
    if (bytes[i] === 0) return i + 1;
  }
  return bytes.length;
}

function parseApicFrame(payload: Uint8Array): string | undefined {
  if (payload.length < 4) return undefined;
  const enc = payload[0];
  let pos = 1;
  let mimeEnd = pos;
  while (mimeEnd < payload.length && payload[mimeEnd] !== 0) mimeEnd++;
  const mimeRaw = new TextDecoder('ascii').decode(payload.subarray(pos, mimeEnd)).trim() || 'image/jpeg';
  const mime = mimeRaw.includes('/') ? mimeRaw : mimeRaw === 'PNG' ? 'image/png' : 'image/jpeg';
  pos = mimeEnd + 1;
  if (pos >= payload.length) return undefined;
  pos += 1; // picture type
  pos = findNullTerminator(payload, pos, enc);
  if (pos >= payload.length) return undefined;
  const imgBytes = payload.subarray(pos);
  if (imgBytes.length < 16) return undefined;
  const blob = new Blob([new Uint8Array(imgBytes)], { type: mime });
  return URL.createObjectURL(blob);
}

function parseId3v2(bytes: Uint8Array): AudioMetadata | null {
  if (bytes.length < 10) return null;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null; // "ID3"

  const version = bytes[3];
  const flags = bytes[5];
  const tagSize = readSyncsafeInt(bytes, 6);
  const tagEnd = Math.min(bytes.length, 10 + tagSize);
  let pos = 10;

  // Skip optional extended header
  if ((flags & 0x40) !== 0 && pos + 4 <= tagEnd) {
    const extSize = version === 4 ? readSyncsafeInt(bytes, pos) : readUInt32BE(bytes, pos);
    pos += version === 4 ? extSize : extSize + 4;
  }

  const meta: AudioMetadata = {};
  const isV22 = version === 2;
  const headerLen = isV22 ? 6 : 10;

  while (pos + headerLen <= tagEnd) {
    if (bytes[pos] === 0) break;
    const frameId = isV22
      ? String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2])
      : String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);

    const frameSize = isV22
      ? (bytes[pos + 3] << 16) | (bytes[pos + 4] << 8) | bytes[pos + 5]
      : version === 4
        ? readSyncsafeInt(bytes, pos + 4)
        : readUInt32BE(bytes, pos + 4);

    pos += headerLen;
    if (frameSize <= 0 || pos + frameSize > tagEnd) break;
    const payload = bytes.subarray(pos, pos + frameSize);
    pos += frameSize;

    if (frameId === 'TIT2' || frameId === 'TT2') {
      meta.title = decodeId3Text(payload.subarray(1), payload[0]) || meta.title;
    } else if (frameId === 'TPE1' || frameId === 'TP1') {
      meta.artist = decodeId3Text(payload.subarray(1), payload[0]) || meta.artist;
    } else if (frameId === 'TALB' || frameId === 'TAL') {
      meta.album = decodeId3Text(payload.subarray(1), payload[0]) || meta.album;
    } else if ((frameId === 'APIC' || frameId === 'PIC') && !meta.coverUrl) {
      if (frameId === 'PIC' && payload.length > 6) {
        const fmt = String.fromCharCode(payload[1], payload[2], payload[3]).toUpperCase();
        const mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
        const descEnd = findNullTerminator(payload, 5, payload[0]);
        if (descEnd < payload.length) {
          const img = payload.subarray(descEnd);
          if (img.length >= 16) meta.coverUrl = URL.createObjectURL(new Blob([new Uint8Array(img)], { type: mime }));
        }
      } else {
        meta.coverUrl = parseApicFrame(payload);
      }
    }
  }

  return meta.title || meta.artist || meta.album || meta.coverUrl ? meta : null;
}

function readBoxHeader(bytes: Uint8Array, pos: number, end: number): { size: number; type: string; headerSize: number } | null {
  if (pos + 8 > end) return null;
  const size = readUInt32BE(bytes, pos);
  const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
  if (size < 8 || pos + size > end) return null;
  return { size, type, headerSize: 8 };
}

function parseMp4Ilst(bytes: Uint8Array, start: number, end: number): AudioMetadata | null {
  const containers = new Set(['moov', 'udta', 'meta', 'ilst']);
  const meta: AudioMetadata = {};

  const walk = (from: number, to: number) => {
    let p = from;
    while (p + 8 <= to) {
      const box = readBoxHeader(bytes, p, to);
      if (!box) break;
      const bodyStart = p + box.headerSize + (box.type === 'meta' ? 4 : 0);
      const bodyEnd = p + box.size;

      if (containers.has(box.type)) {
        walk(bodyStart, bodyEnd);
      } else if (box.type === '\u00a9nam' || box.type === '\u00a9ART' || box.type === '\u00a9alb' || box.type === 'covr') {
        const dataBox = readBoxHeader(bytes, bodyStart, bodyEnd);
        if (dataBox && dataBox.type === 'data' && bodyStart + 16 < bodyStart + dataBox.size) {
          const dataFlags = readUInt32BE(bytes, bodyStart + 8);
          const value = bytes.subarray(bodyStart + 16, bodyStart + dataBox.size);
          if (box.type === 'covr' && !meta.coverUrl) {
            const mime = dataFlags === 14 ? 'image/png' : 'image/jpeg';
            meta.coverUrl = URL.createObjectURL(new Blob([new Uint8Array(value)], { type: mime }));
          } else {
            const str = new TextDecoder('utf-8').decode(value).trim();
            if (box.type === '\u00a9nam') meta.title = str || meta.title;
            if (box.type === '\u00a9ART') meta.artist = str || meta.artist;
            if (box.type === '\u00a9alb') meta.album = str || meta.album;
          }
        }
      }
      p = bodyEnd;
    }
  };

  walk(start, end);
  return meta.title || meta.artist || meta.album || meta.coverUrl ? meta : null;
}

export function parseAudioMetadataBuffer(bytes: Uint8Array): AudioMetadata | null {
  const id3 = parseId3v2(bytes);
  if (id3) return id3;
  if (bytes.length >= 12 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp') {
    return parseMp4Ilst(bytes, 0, bytes.length);
  }
  return null;
}

/**
 * Fetches only the leading 512 KB range of an audio track to decode embedded title,
 * artist, and album cover art without buffering large media files into RAM.
 */
export async function extractAudioMetadata(
  token: string,
  opts?: { deviceId?: string; adminToken?: string }
): Promise<AudioMetadata | null> {
  if (!token) return null;
  if (audioMetaCache.has(token)) {
    return audioMetaCache.get(token) ?? null;
  }
  if (inFlightMeta.has(token)) {
    return inFlightMeta.get(token)!;
  }

  const job = (async () => {
    try {
      const streamUrl = await fetchMediaStreamUrl(token, opts);
      const res = await fetch(streamUrl, {
        headers: { Range: 'bytes=0-524287' },
      });
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      const parsed = parseAudioMetadataBuffer(buf);
      audioMetaCache.set(token, parsed);
      return parsed;
    } catch {
      audioMetaCache.set(token, null);
      return null;
    } finally {
      inFlightMeta.delete(token);
    }
  })();

  inFlightMeta.set(token, job);
  return job;
}
