// Shared setup of the end-to-end provider tests: a temporary HOME with ~/.claude.json, a project
// folder with the Kit hook, the fake `claude` (fixtures/fake-claude.mjs) and a process supervisor
// in a temporary WFK_DATA_DIR. The real claude and the real ~/.claude.json are never touched.
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEventLog, ensureDataDirs, eventsFile, resolveDataDirs } from '#data-store';
import { createProcessSupervisor, processesFile, runCommand } from '#process-supervisor';
import type { ProcessSupervisor } from '#process-supervisor';
import type { Project, Provider, ProviderContext, ProviderError } from '#provider-registry';
import { createClaudeProvider } from '../src/index.ts';
import type { ClaudeProviderOptions } from '../src/index.ts';

export const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** True when `expect` is installed (macOS has it); the end-to-end tests are skipped otherwise. */
export const hasExpect =
  process.platform !== 'win32' &&
  (() => {
    try {
      execFileSync('/bin/sh', ['-c', 'command -v expect'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
export const skip = hasExpect ? false : 'expect is not installed';

export const fast: ClaudeProviderOptions = { pollMs: 50, sessionTimeoutMs: 20_000, stopGraceMs: 2000 };

/** One recorded start of the fake claude. */
export interface FakeCall {
  argv: string[];
  vars: Record<string, string>;
  pid: number;
}

export interface Harness {
  tmp: string;
  home: string;
  configFile: string;
  fakeLog: string;
  supervisor: ProcessSupervisor;
  context: ProviderContext;
  provider: Provider;
  /** Creates a project folder under ~/WorkflowKitProjects with the Kit hook in .claude/settings.json. */
  project(name: string): Promise<Project>;
  /** A provider with extra environment variables for the fake claude and other options. */
  withEnv(extra: Record<string, string>, options?: ClaudeProviderOptions): Provider;
  fakeCalls(): Promise<FakeCall[]>;
  /** Keys the fake claude received inside a dialog (must stay empty). */
  dialogKeys(): Promise<string[]>;
  readConfig(): Promise<{ projects: Record<string, Record<string, unknown>> } & Record<string, unknown>>;
  cleanup(): Promise<void>;
}

/** Matches a ProviderError by its code (for assert.rejects). */
export const code = (expected: string) => (error: unknown): boolean => (error as ProviderError).code === expected;

/** Builds the temporary machine; config is the initial ~/.claude.json (written with mode 0640). */
export async function createHarness(config: (home: string) => Record<string, unknown>, options: ClaudeProviderOptions = {}): Promise<Harness> {
  const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-')));
  const home = path.join(tmp, 'home');
  await mkdir(home, { recursive: true });
  const configFile = path.join(home, '.claude.json');
  await writeFile(configFile, JSON.stringify(config(home)), { mode: 0o640 });
  await chmod(configFile, 0o640);
  const bin = path.join(tmp, 'bin');
  await mkdir(bin, { recursive: true });
  const claude = path.join(bin, 'claude.mjs');
  await writeFile(claude, `#!${process.execPath}\n${await readFile(path.join(fixtures, 'fake-claude.mjs'), 'utf8')}`);
  await chmod(claude, 0o755);
  const fakeLog = path.join(tmp, 'fake-claude.jsonl');
  const dirs = resolveDataDirs({ platform: process.platform, env: { WFK_DATA_DIR: path.join(tmp, 'data') }, homedir: home });
  await ensureDataDirs(dirs);
  const supervisor = createProcessSupervisor({ file: processesFile(dirs.stateDir), graceMs: 2000, pollMs: 50 });
  const context: ProviderContext = {
    platform: process.platform,
    env: { PATH: process.env['PATH'], HOME: home, FAKE_CLAUDE_LOG: fakeLog, CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli' },
    homedir: home,
    dirs,
    config: { port: 0, projectsRoot: path.join(home, 'WorkflowKitProjects'), programs: { claude } },
    events: createEventLog({ file: eventsFile(dirs) }),
    supervisor,
    runCommand,
    now: () => new Date(),
    log: () => undefined,
  };
  const lines = async (file: string): Promise<string[]> => (await readFile(file, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  return {
    tmp,
    home,
    configFile,
    fakeLog,
    supervisor,
    context,
    provider: createClaudeProvider(context, { ...fast, ...options }),
    async project(name) {
      const folder = path.join(home, 'WorkflowKitProjects', name);
      await mkdir(path.join(folder, '.workflow-kit', 'local'), { recursive: true });
      await mkdir(path.join(folder, '.claude'), { recursive: true });
      await writeFile(
        path.join(folder, '.claude', 'settings.json'),
        JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: '"$HOME/.local/bin/wfk" hook session-start --client claude; exit 0' }] }] } }),
      );
      return { id: `p-${name.toLowerCase()}`, name, path: folder, source: 'created', createdAt: new Date().toISOString() };
    },
    withEnv: (extra, more = {}) => createClaudeProvider({ ...context, env: { ...context.env, ...extra } }, { ...fast, ...options, ...more }),
    fakeCalls: async () => (await lines(fakeLog)).map((line) => JSON.parse(line) as FakeCall),
    dialogKeys: async () => (await lines(`${fakeLog}.keys`)).map((line) => (JSON.parse(line) as { keys: string }).keys),
    readConfig: async () => JSON.parse(await readFile(configFile, 'utf8')),
    async cleanup() {
      for (const record of await supervisor.list()) await supervisor.stop(record.id, { graceMs: 500 }).catch(() => undefined);
      await rm(tmp, { recursive: true, force: true });
    },
  };
}
