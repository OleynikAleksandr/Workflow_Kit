// Lock files (protocol sections 4 and 8): the session locks of Kimi, which Kit only reads, and
// the lock Kit itself takes around a write of config.toml. A holder is alive when its process
// exists and it started after the system was booted (a pid is reused after a reboot).
import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** What tells a live holder from a dead one; tests replace it. */
export interface Liveness {
  pidAlive(pid: number): boolean;
  /** Time the system was booted, ms. */
  bootTime(): number;
  hostname(): string;
}

/** The clock of the boot is known to a few seconds only. */
const BOOT_SLACK_MS = 5000;

/** Liveness of this machine. */
export function defaultLiveness(): Liveness {
  return {
    pidAlive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        // EPERM: the process exists and belongs to another user.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
      }
    },
    bootTime: () => Date.now() - os.uptime() * 1000,
    hostname: () => os.hostname(),
  };
}

/** A time of a lock file as ms: a number of ms or an ISO string; null when it is neither. */
export function lockTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

/** True when the process that wrote { pid, startedAt } still runs. */
export function holderAlive(holder: { pid: unknown; startedAt: unknown }, live: Liveness): boolean {
  if (typeof holder.pid !== 'number' || !Number.isInteger(holder.pid) || holder.pid <= 0) return false;
  const started = lockTime(holder.startedAt);
  if (started !== null && started < live.bootTime() - BOOT_SLACK_MS) return false;
  return live.pidAlive(holder.pid);
}

/**
 * Ids of the sessions whose lock is alive: a lock of another host, or of a running process
 * started after the boot. A file that cannot be read counts as alive (it is being written).
 */
export async function liveSessionLocks(dir: string, live: Liveness): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const alive: string[] = [];
  for (const name of names.filter((item) => item.endsWith('.lock')).sort()) {
    const id = name.slice(0, -'.lock'.length);
    let lock: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
      lock = parsed as Record<string, unknown>;
    } catch (error) {
      // Released between readdir and readFile: no lock.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') alive.push(id);
      continue;
    }
    const foreign = typeof lock['hostname'] === 'string' && lock['hostname'] !== live.hostname();
    if (foreign || holderAlive({ pid: lock['pid'], startedAt: lock['startedAt'] }, live)) alive.push(id);
  }
  return alive;
}
