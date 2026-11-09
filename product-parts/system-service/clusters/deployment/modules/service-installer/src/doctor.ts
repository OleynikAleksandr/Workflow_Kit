// wfk doctor [--installed]: checks of the environment and of the installed service (for delivery).
import { launchctl, parseRegQuery, registry, systemctl } from './commands.ts';
import { readCurrent, readProgramPathsSync, servicePort } from './deploy.ts';
import { layoutOf } from './install.ts';
import { mechanismLabel } from './layout.ts';
import { PROGRAMS, envPath, findProgram } from './programs.ts';
import { desktopExecArg, isOwnLauncher, windowsFileUrl, windowsRunValue } from './templates.ts';
import type { ResolvedDeps } from './types.ts';

/** One line of the doctor report. */
export interface DoctorCheck {
  name: string;
  level: 'ok' | 'warn' | 'fail';
  detail: string;
}

/** Report of wfk doctor; ok is false when any check failed. */
export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

const MIN_NODE_MAJOR = 24;

/** Checks the environment; with installed also the installed copy, launcher, icon, autostart and /api/health. */
export async function doctor(deps: ResolvedDeps, options: { installed: boolean; nodeVersion?: string }): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const add = (name: string, level: DoctorCheck['level'], detail: string): void => {
    checks.push({ name, level, detail });
  };
  const layout = layoutOf(deps);
  const nodeVersion = options.nodeVersion ?? process.version;
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0]);
  add('Node.js', major >= MIN_NODE_MAJOR ? 'ok' : 'fail', `${nodeVersion} (нужен ${MIN_NODE_MAJOR}+)`);
  add('каталог данных', deps.fs.existsSync(layout.dirs.configDir) ? 'ok' : 'warn', layout.dirs.configDir);

  let port: number | null = null;
  try {
    port = await servicePort(deps.fs, layout, deps.env);
    add('config.json', 'ok', `порт ${port}`);
  } catch (error) {
    add('config.json', 'fail', error instanceof Error ? error.message : String(error));
  }

  const saved = readProgramPathsSync(deps.fs, layout).programs;
  for (const name of PROGRAMS) {
    const found =
      saved[name] ?? findProgram(name, envPath(deps.env), { platform: deps.platform, env: deps.env, isExecutable: (file) => deps.fs.isExecutable(file) });
    const usable = found !== null && deps.fs.isExecutable(found);
    // claude, codex and expect are optional: the panel shows what is unavailable and why (D4).
    add(`программа ${name}`, usable ? 'ok' : name === 'node' && options.installed ? 'fail' : 'warn', found ?? 'не найдена');
  }

  const current = await readCurrent(deps.fs, layout);
  if (options.installed) {
    if (!current) {
      add('установка', 'fail', `нет ${layout.currentFile}: выполните wfk install`);
    } else {
      add('установка', 'ok', `версия ${current.version} в ${current.appPath}`);
      add('точка входа', (await deps.fs.exists(current.entry)) ? 'ok' : 'fail', current.entry);
      add('node службы', deps.fs.isExecutable(current.node) ? 'ok' : 'fail', current.node);
      if (!current.integrated || layout.development) {
        add('запускатель, значок, автозапуск', 'ok', 'не ставятся для экземпляра разработки (WFK_DATA_DIR)');
      } else {
        await checkIntegration(deps, current.entry, current.mechanism, add);
      }
    }
  }

  const health = port === null ? null : await deps.health(port);
  if (health) {
    const versionOk = !options.installed || !current || health.version === current.version;
    add('служба (/api/health)', versionOk ? 'ok' : 'fail', `pid ${health.pid}, версия ${health.version}${versionOk ? '' : `, ожидалась ${current?.version ?? '?'}`}`);
  } else {
    add('служба (/api/health)', options.installed ? 'fail' : 'warn', `не отвечает на порту ${port ?? '?'}`);
  }
  return { ok: checks.every((check) => check.level !== 'fail'), checks };
}

async function checkIntegration(
  deps: ResolvedDeps,
  entry: string,
  mechanism: string | null,
  add: (name: string, level: DoctorCheck['level'], detail: string) => void,
): Promise<void> {
  const layout = layoutOf(deps);
  const fs = deps.fs;
  const launcher = await fs.readText(layout.launcher);
  const launcherOk = launcher !== undefined && isOwnLauncher(launcher) && launcher.includes(entry);
  add('запускатель wfk', launcherOk ? 'ok' : 'fail', `${layout.launcher}${launcherOk ? '' : ' отсутствует или указывает не на установленную копию'}`);
  for (const file of layout.companions) {
    // Windows: wfk for Git Bash (path with "/") and wfk.mjs for hooks (a file URL).
    const text = await fs.readText(file);
    const ok = text !== undefined && isOwnLauncher(text) && (text.includes(entry.replace(/\\/g, '/')) || text.includes(windowsFileUrl(entry)));
    add('запускатель wfk', ok ? 'ok' : 'fail', `${file}${ok ? '' : ' отсутствует или указывает не на установленную копию'}`);
  }
  add('значок', (await fs.exists(layout.icon)) ? 'ok' : 'fail', layout.icon);

  const label = mechanism === 'launchagent' || mechanism === 'systemd-user' || mechanism === 'xdg-autostart' || mechanism === 'hkcu-run' ? mechanismLabel(mechanism) : 'нет';
  if (mechanism === 'launchagent') {
    const plist = await fs.readText(layout.launchAgentPlist);
    add(`автозапуск (${label})`, plist?.includes(entry) ? 'ok' : 'fail', layout.launchAgentPlist);
    const print = launchctl.print(deps.uid);
    const loaded = (await deps.run(print.command, print.args)).code === 0;
    add('LaunchAgent загружен', loaded ? 'ok' : 'fail', loaded ? 'launchctl print: есть' : 'launchctl print: нет (wfk service start)');
  } else if (mechanism === 'systemd-user') {
    const unit = await fs.readText(layout.systemdUnitFile);
    add(`автозапуск (${label})`, unit?.includes(entry) ? 'ok' : 'fail', layout.systemdUnitFile);
    const enabled = systemctl.isEnabled();
    const ok = (await deps.run(enabled.command, enabled.args)).code === 0;
    add('unit включён', ok ? 'ok' : 'fail', 'systemctl --user is-enabled');
  } else if (mechanism === 'xdg-autostart') {
    const desktop = await fs.readText(layout.xdgAutostartFile);
    add(`автозапуск (${label})`, desktop?.includes(desktopExecArg(entry)) ? 'ok' : 'fail', layout.xdgAutostartFile);
  } else if (mechanism === 'hkcu-run') {
    const query = registry.query(deps.env);
    const result = await deps.run(query.command, query.args);
    const value = result.code === 0 ? parseRegQuery(result.stdout) : null;
    const expected = windowsRunValue(deps.env, layout.serviceVbs);
    add(`автозапуск (${label})`, value === expected ? 'ok' : 'fail', value ?? 'значение не найдено');
    const vbs = await fs.readText(layout.serviceVbs);
    add('скрипт автозапуска', vbs?.includes(entry) ? 'ok' : 'fail', layout.serviceVbs);
  } else {
    add('автозапуск', 'fail', 'не зарегистрирован');
  }
}

/** Text of a doctor report. */
export function formatDoctor(report: DoctorReport): string {
  const mark = { ok: '[ok]  ', warn: '[предупреждение]', fail: '[ошибка]' } as const;
  const lines = report.checks.map((check) => `${mark[check.level]} ${check.name}: ${check.detail}`);
  lines.push(report.ok ? 'итог: всё в порядке' : 'итог: есть ошибки');
  return lines.join('\n');
}
