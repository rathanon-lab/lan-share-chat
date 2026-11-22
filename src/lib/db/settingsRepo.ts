import {
  ADMIN_DEFAULT_AVATAR_URL,
  DEFAULT_ADMIN_RING_COLOR,
  isValidCustomAvatarUrl,
  normalizeHexColor,
} from '../avatars';
import { dbAll, dbRun } from './client';

export type SessionPolicy = 'takeover' | 'block' | 'multi_allow';
export type StickerPreviewMode = 'fullscreen_modal' | 'docked_tray';
export type StickerPickerGifMode = 'live_viewport' | 'static_poster';

export interface SystemSettings {
  voiceMessageEnabled: boolean;
  deletePolicy: 'hybrid_15m' | 'self_always' | 'admin_only';
  editWindowMinutes: number;
  adminRingColor: string;
  adminAvatarUrl: string;
  adminHoldActive: boolean;
  chatLocked: boolean;
  chatBlurred: boolean;
  antiSpamEnabled: boolean;
  spamMaxMessages: number;
  spamWindowSeconds: number;
  spamMuteMinutes: number;
  spamMaxDuplicates: number;
  p2pMaxOffersPerWindow: number;
  sessionPolicy: SessionPolicy;
  maxConcurrentUsers: number;
  stickerPreviewMode: StickerPreviewMode;
  stickerCollageEnabled: boolean;
  stickerPickerGifMode: StickerPickerGifMode;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  voiceMessageEnabled: true,
  deletePolicy: 'hybrid_15m',
  editWindowMinutes: 15,
  adminRingColor: DEFAULT_ADMIN_RING_COLOR,
  adminAvatarUrl: ADMIN_DEFAULT_AVATAR_URL,
  adminHoldActive: false,
  chatLocked: false,
  chatBlurred: false,
  antiSpamEnabled: true,
  spamMaxMessages: 10,
  spamWindowSeconds: 10,
  spamMuteMinutes: 10,
  spamMaxDuplicates: 5,
  p2pMaxOffersPerWindow: 5,
  sessionPolicy: 'takeover',
  maxConcurrentUsers: 100,
  stickerPreviewMode: 'fullscreen_modal',
  stickerCollageEnabled: true,
  stickerPickerGifMode: 'live_viewport',
};

// In-Memory Control Plane Cache (0.1ms synchronous override for emergency gates)
let cachedSettings: SystemSettings | null = null;

export function getCachedSystemSettings(): SystemSettings | null {
  return cachedSettings;
}

export function patchFastControlGate(partial: Partial<SystemSettings>): void {
  if (!cachedSettings) {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  if (typeof partial.chatLocked === 'boolean') cachedSettings.chatLocked = partial.chatLocked;
  if (typeof partial.chatBlurred === 'boolean') cachedSettings.chatBlurred = partial.chatBlurred;
  if (typeof partial.adminHoldActive === 'boolean') cachedSettings.adminHoldActive = partial.adminHoldActive;
  if (partial.chatLocked === true || partial.chatBlurred === true) cachedSettings.adminHoldActive = true;
  if (typeof partial.antiSpamEnabled === 'boolean') cachedSettings.antiSpamEnabled = partial.antiSpamEnabled;
}

function clampInt(raw: unknown, minVal: number, maxVal: number, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(minVal, Math.min(maxVal, Math.floor(n))) : fallback;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const rows = await dbAll<{ key: string; value: string }>('SELECT key, value FROM system_settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const rawPolicy = map.get('deletePolicy');
  const deletePolicy: SystemSettings['deletePolicy'] =
    rawPolicy === 'self_always' || rawPolicy === 'admin_only' ? rawPolicy : 'hybrid_15m';
  const rawAdminAvatar = map.get('adminAvatarUrl') || '';
  const adminAvatarUrl =
    rawAdminAvatar === ADMIN_DEFAULT_AVATAR_URL || isValidCustomAvatarUrl(rawAdminAvatar)
      ? rawAdminAvatar
      : ADMIN_DEFAULT_AVATAR_URL;

  const rawMaxDup = map.get('spamMaxDuplicates');
  const rawSessionPolicy = map.get('sessionPolicy');
  const sessionPolicy: SessionPolicy =
    rawSessionPolicy === 'block' || rawSessionPolicy === 'multi_allow' ? rawSessionPolicy : 'takeover';

  const chatLocked = map.get('chatLocked') === 'true';
  const chatBlurred = map.get('chatBlurred') === 'true';
  const adminHoldActive = chatLocked || chatBlurred || map.get('adminHoldActive') === 'true';
  const rawGifMode = map.get('stickerPickerGifMode');
  const stickerPickerGifMode: StickerPickerGifMode =
    rawGifMode === 'static_poster' ? 'static_poster' : 'live_viewport';

  const result: SystemSettings = {
    voiceMessageEnabled: map.get('voiceMessageEnabled') !== 'false',
    deletePolicy,
    editWindowMinutes: clampInt(map.get('editWindowMinutes'), 1, 1440, DEFAULT_SETTINGS.editWindowMinutes),
    adminRingColor: normalizeHexColor(map.get('adminRingColor'), DEFAULT_SETTINGS.adminRingColor),
    adminAvatarUrl,
    adminHoldActive,
    chatLocked,
    chatBlurred,
    antiSpamEnabled: map.get('antiSpamEnabled') !== 'false',
    spamMaxMessages: clampInt(map.get('spamMaxMessages') || DEFAULT_SETTINGS.spamMaxMessages, 3, 60, DEFAULT_SETTINGS.spamMaxMessages),
    spamWindowSeconds: clampInt(map.get('spamWindowSeconds') || DEFAULT_SETTINGS.spamWindowSeconds, 3, 120, DEFAULT_SETTINGS.spamWindowSeconds),
    spamMuteMinutes: clampInt(map.get('spamMuteMinutes') || DEFAULT_SETTINGS.spamMuteMinutes, 1, 1440, DEFAULT_SETTINGS.spamMuteMinutes),
    spamMaxDuplicates:
      rawMaxDup === undefined
        ? DEFAULT_SETTINGS.spamMaxDuplicates
        : clampInt(rawMaxDup, 0, 50, DEFAULT_SETTINGS.spamMaxDuplicates),
    p2pMaxOffersPerWindow: clampInt(
      map.get('p2pMaxOffersPerWindow') || DEFAULT_SETTINGS.p2pMaxOffersPerWindow,
      2,
      30,
      DEFAULT_SETTINGS.p2pMaxOffersPerWindow
    ),
    sessionPolicy,
    maxConcurrentUsers:
      map.get('maxConcurrentUsers') === undefined
        ? DEFAULT_SETTINGS.maxConcurrentUsers
        : clampInt(map.get('maxConcurrentUsers'), 0, 1000, DEFAULT_SETTINGS.maxConcurrentUsers),
    stickerPreviewMode: map.get('stickerPreviewMode') === 'docked_tray' ? 'docked_tray' : 'fullscreen_modal',
    stickerCollageEnabled: map.get('stickerCollageEnabled') !== 'false',
    stickerPickerGifMode,
  };
  cachedSettings = result;
  return result;
}

async function setSetting(key: string, value: string): Promise<void> {
  await dbRun('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
}

export async function updateSystemSettings(partial: Partial<SystemSettings>): Promise<SystemSettings> {
  // Immediately flip in-memory emergency gate before awaiting disk persistence
  patchFastControlGate(partial);

  if (typeof partial.voiceMessageEnabled === 'boolean') {
    await setSetting('voiceMessageEnabled', String(partial.voiceMessageEnabled));
  }
  if (partial.stickerPreviewMode && ['fullscreen_modal', 'docked_tray'].includes(partial.stickerPreviewMode)) {
    await setSetting('stickerPreviewMode', partial.stickerPreviewMode);
  }
  if (typeof partial.stickerCollageEnabled === 'boolean') {
    await setSetting('stickerCollageEnabled', String(partial.stickerCollageEnabled));
  }
  if (partial.stickerPickerGifMode && ['live_viewport', 'static_poster'].includes(partial.stickerPickerGifMode)) {
    await setSetting('stickerPickerGifMode', partial.stickerPickerGifMode);
  }
  if (partial.deletePolicy && ['hybrid_15m', 'self_always', 'admin_only'].includes(partial.deletePolicy)) {
    await setSetting('deletePolicy', partial.deletePolicy);
  }
  if (partial.sessionPolicy && ['takeover', 'block', 'multi_allow'].includes(partial.sessionPolicy)) {
    await setSetting('sessionPolicy', partial.sessionPolicy);
  }
  if (typeof partial.editWindowMinutes === 'number' && Number.isFinite(partial.editWindowMinutes)) {
    await setSetting('editWindowMinutes', String(clampInt(partial.editWindowMinutes, 1, 1440, DEFAULT_SETTINGS.editWindowMinutes)));
  }
  if (typeof partial.adminRingColor === 'string') {
    await setSetting('adminRingColor', normalizeHexColor(partial.adminRingColor, DEFAULT_SETTINGS.adminRingColor));
  }
  if (typeof partial.adminAvatarUrl === 'string') {
    const safeAvatar =
      partial.adminAvatarUrl === ADMIN_DEFAULT_AVATAR_URL || isValidCustomAvatarUrl(partial.adminAvatarUrl)
        ? partial.adminAvatarUrl
        : ADMIN_DEFAULT_AVATAR_URL;
    await setSetting('adminAvatarUrl', safeAvatar);
  }

  const boolKeys: Array<'adminHoldActive' | 'chatLocked' | 'chatBlurred' | 'antiSpamEnabled'> = [
    'adminHoldActive',
    'chatLocked',
    'chatBlurred',
    'antiSpamEnabled',
  ];
  for (const key of boolKeys) {
    if (typeof partial[key] === 'boolean') {
      await setSetting(key, String(partial[key]));
    }
  }
  if (partial.chatLocked === true || partial.chatBlurred === true) {
    await setSetting('adminHoldActive', 'true');
  }

  const numRanges: Array<[keyof SystemSettings, number, number]> = [
    ['spamMaxMessages', 3, 60],
    ['spamWindowSeconds', 3, 120],
    ['spamMuteMinutes', 1, 1440],
    ['spamMaxDuplicates', 0, 50],
    ['p2pMaxOffersPerWindow', 2, 30],
    ['maxConcurrentUsers', 0, 1000],
  ];
  for (const [key, minVal, maxVal] of numRanges) {
    const val = partial[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      await setSetting(key, String(clampInt(val, minVal, maxVal, minVal)));
    }
  }

  return getSystemSettings();
}

export async function resetSystemSettings(): Promise<SystemSettings> {
  return updateSystemSettings(DEFAULT_SETTINGS);
}
