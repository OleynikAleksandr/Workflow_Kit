// Test doubles: an in-memory file system with platform paths, a recording command runner,
// a fake backend that answers /api/health after a start, and ready-made machines per OS.
import path from 'node:path';
import type { RunOptions, RunResult } from '#process-supervisor';
import type { InstallerFs } from '../src/fs.ts';
import type { HealthInfo, ServiceDeps } from '../src/types.ts';

interface Entry {
  text: string;
  mode: number;
}

/** In-memory InstallerFs; paths follow the given platform (win32 paths work on any host). */
export class MemoryFs implements InstallerFs {
  readonly files = new Map<string, Entry>();
  readonly dirs = new Set<string>();
  /** Symbolic links: link path to target path (absolute). */
  readonly links = new Map<string, string>();
  readonly p: path.PlatformPath;

  constructor(platform: NodeJS.Platform) {
    this.p = platform === 'win32' ? path.win32 : path.posix;
  }

  private inside(target: string, root: string): boolean {
    return target === root || target.startsWith(root.endsWith(this.p.sep) ? root : root + this.p.sep);
  }

  private addDir(dir: string): void {
    let current = dir;
    while (!this.dirs.has(current)) {
      this.dirs.add(current);
      const parent = this.p.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  seed(file: string, text: string, mode = 0o644): void {
    this.addDir(this.p.dirname(file));
    this.files.set(file, { text, mode });
  }

  async readText(file: string): Promise<string | undefined> {
    return this.files.get(file)?.text;
  }

  async writeText(file: string, text: string, options: { mode?: number } = {}): Promise<void> {
    this.seed(file, text, options.mode ?? 0o600);
  }

  async remove(target: string): Promise<void> {
    for (const key of [...this.files.keys()]) if (this.inside(key, target)) this.files.delete(key);
    for (const key of [...this.dirs]) if (this.inside(key, target)) this.dirs.delete(key);
  }

  async exists(target: string): Promise<boolean> {
    return this.existsSync(target);
  }

  async list(dir: string): Promise<string[]> {
    const names = new Set<string>();
    for (const key of [...this.files.keys(), ...this.dirs]) {
      if (key !== dir && this.p.dirname(key) === dir) names.add(this.p.basename(key));
    }
    return [...names].sort();
  }

  async copyTree(from: string, to: string, filter: (source: string) => boolean): Promise<void> {
    const allowed = (source: string): boolean => {
      // Like fs.cp: an excluded directory hides everything below it.
      for (let current = source; this.inside(current, from); current = this.p.dirname(current)) {
        if (!filter(current)) return false;
        if (current === from) break;
      }
      return true;
    };
    for (const [key, entry] of [...this.files]) {
      if (this.inside(key, from) && allowed(key)) this.seed(to + key.slice(from.length), entry.text, entry.mode);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    for (const [key, entry] of [...this.files]) {
      if (this.inside(key, from)) {
        this.files.delete(key);
        this.seed(to + key.slice(from.length), entry.text, entry.mode);
      }
    }
    for (const key of [...this.dirs]) if (this.inside(key, from)) this.dirs.delete(key);
    this.addDir(to);
  }

  async ensureDir(dir: string): Promise<void> {
    this.addDir(dir);
  }

  existsSync(target: string): boolean {
    return this.files.has(target) || this.dirs.has(target);
  }

  readTextSync(file: string): string | undefined {
    return this.files.get(file)?.text;
  }

  isExecutable(file: string): boolean {
    const entry = this.files.get(file);
    if (!entry) return false;
    return this.p === path.win32 ? true : (entry.mode & 0o111) !== 0;
  }

  /** Seeds an executable symlink (it also reads as the file for isExecutable). */
  symlink(link: string, target: string): void {
    this.seed(link, 'link', 0o755);
    this.links.set(link, target);
  }

  realpath(file: string): string | null {
    let current = file;
    for (let hops = 0; hops < 40; hops += 1) {
      const target = this.links.get(current);
      if (target === undefined) return this.existsSync(current) ? current : null;
      current = target;
    }
    return null;
  }

  mode(file: string): number | undefined {
    return this.files.get(file)?.mode;
  }
}

/** One recorded call of the fake runner. */
export interface Call {
  command: string;
  args: string[];
  options?: RunOptions;
}

/** Handler of the fake runner: returns a partial result or undefined (success, empty output). */
export type Handler = (command: string, args: string[]) => Partial<RunResult> | undefined;

/** A fake machine: deps for the installer plus the recorded effects. */
export interface Machine {
  deps: ServiceDeps & { fs: MemoryFs };
  fs: MemoryFs;
  calls: Call[];
  spawned: { command: string; args: string[]; env: Record<string, string>; logFile?: string }[];
  killed: number[];
  backend: { health: HealthInfo | null };
  /** Command lines of the calls, for compact assertions. */
  lines(): string[];
  /** Makes the backend answer with the version of app/current.json (what a start would run). */
  boot(): void;
}

export const LOGIN_PATH: Record<string, string> = {
  darwin: '/opt/homebrew/bin:/usr/bin:/bin',
  linux: '/home/me/.local/bin:/usr/bin:/bin',
  win32: 'C:\\Program Files\\nodejs;C:\\Windows\\System32',
};

/** Homes, env and node of the three platforms. */
export function machineBase(platform: NodeJS.Platform): { homedir: string; env: NodeJS.ProcessEnv; nodePath: string; sourceRoot: string } {
  if (platform === 'win32') {
    return {
      homedir: 'C:\\Users\\me',
      env: {
        LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
        APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
        SystemRoot: 'C:\\Windows',
        Path: LOGIN_PATH['win32'],
        PATHEXT: '.COM;.EXE;.CMD',
        CLAUDECODE: '1',
      },
      nodePath: 'C:\\Program Files\\nodejs\\node.exe',
      sourceRoot: 'C:\\src\\clone',
    };
  }
  const homedir = platform === 'darwin' ? '/Users/me' : '/home/me';
  return {
    homedir,
    env: { HOME: homedir, SHELL: '/bin/zsh', PATH: '/usr/bin:/bin', CLAUDECODE: '1' },
    nodePath: platform === 'darwin' ? '/opt/homebrew/bin/node' : '/usr/bin/node',
    sourceRoot: '/src/clone',
  };
}

/** Seeds a source clone with the given version. */
export function seedClone(fs: MemoryFs, root: string, version: string): void {
  const j = fs.p.join;
  fs.seed(j(root, 'package.json'), JSON.stringify({ name: 'workflow-kit', version }));
  fs.seed(j(root, 'bin', 'wfk.mjs'), '#!/usr/bin/env node\n', 0o755);
  fs.seed(j(root, 'product-parts', 'part', 'src', 'index.ts'), 'export {};\n');
  fs.seed(j(root, 'product-parts', 'part', 'test', 'index.test.ts'), 'test\n');
  fs.seed(j(root, 'docs', 'note.md'), 'not copied\n');
}

/** Builds a fake machine; handler decides the outcome of external commands. */
export function makeMachine(platform: NodeJS.Platform, options: { handler?: Handler; env?: NodeJS.ProcessEnv } = {}): Machine {
  const base = machineBase(platform);
  const fs = new MemoryFs(platform);
  seedClone(fs, base.sourceRoot, '0.1.0');
  fs.seed(base.nodePath, 'node', 0o755);
  const calls: Call[] = [];
  const spawned: Machine['spawned'] = [];
  const killed: number[] = [];
  const backend: Machine['backend'] = { health: null };
  let pid = 1000;
  const env = { ...base.env, ...options.env };
  const machine: Machine = {
    fs,
    calls,
    spawned,
    killed,
    backend,
    lines: () => calls.map((call) => [call.command, ...call.args].join(' ')),
    boot() {
      const current = [...fs.files.entries()].find(([key]) => key.endsWith(`${fs.p.sep}current.json`));
      const version = current ? (JSON.parse(current[1].text) as { version: string }).version : 'dev';
      pid += 1;
      backend.health = { ok: true, version, pid };
    },
    deps: {
      platform,
      env,
      homedir: base.homedir,
      fs,
      uid: 501,
      nodePath: base.nodePath,
      sourceRoot: base.sourceRoot,
      now: () => new Date('2026-11-05T10:00:00Z'),
      sleep: async () => undefined,
      readyTimeoutMs: 1000,
      stopTimeoutMs: 1000,
      health: async () => backend.health,
      kill: (target) => {
        killed.push(target);
        backend.health = null;
      },
      spawnDetached: async (command, args, spawnOptions) => {
        spawned.push({ command, args: [...args], env: spawnOptions.env, logFile: spawnOptions.logFile });
        if (args.includes('serve')) machine.boot();
      },
      run: async (command, args, runOptions) => {
        calls.push({ command, args: [...args], options: runOptions });
        const custom = options.handler?.(command, [...args]);
        const result: RunResult = { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, startError: null, ...custom };
        return result;
      },
    },
  };
  return machine;
}

/** Options of the fake service managers. */
export interface HandlerOptions {
  /**
   * launchd unloads a job asynchronously: after bootout, print still finds the job for this many
   * calls; meanwhile kickstart "succeeds" without starting anything and bootstrap fails (code 5).
   */
  unloadPolls?: number;
}

/** Default handler: login shell prints PATH, launchctl and systemd behave like a fresh machine. */
export function defaultHandler(platform: NodeJS.Platform, machine: () => Machine, extra?: Handler, handlerOptions: HandlerOptions = {}): Handler {
  let loaded = false;
  let unloading = 0;
  return (command, args) => {
    const custom = extra?.(command, args);
    if (custom) return custom;
    if (args.includes('-c')) return { stdout: `noise\n__WFK_PATH__${LOGIN_PATH[platform]}__WFK_PATH__` };
    if (command === '/bin/launchctl') {
      if (args[0] === 'print') {
        if (unloading > 0) {
          unloading -= 1;
          return { code: 0 };
        }
        return { code: loaded ? 0 : 113 };
      }
      if (unloading > 0 && args[0] === 'kickstart') return undefined;
      if (unloading > 0 && args[0] === 'bootstrap') return { code: 5, stderr: 'Bootstrap failed: 5: Input/output error' };
      if (args[0] === 'bootstrap' || args[0] === 'kickstart') {
        loaded = true;
        machine().boot();
      }
      if (args[0] === 'bootout') {
        if (loaded) unloading = handlerOptions.unloadPolls ?? 0;
        loaded = false;
        machine().backend.health = null;
      }
      return undefined;
    }
    if (command === 'systemctl' && (args[1] === 'restart' || args[1] === 'start')) machine().boot();
    if (command === 'systemctl' && args[1] === 'stop') machine().backend.health = null;
    if (command.endsWith('powershell.exe') && (args.at(-1) ?? '').includes('CreateShortcut')) {
      const lnk = /CreateShortcut\('([^']+)'\)/.exec(args.at(-1) ?? '')?.[1];
      if (lnk) machine().fs.seed(lnk, 'lnk');
    }
    return undefined;
  };
}

/** A machine with the default handler (plus optional overrides). */
export function standardMachine(platform: NodeJS.Platform, options: { extra?: Handler; env?: NodeJS.ProcessEnv } & HandlerOptions = {}): Machine {
  let machine: Machine | undefined;
  const handler = defaultHandler(platform, () => machine as Machine, options.extra, { unloadPolls: options.unloadPolls });
  machine = makeMachine(platform, { handler, env: options.env });
  return machine;
}
