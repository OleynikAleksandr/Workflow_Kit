// "Окружение папки": `claude remote-control --spawn=same-dir` in the project folder, so the iPad
// app and the web can start sessions there. A special project action (start / stop) with its own
// record; the process lives apart from the service (D5) and is stopped only by its record (D9).
// After a reboot the boot id differs, so the environment reads as stopped.
import path from 'node:path';
import { ProviderError } from '#provider-registry';
import type { Project, ProviderAction } from '#provider-registry';
import { ProcessError } from '#process-supervisor';
import { dialogError, logTail, parseMarkers, poll, readText } from './pty.ts';
import type { EnvironmentRecord } from './records.ts';
import { PROVIDER_ID } from './runtime.ts';
import type { ClaudeRuntime } from './runtime.ts';

/** Action ids. */
export const ENVIRONMENT_START = 'environment-start';
export const ENVIRONMENT_STOP = 'environment-stop';

/** The record of a project's environment and whether its process is alive. */
export async function environmentState(rt: ClaudeRuntime, project: Project): Promise<{ record: EnvironmentRecord | undefined; running: boolean }> {
  const record = (await rt.store.read()).environments.find((e) => e.projectPath === project.path);
  return { record, running: await rt.isAlive(record?.processId ?? null) };
}

/** The two project actions with their state (shown as reasons of the disabled button). */
export async function environmentActions(rt: ClaudeRuntime, project: Project): Promise<ProviderAction[]> {
  const [reason, trust, state] = await Promise.all([rt.ptyReason(), rt.claudeConfig.trustOf(project.path), environmentState(rt, project)]);
  const since = state.record ? rt.formatTime(state.record.startedAt) : '';
  let startReason: string | undefined;
  if (state.running) startReason = `окружение папки работает с ${since}`;
  else if (reason) startReason = reason;
  else if (trust.trusted !== true) startReason = 'папка не доверена: сначала «Предпросмотр доверия…» → «Доверять»';
  let stopReason: string | undefined;
  if (!state.running) stopReason = state.record ? 'окружение папки остановлено' : 'окружение папки не запущено';
  return [
    {
      id: ENVIRONMENT_START,
      title: 'Окружение папки: запустить',
      scope: 'project',
      enabled: startReason === undefined,
      ...(startReason ? { reason: startReason } : {}),
      confirm: `Запустить окружение папки «${project.name}»? С iPad и из веба в нём можно будет начинать сессии Claude; процесс работает отдельно от службы.`,
    },
    {
      id: ENVIRONMENT_STOP,
      title: 'Окружение папки: остановить',
      scope: 'project',
      enabled: stopReason === undefined,
      ...(stopReason ? { reason: stopReason } : {}),
      confirm: `Остановить окружение папки «${project.name}»? Сессии, начатые через него, могут завершиться.`,
    },
  ];
}

/** Starts the environment (no-op when it already runs). */
export async function startEnvironment(rt: ClaudeRuntime, project: Project): Promise<void> {
  if ((await environmentState(rt, project)).running) return;
  const { claude, expect } = await rt.requirePty();
  await rt.requireTrust(project);
  const key = rt.newKey('environment');
  const logFile = path.join(rt.logsDir, `${key}.log`);
  const debugFile = path.join(rt.logsDir, `${key}.debug.log`);
  const record = await rt.context.supervisor
    .spawn({
      owner: { provider: PROVIDER_ID, project: project.id, kind: 'environment', ref: key },
      command: expect,
      args: [rt.options.scripts.environment, project.path, claude, project.name, debugFile],
      cwd: project.path,
      env: rt.context.env,
      logFile,
    })
    .catch((error: unknown) => {
      if (error instanceof ProcessError) throw new ProviderError(`process-${error.code}`, `Claude: ${error.message}`, { hint: `Журнал: ${logFile}` });
      throw error;
    });
  let claudePid: number | null = null;
  const halt = async (): Promise<string> => {
    if (claudePid !== null) await rt.context.supervisor.track(record.id, claudePid).catch(() => undefined);
    await rt.context.supervisor.stop(record.id, { graceMs: 2000 }).catch(() => undefined);
    return readText(logFile);
  };
  const fail = async (code: string, message: string): Promise<never> => {
    const tail = logTail(await halt());
    throw new ProviderError(code, tail ? `${message}\n${tail}` : message, { hint: `Журнал окружения: ${logFile}`, details: { log: logFile } });
  };
  const started = await poll<{ envId: string | null }>(
    async () => {
      const markers = parseMarkers(await readText(logFile));
      claudePid = markers.claudePid ?? claudePid;
      if (markers.dialog) throw dialogError(markers.dialog, await halt(), logFile);
      if (markers.envStarted) return { envId: markers.envId };
      if (markers.failure === 'not-trusted') return fail('not-trusted', 'Claude: «Workspace not trusted» — папка не доверена');
      if (markers.failure === 'exited' || !(await rt.isAlive(record.id))) {
        // The script may have printed DIALOG right before it exited.
        const dialog = parseMarkers(await readText(logFile)).dialog;
        if (dialog) throw dialogError(dialog, await halt(), logFile);
        return fail('environment-exited', 'Окружение папки завершилось сразу после запуска');
      }
      return undefined;
    },
    { timeoutMs: rt.options.environmentTimeoutMs, pollMs: rt.options.pollMs },
  );
  if (!started) await fail('environment-timeout', 'Окружение папки не запустилось вовремя');
  if (claudePid !== null) {
    const pid = claudePid;
    await rt.context.supervisor.track(record.id, pid).catch((error: unknown) => rt.context.log(`claude: track ${pid}: ${String(error)}`));
  }
  const startedAt = rt.context.now().toISOString();
  const next: EnvironmentRecord = {
    projectId: project.id,
    projectPath: project.path,
    name: project.name,
    processId: record.id,
    claudePid,
    environmentId: started?.envId ?? null,
    startedAt,
    stoppedAt: null,
    logFile,
    debugFile,
  };
  await rt.store.update((records) => {
    records.environments = [...records.environments.filter((e) => e.projectPath !== project.path), next];
  });
}

/** Stops the environment through its own supervisor record only (D9). */
export async function stopEnvironment(rt: ClaudeRuntime, project: Project): Promise<void> {
  const { record } = await environmentState(rt, project);
  if (!record?.processId) return;
  let outcome: string;
  try {
    outcome = (await rt.context.supervisor.stop(record.processId, { graceMs: rt.options.stopGraceMs })).outcome;
  } catch (error) {
    if (!(error instanceof ProcessError && error.code === 'not-found')) throw error;
    outcome = 'already-gone';
  }
  if (outcome === 'still-running') throw new ProviderError('stop-failed', 'Окружение папки не завершилось', { hint: `Журнал: ${record.logFile}` });
  if (outcome === 'unverifiable') throw new ProviderError('unverifiable', 'Процесс окружения нельзя проверить на этой ОС');
  await rt.store.update((records) => {
    const stored = records.environments.find((e) => e.projectPath === project.path);
    if (stored) Object.assign(stored, { processId: null, claudePid: null, stoppedAt: rt.context.now().toISOString() });
  });
}

/** Reasons not to remove the project while its environment runs. */
export async function environmentBlockers(rt: ClaudeRuntime, project: Project): Promise<string[]> {
  return (await environmentState(rt, project)).running ? ['работает окружение папки'] : [];
}
