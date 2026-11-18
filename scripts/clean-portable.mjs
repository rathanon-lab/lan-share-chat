#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

const rootDir = process.cwd();
const buildIdPath = path.join(rootDir, '.next', 'BUILD_ID');

function readDotEnv(envFile) {
  const out = {};
  if (!fs.existsSync(envFile)) return out;
  try {
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
    }
  } catch {
    // Ignore unreadable .env
  }
  return out;
}

function resolveZoneDir(dotEnv, envKey, subDir) {
  const override = (process.env[envKey] || dotEnv[envKey] || '').trim();
  if (override) return path.resolve(rootDir, override);
  const rootOverride = (process.env.STORAGE_ROOT || dotEnv.STORAGE_ROOT || '').trim();
  if (rootOverride) return path.resolve(rootDir, rootOverride, subDir);
  return path.resolve(rootDir, 'storage', subDir);
}

function getDirBytes(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirBytes(fullPath);
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(fullPath).size;
        } catch {
          // Ignore transient files
        }
      }
    }
  } catch {
    return 0;
  }
  return total;
}

function emptyDirectoryContents(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const name of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, name), { recursive: true, force: true });
  }
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

if (!fs.existsSync(buildIdPath)) {
  console.error('[clean:portable] Missing .next/BUILD_ID. Run "npm run build" first before pruning devDependencies.');
  process.exit(1);
}

const dotEnv = readDotEnv(path.join(rootDir, '.env'));
const videoCacheDir = resolveZoneDir(dotEnv, 'STORAGE_CACHE_DIR', 'video-cache');
const chunkStagingDir = resolveZoneDir(dotEnv, 'STORAGE_CHUNKS_DIR', 'chunks');
const stickerStagingDir = resolveZoneDir(dotEnv, 'STORAGE_STAGING_DIR', 'sticker-staging');
const nodeModulesDir = path.join(rootDir, 'node_modules');
const nextDir = path.join(rootDir, '.next');

const beforeBytes = getDirBytes(nodeModulesDir) + getDirBytes(nextDir);

// Ensure offline PDF.js worker is copied to public/ before pruning devDependencies
const pdfWorkerSrc = path.join(nodeModulesDir, 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const pdfWorkerDest = path.join(rootDir, 'public', 'pdf.worker.min.mjs');
if (fs.existsSync(pdfWorkerSrc) && !fs.existsSync(pdfWorkerDest)) {
  fs.mkdirSync(path.dirname(pdfWorkerDest), { recursive: true });
  fs.copyFileSync(pdfWorkerSrc, pdfWorkerDest);
}

console.log('[clean:portable] Removing dev/cache artifacts (preserving db, uploads, stickers, avatars, .env)...');
for (const target of [
  path.join(nextDir, 'dev'),
  path.join(nextDir, 'cache'),
  path.join(nodeModulesDir, '.cache'),
  path.join(rootDir, 'tsconfig.tsbuildinfo'),
]) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

for (const transientDir of [videoCacheDir, chunkStagingDir, stickerStagingDir]) {
  emptyDirectoryContents(transientDir);
}

console.log('[clean:portable] Pruning devDependencies via "npm prune --omit=dev --ignore-scripts"...');
const npmCmd = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const npmArgs =
  process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm prune --omit=dev --ignore-scripts']
    : ['prune', '--omit=dev', '--ignore-scripts'];
const npmRes = spawnSync(npmCmd, npmArgs, {
  cwd: rootDir,
  stdio: 'inherit',
});

if (npmRes.status !== 0) {
  console.error(`[clean:portable] npm prune failed with exit code ${npmRes.status ?? 1}`);
  process.exit(npmRes.status || 1);
}

try {
  const require = createRequire(import.meta.url);
  require('sqlite3');
} catch (err) {
  console.error('[clean:portable] sqlite3 verification failed after prune:', err instanceof Error ? err.message : err);
  process.exit(1);
}

const afterBytes = getDirBytes(nodeModulesDir) + getDirBytes(nextDir);
const savedBytes = Math.max(0, beforeBytes - afterBytes);

console.log('--------------------------------------------------------------------');
console.log(`[clean:portable] Before : ${formatMb(beforeBytes)} (node_modules + .next)`);
console.log(`[clean:portable] After  : ${formatMb(afterBytes)} (node_modules + .next)`);
console.log(`[clean:portable] Freed  : ${formatMb(savedBytes)}`);
console.log('[clean:portable] SQLite3 + Production bundle verified OK.');
console.log('[clean:portable] Next: run "npm run start" (run "npm install" before future rebuilds).');
console.log('--------------------------------------------------------------------');
