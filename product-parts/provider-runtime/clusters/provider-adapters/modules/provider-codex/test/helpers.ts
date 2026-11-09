// Test setup of the Codex provider: a fake HOME with $HOME/.codex, a fake `codex` program
// (fixtures/fake-codex.mjs), a fake daemon socket linked where Codex keeps it, a project folder.
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEventLog } from '#data-store';
import type { DataDirs } from '#data-store';
import { runCommand } from '#process-supervisor';
import type { ProcessSupervisor } from '#process-supervisor';
import type { Project, ProviderContext } from '#provider-registry';
import { startFakeDaemon } from './fake-daemon.ts';
import type { FakeDaemon, FakeDaemonOptions } from './fake-daemon.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));

/** One fake machine. */
export interface FakeMachine {
  root: string;
  home: string;
  codexHome: string;
  bin: string;
  dirs: DataDirs;
  context(overrides?: Partial<ProviderContext>): ProviderContext;
  /** Starts a fake daemon, links its socket and writes the pid file (pid of this test process). */
  daemon(options?: FakeDaemonOptions): Promise<FakeDaemon>;
  project(name: string): Promise<Project>;
  /** Requests the fake `codex` received (calls.jsonl). */
  calls(): Promise<Array<{ method?: string; params?: Record<string, unknown>; argv?: string[] }>>;
  /** Stops every fake daemon and removes the temporary directory. */
  close(): Promise<void>;
}

/** Creates a fake machine in a short temporary directory (unix socket names are limited). */
export async function fakeMachine(): Promise<FakeMachine> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfkc-')));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const bin = path.join(root, 'bin');
  await mkdir(codexHome, { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, 'codex'), `#!/bin/sh\nexec "${process.execPath}" "${FIXTURE}" "$@"\n`);
  await chmod(path.join(bin, 'codex'), 0o755);
  await writeFile(path.join(codexHome, 'config.toml'), 'model = "gpt-test"\n');
  const data = path.join(root, 'data');
  const dirs: DataDirs = { configDir: data, stateDir: data, appDir: data, logsDir: path.join(data, 'logs'), backupsDir: path.join(data, 'backups'), overridden: true };
  let sockets = 0;
  const daemons: FakeDaemon[] = [];
  return {
    root,
    home,
    codexHome,
    bin,
    dirs,
    context(overrides = {}) {
      return {
        platform: 'darwin',
        env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home },
        homedir: home,
        dirs,
        config: { port: 0, projectsRoot: home, programs: {} },
        events: createEventLog({ file: path.join(data, 'events.jsonl') }),
        supervisor: {} as ProcessSupervisor,
        runCommand,
        now: () => new Date(),
        log: () => undefined,
        ...overrides,
      };
    },
    async daemon(options = {}) {
      sockets += 1;
      const daemon = await startFakeDaemon(path.join(root, `d${sockets}.sock`), options);
      daemons.push(daemon);
      const control = path.join(codexHome, 'app-server-control');
      await mkdir(control, { recursive: true });
      await rm(path.join(control, 'app-server-control.sock'), { force: true });
      await symlink(daemon.socketPath, path.join(control, 'app-server-control.sock'));
      await mkdir(path.join(codexHome, 'app-server-daemon'), { recursive: true });
      await writeFile(path.join(codexHome, 'app-server-daemon', 'daemon.pid'), JSON.stringify({ pid: process.pid, processStartTime: 'now' }));
      return daemon;
    },
    async project(name) {
      const dir = path.join(home, name);
      await mkdir(dir, { recursive: true });
      return { id: `id-${name.toLowerCase()}`, name, path: dir, source: 'created', createdAt: new Date().toISOString() };
    },
    async close() {
      for (const daemon of daemons) await daemon.close();
      await rm(root, { recursive: true, force: true });
    },
    async calls() {
      const text = await readFile(path.join(codexHome, 'calls.jsonl'), 'utf8').catch(() => '');
      return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as { method?: string; params?: Record<string, unknown>; argv?: string[] });
    },
  };
}
