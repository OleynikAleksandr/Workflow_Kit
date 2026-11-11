// Dispatcher of the service commands for the cli module: runs a command and turns the outcome
// into { ok, exitCode, message }.
import { resolveDeps } from './context.ts';
import { startService, stopService } from './control.ts';
import { readCurrent, servicePort } from './deploy.ts';
import { doctor, formatDoctor } from './doctor.ts';
import { install, layoutOf, uninstall } from './install.ts';
import type { InstallReport } from './install.ts';
import { mechanismLabel } from './layout.ts';
import { openPanel } from './open.ts';
import { PROGRAMS } from './programs.ts';
import { describeStatus } from './status.ts';
import type { ResolvedDeps, ServiceCommand, ServiceCommandResult, ServiceDeps } from './types.ts';

/**
 * Windows (M14): the PATH of the user changes at once, but a Windows Terminal that was already
 * open gives its new tabs the old environment, so wfk is not found there until it restarts.
 */
export function windowsLauncherHint(launcher: string): string {
  return `команда wfk появится в новом окне терминала; если Windows Terminal был открыт, закройте его полностью. Сейчас: & "${launcher}" open`;
}

function installText(report: InstallReport, deps: ResolvedDeps): string {
  const kind =
    report.previousVersion === null
      ? 'новая установка'
      : report.previousVersion === report.version
        ? 'повторная установка'
        : `обновление с ${report.previousVersion}`;
  const lines = [`Workflow Kit ${report.version} установлен в ${report.appPath} (${kind}${report.copied ? '' : ', копия уже на месте'})`];
  lines.push(`программы: ${PROGRAMS.map((name) => `${name} ${report.programs[name] ?? '—'}`).join(', ')}`);
  if (report.development) {
    lines.push('экземпляр разработки (WFK_DATA_DIR): запускатель, значок и автозапуск не ставятся');
  } else {
    const record = report.record;
    lines.push(`запускатель: ${record.launcher ?? '—'}`);
    if (deps.platform === 'win32' && record.launcher) lines.push(windowsLauncherHint(record.launcher));
    const how = report.icon?.kind === 'app' ? ' (приложение с окном панели)' : report.icon && deps.platform === 'darwin' ? ' (окно браузера)' : '';
    lines.push(`значок: ${record.icon ?? '—'}${how}${report.icon?.note ? `; ${report.icon.note}` : ''}`);
    if (record.mechanism) lines.push(`автозапуск: ${mechanismLabel(record.mechanism)} (${record.autostartEntry ?? '—'})`);
  }
  const health = report.start.health;
  lines.push(`служба: работает (pid ${health.pid}, версия ${health.version})`);
  if (report.removedVersions.length > 0) lines.push(`удалены старые версии: ${report.removedVersions.join(', ')}`);
  for (const warning of report.warnings) lines.push(`ВНИМАНИЕ: ${warning}`);
  return lines.join('\n');
}

async function control(deps: ResolvedDeps, command: 'start' | 'stop'): Promise<string> {
  const layout = layoutOf(deps);
  const current = await readCurrent(deps.fs, layout);
  const port = await servicePort(deps.fs, layout, deps.env);
  if (command === 'start') {
    const result = await startService(deps, { layout, current, port });
    const state = result.alreadyRunning ? 'уже работает' : 'запущена';
    return `служба ${state}: pid ${result.health.pid}, версия ${result.health.version}, http://127.0.0.1:${port}/`;
  }
  const result = await stopService(deps, { layout, current, port });
  return result.wasRunning ? 'служба остановлена' : 'служба не была запущена';
}

async function dispatch(command: ServiceCommand, deps: ResolvedDeps, args: readonly string[]): Promise<ServiceCommandResult> {
  switch (command) {
    case 'install':
      return { ok: true, exitCode: 0, message: installText(await install(deps), deps) };
    case 'uninstall': {
      const report = await uninstall(deps);
      const lines = [report.removed.length > 0 ? `сняты: ${report.removed.join(', ')}` : 'снимать нечего'];
      if (report.wasRunning) lines.unshift('служба остановлена');
      lines.push(`данные сохранены: ${report.keptData.join(', ')}`);
      return { ok: true, exitCode: 0, message: lines.join('\n') };
    }
    case 'start':
    case 'stop':
      return { ok: true, exitCode: 0, message: await control(deps, command) };
    case 'status':
      return { ok: true, exitCode: 0, message: (await describeStatus(deps)).text };
    case 'open': {
      if (args.some((arg) => arg !== '--url-only')) throw new Error('Использование: wfk open [--url-only]');
      const result = await openPanel(deps, { urlOnly: args.includes('--url-only') });
      if (!result.plan) return { ok: true, exitCode: 0, message: `панель: ${result.url}` };
      const how = result.plan.kind === 'mac-app' ? 'в приложении Workflow Kit' : result.plan.kind === 'app-window' ? 'в окне приложения' : 'в браузере';
      return { ok: true, exitCode: 0, message: `панель открыта ${how}: ${result.url}` };
    }
    case 'doctor': {
      const report = await doctor(deps, { installed: args.includes('--installed') });
      return { ok: report.ok, exitCode: report.ok ? 0 : 1, message: formatDoctor(report) };
    }
  }
}

/** Label of a command in messages ("install", "service start"). */
export function commandLabel(command: ServiceCommand): string {
  return command === 'start' || command === 'stop' || command === 'status' ? `service ${command}` : command;
}

/** Runs a service command with the caller's context and injected effects; never throws. */
export async function runWithDeps(command: ServiceCommand, deps: ServiceDeps, args: readonly string[] = []): Promise<ServiceCommandResult> {
  try {
    return await dispatch(command, resolveDeps(deps), args);
  } catch (error) {
    return { ok: false, exitCode: 1, message: `wfk ${commandLabel(command)}: ${error instanceof Error ? error.message : String(error)}` };
  }
}
