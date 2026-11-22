import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { ADMIN_DEFAULT_AVATAR_URL, DEFAULT_ADMIN_RING_COLOR } from '../avatars';
import { dbDir } from '../storagePaths';

// Private SQLite storage directory (kept outside public static assets)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Dual-SQLite Bulkhead Architecture:
//   1. database.sqlite       -> Data Plane (write-heavy messages, uploads, alerts, activity logs, telemetry)
//   2. control_plane.sqlite  -> Control Plane (system_settings, devices, deleted_devices, banned_ips, stickers)
export const dataDbPath = path.join(dbDir, 'database.sqlite');
export const controlDbPath = path.join(dbDir, 'control_plane.sqlite');

const DEFAULT_SEED_SETTINGS: Array<[string, string]> = [
  ['voiceMessageEnabled', 'true'],
  ['deletePolicy', 'hybrid_15m'],
  ['editWindowMinutes', '15'],
  ['adminRingColor', DEFAULT_ADMIN_RING_COLOR],
  ['adminAvatarUrl', ADMIN_DEFAULT_AVATAR_URL],
  ['stickerPickerGifMode', 'live_viewport'],
];

const CONTROL_TABLES_RE =
  /\b(?:FROM|INTO|UPDATE|TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?)\s+["'`]?(system_settings|devices|deleted_devices|banned_ips|sticker_packs|stickers)\b/i;

function isControlPlaneSql(sql: string): boolean {
  return CONTROL_TABLES_RE.test(sql);
}

function migrateColumn(database: sqlite3.Database, table: string, column: string, definition: string) {
  database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
    if (alterErr && !alterErr.message.toLowerCase().includes('duplicate')) {
      console.error(`Migration error (${table}.${column}):`, alterErr.message);
    }
  });
}

function initializeDataPlaneSchema(database: sqlite3.Database): Promise<void> {
  return new Promise((resolve) => {
    database.serialize(() => {
      database.run('PRAGMA journal_mode = WAL');
      database.run('PRAGMA synchronous = NORMAL');
      database.run('PRAGMA busy_timeout = 5000');

      database.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT,
          senderDeviceId TEXT,
          text TEXT,
          type TEXT DEFAULT 'text',
          fileName TEXT,
          fileSize INTEGER,
          filePath TEXT,
          mimeType TEXT,
          mediaToken TEXT,
          attachments TEXT,
          time TEXT,
          createdAt INTEGER,
          editedAt INTEGER,
          editCount INTEGER DEFAULT 0,
          isDeleted INTEGER DEFAULT 0,
          deletedAt INTEGER,
          deletedBy TEXT,
          mentionAdmin INTEGER DEFAULT 0,
          status TEXT,
          isAdmin INTEGER DEFAULT 0
        )
      `);

      const msgMigrations: Array<[string, string]> = [
        ['filePath', 'TEXT'],
        ['mimeType', 'TEXT'],
        ['mediaToken', 'TEXT'],
        ['attachments', 'TEXT'],
        ['isAdmin', 'INTEGER DEFAULT 0'],
        ['senderDeviceId', 'TEXT'],
        ['createdAt', 'INTEGER'],
        ['editedAt', 'INTEGER'],
        ['editCount', 'INTEGER DEFAULT 0'],
        ['isDeleted', 'INTEGER DEFAULT 0'],
        ['deletedAt', 'INTEGER'],
        ['deletedBy', 'TEXT'],
        ['mentionAdmin', 'INTEGER DEFAULT 0'],
        ['stickerMeta', 'TEXT'],
        ['isRead', 'INTEGER DEFAULT 0'],
        ['readAt', 'INTEGER'],
      ];
      for (const [col, def] of msgMigrations) {
        migrateColumn(database, 'messages', col, def);
      }

      database.run(`
        CREATE TABLE IF NOT EXISTS message_edits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          messageId INTEGER NOT NULL,
          previousText TEXT,
          newText TEXT,
          editedBy TEXT,
          editedByDeviceId TEXT,
          editedAt INTEGER
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS admin_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alertType TEXT NOT NULL,
          messageId INTEGER,
          sender TEXT,
          deviceId TEXT,
          previewText TEXT,
          reason TEXT,
          status TEXT DEFAULT 'pending',
          createdAt INTEGER,
          resolvedAt INTEGER
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS daily_telemetry (
          dayKey TEXT PRIMARY KEY,
          peakOnline INTEGER DEFAULT 0,
          peakHour INTEGER DEFAULT 0,
          peakOnlineAt INTEGER DEFAULT 0,
          messageCount INTEGER DEFAULT 0,
          uploadCount INTEGER DEFAULT 0,
          uploadBytes INTEGER DEFAULT 0,
          egressBytes INTEGER DEFAULT 0,
          spamBlockedCount INTEGER DEFAULT 0,
          p2pBlockedCount INTEGER DEFAULT 0
        )
      `);
      migrateColumn(database, 'daily_telemetry', 'uploadBytes', 'INTEGER DEFAULT 0');
      migrateColumn(database, 'daily_telemetry', 'egressBytes', 'INTEGER DEFAULT 0');

      database.run(`
        CREATE TABLE IF NOT EXISTS hourly_telemetry (
          dayKey TEXT NOT NULL,
          hour INTEGER NOT NULL,
          peakOnline INTEGER DEFAULT 0,
          messageCount INTEGER DEFAULT 0,
          PRIMARY KEY (dayKey, hour)
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS uploaded_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT,
          deviceId TEXT,
          senderIp TEXT,
          originalName TEXT,
          storedName TEXT,
          mimeType TEXT,
          fileSize INTEGER,
          uploadedAt TEXT
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT,
          actor TEXT,
          actorIp TEXT,
          details TEXT,
          timestamp TEXT
        )
      `);

      database.run('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(createdAt)');
      database.run('CREATE INDEX IF NOT EXISTS idx_messages_device ON messages(senderDeviceId)');
      database.run('CREATE INDEX IF NOT EXISTS idx_edits_msg ON message_edits(messageId)');
      database.run('CREATE INDEX IF NOT EXISTS idx_alerts_status ON admin_alerts(status, id)');
      database.run('CREATE INDEX IF NOT EXISTS idx_logs_ts ON activity_log(timestamp)');

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      database.run('DELETE FROM activity_log WHERE timestamp < ?', [cutoff.toISOString()], () => resolve());
    });
  });
}

function initializeControlPlaneSchema(database: sqlite3.Database): Promise<void> {
  return new Promise((resolve) => {
    database.serialize(() => {
      database.run('PRAGMA journal_mode = WAL');
      database.run('PRAGMA synchronous = NORMAL');
      database.run('PRAGMA busy_timeout = 5000');

      database.run(`
        CREATE TABLE IF NOT EXISTS _meta_flags (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS devices (
          deviceId TEXT PRIMARY KEY,
          name TEXT,
          avatarUrl TEXT,
          os TEXT,
          browser TEXT,
          userAgent TEXT,
          lastIp TEXT,
          lastSeenAt INTEGER,
          mutedUntil INTEGER DEFAULT 0,
          isBanned INTEGER DEFAULT 0,
          banReason TEXT DEFAULT ''
        )
      `);

      const devMigrations: Array<[string, string]> = [
        ['avatarUrl', 'TEXT'],
        ['os', 'TEXT'],
        ['browser', 'TEXT'],
        ['userAgent', 'TEXT'],
        ['lastIp', 'TEXT'],
        ['lastSeenAt', 'INTEGER'],
        ['mutedUntil', 'INTEGER DEFAULT 0'],
        ['isBanned', 'INTEGER DEFAULT 0'],
        ['banReason', "TEXT DEFAULT ''"],
      ];
      for (const [col, def] of devMigrations) {
        migrateColumn(database, 'devices', col, def);
      }

      database.run(`
        CREATE TABLE IF NOT EXISTS deleted_devices (
          deviceId TEXT PRIMARY KEY,
          deletedAt INTEGER
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS banned_ips (
          ip TEXT PRIMARY KEY,
          reason TEXT DEFAULT '',
          bannedAt INTEGER
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS sticker_packs (
          packId TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          mainUrl TEXT,
          tabUrl TEXT,
          source TEXT DEFAULT 'uploaded',
          enabled INTEGER DEFAULT 1,
          sortOrder INTEGER DEFAULT 0,
          createdAt INTEGER
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS stickers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          packId TEXT NOT NULL,
          stickerId TEXT NOT NULL,
          fileName TEXT NOT NULL,
          url TEXT NOT NULL,
          alt TEXT DEFAULT '',
          keywords TEXT DEFAULT '',
          sortOrder INTEGER DEFAULT 0
        )
      `);

      database.run('CREATE INDEX IF NOT EXISTS idx_stickers_pack ON stickers(packId, sortOrder)');
      database.run('CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(lastIp)');

      // One-time non-destructive migration of legacy Control Plane rows from database.sqlite
      database.get<{ value: string }>(
        "SELECT value FROM _meta_flags WHERE key = 'migrated_from_legacy_v32'",
        [],
        (_flagErr, row) => {
          if (row?.value === '1' || !fs.existsSync(dataDbPath)) {
            for (const [key, value] of DEFAULT_SEED_SETTINGS) {
              database.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
            }
            resolve();
            return;
          }

          const escapedLegacy = dataDbPath.replace(/'/g, "''");
          database.serialize(() => {
            database.run(`ATTACH DATABASE '${escapedLegacy}' AS legacy`, (attachErr) => {
              if (attachErr) {
                for (const [key, value] of DEFAULT_SEED_SETTINGS) {
                  database.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
                }
                resolve();
                return;
              }
              const copyOps = [
                'INSERT OR IGNORE INTO system_settings (key, value) SELECT key, value FROM legacy.system_settings',
                'INSERT OR IGNORE INTO devices (deviceId, name, avatarUrl, os, browser, userAgent, lastIp, lastSeenAt, mutedUntil, isBanned, banReason) SELECT deviceId, name, avatarUrl, os, browser, userAgent, lastIp, lastSeenAt, mutedUntil, isBanned, banReason FROM legacy.devices',
                'INSERT OR IGNORE INTO deleted_devices (deviceId, deletedAt) SELECT deviceId, deletedAt FROM legacy.deleted_devices',
                'INSERT OR IGNORE INTO banned_ips (ip, reason, bannedAt) SELECT ip, reason, bannedAt FROM legacy.banned_ips',
                'INSERT OR IGNORE INTO sticker_packs (packId, name, description, mainUrl, tabUrl, source, enabled, sortOrder, createdAt) SELECT packId, name, description, mainUrl, tabUrl, source, enabled, sortOrder, createdAt FROM legacy.sticker_packs',
                'INSERT OR IGNORE INTO stickers (id, packId, stickerId, fileName, url, alt, keywords, sortOrder) SELECT id, packId, stickerId, fileName, url, alt, keywords, sortOrder FROM legacy.stickers',
              ];
              for (const q of copyOps) {
                database.run(q, () => {});
              }
              for (const [key, value] of DEFAULT_SEED_SETTINGS) {
                database.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
              }
              database.run("INSERT OR REPLACE INTO _meta_flags (key, value) VALUES ('migrated_from_legacy_v32', '1')");
              database.run('DETACH DATABASE legacy', () => resolve());
            });
          });
        }
      );
    });
  });
}

let resolveDataReady!: () => void;
let resolveControlReady!: () => void;
const dataReadyPromise = new Promise<void>((r) => {
  resolveDataReady = r;
});
const controlReadyPromise = new Promise<void>((r) => {
  resolveControlReady = r;
});

export const db = new sqlite3.Database(dataDbPath, (err) => {
  if (err) {
    console.error('Failed to connect to Data Plane SQLite DB:', err.message);
    resolveDataReady();
  } else {
    console.log(`Connected to Data Plane SQLite DB at ${dataDbPath}`);
    initializeDataPlaneSchema(db).finally(() => resolveDataReady());
  }
});

export const controlDb = new sqlite3.Database(controlDbPath, (err) => {
  if (err) {
    console.error('Failed to connect to Control Plane SQLite DB:', err.message);
    resolveControlReady();
  } else {
    console.log(`Connected to Control Plane SQLite DB at ${controlDbPath}`);
    dataReadyPromise.then(() => initializeControlPlaneSchema(controlDb)).finally(() => resolveControlReady());
  }
});

function pickDb(sql: string): { conn: sqlite3.Database; ready: Promise<void> } {
  if (isControlPlaneSql(sql)) {
    return { conn: controlDb, ready: controlReadyPromise };
  }
  return { conn: db, ready: dataReadyPromise };
}

export async function dbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const { conn, ready } = pickDb(sql);
  await ready;
  return new Promise((resolve, reject) => {
    conn.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

export async function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { conn, ready } = pickDb(sql);
  await ready;
  return new Promise((resolve, reject) => {
    conn.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
  const { conn, ready } = pickDb(sql);
  await ready;
  return new Promise((resolve, reject) => {
    conn.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function getDualDbStatus(): {
  dataDbPath: string;
  controlDbPath: string;
  dataDbBytes: number;
  controlDbBytes: number;
} {
  const safeSize = (p: string) => {
    try {
      return fs.existsSync(p) ? fs.statSync(p).size : 0;
    } catch {
      return 0;
    }
  };
  return {
    dataDbPath,
    controlDbPath,
    dataDbBytes: safeSize(dataDbPath),
    controlDbBytes: safeSize(controlDbPath),
  };
}
