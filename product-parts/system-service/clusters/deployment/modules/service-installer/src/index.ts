// Public interface of the service-installer module (#service-installer).
// T001 ships a stub: the real installer, autostart and launcher arrive in T008.

/** Autostart mechanism used on a platform (spec section 9). */
export type AutostartMechanism = 'launchagent' | 'systemd-user' | 'hkcu-run';

/** Service status shown in the "System" card. */
export interface ServiceStatus {
  /** False while the module is a stub. */
  implemented: boolean;
  installed: boolean;
  running: boolean;
  autostart: boolean;
  mechanism: AutostartMechanism;
  /** Human-readable note for the panel. */
  note: string;
}

/** Commands of the service lifecycle routed here by the cli module. */
export type ServiceCommand = 'install' | 'uninstall' | 'start' | 'stop' | 'status';

/** Outcome of a service command; the cli prints message and exits with exitCode. */
export interface ServiceCommandResult {
  ok: boolean;
  exitCode: number;
  message: string;
}

/** Text printed by commands that are not implemented yet. */
export const NOT_IMPLEMENTED = 'не реализовано';

/** Autostart mechanism for a platform. */
export function autostartMechanism(platform: NodeJS.Platform): AutostartMechanism {
  if (platform === 'darwin') return 'launchagent';
  if (platform === 'win32') return 'hkcu-run';
  return 'systemd-user';
}

/** Current service status. Stub: reports "not installed" without touching the system. */
export function getServiceStatus(platform: NodeJS.Platform = process.platform): ServiceStatus {
  return {
    implemented: false,
    installed: false,
    running: false,
    autostart: false,
    mechanism: autostartMechanism(platform),
    note: 'установщик службы появится в задаче T008',
  };
}

/** Runs a service command. Stub: status prints the stub status, everything else is not implemented. */
export async function runServiceCommand(command: ServiceCommand): Promise<ServiceCommandResult> {
  if (command === 'status') {
    const status = getServiceStatus();
    return { ok: true, exitCode: 0, message: `служба: не установлена (${status.note})` };
  }
  const label = command === 'install' || command === 'uninstall' ? command : `service ${command}`;
  return { ok: false, exitCode: 2, message: `wfk ${label}: ${NOT_IMPLEMENTED} (задача T008)` };
}
