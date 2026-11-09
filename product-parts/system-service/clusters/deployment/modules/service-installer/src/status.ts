// Service status: a synchronous files-only read for the "System" card (D11) and the text of
// `wfk service status` (which also asks /api/health).
import { parseCurrent, readProgramPathsSync, servicePort } from './deploy.ts';
import { pathApi } from './fs.ts';
import { layoutOf } from './install.ts';
import { autostartEntry, mechanismLabel } from './layout.ts';
import { PROGRAMS } from './programs.ts';
import type { AutostartMechanism, HealthInfo, ResolvedDeps, ServiceStatus } from './types.ts';

/** Default autostart mechanism of a platform (Linux: systemd until install finds none). */
export function autostartMechanism(platform: NodeJS.Platform): AutostartMechanism {
  if (platform === 'darwin') return 'launchagent';
  if (platform === 'win32') return 'hkcu-run';
  return 'systemd-user';
}

function samePath(platform: NodeJS.Platform, a: string, b: string): boolean {
  const p = pathApi(platform);
  const left = p.resolve(a).replace(/[\\/]+$/, '');
  const right = p.resolve(b).replace(/[\\/]+$/, '');
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** Status from files only: app/current.json, config.json and the managed files. */
export function readServiceStatus(deps: ResolvedDeps): ServiceStatus {
  const layout = layoutOf(deps);
  const fs = deps.fs;
  const current = parseCurrent(fs.readTextSync(layout.currentFile));
  const { programs, loginPath } = readProgramPathsSync(fs, layout);
  const mechanism = current?.mechanism ?? autostartMechanism(deps.platform);
  const entry = current?.autostartEntry ?? autostartEntry(layout, mechanism);
  let autostart = false;
  if (current?.integrated && current.autostartEntry) {
    // The Run value is checked by `wfk doctor --installed` (reg.exe), not on every poll.
    autostart = mechanism === 'hkcu-run' ? true : fs.existsSync(current.autostartEntry);
  }
  const fromInstalledCopy = current !== null && samePath(deps.platform, deps.sourceRoot, current.appPath);
  let note: string;
  if (layout.development) {
    note = 'экземпляр разработки (WFK_DATA_DIR): автозапуск, запускатель и значок не ставятся';
    if (current) note += `; копия ${current.version}`;
  } else if (!current) {
    note = 'служба не установлена: выполните node bin/wfk.mjs install из клона';
  } else {
    note = `версия ${current.version}, автозапуск: ${mechanismLabel(mechanism)}${autostart ? '' : ' (не зарегистрирован)'}`;
    if (deps.serving && !fromInstalledCopy) note += '; эта служба запущена из клона, не из установленной копии';
  }
  return {
    implemented: true,
    installed: current !== null,
    running: deps.serving,
    autostart,
    mechanism,
    note,
    instance: layout.development ? 'development' : 'default',
    version: current?.version ?? null,
    installedAt: current?.installedAt || null,
    appPath: current?.appPath ?? null,
    fromInstalledCopy,
    autostartEntry: entry,
    launcher: { path: layout.launcher, present: fs.existsSync(layout.launcher) },
    icon: { path: layout.icon, present: fs.existsSync(layout.icon) },
    programs,
    loginPath,
  };
}

function yesNo(value: boolean): string {
  return value ? 'есть' : 'нет';
}

/** Text of `wfk service status`. */
export async function describeStatus(deps: ResolvedDeps): Promise<{ text: string; health: HealthInfo | null }> {
  const layout = layoutOf(deps);
  const status = readServiceStatus(deps);
  const port = await servicePort(deps.fs, layout, deps.env);
  const health = await deps.health(port);
  const lines = [
    `служба: ${health ? `работает (pid ${health.pid}, версия ${health.version}, порт ${port})` : `не отвечает на порту ${port}`}`,
    `установка: ${status.installed ? `версия ${status.version ?? '?'} в ${status.appPath ?? '?'}` : 'не установлена'}`,
    `автозапуск: ${mechanismLabel(status.mechanism)} — ${status.autostart ? 'зарегистрирован' : 'не зарегистрирован'} (${status.autostartEntry ?? '—'})`,
    `запускатель: ${status.launcher?.path ?? '—'} (${yesNo(status.launcher?.present ?? false)})`,
    `значок: ${status.icon?.path ?? '—'} (${yesNo(status.icon?.present ?? false)})`,
    `программы: ${PROGRAMS.map((name) => `${name} ${status.programs?.[name] ?? '—'}`).join(', ')}`,
  ];
  if (status.instance === 'development') lines.push(`примечание: ${status.note}`);
  return { text: lines.join('\n'), health };
}
