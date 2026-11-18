import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { ADMIN_DEFAULT_AVATAR_URL, DEFAULT_ADMIN_RING_COLOR } from '../avatars';

// Private SQLite storage directory (kept outside public static assets)
const dbDir = path.resolve(process.cwd(), 'storage', 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'database.sqlite');

const DEFAULT_SEED_SETTINGS: Array<[string, string]> = [
  ['voiceMessageEnabled', 'true'],
  ['deletePolicy', 'hybrid_15m'],
  ['editWindowMinutes', '15'],
  ['adminRingColor', DEFAULT_ADMIN_RING_COLOR],
  ['adminAvatarUrl', ADMIN_DEFAULT_AVATAR_URL],
];

function migrateColumn(database: sqlite3.Database, table: string, column: string, definition: string) {
  database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
    if (alterErr && !alterErr.message.toLowerCase().includes('duplicate')) {
      console.error(`Migration error (${table}.${column}):`, alterErr.message);
    }
  });
}

function initializeSchema(database: sqlite3.Database) {
  database.serialize(() => {
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
        lastSeenAt INTEGER
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
      CREATE TABLE IF NOT EXISTS daily_telemetry (
        dayKey TEXT PRIMARY KEY,
        peakOnline INTEGER DEFAULT 0,
        peakHour INTEGER DEFAULT 0,
        peakOnlineAt INTEGER DEFAULT 0,
        messageCount INTEGER DEFAULT 0,
        uploadCount INTEGER DEFAULT 0,
        spamBlockedCount INTEGER DEFAULT 0,
        p2pBlockedCount INTEGER DEFAULT 0
      )
    `);

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
    database.run('CREATE INDEX IF NOT EXISTS idx_stickers_pack ON stickers(packId, sortOrder)');
    database.run('CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(lastIp)');
    database.run('CREATE INDEX IF NOT EXISTS idx_logs_ts ON activity_log(timestamp)');

    for (const [key, value] of DEFAULT_SEED_SETTINGS) {
      database.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
    }

    // Auto-purge logs older than 90 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    database.run('DELETE FROM activity_log WHERE timestamp < ?', [cutoff.toISOString()]);
  });
}

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite DB:', err.message);
  } else {
    console.log(`Connected to SQLite database at ${dbPath}`);
    initializeSchema(db);
  }
});

export function dbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

export function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });
}

export function dbRun(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
