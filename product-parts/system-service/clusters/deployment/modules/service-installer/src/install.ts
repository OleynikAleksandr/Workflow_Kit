// wfk install and wfk uninstall (spec section 9). A repeated install updates the version;
// uninstall removes autostart, launcher, icon and the installed copies, the data stays.
import { powershell, systemctl } from './commands.ts';
import { ServiceError, startService, stopService, unloadLaunchAgent } from './control.ts';
import type { ControlTarget, StartResult } from './control.ts';
import { copyApp, pruneVersions, readCurrent, readSourceVersion, saveProgramPaths, servicePort, writeCurrent } from './deploy.ts';
import type { CurrentRecord } from './deploy.ts';
import { checkConflicts, registerAutostart, removeIntegration, writeIcon, writeLauncher } from './integrate.ts';
import type { IconResult } from './integrate.ts';
import { autostartEntry, entryOf, serviceLayout, versionDir } from './layout.ts';
import type { ServiceLayout } from './layout.ts';
import { detectPrograms } from './programs.ts';
import type { ServiceProgram } from './templates.ts';
import type { ResolvedDeps } from './types.ts';

/** What install did. */
export interface InstallReport {
  version: string;
  previousVersion: string | null;
  appPath: string;
  /** False when install ran from the installed copy itself. */
  copied: boolean;
  development: boolean;
  record: CurrentRecord;
  programs: Record<string, string>;
  loginPath: string;
  start: StartResult;
  removedVersions: string[];
  /** What the icon is (macOS: the app or the browser-window script) and why, when it is not the app. */
  icon: IconResult | null;
  /** Warnings shown after the report (Windows: run with administrator rights). */
  warnings: string[];
}

/** PowerShell check of administrator rights of the current process (prints True or False). */
export const ELEVATION_SCRIPT =
  '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)';

/** The warning about an elevated install (spec M5 section 7): the Codex daemon refuses to run elevated. */
export const ELEVATED_WARNING =
  'wfk install запущен с правами администратора: служба унаследует их, а демон Codex с повышенными правами не работает. Переустановите из обычного (не администраторского) терминала.';

async function elevationWarnings(deps: ResolvedDeps): Promise<string[]> {
  if (deps.platform !== 'win32') return [];
  const check = powershell(deps.env, ELEVATION_SCRIPT);
  const result = await deps.run(check.command, check.args, { timeoutMs: 15_000 });
  return result.code === 0 && result.stdout.trim().toLowerCase() === 'true' ? [ELEVATED_WARNING] : [];
}

/** What uninstall did. */
export interface UninstallReport {
  development: boolean;
  wasRunning: boolean;
  removed: string[];
  /** Directories with the data that stay in place. */
  keptData: string[];
}

/** Layout of the caller. */
export function layoutOf(deps: ResolvedDeps): ServiceLayout {
  return serviceLayout({ platform: deps.platform, env: deps.env, homedir: deps.homedir });
}

/** Restarts the service on the new version: unload the old job, or stop the old process. */
async function restart(deps: ResolvedDeps, target: ControlTarget): Promise<StartResult> {
  const mechanism = target.current?.integrated ? target.current.mechanism : null;
  if (mechanism === 'launchagent') {
    // bootout drops the old job (and its process); startService bootstraps the new plist only
    // after launchd has forgotten the old job.
    await unloadLaunchAgent(deps);
    // An old process still answering (or one started by hand) is stopped by its health pid.
    if (await deps.health(target.port)) await stopService(deps, target);
  } else if (mechanism === 'systemd-user') {
    const restartCall = systemctl.restart();
    const result = await deps.run(restartCall.command, restartCall.args);
    if (result.code !== 0) throw new ServiceError(`systemctl --user restart не удался: ${(result.stderr || result.stdout).trim()}`);
  } else if (await deps.health(target.port)) {
    await stopService(deps, target);
  }
  return startService(deps, target);
}

/**
 * Installs or updates Workflow Kit: copies the code into app/<version>, saves program paths
 * (D12), writes launcher, icon and autostart, writes app/current.json and (re)starts the service.
 * A development instance (WFK_DATA_DIR) gets the copy and the service but no launcher, icon
 * or autostart: those belong to the default instance.
 */
export async function install(deps: ResolvedDeps): Promise<InstallReport> {
  const layout = layoutOf(deps);
  const integrated = !layout.development;
  const version = await readSourceVersion(deps.fs, deps.platform, deps.sourceRoot);
  const previous = await readCurrent(deps.fs, layout);
  const port = await servicePort(deps.fs, layout, deps.env);
  if (integrated) await checkConflicts(deps, layout);
  const warnings = await elevationWarnings(deps);

  for (const dir of [layout.dirs.configDir, layout.dirs.stateDir, layout.dirs.appDir, layout.dirs.logsDir, layout.appRoot]) {
    await deps.fs.ensureDir(dir);
  }
  const detected = await detectPrograms(deps);
  const copied = await copyApp(deps.fs, layout, deps.sourceRoot, version);
  const appPath = versionDir(layout, version);
  await saveProgramPaths(deps.fs, layout, detected.programs, detected.loginPath);

  const program: ServiceProgram = {
    node: detected.programs['node'] ?? deps.nodePath,
    entry: entryOf(deps.platform, appPath),
    workingDir: appPath,
    path: detected.loginPath,
    logFile: layout.serviceLog,
  };
  const record: CurrentRecord = {
    version,
    appPath,
    entry: program.entry,
    node: program.node,
    installedAt: deps.now().toISOString(),
    integrated,
    mechanism: null,
    autostartEntry: null,
    launcher: null,
    icon: null,
  };
  let icon: IconResult | null = null;
  if (integrated) {
    await writeLauncher(deps, layout, program);
    icon = await writeIcon(deps, layout, program, version);
    const mechanism = await registerAutostart(deps, layout, program);
    record.mechanism = mechanism;
    record.autostartEntry = autostartEntry(layout, mechanism);
    record.launcher = layout.launcher;
    record.icon = layout.icon;
  }
  await writeCurrent(deps.fs, layout, record);
  const start = await restart(deps, { layout, current: record, port });
  const keep = [version, ...(previous && previous.version !== version ? [previous.version] : [])];
  const removedVersions = await pruneVersions(deps.fs, layout, keep);
  return {
    version,
    previousVersion: previous?.version ?? null,
    appPath,
    copied,
    development: layout.development,
    record,
    programs: detected.programs,
    loginPath: detected.loginPath,
    start,
    removedVersions,
    icon,
    warnings,
  };
}

/** Stops the service and removes autostart, launcher, icon and app/; config and journals stay. */
export async function uninstall(deps: ResolvedDeps): Promise<UninstallReport> {
  const layout = layoutOf(deps);
  const current = await readCurrent(deps.fs, layout);
  const port = await servicePort(deps.fs, layout, deps.env);
  const stopped = await stopService(deps, { layout, current, port });
  const removed = layout.development ? [] : await removeIntegration(deps, layout);
  if (await deps.fs.exists(layout.appRoot)) {
    await deps.fs.remove(layout.appRoot);
    removed.push(layout.appRoot);
  }
  return {
    development: layout.development,
    wasRunning: stopped.wasRunning,
    removed,
    keptData: [...new Set([layout.dirs.configDir, layout.dirs.stateDir])],
  };
}
