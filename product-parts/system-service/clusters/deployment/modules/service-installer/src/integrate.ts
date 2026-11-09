// Integration with the OS: the wfk launcher, the "Workflow Kit" icon and the autostart entry.
// Only files that carry the Workflow Kit marks are replaced or removed.
import {
  addUserPathScript,
  launchctl,
  macApp,
  powershell,
  registry,
  removeUserPathScript,
  shortcutScript,
  systemctl,
} from './commands.ts';
import type { PlannedCommand } from './commands.ts';
import { ServiceError } from './control.ts';
import { pathApi } from './fs.ts';
import { OWN_ICON_BUNDLE_IDS, autostartEntry } from './layout.ts';
import type { ServiceLayout } from './layout.ts';
import {
  DESKTOP_MARK,
  ICON_EXECUTABLE,
  MAC_APP_ICON,
  MAC_APP_SOURCE,
  UNIT_MARK,
  isOwnLauncher,
  launchAgentPlist,
  linuxDesktopEntry,
  macAppInfoPlist,
  macIconInfoPlist,
  macIconScript,
  posixLauncher,
  systemdUnit,
  gitBashLauncher,
  hookLauncherScript,
  windowsLauncher,
  windowsOpenVbs,
  windowsRunValue,
  windowsServiceVbs,
  xdgAutostartEntry,
} from './templates.ts';
import type { ServiceProgram } from './templates.ts';
import type { AutostartMechanism, ResolvedDeps } from './types.ts';

/** Public files (launcher, icon, autostart) are readable by everyone, like any app. */
const PUBLIC_FILE = { mode: 0o644, dirMode: 0o755 };
const PUBLIC_EXEC = { mode: 0o755, dirMode: 0o755 };

async function runChecked(deps: ResolvedDeps, planned: PlannedCommand, what: string): Promise<void> {
  const result = await deps.run(planned.command, planned.args);
  if (result.code !== 0) {
    throw new ServiceError(`${what}: ${(result.stderr || result.stdout || result.startError || `код ${String(result.code)}`).trim()}`);
  }
}

function iconInfoPlist(layout: ServiceLayout): string {
  return pathApi(layout.platform).join(layout.icon, 'Contents', 'Info.plist');
}

/** Refuses to replace a launcher or icon that Workflow Kit did not write. */
export async function checkConflicts(deps: ResolvedDeps, layout: ServiceLayout): Promise<void> {
  for (const file of [layout.launcher, ...layout.companions]) {
    const text = await deps.fs.readText(file);
    if (text !== undefined && !isOwnLauncher(text)) {
      throw new ServiceError(`${file} уже существует и создан не Workflow Kit; переименуйте или удалите его и повторите install`);
    }
  }
  if (await ownedIcon(deps, layout) === false) {
    throw new ServiceError(`${layout.icon} уже существует и создан не Workflow Kit; переименуйте или удалите его и повторите install`);
  }
}

/** true: our icon, false: a foreign file in its place, null: no icon. */
async function ownedIcon(deps: ResolvedDeps, layout: ServiceLayout): Promise<boolean | null> {
  if (!(await deps.fs.exists(layout.icon))) return null;
  if (layout.platform === 'darwin') {
    const info = (await deps.fs.readText(iconInfoPlist(layout))) ?? '';
    return OWN_ICON_BUNDLE_IDS.some((id) => info.includes(`<string>${id}</string>`));
  }
  if (layout.platform === 'win32') return true;
  return (await deps.fs.readText(layout.icon))?.includes(DESKTOP_MARK) ?? false;
}

/** Writes the launcher (and on Windows adds its directory to the user PATH). */
export async function writeLauncher(deps: ResolvedDeps, layout: ServiceLayout, program: ServiceProgram): Promise<void> {
  if (layout.platform === 'win32') {
    await deps.fs.writeText(layout.launcher, windowsLauncher(program.node, program.entry), PUBLIC_FILE);
    const [sh, hook] = layout.companions;
    if (sh) await deps.fs.writeText(sh, gitBashLauncher(program.node, program.entry), PUBLIC_FILE);
    if (hook) await deps.fs.writeText(hook, hookLauncherScript(program.entry), PUBLIC_FILE);
    const dir = pathApi('win32').dirname(layout.launcher);
    await runChecked(deps, powershell(deps.env, addUserPathScript(dir)), 'не удалось добавить каталог wfk.cmd в PATH пользователя');
    return;
  }
  await deps.fs.writeText(layout.launcher, posixLauncher(program.node, program.entry), PUBLIC_EXEC);
}

/** How long swiftc may compile the macOS app. */
export const MAC_APP_COMPILE_TIMEOUT_MS = 300_000;

/** What writeIcon made: the macOS app (own window and Dock icon) or a script that opens a browser window. */
export interface IconResult {
  kind: 'app' | 'script';
  /** Why the macOS app was not built, or what is missing in it (no picture). */
  note: string | null;
}

function failure(result: { stderr: string; stdout: string; startError: string | null; code: number | null }): string {
  return (result.stderr || result.stdout || result.startError || `код ${String(result.code)}`).trim().split('\n').slice(-3).join(' ');
}

/**
 * macOS: compiles the app (WorkflowKitApp.swift of the installed copy) into the bundle and draws
 * its icon. Returns the reason as a string when there is no source or the build failed.
 */
async function buildMacApp(deps: ResolvedDeps, layout: ServiceLayout, program: ServiceProgram, version: string): Promise<IconResult | string> {
  const p = pathApi('darwin');
  const source = p.join(program.workingDir, ...MAC_APP_SOURCE.split('/'));
  if (!(await deps.fs.exists(source))) return `нет исходника ${source}`;
  const executable = p.join(layout.icon, 'Contents', 'MacOS', ICON_EXECUTABLE);
  await deps.fs.ensureDir(p.dirname(executable));
  const compile = macApp.compile(source, executable);
  const built = await deps.run(compile.command, compile.args, { timeoutMs: MAC_APP_COMPILE_TIMEOUT_MS });
  if (built.code !== 0) return `swiftc: ${failure(built)}`;
  await deps.fs.writeText(iconInfoPlist(layout), macAppInfoPlist(version, program.node, program.entry), PUBLIC_FILE);
  // The picture is optional: without it macOS shows the generic app icon.
  const resources = p.join(layout.icon, 'Contents', 'Resources');
  const iconset = p.join(resources, `${MAC_APP_ICON}.iconset`);
  await deps.fs.ensureDir(resources);
  let note: string | null = null;
  for (const step of [macApp.iconset(executable, iconset), macApp.iconutil(iconset, p.join(resources, `${MAC_APP_ICON}.icns`))]) {
    const result = await deps.run(step.command, step.args, { timeoutMs: 60_000 });
    if (result.code !== 0) {
      note = `значок без картинки: ${failure(result)}`;
      break;
    }
  }
  await deps.fs.remove(iconset);
  const register = macApp.register(layout.icon);
  await deps.run(register.command, register.args, { timeoutMs: 30_000 });
  return { kind: 'app', note };
}

/** Writes the icon that opens the panel. */
export async function writeIcon(deps: ResolvedDeps, layout: ServiceLayout, program: ServiceProgram, version: string): Promise<IconResult> {
  const p = pathApi(layout.platform);
  if (layout.platform === 'darwin') {
    // The bundle is rebuilt from scratch so no stale file of an older version stays inside.
    await deps.fs.remove(layout.icon);
    const app = await buildMacApp(deps, layout, program, version);
    if (typeof app !== 'string') return app;
    // No compiler (Xcode command line tools) or a failed build: the script icon opens a browser window.
    await deps.fs.remove(layout.icon);
    await deps.fs.writeText(iconInfoPlist(layout), macIconInfoPlist(version), PUBLIC_FILE);
    await deps.fs.writeText(p.join(layout.icon, 'Contents', 'MacOS', ICON_EXECUTABLE), macIconScript(program.node, program.entry, layout.openLog), PUBLIC_EXEC);
    return { kind: 'script', note: app };
  } else if (layout.platform === 'win32') {
    await deps.fs.writeText(layout.openVbs, windowsOpenVbs(program.node, program.entry), PUBLIC_FILE);
    await runChecked(deps, powershell(deps.env, shortcutScript(deps.env, layout.icon, layout.openVbs, program.workingDir)), 'не удалось создать ярлык в меню «Пуск»');
  } else {
    await deps.fs.writeText(layout.icon, linuxDesktopEntry(layout.launcher), PUBLIC_FILE);
  }
  return { kind: 'script', note: null };
}

/** Linux: systemd user manager reachable? */
async function hasSystemdUser(deps: ResolvedDeps): Promise<boolean> {
  const probe = systemctl.probe();
  const result = await deps.run(probe.command, probe.args, { timeoutMs: 5_000 });
  return result.code === 0;
}

/** Registers autostart; the service itself is (re)started by the caller. */
export async function registerAutostart(deps: ResolvedDeps, layout: ServiceLayout, program: ServiceProgram): Promise<AutostartMechanism> {
  if (layout.platform === 'darwin') {
    await deps.fs.writeText(layout.launchAgentPlist, launchAgentPlist(program), PUBLIC_FILE);
    return 'launchagent';
  }
  if (layout.platform === 'win32') {
    await deps.fs.writeText(layout.serviceVbs, windowsServiceVbs(program.node, program.entry), PUBLIC_FILE);
    await runChecked(deps, registry.add(deps.env, windowsRunValue(deps.env, layout.serviceVbs)), 'reg add (автозапуск) не удался');
    return 'hkcu-run';
  }
  if (await hasSystemdUser(deps)) {
    await deps.fs.writeText(layout.systemdUnitFile, systemdUnit(program), PUBLIC_FILE);
    await runChecked(deps, systemctl.daemonReload(), 'systemctl --user daemon-reload не удался');
    await runChecked(deps, systemctl.enable(), 'systemctl --user enable не удался');
    await removeIfMarked(deps, layout.xdgAutostartFile, DESKTOP_MARK);
    return 'systemd-user';
  }
  await deps.fs.writeText(layout.xdgAutostartFile, xdgAutostartEntry(program.node, program.entry), PUBLIC_FILE);
  return 'xdg-autostart';
}

async function removeIfMarked(deps: ResolvedDeps, file: string, mark: string): Promise<boolean> {
  const text = await deps.fs.readText(file);
  if (text === undefined || !text.includes(mark)) return false;
  await deps.fs.remove(file);
  return true;
}

/** Removes autostart, launcher and icon of this platform; returns what was removed. Data stays. */
export async function removeIntegration(deps: ResolvedDeps, layout: ServiceLayout): Promise<string[]> {
  const removed: string[] = [];
  const fs = deps.fs;
  if (layout.platform === 'darwin') {
    await deps.run(launchctl.bootout(deps.uid).command, launchctl.bootout(deps.uid).args);
    if (await removeIfMarked(deps, layout.launchAgentPlist, 'ai.workflowkit.backend')) removed.push(layout.launchAgentPlist);
  } else if (layout.platform === 'win32') {
    const query = registry.query(deps.env);
    if ((await deps.run(query.command, query.args)).code === 0) {
      await runChecked(deps, registry.remove(deps.env), 'reg delete (автозапуск) не удался');
      removed.push(autostartEntry(layout, 'hkcu-run'));
    }
    for (const file of [layout.serviceVbs, layout.openVbs]) {
      if (await fs.exists(file)) {
        await fs.remove(file);
        removed.push(file);
      }
    }
    await runChecked(deps, powershell(deps.env, removeUserPathScript(pathApi('win32').dirname(layout.launcher))), 'не удалось убрать каталог wfk.cmd из PATH пользователя');
  } else {
    if ((await deps.fs.readText(layout.systemdUnitFile))?.includes(UNIT_MARK)) {
      await deps.run(systemctl.disable().command, systemctl.disable().args);
      await fs.remove(layout.systemdUnitFile);
      await deps.run(systemctl.daemonReload().command, systemctl.daemonReload().args);
      removed.push(layout.systemdUnitFile);
    }
    if (await removeIfMarked(deps, layout.xdgAutostartFile, DESKTOP_MARK)) removed.push(layout.xdgAutostartFile);
  }
  for (const file of [layout.launcher, ...layout.companions]) {
    const text = await fs.readText(file);
    if (text !== undefined && isOwnLauncher(text)) {
      await fs.remove(file);
      removed.push(file);
    }
  }
  if ((await ownedIcon(deps, layout)) === true) {
    await fs.remove(layout.icon);
    removed.push(layout.icon);
  }
  return removed;
}
