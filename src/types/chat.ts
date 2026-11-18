export type PresenceStatus = 'online' | 'idle' | 'offline';
export type SenderDeviceStatus = 'active' | 'banned' | 'ip_banned' | 'muted' | 'deleted';

export interface PeerInfo {
  id: string;
  deviceId: string;
  name: string;
  avatarUrl?: string;
  os?: string;
  browser?: string;
  ip: string;
  tabCount?: number;
  status?: PresenceStatus;
}

export interface ChatAttachment {
  fileId?: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  mediaToken: string;
}

export type StickerPreviewMode = 'fullscreen_modal' | 'docked_tray';

export interface StickerCollageLayer {
  packId: string;
  stickerId: string;
  url: string;
  alt?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface StickerMessageMeta {
  packId: string;
  stickerId: string;
  url: string;
  alt: string;
  layers?: StickerCollageLayer[];
}

export interface MessageEditEntry {
  id: number;
  messageId: number;
  previousText: string;
  newText: string;
  editedBy: string;
  editedByDeviceId: string;
  editedAt: number;
}

export interface ChatMessage {
  id: number;
  sender: string;
  senderDeviceId?: string;
  senderAvatarUrl?: string;
  senderOs?: string;
  senderStatus?: SenderDeviceStatus;
  text: string;
  type: 'text' | 'file' | 'audio' | 'sticker' | string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  mediaToken?: string | null;
  attachments?: ChatAttachment[];
  stickerMeta?: StickerMessageMeta | null;
  time: string;
  createdAt?: number;
  editedAt?: number | null;
  editCount?: number;
  editHistory?: MessageEditEntry[];
  isDeleted?: number | boolean;
  deletedAt?: number | null;
  deletedBy?: string | null;
  mentionAdmin?: number | boolean;
  isRead?: number | boolean;
  readAt?: number | null;
  status?: string;
  isAdmin?: number | boolean;
}

export interface StickerItem {
  id?: number;
  packId: string;
  stickerId: string;
  fileName: string;
  url: string;
  alt: string;
  keywords: string;
  sortOrder: number;
}

export interface StickerPack {
  packId: string;
  name: string;
  description: string;
  mainUrl: string;
  tabUrl: string;
  source: 'builtin' | 'uploaded';
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  items: StickerItem[];
}

export type SessionPolicy = 'takeover' | 'block' | 'multi_allow';

export interface SystemSettings {
  voiceMessageEnabled: boolean;
  deletePolicy: 'hybrid_15m' | 'self_always' | 'admin_only';
  editWindowMinutes: number;
  adminRingColor: string;
  adminAvatarUrl: string;
  adminHoldActive: boolean;
  chatLocked: boolean;
  chatBlurred?: boolean;
  antiSpamEnabled: boolean;
  spamMaxMessages: number;
  spamWindowSeconds: number;
  spamMuteMinutes: number;
  spamMaxDuplicates: number;
  p2pMaxOffersPerWindow: number;
  sessionPolicy?: SessionPolicy;
  maxConcurrentUsers?: number;
  stickerPreviewMode?: StickerPreviewMode;
  stickerCollageEnabled?: boolean;
}

export interface TelemetryDailyRow {
  dayKey: string;
  peakOnline: number;
  peakHour: number;
  peakOnlineAt: number;
  messageCount: number;
  uploadCount: number;
  spamBlockedCount: number;
  p2pBlockedCount: number;
}

export interface TelemetryHourlyRow {
  dayKey: string;
  hour: number;
  peakOnline: number;
  messageCount: number;
}

export interface AdminOverviewStats {
  serverStartedAt: number;
  uptimeSeconds: number;
  onlinePeersCount: number;
  totalDevices: number;
  totalMessages: number;
  totalFiles: number;
  totalFileBytes: number;
  pendingAlerts: number;
  mutedDevicesCount: number;
  bannedDevicesCount: number;
  bannedIpsCount: number;
  todayPeakOnline: number;
  todayPeakHour: number;
  daily: TelemetryDailyRow[];
  todayHourly: TelemetryHourlyRow[];
}

export interface RuntimeConfig {
  maxChatFileSizeMb: number;
  maxChatFileBytes: number;
  maxP2pFileSizeMb: number;
  maxP2pFileBytes: number;
  maxChatFilesBatch: number;
  minStickersPerPack: number;
  maxStickersPerPack: number;
  recommendedStickersPerPack: number;
  avatarPresets: { id: string; name: string; file?: string; url: string }[];
  videoTranscodeAvailable?: boolean;
  settings?: SystemSettings;
}

export interface TransferItem {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'error' | 'cancelled';
  peerName: string;
  peerKey?: string;
  direction: 'upload' | 'download';
  speed?: string;
}

export interface StagedChatFile {
  id: string;
  file: File;
  previewUrl: string;
  kind: 'image' | 'video' | 'file';
}

export type AdminTab =
  | 'overview'
  | 'chat'
  | 'alerts'
  | 'files'
  | 'devices'
  | 'stickers'
  | 'logs'
  | 'env'
  | 'settings';

export interface AdminEnvAuditItem {
  key: string;
  label: string;
  category: 'media' | 'security' | 'storage' | 'runtime';
  status: 'ok' | 'missing' | 'warning';
  valuePreview: string | null;
  hint: string;
}

export interface AdminEnvDiagnosticLog {
  id: string;
  level: 'warning' | 'info';
  key: string;
  message: string;
  createdAt: number;
}

export interface StorageZoneStatus {
  id: 'db' | 'uploads' | 'stickers' | 'avatars' | 'cache' | 'chunks';
  label: string;
  path: string;
  writable: boolean;
  usedMb: number;
  freeMb: number;
  totalGb: number;
  distinctMount: boolean;
}

export interface RuntimeStorageSummary {
  executionMode: 'docker' | 'standalone';
  platform: string;
  platformLabel: string;
  nodeVersion: string;
  minDiskFreeMb: number;
  diskFreeMb: number;
  diskTotalGb: number;
  diskUsedPercent: number;
  isolatedVolumesCount: number;
  zones: StorageZoneStatus[];
}

export interface AdminEnvStatusPayload {
  readOnly: true;
  ffmpeg: {
    available: boolean;
    source: 'env' | 'system_path' | 'missing';
    version: string | null;
    errorDetail: string | null;
  };
  missingCount: number;
  items: AdminEnvAuditItem[];
  envLogs: AdminEnvDiagnosticLog[];
  runtime?: RuntimeStorageSummary;
}
