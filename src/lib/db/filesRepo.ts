import { encryptMediaToken } from '../crypto';
import { dbAll, dbGet, dbRun } from './client';

export interface UploadedFileRecord {
  id: number;
  sender: string;
  deviceId: string;
  senderIp: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  mediaToken?: string;
}

export async function saveUploadedFile(file: {
  sender: string;
  deviceId: string;
  senderIp: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
}): Promise<number> {
  const uploadedAt = new Date().toISOString();
  const { lastID } = await dbRun(
    'INSERT INTO uploaded_files (sender, deviceId, senderIp, originalName, storedName, mimeType, fileSize, uploadedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [file.sender, file.deviceId, file.senderIp, file.originalName, file.storedName, file.mimeType, file.fileSize, uploadedAt]
  );
  return lastID;
}

export async function getAllUploadedFiles(): Promise<UploadedFileRecord[]> {
  const rows = await dbAll<UploadedFileRecord>('SELECT * FROM uploaded_files ORDER BY id DESC');
  return rows.map((f) => ({
    ...f,
    mediaToken: encryptMediaToken({
      storedName: f.storedName,
      originalName: f.originalName,
      mimeType: f.mimeType || 'application/octet-stream',
    }),
  }));
}

export async function deleteUploadedFile(id: number): Promise<{ storedName: string; originalName: string } | null> {
  const row = await dbGet<{ storedName: string; originalName: string }>(
    'SELECT storedName, originalName FROM uploaded_files WHERE id = ?',
    [id]
  );
  if (!row) return null;
  await dbRun('DELETE FROM uploaded_files WHERE id = ?', [id]);
  return row;
}

export async function deleteUploadedFilesBatch(
  ids: number[]
): Promise<Array<{ id: number; storedName: string; originalName: string }>> {
  const cleanIds = Array.from(new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)));
  if (cleanIds.length === 0) return [];
  const placeholders = cleanIds.map(() => '?').join(', ');
  const rows = await dbAll<{ id: number; storedName: string; originalName: string }>(
    `SELECT id, storedName, originalName FROM uploaded_files WHERE id IN (${placeholders})`,
    cleanIds
  );
  if (rows.length > 0) {
    await dbRun(`DELETE FROM uploaded_files WHERE id IN (${placeholders})`, cleanIds);
  }
  return rows;
}

export async function deleteAllUploadedFiles(): Promise<Array<{ storedName: string }>> {
  const rows = await dbAll<{ storedName: string }>('SELECT storedName FROM uploaded_files');
  await dbRun('DELETE FROM uploaded_files');
  return rows;
}
