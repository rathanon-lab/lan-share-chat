import fs from 'fs';
import os from 'os';

export interface MediaWorkerMetrics {
  mode: 'auto' | 'manual';
  envOverride: string;
  effectiveCpus: number;
  effectiveRamGb: number;
  freeRamRatio: number;
  baseConcurrency: number;
  currentLimit: number;
  activeWorkers: number;
  queuedTasks: number;
  backpressureActive: boolean;
}

function detectCgroupCpuLimit(): number {
  const hostCpus = Math.max(1, os.cpus().length);
  if (process.platform !== 'linux') return hostCpus;
  try {
    // cgroups v2: "<quota> <period>" or "max <period>"
    const cpuMax = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/);
    if (cpuMax.length >= 2 && cpuMax[0] !== 'max') {
      const quota = Number(cpuMax[0]);
      const period = Number(cpuMax[1]);
      if (quota > 0 && period > 0) {
        return Math.max(1, Math.min(hostCpus, Math.ceil(quota / period)));
      }
    }
  } catch {}
  try {
    // cgroups v1
    const quota = Number(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', 'utf8').trim());
    const period = Number(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_period_us', 'utf8').trim());
    if (quota > 0 && period > 0) {
      return Math.max(1, Math.min(hostCpus, Math.ceil(quota / period)));
    }
  } catch {}
  return hostCpus;
}

function detectMemoryInfo(): { totalBytes: number; freeBytes: number } {
  let totalBytes = os.totalmem();
  let freeBytes = os.freemem();
  if (process.platform === 'linux') {
    try {
      const maxRaw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
      const curRaw = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim();
      if (maxRaw !== 'max') {
        const lim = Number(maxRaw);
        const cur = Number(curRaw);
        if (lim > 0 && lim < totalBytes) {
          totalBytes = lim;
          freeBytes = Math.max(0, lim - (Number.isFinite(cur) ? cur : 0));
        }
      }
    } catch {}
  }
  return { totalBytes, freeBytes };
}

const rawEnvVal = (process.env.MEDIA_WORKER_CONCURRENCY || 'auto').trim().toLowerCase();
const manualParsed = rawEnvVal && rawEnvVal !== 'auto' ? parseInt(rawEnvVal, 10) : NaN;
const isManual = Number.isFinite(manualParsed) && manualParsed >= 1;

const effectiveCpus = detectCgroupCpuLimit();
const bootMem = detectMemoryInfo();
const effectiveRamGb = Math.max(0.5, Math.round((bootMem.totalBytes / (1024 ** 3)) * 10) / 10);

// Reserve 50% CPU headroom for Node Event Loop / Control Plane and ~1.5 GB RAM per heavy FFmpeg job
const cpuBudget = Math.max(2, Math.floor(effectiveCpus * 0.5));
const ramBudget = Math.max(2, Math.floor(effectiveRamGb / 1.5));
const baseConcurrency = isManual
  ? Math.max(1, Math.min(16, manualParsed))
  : Math.min(8, Math.max(2, Math.min(cpuBudget, ramBudget)));

let activeWorkers = 0;
const waitQueue: Array<() => void> = [];

function computeDynamicLimit(): { limit: number; freeRamRatio: number; backpressureActive: boolean } {
  const mem = detectMemoryInfo();
  const freeRamRatio = mem.totalBytes > 0 ? mem.freeBytes / mem.totalBytes : 1;
  // Adaptive Backpressure: if free memory drops below 15%, temporarily halve worker concurrency
  const backpressureActive = freeRamRatio < 0.15;
  const limit = backpressureActive ? Math.max(1, Math.floor(baseConcurrency / 2)) : baseConcurrency;
  return { limit, freeRamRatio, backpressureActive };
}

function drainQueue() {
  const { limit } = computeDynamicLimit();
  while (activeWorkers < limit && waitQueue.length > 0) {
    const next = waitQueue.shift();
    if (next) next();
  }
}

export async function runMediaWorkerTask<T>(task: () => Promise<T>): Promise<T> {
  const { limit } = computeDynamicLimit();
  if (activeWorkers >= limit) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  activeWorkers += 1;
  try {
    return await task();
  } finally {
    activeWorkers = Math.max(0, activeWorkers - 1);
    drainQueue();
  }
}

export function getMediaWorkerStatus(): MediaWorkerMetrics {
  const { limit, freeRamRatio, backpressureActive } = computeDynamicLimit();
  return {
    mode: isManual ? 'manual' : 'auto',
    envOverride: rawEnvVal || 'auto',
    effectiveCpus,
    effectiveRamGb,
    freeRamRatio: Math.round(freeRamRatio * 1000) / 1000,
    baseConcurrency,
    currentLimit: limit,
    activeWorkers,
    queuedTasks: waitQueue.length,
    backpressureActive,
  };
}
