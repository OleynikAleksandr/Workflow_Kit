// Where the installer puts things on each OS (spec sections 6 and 9). Pure functions.
import { resolveDataDirs } from '#data-store';
import type { DataDirs } from '#data-store';
import { pathApi } from './fs.ts';
import type { AutostartMechanism } from './types.ts';

/** launchd label of the macOS LaunchAgent. */
export const LAUNCH_AGENT_LABEL = 'ai.workflowkit.backend';
/** systemd user unit name on Linux. */
export const SYSTEMD_UNIT = 'workflow-kit.service';
/** Value name under HKCU\Software\Microsoft\Windows\CurrentVersion\Run. */
export const RUN_VALUE_NAME = 'WorkflowKit';
/** Registry key of per-user autostart on Windows. */
export const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
/** Bundle identifier of the macOS icon application. */
export const ICON_BUNDLE_ID = 'ai.workflowkit.launcher';
/** Bundle identifiers of earlier Workflow Kit icons (the prototype applet); install replaces them. */
export const OWN_ICON_BUNDLE_IDS: readonly string[] = [ICON_BUNDLE_ID, 'com.workflowkit.launcher'];
/** Display name of the icon. */
export const ICON_NAME = 'Workflow Kit';

/** Inputs of the layout; injected for tests. */
export interface LayoutInput {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homedir: string;
}

/** Every path the installer reads or writes. */
export interface ServiceLayout {
  platform: NodeJS.Platform;
  dirs: DataDirs;
  /** WFK_DATA_DIR is set: a development instance without launcher, icon and autostart. */
  development: boolean;
  /** <app>/app: installed versions live in app/<version>. */
  appRoot: string;
  /** app/current.json. */
  currentFile: string;
  configFile: string;
  /** Service log (stdout and stderr of the backend). */
  serviceLog: string;
  /** Log of `wfk open` started from the icon. */
  openLog: string;
  /** Profile directory of the panel browser window. */
  browserProfile: string;
  /** The wfk launcher (~/.local/bin/wfk; Windows: wfk.cmd in the data directory). */
  launcher: string;
  /** Windows: `wfk` for Git Bash and `wfk.mjs` for Kit hooks next to wfk.cmd (spec M5 section 6); elsewhere empty. */
  companions: string[];
  /** The icon: macOS .app, Linux .desktop, Windows Start menu shortcut. */
  icon: string;
  /** Windows helper scripts that start the service and the panel without a console window. */
  serviceVbs: string;
  openVbs: string;
  /** LaunchAgent plist, systemd unit, XDG autostart entry (by mechanism). */
  launchAgentPlist: string;
  systemdUnitFile: string;
  xdgAutostartFile: string;
}

function xdg(value: string | undefined, fallback: string): string {
  return value && value.startsWith('/') ? value : fallback;
}

/** Computes the layout for a platform and home folder. */
export function serviceLayout(input: LayoutInput): ServiceLayout {
  const p = pathApi(input.platform);
  const dirs = resolveDataDirs(input);
  const home = input.homedir;
  const appRoot = p.join(dirs.appDir, 'app');
  const configHome = xdg(input.env['XDG_CONFIG_HOME'], p.join(home, '.config'));
  const dataHome = xdg(input.env['XDG_DATA_HOME'], p.join(home, '.local', 'share'));
  let launcher = p.join(home, '.local', 'bin', 'wfk');
  let icon: string;
  if (input.platform === 'darwin') {
    icon = p.join(home, 'Applications', `${ICON_NAME}.app`);
  } else if (input.platform === 'win32') {
    launcher = p.join(dirs.configDir, 'wfk.cmd');
    const roaming = input.env['APPDATA'] || p.join(home, 'AppData', 'Roaming');
    icon = p.join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${ICON_NAME}.lnk`);
  } else {
    icon = p.join(dataHome, 'applications', 'workflow-kit.desktop');
  }
  return {
    platform: input.platform,
    dirs,
    development: dirs.overridden,
    appRoot,
    currentFile: p.join(appRoot, 'current.json'),
    configFile: p.join(dirs.configDir, 'config.json'),
    serviceLog: p.join(dirs.logsDir, 'service.log'),
    openLog: p.join(dirs.logsDir, 'open.log'),
    browserProfile: p.join(dirs.stateDir, 'panel-browser'),
    launcher,
    companions: input.platform === 'win32' ? [p.join(dirs.configDir, 'wfk'), p.join(dirs.configDir, 'wfk.mjs')] : [],
    icon,
    serviceVbs: p.join(dirs.configDir, 'wfk-service.vbs'),
    openVbs: p.join(dirs.configDir, 'wfk-open.vbs'),
    launchAgentPlist: p.join(home, 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`),
    systemdUnitFile: p.join(configHome, 'systemd', 'user', SYSTEMD_UNIT),
    xdgAutostartFile: p.join(configHome, 'autostart', 'workflow-kit.desktop'),
  };
}

/**
 * Directory of the wfk launcher that agents find on PATH (spec M17 2.1): ~/.local/bin, on Windows
 * the data directory; null for a development instance, which has no launcher.
 */
export function launcherDir(layout: ServiceLayout): string | null {
  return layout.development ? null : pathApi(layout.platform).dirname(layout.launcher);
}

/** Directory of an installed version. */
export function versionDir(layout: ServiceLayout, version: string): string {
  return pathApi(layout.platform).join(layout.appRoot, version);
}

/** Entry point bin/wfk.mjs inside an application root. */
export function entryOf(platform: NodeJS.Platform, root: string): string {
  return pathApi(platform).join(root, 'bin', 'wfk.mjs');
}

/** Autostart file or registry value for a mechanism. */
export function autostartEntry(layout: ServiceLayout, mechanism: AutostartMechanism): string {
  if (mechanism === 'launchagent') return layout.launchAgentPlist;
  if (mechanism === 'systemd-user') return layout.systemdUnitFile;
  if (mechanism === 'xdg-autostart') return layout.xdgAutostartFile;
  return `${RUN_KEY}\\${RUN_VALUE_NAME}`;
}

/** Human-readable name of a mechanism. */
export function mechanismLabel(mechanism: AutostartMechanism): string {
  if (mechanism === 'launchagent') return 'LaunchAgent';
  if (mechanism === 'systemd-user') return 'systemd (пользовательский unit)';
  if (mechanism === 'xdg-autostart') return 'XDG autostart';
  return 'ключ HKCU Run';
}
