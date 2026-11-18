import fs from 'fs';
import { ServerResponse } from 'http';

export interface ZipSourceEntry {
  filePath: string;
  fileName: string;
  fileSize: number;
  mtimeMs?: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function updateCrc32(crc: number, buf: Buffer): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function toDosDateTime(mtimeMs?: number): { dosTime: number; dosDate: number } {
  const d = mtimeMs ? new Date(mtimeMs) : new Date();
  const year = Math.max(1980, Math.min(2107, d.getFullYear()));
  const dosTime = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

export function sanitizeZipEntryName(rawName: string, usedNames: Set<string>): string {
  const base = (rawName || 'file')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .trim() || 'file';

  if (!usedNames.has(base.toLowerCase())) {
    usedNames.add(base.toLowerCase());
    return base;
  }

  const dotIdx = base.lastIndexOf('.');
  const stem = dotIdx > 0 ? base.slice(0, dotIdx) : base;
  const ext = dotIdx > 0 ? base.slice(dotIdx) : '';
  let counter = 1;
  while (true) {
    const candidate = `${stem} (${counter})${ext}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase());
      return candidate;
    }
    counter++;
  }
}

async function writeBuffer(res: ServerResponse, buf: Buffer): Promise<void> {
  if (res.destroyed || res.writableEnded) {
    throw new Error('Client connection closed');
  }
  if (!res.write(buf)) {
    await new Promise<void>((resolve, reject) => {
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Client connection closed'));
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        res.off('drain', onDrain);
        res.off('close', onClose);
        res.off('error', onError);
      };
      res.once('drain', onDrain);
      res.once('close', onClose);
      res.once('error', onError);
    });
  }
}

async function streamEntryFile(
  res: ServerResponse,
  filePath: string
): Promise<{ crc: number; bytes: number }> {
  return new Promise((resolve, reject) => {
    let crc = 0;
    let bytes = 0;
    let settled = false;
    const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });

    const abortStream = () => {
      if (!stream.destroyed) stream.destroy();
      if (!settled) {
        settled = true;
        reject(new Error('Client connection closed'));
      }
    };

    res.once('close', abortStream);

    stream.on('data', (chunk: string | Buffer) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      crc = updateCrc32(crc, buf);
      bytes += buf.length;
      if (!res.write(buf)) {
        stream.pause();
        res.once('drain', () => {
          if (!settled && !stream.destroyed) stream.resume();
        });
      }
    });

    stream.on('end', () => {
      res.off('close', abortStream);
      if (!settled) {
        settled = true;
        resolve({ crc, bytes });
      }
    });

    stream.on('error', (err) => {
      res.off('close', abortStream);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

interface CentralRecord {
  nameBuf: Buffer;
  crc: number;
  size: number;
  localHeaderOffset: number;
  dosTime: number;
  dosDate: number;
}

const MAX_U32 = 0xffffffff;

/**
 * Streams a standard STORE (method 0) ZIP archive directly from disk to HTTP response
 * without loading files into RAM. Uses UTF-8 filenames (bit 11) and Data Descriptors (bit 3).
 */
export async function streamFilesAsZip(
  res: ServerResponse,
  entries: ZipSourceEntry[]
): Promise<void> {
  const usedNames = new Set<string>();
  const centralRecords: CentralRecord[] = [];
  let cursor = 0;
  const flags = 0x0008 | 0x0800; // Data Descriptor + UTF-8 filename

  for (const entry of entries) {
    if (!fs.existsSync(entry.filePath)) continue;
    const safeName = sanitizeZipEntryName(entry.fileName, usedNames);
    const nameBuf = Buffer.from(safeName, 'utf8');
    const { dosTime, dosDate } = toDosDateTime(entry.mtimeMs);
    const localHeaderOffset = cursor;
    const isZip64Entry = entry.fileSize >= MAX_U32;

    // Local File Header (30 bytes + filename)
    const lfh = Buffer.alloc(30 + nameBuf.length);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(isZip64Entry ? 45 : 20, 4);
    lfh.writeUInt16LE(flags, 6);
    lfh.writeUInt16LE(0, 8); // STORE
    lfh.writeUInt16LE(dosTime, 10);
    lfh.writeUInt16LE(dosDate, 12);
    lfh.writeUInt32LE(0, 14); // crc32 via data descriptor
    lfh.writeUInt32LE(0, 18); // comp size via data descriptor
    lfh.writeUInt32LE(0, 22); // uncomp size via data descriptor
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28); // extra len
    nameBuf.copy(lfh, 30);

    await writeBuffer(res, lfh);
    cursor += lfh.length;

    const { crc, bytes } = await streamEntryFile(res, entry.filePath);
    cursor += bytes;

    // Data Descriptor (16 bytes, or 24 bytes for ZIP64 entry)
    const useZip64Desc = isZip64Entry || bytes >= MAX_U32;
    if (useZip64Desc) {
      const dd = Buffer.alloc(24);
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(crc >>> 0, 4);
      dd.writeBigUInt64LE(BigInt(bytes), 8);
      dd.writeBigUInt64LE(BigInt(bytes), 16);
      await writeBuffer(res, dd);
      cursor += dd.length;
    } else {
      const dd = Buffer.alloc(16);
      dd.writeUInt32LE(0x08074b50, 0);
      dd.writeUInt32LE(crc >>> 0, 4);
      dd.writeUInt32LE(bytes >>> 0, 8);
      dd.writeUInt32LE(bytes >>> 0, 12);
      await writeBuffer(res, dd);
      cursor += dd.length;
    }

    centralRecords.push({
      nameBuf,
      crc,
      size: bytes,
      localHeaderOffset,
      dosTime,
      dosDate,
    });
  }

  const cdOffset = cursor;
  let cdSize = 0;

  for (const rec of centralRecords) {
    const needSize64 = rec.size >= MAX_U32;
    const needOffset64 = rec.localHeaderOffset >= MAX_U32;
    let extraBuf = Buffer.alloc(0);

    if (needSize64 || needOffset64) {
      const fieldsLen = (needSize64 ? 16 : 0) + (needOffset64 ? 8 : 0);
      extraBuf = Buffer.alloc(4 + fieldsLen);
      extraBuf.writeUInt16LE(0x0001, 0);
      extraBuf.writeUInt16LE(fieldsLen, 2);
      let pos = 4;
      if (needSize64) {
        extraBuf.writeBigUInt64LE(BigInt(rec.size), pos);
        extraBuf.writeBigUInt64LE(BigInt(rec.size), pos + 8);
        pos += 16;
      }
      if (needOffset64) {
        extraBuf.writeBigUInt64LE(BigInt(rec.localHeaderOffset), pos);
      }
    }

    const cdh = Buffer.alloc(46 + rec.nameBuf.length + extraBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(extraBuf.length > 0 ? 45 : 20, 4); // version made by
    cdh.writeUInt16LE(extraBuf.length > 0 ? 45 : 20, 6); // version needed
    cdh.writeUInt16LE(flags, 8);
    cdh.writeUInt16LE(0, 10); // STORE
    cdh.writeUInt16LE(rec.dosTime, 12);
    cdh.writeUInt16LE(rec.dosDate, 14);
    cdh.writeUInt32LE(rec.crc >>> 0, 16);
    cdh.writeUInt32LE(needSize64 ? MAX_U32 : rec.size >>> 0, 20);
    cdh.writeUInt32LE(needSize64 ? MAX_U32 : rec.size >>> 0, 24);
    cdh.writeUInt16LE(rec.nameBuf.length, 28);
    cdh.writeUInt16LE(extraBuf.length, 30);
    cdh.writeUInt16LE(0, 32); // comment len
    cdh.writeUInt16LE(0, 34); // disk start
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(needOffset64 ? MAX_U32 : rec.localHeaderOffset >>> 0, 42);
    rec.nameBuf.copy(cdh, 46);
    if (extraBuf.length > 0) {
      extraBuf.copy(cdh, 46 + rec.nameBuf.length);
    }

    await writeBuffer(res, cdh);
    cdSize += cdh.length;
    cursor += cdh.length;
  }

  const needZip64Eocd =
    centralRecords.length >= 0xffff || cdOffset >= MAX_U32 || cdSize >= MAX_U32;

  if (needZip64Eocd) {
    const zip64EocdOffset = cursor;
    const z64 = Buffer.alloc(56);
    z64.writeUInt32LE(0x06064b50, 0);
    z64.writeBigUInt64LE(BigInt(44), 4);
    z64.writeUInt16LE(45, 12);
    z64.writeUInt16LE(45, 14);
    z64.writeUInt32LE(0, 16);
    z64.writeUInt32LE(0, 20);
    z64.writeBigUInt64LE(BigInt(centralRecords.length), 24);
    z64.writeBigUInt64LE(BigInt(centralRecords.length), 32);
    z64.writeBigUInt64LE(BigInt(cdSize), 40);
    z64.writeBigUInt64LE(BigInt(cdOffset), 48);
    await writeBuffer(res, z64);

    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeUInt32LE(0, 4);
    loc.writeBigUInt64LE(BigInt(zip64EocdOffset), 8);
    loc.writeUInt32LE(1, 16);
    await writeBuffer(res, loc);
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // cd disk
  eocd.writeUInt16LE(Math.min(centralRecords.length, 0xffff), 8);
  eocd.writeUInt16LE(Math.min(centralRecords.length, 0xffff), 10);
  eocd.writeUInt32LE(cdSize >= MAX_U32 ? MAX_U32 : cdSize >>> 0, 12);
  eocd.writeUInt32LE(cdOffset >= MAX_U32 ? MAX_U32 : cdOffset >>> 0, 16);
  eocd.writeUInt16LE(0, 20);
  await writeBuffer(res, eocd);
  res.end();
}
