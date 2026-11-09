// Text of every file the installer writes: launcher, LaunchAgent, systemd unit, XDG entries,
// macOS icon bundle and Windows helper scripts. Pure functions, tested for all three OS.
import { ICON_BUNDLE_ID, ICON_NAME, LAUNCH_AGENT_LABEL } from './layout.ts';

/** Marker line of a launcher written by Workflow Kit; equals LAUNCHER_MARK of the cli module. */
export const LAUNCHER_MARK = '# Workflow Kit launcher';
/** Marker key of the desktop entries written by Workflow Kit. */
export const DESKTOP_MARK = 'X-WorkflowKit-Managed=true';
/** Marker comment of the systemd unit written by Workflow Kit. */
export const UNIT_MARK = '# Workflow Kit backend (written by wfk install)';
/** Executable name inside the macOS icon bundle. */
export const ICON_EXECUTABLE = 'workflow-kit';
/** Swift source of the macOS app (panel window with its own Dock icon), relative to the copy. */
export const MAC_APP_SOURCE = 'product-parts/system-service/clusters/deployment/modules/service-installer/assets/macos/WorkflowKitApp.swift';
/** Icon file of the macOS app in Contents/Resources (CFBundleIconFile). */
export const MAC_APP_ICON = 'AppIcon';

/** What the service runs: an absolute node and the entry point of the installed copy. */
export interface ServiceProgram {
  node: string;
  entry: string;
  /** Working directory of the service (the installed copy). */
  workingDir: string;
  /** PATH of the login shell (D12), passed to the service and its children. */
  path: string;
  /** Service log. */
  logFile: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** POSIX launcher ~/.local/bin/wfk that runs the installed copy with an absolute node. */
export function posixLauncher(node: string, entry: string): string {
  return `#!/bin/sh\n${LAUNCHER_MARK} (wfk install)\nexec ${shellQuote(node)} ${shellQuote(entry)} "$@"\n`;
}

function cmdQuote(value: string): string {
  return `"${value.replace(/%/g, '%%')}"`;
}

/** Windows launcher wfk.cmd (CRLF line ends). */
export function windowsLauncher(node: string, entry: string): string {
  return ['@echo off', `rem ${LAUNCHER_MARK.slice(2)} (wfk install)`, `${cmdQuote(node)} ${cmdQuote(entry)} %*`, ''].join('\r\n');
}

/** True when a launcher file was written by Workflow Kit (install or link). */
export function isOwnLauncher(text: string): boolean {
  // The Windows launcher carries the mark after "rem" instead of "#".
  return text.includes(LAUNCHER_MARK.slice(2));
}

/** macOS LaunchAgent: RunAtLoad, KeepAlive, AbandonProcessGroup, PATH and an absolute node. */
export function launchAgentPlist(program: ServiceProgram): string {
  const args = [program.node, program.entry, 'serve'].map((arg) => `    <string>${xml(arg)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(program.workingDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(program.path)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>AbandonProcessGroup</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${xml(program.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(program.logFile)}</string>
</dict>
</plist>
`;
}

/** Quotes one systemd argument: specifiers (%) and variables ($) are escaped. */
export function systemdQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%').replace(/\$/g, '$$$$')}"`;
}

/** Linux systemd user unit; KillMode=process keeps session processes alive on restart (D5). */
export function systemdUnit(program: ServiceProgram): string {
  const exec = [program.node, program.entry, 'serve'].map(systemdQuote).join(' ');
  const pathValue = `PATH=${program.path}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  return `${UNIT_MARK}
[Unit]
Description=Workflow Kit backend

[Service]
Type=simple
ExecStart=${exec}
WorkingDirectory=${systemdQuote(program.workingDir)}
Environment="${pathValue}"
Restart=on-failure
RestartSec=5
KillMode=process
StandardOutput=append:${program.logFile.replace(/%/g, '%%')}
StandardError=append:${program.logFile.replace(/%/g, '%%')}

[Install]
WantedBy=default.target
`;
}

/** Quotes one argument of a desktop entry Exec key (quoting, then string escaping, then %). */
export function desktopExecArg(value: string): string {
  const quoted = `"${value.replace(/(["`$\\])/g, '\\$1')}"`;
  return quoted.replace(/\\/g, '\\\\').replace(/%/g, '%%');
}

/** XDG autostart entry (Linux without systemd): starts the service at login. */
export function xdgAutostartEntry(node: string, entry: string): string {
  return `[Desktop Entry]
Type=Application
Name=Workflow Kit (служба)
Exec=${desktopExecArg(node)} ${desktopExecArg(entry)} service start
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
${DESKTOP_MARK}
`;
}

/** Linux icon: an application entry that runs `wfk open`. */
export function linuxDesktopEntry(launcher: string): string {
  return `[Desktop Entry]
Type=Application
Version=1.0
Name=${ICON_NAME}
Comment=Панель Workflow Kit
Exec=${desktopExecArg(launcher)} open
Terminal=false
Categories=Development;
${DESKTOP_MARK}
`;
}

/** Info.plist of ~/Applications/Workflow Kit.app (no Xcode needed: a script bundle). */
export function macIconInfoPlist(version: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${ICON_EXECUTABLE}</string>
  <key>CFBundleIdentifier</key>
  <string>${ICON_BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>${ICON_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${ICON_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleShortVersionString</key>
  <string>${xml(version)}</string>
  <key>CFBundleVersion</key>
  <string>${xml(version)}</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

/**
 * Info.plist of the compiled macOS app: a regular app with a Dock icon (no LSUIElement); the
 * executable reads WFKNode and WFKEntry to run `wfk open --url-only` of the installed copy.
 */
export function macAppInfoPlist(version: string, node: string, entry: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${ICON_EXECUTABLE}</string>
  <key>CFBundleIdentifier</key>
  <string>${ICON_BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>${ICON_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${ICON_NAME}</string>
  <key>CFBundleIconFile</key>
  <string>${MAC_APP_ICON}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleShortVersionString</key>
  <string>${xml(version)}</string>
  <key>CFBundleVersion</key>
  <string>${xml(version)}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
  <key>WFKNode</key>
  <string>${xml(node)}</string>
  <key>WFKEntry</key>
  <string>${xml(entry)}</string>
</dict>
</plist>
`;
}

/** Executable of the macOS icon: runs `wfk open` of the installed copy, output to a log. */
export function macIconScript(node: string, entry: string, openLog: string): string {
  return `#!/bin/sh\n${LAUNCHER_MARK} (icon)\nexec ${shellQuote(node)} ${shellQuote(entry)} open >>${shellQuote(openLog)} 2>&1\n`;
}

function vbsString(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function windowsCommandLine(args: readonly string[]): string {
  return args.map((arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(' ');
}

/** VBScript that runs a command with a hidden window (style 0) and does not wait. */
export function hiddenRunVbs(args: readonly string[], comment: string): string {
  return [`' ${LAUNCHER_MARK.slice(2)} (${comment})`, 'Set shell = CreateObject("WScript.Shell")', `shell.Run ${vbsString(windowsCommandLine(args))}, 0, False`, ''].join('\r\n');
}

/** Windows autostart helper: `wfk service start` without a console window. */
export function windowsServiceVbs(node: string, entry: string): string {
  return hiddenRunVbs([node, entry, 'service', 'start'], 'service start');
}

/** Windows icon helper: `wfk open` without a console window. */
export function windowsOpenVbs(node: string, entry: string): string {
  return hiddenRunVbs([node, entry, 'open'], 'open');
}

/** wscript.exe of a Windows installation. */
export function wscriptPath(env: NodeJS.ProcessEnv): string {
  return `${env['SystemRoot'] || env['SYSTEMROOT'] || 'C:\\Windows'}\\System32\\wscript.exe`;
}

/** Data of the HKCU Run value: wscript runs the hidden service helper. */
export function windowsRunValue(env: NodeJS.ProcessEnv, serviceVbs: string): string {
  return `"${wscriptPath(env)}" "${serviceVbs}"`;
}
