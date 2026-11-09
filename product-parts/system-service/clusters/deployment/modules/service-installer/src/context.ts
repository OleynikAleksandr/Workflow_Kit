// Real effects of the installer (process spawn, HTTP health probe) and resolution of injected deps.
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { runCommand } from '#process-supervisor';
import { nodeFs } from './fs.ts';
import type { DetachedSpawner, HealthInfo, HealthProbe, ResolvedDeps, ServiceDeps } from './types.ts';

/** Root of the code this module runs from (a clone or an installed app/<version>). */
export const SOURCE_ROOT: string = fileURLToPath(new URL('../../../../../../../', import.meta.url));

/** Default wait for /api/health after a start. */
export const READY_TIMEOUT_MS = 20_000;
/** Default wait for the backend to go away after a stop. */
export const STOP_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads GET http://127.0.0.1:<port>/api/health; null when nothing (or not Workflow Kit) answers. */
export const fetchHealth: HealthProbe = async (port) => {
  if (port === 0) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isRecord(body) || body['ok'] !== true || typeof body['pid'] !== 'number' || typeof body['version'] !== 'string') return null;
    const info: HealthInfo = { ok: true, version: body['version'], pid: body['pid'] };
    if (typeof body['startedAt'] === 'string') info.startedAt = body['startedAt'];
    return info;
  } catch {
    return null;
  }
};

/** POST /api/system/shutdown from this computer (Origin and JSON as the service requires). */
export async function postShutdown(port: number): Promise<boolean> {
  const origin = `http://127.0.0.1:${port}`;
  try {
    const response = await fetch(`${origin}/api/system/shutdown`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Starts a detached program in its own group, stdin closed, output appended to the log (0600). */
export const spawnDetachedProcess: DetachedSpawner = async (command, args, options) => {
  let fd: number | undefined;
  if (options.logFile) {
    mkdirSync(path.dirname(options.logFile), { recursive: true, mode: 0o700 });
    fd = openSync(options.logFile, 'a', 0o600);
  }
  try {
    const output = fd ?? 'ignore';
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdio: ['ignore', output, output],
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', reject);
    });
    child.unref();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

/** Fills every dependency that the caller did not inject with the real one. */
export function resolveDeps(deps: ServiceDeps = {}): ResolvedDeps {
  return {
    platform: deps.platform ?? process.platform,
    env: deps.env ?? process.env,
    homedir: deps.homedir ?? os.homedir(),
    serving: deps.serving ?? false,
    fs: deps.fs ?? nodeFs,
    run: deps.run ?? runCommand,
    spawnDetached: deps.spawnDetached ?? spawnDetachedProcess,
    health: deps.health ?? fetchHealth,
    kill: deps.kill ?? ((pid, signal) => process.kill(pid, signal)),
    requestShutdown: deps.requestShutdown ?? postShutdown,
    sleep: deps.sleep ?? ((ms) => delay(ms)),
    now: deps.now ?? (() => new Date()),
    uid: deps.uid ?? process.getuid?.() ?? 0,
    sourceRoot: deps.sourceRoot ?? SOURCE_ROOT,
    nodePath: deps.nodePath ?? process.execPath,
    readyTimeoutMs: deps.readyTimeoutMs ?? READY_TIMEOUT_MS,
    stopTimeoutMs: deps.stopTimeoutMs ?? STOP_TIMEOUT_MS,
  };
}
