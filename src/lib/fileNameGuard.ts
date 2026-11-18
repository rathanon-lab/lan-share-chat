export const MAX_FILENAME_LENGTH = 112;

const FORBIDDEN_CHARS_RE = /[\x00-\x1f\x7f<>:"/\\|?*]/;
const WINDOWS_RESERVED_RE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

export interface FileNameValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Strict cross-platform filename validation (Windows, Linux, macOS, iOS/iPadOS, Android).
 * Enforces <= 112 characters and rejects OS-forbidden characters/reserved device names
 * at the sender side before upload or P2P transfer.
 */
export function validateUploadFileName(rawName: string): FileNameValidationResult {
  const name = String(rawName || '').trim();
  if (!name || /^\.+$/.test(name)) {
    return {
      valid: false,
      reason: 'ชื่อไฟล์ไม่ถูกต้อง กรุณาตั้งชื่อไฟล์ให้ชัดเจน (เช่น A1234.mp4)',
    };
  }

  if (name.length > MAX_FILENAME_LENGTH) {
    return {
      valid: false,
      reason: `ชื่อไฟล์ "${name.slice(0, 32)}..." ยาวเกิน ${MAX_FILENAME_LENGTH} ตัวอักษร (${name.length} ตัวอักษร) กรุณาเปลี่ยนชื่อให้สั้นกระชับ (เช่น A1234.mp4) แล้วพิมพ์รายละเอียดในช่องข้อความแชทแทน เพื่อป้องกันไฟล์พังเมื่อดาวน์โหลดข้ามระบบ`,
    };
  }

  if (FORBIDDEN_CHARS_RE.test(name) || name.includes('..')) {
    return {
      valid: false,
      reason: `ชื่อไฟล์ "${name}" มีอักขระต้องห้ามข้ามระบบ (เช่น \\ / : * ? " < > | หรือ ..) กรุณาเปลี่ยนชื่อไฟล์ก่อนส่ง`,
    };
  }

  if (/[. ]$/.test(name)) {
    return {
      valid: false,
      reason: `ชื่อไฟล์ "${name}" ห้ามลงท้ายด้วยจุด (.) หรือช่องว่าง เพราะระบบ Windows จะไม่สามารถบันทึกไฟล์ได้ กรุณาเปลี่ยนชื่อไฟล์ก่อนส่ง`,
    };
  }

  if (WINDOWS_RESERVED_RE.test(name)) {
    return {
      valid: false,
      reason: `ชื่อไฟล์ "${name}" ตรงกับชื่อสงวนของระบบปฏิบัติการ (CON, PRN, AUX, NUL, COM, LPT) กรุณาเปลี่ยนชื่อไฟล์ก่อนส่ง`,
    };
  }

  return { valid: true };
}

/**
 * Defense-in-depth sanitizer for legacy downloaded files and ZIP archive entries.
 * Always preserves the file extension and caps total length at <= 112 characters.
 */
export function sanitizeDownloadFileName(rawName: string, maxLen = MAX_FILENAME_LENGTH): string {
  const cleaned = String(rawName || 'file')
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/[. ]+$/g, '')
    .trim();

  const safe = cleaned && !/^\.+$/.test(cleaned) ? cleaned : 'file';
  const dotIdx = safe.lastIndexOf('.');
  const hasExt = dotIdx > 0 && dotIdx < safe.length - 1 && safe.length - dotIdx <= 14;
  const ext = hasExt ? safe.slice(dotIdx) : '';
  let base = hasExt ? safe.slice(0, dotIdx) : safe;

  if (WINDOWS_RESERVED_RE.test(base)) {
    base = `file_${base}`;
  }

  const maxBaseLen = Math.max(1, maxLen - ext.length);
  if (base.length > maxBaseLen) {
    base = base.slice(0, maxBaseLen).replace(/[. ]+$/g, '') || 'file';
  }

  return `${base}${ext}`;
}
