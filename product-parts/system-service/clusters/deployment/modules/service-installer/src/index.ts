// Public interface of the service-installer module (#service-installer): install, autostart,
// launcher and icon, service control, `wfk open`, `wfk doctor` and the status for "System".
import { resolveDeps } from './context.ts';
import { commandLabel, runWithDeps } from './run.ts';
import { autostartMechanism, readServiceStatus } from './status.ts';
import type { ServiceCommand, ServiceCommandResult, ServiceDeps, ServiceStatus } from './types.ts';

export type {
  AutostartMechanism,
  DetachedSpawner,
  HealthInfo,
  HealthProbe,
  ManagedItem,
  ServiceCommand,
  ServiceCommandResult,
  ServiceContext,
  ServiceDeps,
  ServiceStatus,
} from './types.ts';
export type { InstallerFs } from './fs.ts';
export { COPY_EXCLUDED_DIRS, nodeFs } from './fs.ts';
export type { ServiceLayout } from './layout.ts';
export { ICON_BUNDLE_ID, LAUNCH_AGENT_LABEL, RUN_KEY, RUN_VALUE_NAME, SYSTEMD_UNIT, launcherDir, serviceLayout } from './layout.ts';
export { DESKTOP_MARK, LAUNCHER_MARK, UNIT_MARK, gitBashLauncher, hookLauncherScript, isOwnLauncher, windowsLauncher } from './templates.ts';
export type { CurrentRecord } from './deploy.ts';
export { APP_PARTS } from './deploy.ts';
export type { BrowserPlan, BrowserPlanInput } from './open.ts';
export { browserPlan } from './open.ts';
export type { DoctorCheck, DoctorReport } from './doctor.ts';
export { PROGRAMS, mergePath } from './programs.ts';
export { ServiceError } from './control.ts';
export { SOURCE_ROOT, fetchHealth, spawnDetachedProcess } from './context.ts';
export { autostartMechanism };

/** Text of the context-less legacy calls (kept so a caller without context never touches the system). */
export const NOT_IMPLEMENTED = 'не реализовано';

const NO_CONTEXT_NOTE = 'cli не передаёт установщику контекст (env, homedir): статус службы недоступен';

/**
 * Status of the service for the "System" card, read from files only (D11). Without a
 * context the call answers like the T001 stub (implemented: false) and reads nothing.
 */
export function getServiceStatus(platform: NodeJS.Platform = process.platform, context?: ServiceDeps): ServiceStatus {
  if (!context) {
    return { implemented: false, installed: false, running: false, autostart: false, mechanism: autostartMechanism(platform), note: NO_CONTEXT_NOTE };
  }
  return readServiceStatus(resolveDeps({ ...context, platform: context.platform ?? platform }));
}

/**
 * Runs install, uninstall, start, stop, status, open or doctor (args: "--installed") with the
 * caller's context; effects (runner, file system, health probe, spawner) are injectable.
 * Without a context nothing is touched: status says "не установлена", the rest "не реализовано".
 */
export async function runServiceCommand(command: ServiceCommand, context?: ServiceDeps, args: readonly string[] = []): Promise<ServiceCommandResult> {
  if (!context) {
    if (command === 'status') return { ok: true, exitCode: 0, message: `служба: не установлена (${NO_CONTEXT_NOTE})` };
    return { ok: false, exitCode: 2, message: `wfk ${commandLabel(command)}: ${NOT_IMPLEMENTED} без контекста вызова (cli должен передать env и homedir)` };
  }
  return runWithDeps(command, context, args);
}
