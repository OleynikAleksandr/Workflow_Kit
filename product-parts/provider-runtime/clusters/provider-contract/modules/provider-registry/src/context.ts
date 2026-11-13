import type { DataDirs, EventLog, WfkConfig } from '#data-store';
import type { CommandRunner, ProcessSupervisor } from '#process-supervisor';

/** What the backend gives a provider factory; everything machine-specific is injectable. */
export interface ProviderContext {
  platform: NodeJS.Platform;
  /** Service environment (PATH from D12); strip CLAUDE* before starting children. */
  env: Readonly<Record<string, string | undefined>>;
  homedir: string;
  dirs: DataDirs;
  config: WfkConfig;
  events: EventLog;
  supervisor: ProcessSupervisor;
  /** Runner of external programs (`--version`, `app-server`); tests pass fakes. */
  runCommand: CommandRunner;
  now: () => Date;
  log: (line: string) => void;
  /** Optional command for a new managed host's native metadata + unchanged user statusline. */
  nativeStatuslineCommand?: (binding: { file: string; hostId: string }) => string;
}

