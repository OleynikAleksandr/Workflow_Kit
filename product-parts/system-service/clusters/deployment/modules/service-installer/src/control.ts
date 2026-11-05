// Start and stop of the backend: launchd and systemd when installed, otherwise a detached process.
// A stop without a service manager signals only the pid that /api/health reports right before.
import { cleanEnv } from '#process-supervisor';
import { launchctl, systemctl } from './commands.ts';
import type { PlannedCommand } from './commands.ts';
import type { CurrentRecord } from './deploy.ts';
import { readProgramPathsSync } from './deploy.ts';
import { pathApi } from './fs.ts';
import { entryOf } from './layout.ts';
import type { ServiceLayout } from './layout.ts';
import type { HealthInfo, ResolvedDeps } from './types.ts';

/** How the backend is started and stopped. */
export type ControlMode = 'launchagent' | 'systemd-user' | 'detached';

/** A start or stop that did not work; the message is shown to the user. */
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

/** Everything start and stop need to know about the instance. */
export interface ControlTarget {
  layout: ServiceLayout;
  current: CurrentRecord | null;
  port: number;
}

/** launchd and systemd manage only an installed, integrated instance; the rest runs detached. */
export function controlMode(target: ControlTarget): ControlMode {
  const current = target.current;
  if (!current || !current.integrated || target.layout.development || !current.autostartEntry) return 'detached';
  if (current.mechanism === 'launchagent' || current.mechanism === 'systemd-user') return current.mechanism;
  return 'detached';
}

async function call(deps: ResolvedDeps, planned: PlannedCommand): Promise<{ ok: boolean; output: string }> {
  const result = await deps.run(planned.command, planned.args);
  const output = `${result.stderr || result.stdout || result.startError || ''}`.trim();
  return { ok: result.code === 0, output };
}

async function waitUntil(deps: ResolvedDeps, timeoutMs: number, check: () => Promise<boolean>): Promise<boolean> {
  const step = 250;
  for (let waited = 0; ; waited += step) {
    if (await check()) return true;
    if (waited >= timeoutMs) return false;
    await deps.sleep(step);
  }
}

/** Waits until /api/health answers; null on timeout. */
export async function waitReady(deps: ResolvedDeps, port: number): Promise<HealthInfo | null> {
  let health: HealthInfo | null = null;
  await waitUntil(deps, deps.readyTimeoutMs, async () => (health = await deps.health(port)) !== null);
  return health;
}

/** Program the detached mode runs: the installed copy, or this code for a development instance. */
export function detachedProgram(deps: ResolvedDeps, target: ControlTarget): { node: string; entry: string } {
  if (target.current) return { node: target.current.node, entry: target.current.entry };
  return { node: deps.nodePath, entry: entryOf(deps.platform, deps.sourceRoot) };
}

/** Environment of a detached backend: no CLAUDE* (D5) and the saved login PATH (D12). */
export function serviceEnv(deps: ResolvedDeps, layout: ServiceLayout): Record<string, string> {
  const { loginPath } = readProgramPathsSync(deps.fs, layout);
  const env = cleanEnv(deps.env, { platform: deps.platform });
  if (loginPath) {
    const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
    env[key] = loginPath;
  }
  return env;
}

async function bootstrap(deps: ResolvedDeps, plist: string): Promise<void> {
  let last = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await call(deps, launchctl.bootstrap(deps.uid, plist));
    if (result.ok) return;
    last = result.output;
    // A bootout may still be finishing; a job that got loaded meanwhile is fine.
    if ((await call(deps, launchctl.print(deps.uid))).ok) return;
    await deps.sleep(500);
  }
  throw new ServiceError(`launchctl bootstrap не удался: ${last}`);
}

/** Asks the service manager (or a detached spawn) to run the backend; does not wait. */
export async function launch(deps: ResolvedDeps, target: ControlTarget): Promise<ControlMode> {
  const mode = controlMode(target);
  if (mode === 'launchagent') {
    if ((await call(deps, launchctl.print(deps.uid))).ok) {
      const kick = await call(deps, launchctl.kickstart(deps.uid));
      if (!kick.ok) throw new ServiceError(`launchctl kickstart не удался: ${kick.output}`);
    } else {
      await bootstrap(deps, target.layout.launchAgentPlist);
    }
  } else if (mode === 'systemd-user') {
    const started = await call(deps, systemctl.start());
    if (!started.ok) throw new ServiceError(`systemctl --user start не удался: ${started.output}`);
  } else {
    const program = detachedProgram(deps, target);
    const p = pathApi(deps.platform);
    await deps.spawnDetached(program.node, [program.entry, 'serve'], {
      env: serviceEnv(deps, target.layout),
      logFile: target.layout.serviceLog,
      cwd: p.dirname(p.dirname(program.entry)),
    });
  }
  return mode;
}

/** Result of startService. */
export interface StartResult {
  health: HealthInfo;
  alreadyRunning: boolean;
  mode: ControlMode;
}

/** Starts the backend unless it already answers, then waits for /api/health. */
export async function startService(deps: ResolvedDeps, target: ControlTarget): Promise<StartResult> {
  const mode = controlMode(target);
  const before = await deps.health(target.port);
  if (before) return { health: before, alreadyRunning: true, mode };
  if (target.port === 0) throw new ServiceError('порт 0 (WFK_PORT=0): службу можно запустить только на известном порту');
  await launch(deps, target);
  const health = await waitReady(deps, target.port);
  if (!health) {
    throw new ServiceError(`служба не ответила на /api/health за ${Math.round(deps.readyTimeoutMs / 1000)} с; журнал: ${target.layout.serviceLog}`);
  }
  return { health, alreadyRunning: false, mode };
}

/** Result of stopService. */
export interface StopResult {
  wasRunning: boolean;
  mode: ControlMode;
}

/** Stops the backend: service manager first, then TERM to the pid that /api/health reports. */
export async function stopService(deps: ResolvedDeps, target: ControlTarget): Promise<StopResult> {
  const mode = controlMode(target);
  const before = await deps.health(target.port);
  if (mode === 'launchagent') {
    // bootout unloads the job until the next login or start; a job that is not loaded is fine.
    await call(deps, launchctl.bootout(deps.uid));
  } else if (mode === 'systemd-user') {
    const stopped = await call(deps, systemctl.stop());
    if (!stopped.ok) throw new ServiceError(`systemctl --user stop не удался: ${stopped.output}`);
  }
  const gone = await waitUntil(deps, mode === 'detached' ? 0 : 2_000, async () => (await deps.health(target.port)) === null);
  if (!gone) {
    const health = await deps.health(target.port);
    if (health) {
      try {
        deps.kill(health.pid, 'SIGTERM');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
      const stopped = await waitUntil(deps, deps.stopTimeoutMs, async () => (await deps.health(target.port)) === null);
      if (!stopped) throw new ServiceError(`служба (pid ${health.pid}) не остановилась за ${Math.round(deps.stopTimeoutMs / 1000)} с`);
    }
  }
  return { wasRunning: before !== null, mode };
}
