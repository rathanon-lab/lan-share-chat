import crypto from 'crypto';

declare global {
  var __lanShareEphemeralSecret: string | undefined;
}

function getSecretSeed(): string {
  if (process.env.MEDIA_SECRET && process.env.MEDIA_SECRET.trim().length > 0) {
    return process.env.MEDIA_SECRET.trim();
  }
  if (!globalThis.__lanShareEphemeralSecret) {
    globalThis.__lanShareEphemeralSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Crypto] MEDIA_SECRET not set in .env; generated ephemeral key for this process.');
  }
  return globalThis.__lanShareEphemeralSecret;
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) {
    cachedKey = crypto.scryptSync(getSecretSeed(), 'lan-share-salt-v2', 32);
  }
  return cachedKey;
}

export interface MediaTokenPayload {
  /** Stored filename inside storage/uploads/ (never exposed in URL) */
  f: string;
  /** Original filename for download */
  n: string;
  /** MIME type */
  m: string;
  /** Issued timestamp (ms) */
  t: number;
  /** Optional expiration timestamp (ms) for short-lived stream tickets */
  exp?: number;
}

/**
 * Encrypts file metadata into an opaque AES-256-GCM token (base64url).
 * Format: base64url(iv [12B] + authTag [16B] + ciphertext)
 */
export function encryptMediaToken(payload: {
  storedName: string;
  originalName: string;
  mimeType: string;
  exp?: number;
}): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);

  const data: MediaTokenPayload = {
    f: payload.storedName,
    n: payload.originalName,
    m: payload.mimeType || 'application/octet-stream',
    t: Date.now(),
    ...(payload.exp ? { exp: payload.exp } : {}),
  };

  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}

/** Creates a short-lived opaque stream ticket for Range HTTP 206 video/audio playback */
export function createStreamTicket(payload: MediaTokenPayload, ttlMs = 15 * 60 * 1000): string {
  return encryptMediaToken({
    storedName: payload.f,
    originalName: payload.n,
    mimeType: payload.m,
    exp: Date.now() + ttlMs,
  });
}

/** Verifies an opaque stream ticket and enforces expiration */
export function verifyStreamTicket(ticket: string): MediaTokenPayload | null {
  const parsed = decryptMediaToken(ticket);
  if (!parsed) return null;
  if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) return null;
  return parsed;
}

/**
 * Decrypts and authenticates an AES-256-GCM mediaToken.
 * Returns null if tampered or invalid.
 */
export function decryptMediaToken(token: string): MediaTokenPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 29) return null; // 12B IV + 16B Tag + >=1B Ciphertext

    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString('utf8')) as MediaTokenPayload;
    if (!parsed || typeof parsed.f !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
