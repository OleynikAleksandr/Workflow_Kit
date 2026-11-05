// Public interface of the process-supervisor module; other modules import only from here (#process-supervisor).
export type { CommandRunner, RunOptions, RunResult } from './command.ts';
export { COMMAND_TIMEOUT_MS, runCommand } from './command.ts';
export { STRIPPED_ENV_PREFIXES, cleanEnv } from './env.ts';
export type { BootIdReader, ProcessInfo, ProcessInspector } from './proc-info.ts';
export { parsePsLine, psInspector, systemBootId } from './proc-info.ts';
export type {
  ProcessCheck,
  ProcessOwner,
  ProcessRecord,
  ProcessSupervisor,
  SpawnSpec,
  StopResult,
  SupervisorOptions,
  TrackedPid,
} from './supervisor.ts';
export { ProcessError, createProcessSupervisor, processesFile } from './supervisor.ts';
