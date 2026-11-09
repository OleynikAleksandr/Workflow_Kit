// Service environment (D12): the login-shell PATH and absolute paths of the programs of PROGRAMS.
import { loginPathCommands, parseLoginPath } from './commands.ts';
import { pathApi } from './fs.ts';
import type { ResolvedDeps } from './types.ts';

/**
 * Programs whose paths install saves in config.json. Only node is required: the provider programs
 * (claude, codex, kimi) and expect are optional, a missing one is shown and is not an error.
 */
export const PROGRAMS: readonly string[] = ['node', 'claude', 'codex', 'kimi', 'expect'];

/** Result of the detection. */
export interface DetectedPrograms {
  /** Found programs only; node is the running node, by a stable path when one exists (stableNodePath). */
  programs: Record<string, string>;
  /** PATH given to the service and its children. */
  loginPath: string;
}

/** PATH of an environment (Windows spells it "Path"). */
export function envPath(env: NodeJS.ProcessEnv): string {
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH');
  return (key ? env[key] : undefined) ?? '';
}

/** Joins PATH lists keeping the first occurrence of every directory. */
export function mergePath(platform: NodeJS.Platform, ...lists: string[]): string {
  const delimiter = platform === 'win32' ? ';' : ':';
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const dir of list.split(delimiter)) {
      const key = platform === 'win32' ? dir.toLowerCase() : dir;
      if (dir === '' || seen.has(key)) continue;
      seen.add(key);
      result.push(dir);
    }
  }
  return result.join(delimiter);
}

/** Finds an executable in a PATH list (Windows tries PATHEXT). */
export function findProgram(
  name: string,
  pathValue: string,
  options: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; isExecutable: (file: string) => boolean },
): string | null {
  const p = pathApi(options.platform);
  const delimiter = options.platform === 'win32' ? ';' : ':';
  const extensions =
    options.platform === 'win32' ? ['', ...(options.env['PATHEXT'] || '.COM;.EXE;.BAT;.CMD').split(';').map((ext) => ext.toLowerCase())] : [''];
  for (const dir of pathValue.split(delimiter)) {
    if (dir === '' || !p.isAbsolute(dir)) continue;
    for (const ext of extensions) {
      const file = p.join(dir, `${name}${ext}`);
      if (options.isExecutable(file)) return file;
    }
  }
  return null;
}

/** PATH of the user's login shell (macOS, Linux); null when it cannot be read. */
export async function loginShellPath(deps: ResolvedDeps): Promise<string | null> {
  if (deps.platform === 'win32') return null;
  const shell = deps.env['SHELL'] || (deps.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  for (const call of loginPathCommands(shell)) {
    const result = await deps.run(call.command, call.args, { env: { ...deps.env, TERM: 'dumb' }, timeoutMs: 10_000 });
    const value = result.code === 0 ? parseLoginPath(result.stdout) : null;
    if (value) return value;
  }
  return null;
}

/** Homebrew keg link of a Cellar node: <prefix>/Cellar/<formula>/<version>/bin/node → <prefix>/opt/<formula>/bin/node. */
export function homebrewOptNode(realNode: string): string | null {
  const match = /^(.*)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/.exec(realNode);
  return match ? `${match[1]}/opt/${match[2]}/bin/node` : null;
}

/**
 * Node path for the service that survives a Homebrew upgrade: process.execPath is the versioned
 * Cellar path (…/Cellar/node@24/24.x.y/bin/node) that disappears on `brew upgrade`. The first
 * `node` of the search PATH (login PATH first) with the same realpath is taken, then the Homebrew
 * opt link; when none matches, the running node itself. Windows keeps the running node.
 */
export function stableNodePath(deps: ResolvedDeps, searchPath: string): string {
  if (deps.platform === 'win32') return deps.nodePath;
  const real = deps.fs.realpath(deps.nodePath);
  if (!real) return deps.nodePath;
  const p = pathApi(deps.platform);
  const candidates = searchPath
    .split(':')
    .filter((dir) => dir !== '' && p.isAbsolute(dir))
    .map((dir) => p.join(dir, 'node'));
  const opt = homebrewOptNode(real);
  if (opt) candidates.push(opt);
  for (const candidate of candidates) {
    if (deps.fs.isExecutable(candidate) && deps.fs.realpath(candidate) === real) return candidate;
  }
  return deps.nodePath;
}

/** Detects the service PATH and the program paths saved by install (D12). */
export async function detectPrograms(deps: ResolvedDeps): Promise<DetectedPrograms> {
  const p = pathApi(deps.platform);
  const login = await loginShellPath(deps);
  const node = stableNodePath(deps, mergePath(deps.platform, login ?? '', envPath(deps.env)));
  // The directory of the service node goes first: the service runs exactly that node.
  const loginPath = mergePath(deps.platform, p.dirname(node), login ?? '', envPath(deps.env));
  const programs: Record<string, string> = { node };
  for (const name of PROGRAMS) {
    if (name === 'node') continue;
    const found = findProgram(name, loginPath, { platform: deps.platform, env: deps.env, isExecutable: (file) => deps.fs.isExecutable(file) });
    if (found) programs[name] = found;
  }
  return { programs, loginPath };
}
