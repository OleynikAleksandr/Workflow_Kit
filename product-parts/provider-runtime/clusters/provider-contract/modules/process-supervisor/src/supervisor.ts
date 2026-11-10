// Starting, tracking and stopping session and environment processes (D5, D9). Processes run in
// their own group with output to a file and outlive the service; every record keeps pid, start
// time, command line and boot id, and nothing is signalled before all of them match again.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { createKeyedMutex, readJsonFile, writeJsonAtomic } from '#data-store';
import { cleanEnv } from './env.ts';
import { psInspector, systemBootId } from './proc-info.ts';
import type { BootIdReader, ProcessInfo, ProcessInspector } from './proc-info.ts';
import { runCommand } from './command.ts';
import type { CommandRunner } from './command.ts';
import { cimInspector, taskkill, windowsBootId } from './windows.ts';

/** Who a process belongs to; providers find their processes by these fields. */
export interface ProcessOwner {
  provider: string;
  /** Project id, or null for provider-wide processes (e.g. a daemon). */
  project: string | null;
  /** What the process is, e.g. "session" or "environment". */
  kind: string;
  /** Provider's own reference, e.g. a local session id. */
  ref?: string | null;
}

/** A verified pid related to a record (e.g. the `claude` child reported by `expect`). */
export interface TrackedPid {
  pid: number;
  startToken: string;
  commandLine: string;
}

/** One started process as stored in processes.json. */
export interface ProcessRecord {
  id: string;
  owner: ProcessOwner;
  pid: number;
  /** Process group (equals pid: the process leads its own group); null on Windows. */
  pgid: number | null;
  command: string;
  args: string[];
  cwd: string;
  logFile: string | null;
  /** Identity read right after the start (D9). */
  startToken: string;
  startedAt: string;
  commandLine: string;
  bootId: string | null;
  children: TrackedPid[];
  /** The process changes its own name (kimi web): it is recognized by its start time only. */
  renames?: boolean;
}

/** Liveness of a record: alive (identity matches), gone, mismatch (pid reused) or unverifiable. */
export type ProcessCheck = 'alive' | 'gone' | 'mismatch' | 'unverifiable';

/** Outcome of stop(). */
export interface StopResult {
  outcome: 'stopped' | 'killed' | 'already-gone' | 'mismatch' | 'unverifiable' | 'still-running';
  record: ProcessRecord;
}

/** What to start. */
export interface SpawnSpec {
  owner: ProcessOwner;
  command: string;
  args: string[];
  cwd: string;
  /** Base environment (the service PATH from D12); CLAUDE* variables are removed. */
  env: Readonly<Record<string, string | undefined>>;
  /** Variables added on top of env (e.g. WFK_SERVICE_SESSION). */
  extraEnv?: Readonly<Record<string, string | undefined>>;
  /** stdout and stderr go here (appended, mode 0600). */
  logFile: string | null;
  /**
   * The process changes its own name after the start (kimi web shows as kimi-code): its record
   * is recognized by pid and start time without the command line (spec M9 section 8.2).
   */
  renames?: boolean;
}

/** Errors of the supervisor; providers turn them into their own messages. */
export class ProcessError extends Error {
  readonly code: 'not-found' | 'start-failed' | 'exited' | 'unsupported';
  constructor(code: ProcessError['code'], message: string) {
    super(message);
    this.name = 'ProcessError';
    this.code = code;
  }
}

/** Options; inspection, boot id and signals are injectable for tests. */
export interface SupervisorOptions {
  /** processes.json (see processesFile). */
  file: string;
  platform?: NodeJS.Platform;
  inspect?: ProcessInspector;
  bootId?: BootIdReader;
  signal?: (pid: number, signal: NodeJS.Signals | 0) => void;
  /** Runs taskkill and PowerShell on Windows (spec M5 section 3). */
  run?: CommandRunner;
  /** Wait after TERM before KILL, ms (default 5000). */
  graceMs?: number;
  /** Wait after KILL, ms (default 2000). */
  killWaitMs?: number;
  pollMs?: number;
}

/** Starts and stops processes by their own records only. */
export interface ProcessSupervisor {
  readonly file: string;
  spawn(spec: SpawnSpec): Promise<ProcessRecord>;
  /** Adds a verified pid (e.g. the child `claude` of `expect`) that stop() also ends. */
  track(id: string, pid: number): Promise<ProcessRecord>;
  get(id: string): Promise<ProcessRecord | undefined>;
  list(filter?: Partial<ProcessOwner>): Promise<ProcessRecord[]>;
  /** Full check through `ps` and the boot id. */
  check(id: string): Promise<ProcessCheck>;
  /** Cheap check for polling: same boot and the pid exists (no external program). */
  quickCheck(id: string): Promise<'alive' | 'gone'>;
  stop(id: string, options?: { graceMs?: number }): Promise<StopResult>;
  forget(id: string): Promise<void>;
  /** Drops records whose process is gone or was replaced (after a reboot all of them). */
  reconcile(): Promise<{ removed: ProcessRecord[] }>;
}

interface ProcessesFile {
  version: 1;
  processes: ProcessRecord[];
}

/** processes.json inside the state directory. */
export function processesFile(stateDir: string): string {
  return path.join(stateDir, 'processes.json');
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function matches(info: ProcessInfo | undefined, expected: { startToken: string; commandLine: string; renames?: boolean }): ProcessCheck {
  if (!info) return 'gone';
  if (info.startToken !== expected.startToken) return 'mismatch';
  return expected.renames === true || info.commandLine === expected.commandLine ? 'alive' : 'mismatch';
}

/** Creates a supervisor over processes.json. */
export function createProcessSupervisor(options: SupervisorOptions): ProcessSupervisor {
  const platform = options.platform ?? process.platform;
  const windows = platform === 'win32';
  const run = options.run ?? runCommand;
  const inspect = options.inspect ?? (windows ? cimInspector({ run }) : psInspector({ platform }));
  const bootId = options.bootId ?? (windows ? windowsBootId({ run }) : systemBootId({ platform }));
  const signal = options.signal ?? ((pid: number, sig: NodeJS.Signals | 0) => void process.kill(pid, sig));
  const pollMs = options.pollMs ?? 100;
  const lock = createKeyedMutex();

  async function load(): Promise<ProcessRecord[]> {
    const data = (await readJsonFile(options.file)) as ProcessesFile | undefined;
    return Array.isArray(data?.processes) ? data.processes : [];
  }

  function update<T>(change: (records: ProcessRecord[]) => T | Promise<T>): Promise<T> {
    return lock.run('file', async () => {
      const records = await load();
      const result = await change(records);
      await writeJsonAtomic(options.file, { version: 1, processes: records } satisfies ProcessesFile);
      return result;
    });
  }

  function exists(pid: number): boolean {
    try {
      signal(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  async function bootChanged(record: ProcessRecord): Promise<boolean> {
    const boot = await bootId();
    return record.bootId !== null && boot !== null && record.bootId !== boot;
  }

  async function checkRecord(record: ProcessRecord): Promise<ProcessCheck> {
    if (await bootChanged(record)) return 'gone';
    return matches(await inspect(record.pid), record);
  }

  async function find(id: string): Promise<ProcessRecord> {
    const record = (await load()).find((r) => r.id === id);
    if (!record) throw new ProcessError('not-found', `No process record ${id}`);
    return record;
  }

  /** Targets of a stop: the record (its group when it leads one) and the tracked children. */
  function targets(record: ProcessRecord): Array<{ pid: number; group: boolean; identity: TrackedPid & { renames?: boolean } }> {
    const leader = { pid: record.pid, startToken: record.startToken, commandLine: record.commandLine, renames: record.renames === true };
    return [{ pid: record.pid, group: record.pgid === record.pid, identity: leader }, ...record.children.map((c) => ({ pid: c.pid, group: false, identity: c }))];
  }

  async function aliveTarget(t: { pid: number; group: boolean; identity: TrackedPid & { renames?: boolean } }): Promise<boolean> {
    if (matches(await inspect(t.pid), t.identity) === 'alive') return true;
    // A group that outlived its leader still consists only of processes started from our record.
    return t.group && exists(-t.pid);
  }

  async function waitGone(list: ReturnType<typeof targets>, ms: number): Promise<ReturnType<typeof targets>> {
    const deadline = Date.now() + ms;
    let alive = list;
    for (;;) {
      const next: typeof list = [];
      // Windows: a CIM query takes about a second, so waiting looks only at the pid; the identity
      // is checked again right before the forced kill.
      for (const t of alive) if (windows ? exists(t.pid) : await aliveTarget(t)) next.push(t);
      alive = next;
      if (alive.length === 0 || Date.now() >= deadline) return alive;
      await sleep(pollMs);
    }
  }

  async function send(t: { pid: number; group: boolean }, sig: NodeJS.Signals): Promise<void> {
    // Windows has no groups or TERM: the process tree ends through taskkill (/F for KILL).
    if (windows) return void (await taskkill(run, t.pid, sig === 'SIGKILL'));
    try {
      signal(t.group ? -t.pid : t.pid, sig);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  const supervisor: ProcessSupervisor = {
    file: options.file,
    async spawn(spec) {
      // logFile null: the output is dropped (a program that prints secrets), no file is created.
      if (spec.logFile !== null) await mkdir(path.dirname(spec.logFile), { recursive: true, mode: 0o700 });
      const log = spec.logFile === null ? null : await open(spec.logFile, 'a', 0o600);
      let pid: number;
      try {
        if (spec.logFile !== null) await chmod(spec.logFile, 0o600);
        const child = spawn(spec.command, spec.args, {
          cwd: spec.cwd,
          env: cleanEnv(spec.env, { extra: spec.extraEnv, platform }),
          detached: true,
          // Windows: the detached child gets its own console; it stays hidden.
          windowsHide: true,
          stdio: log ? ['ignore', log.fd, log.fd] : 'ignore',
        });
        pid = await new Promise<number>((resolve, reject) => {
          child.once('error', (error) => reject(new ProcessError('start-failed', `${spec.command}: ${error.message}`)));
          child.once('spawn', () => resolve(child.pid ?? -1));
        });
        child.unref();
      } finally {
        await log?.close();
      }
      let info: ProcessInfo | undefined;
      for (let attempt = 0; attempt < 5 && !info; attempt += 1) {
        info = await inspect(pid);
        if (!info) await sleep(20);
      }
      if (!info) throw new ProcessError('exited', `${spec.command} exited right after the start${spec.logFile === null ? '' : `; see ${spec.logFile}`}`);
      const record: ProcessRecord = {
        id: `proc-${randomBytes(6).toString('hex')}`,
        owner: { ref: null, ...spec.owner },
        pid,
        pgid: info.pgid,
        command: spec.command,
        args: [...spec.args],
        cwd: spec.cwd,
        logFile: spec.logFile,
        startToken: info.startToken,
        startedAt: info.startedAt ?? new Date().toISOString(),
        commandLine: info.commandLine,
        bootId: await bootId(),
        children: [],
        ...(spec.renames === true ? { renames: true } : {}),
      };
      await update((records) => void records.push(record));
      return record;
    },
    async track(id, pid) {
      const info = await inspect(pid);
      if (!info) throw new ProcessError('exited', `Process ${pid} is not running`);
      return update((records) => {
        const record = records.find((r) => r.id === id);
        if (!record) throw new ProcessError('not-found', `No process record ${id}`);
        record.children = [...record.children.filter((c) => c.pid !== pid), { pid, startToken: info.startToken, commandLine: info.commandLine }];
        return record;
      });
    },
    get: async (id) => (await load()).find((r) => r.id === id),
    async list(filter = {}) {
      const keys = Object.keys(filter) as Array<keyof ProcessOwner>;
      return (await load()).filter((r) => keys.every((k) => (r.owner[k] ?? null) === (filter[k] ?? null)));
    },
    check: async (id) => checkRecord(await find(id)),
    async quickCheck(id) {
      const record = await find(id);
      if (await bootChanged(record)) return 'gone';
      return exists(record.pid) ? 'alive' : 'gone';
    },
    async stop(id, stopOptions = {}) {
      const record = await find(id);
      if (await bootChanged(record)) {
        await supervisor.forget(id);
        return { outcome: 'already-gone', record };
      }
      const state = matches(await inspect(record.pid), record);
      // The leader (and its group) only when its identity matches; children are verified one by one.
      const candidates = targets(record).filter((_, index) => index > 0 || state === 'alive');
      const live: typeof candidates = [];
      for (const t of candidates) if (await aliveTarget(t)) live.push(t);
      if (live.length === 0) {
        await supervisor.forget(id);
        return { outcome: state === 'mismatch' ? 'mismatch' : 'already-gone', record };
      }
      for (const t of live) await send(t, 'SIGTERM');
      let left = await waitGone(live, stopOptions.graceMs ?? options.graceMs ?? 5000);
      let killed = false;
      if (left.length > 0) {
        // Re-verified right before KILL by aliveTarget inside waitGone (identity or own group).
        for (const t of left) if (await aliveTarget(t)) await send(t, 'SIGKILL');
        killed = true;
        left = await waitGone(left, options.killWaitMs ?? 2000);
      }
      if (left.length > 0) return { outcome: 'still-running', record };
      await supervisor.forget(id);
      return { outcome: killed ? 'killed' : 'stopped', record };
    },
    forget: (id) =>
      update((records) => {
        const index = records.findIndex((r) => r.id === id);
        if (index >= 0) records.splice(index, 1);
      }),
    async reconcile() {
      const removed: ProcessRecord[] = [];
      for (const record of await load()) {
        const state = await checkRecord(record);
        if (state === 'gone' || state === 'mismatch') removed.push(record);
      }
      if (removed.length > 0) {
        const gone = new Set(removed.map((r) => r.id));
        await update((records) => {
          const kept = records.filter((r) => !gone.has(r.id));
          records.splice(0, records.length, ...kept);
        });
      }
      return { removed };
    },
  };
  return supervisor;
}
