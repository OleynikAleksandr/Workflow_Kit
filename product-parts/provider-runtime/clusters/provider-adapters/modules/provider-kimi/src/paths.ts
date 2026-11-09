// Where Kimi Code keeps its files (docs/planning/M8-kimi-protocol.md, sections 1, 2 and 7). Every
// path is built for the injected platform, so the Windows layout is testable on any machine.
import path from 'node:path';

/** Environment variable that moves the Kimi Code home. */
export const KIMI_HOME_ENV = 'KIMI_CODE_HOME';

/** Files and folders of one Kimi Code home. */
export interface KimiPaths {
  home: string;
  /** Token of every local server of this home. */
  token: string;
  /** One JSON record per running server. */
  instances: string;
  /** One file per trusted folder. */
  trustDir: string;
  /** Session locks (a live turn holds one). */
  locks: string;
  /** User configuration with the hooks. */
  config: string;
  /** The program Kimi Code installs itself. */
  program: string;
}

/** path.win32 for Windows, path.posix otherwise. */
export function pathApi(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

/** A variable of env; Windows names are matched without case. */
export function envValue(env: Readonly<Record<string, string | undefined>>, name: string, platform: NodeJS.Platform): string | undefined {
  const exact = env[name];
  if (exact !== undefined || platform !== 'win32') return exact;
  const wanted = name.toUpperCase();
  for (const [key, value] of Object.entries(env)) if (key.toUpperCase() === wanted) return value;
  return undefined;
}

/** env without one variable (Windows: without case). */
export function envWithout(env: Readonly<Record<string, string | undefined>>, name: string, platform: NodeJS.Platform): Record<string, string | undefined> {
  const wanted = name.toUpperCase();
  return Object.fromEntries(Object.entries(env).filter(([key]) => (platform === 'win32' ? key.toUpperCase() !== wanted : key !== name)));
}

/** The Kimi Code home: KIMI_CODE_HOME, else <home of the user>/.kimi-code. */
export function kimiHome(env: Readonly<Record<string, string | undefined>>, homedir: string, platform: NodeJS.Platform): string {
  const api = pathApi(platform);
  const custom = envValue(env, KIMI_HOME_ENV, platform)?.trim();
  return custom ? api.resolve(homedir, custom) : api.join(homedir, '.kimi-code');
}

/** Paths inside a Kimi Code home. */
export function kimiPaths(home: string, platform: NodeJS.Platform): KimiPaths {
  const api = pathApi(platform);
  return {
    home,
    token: api.join(home, 'server.token'),
    instances: api.join(home, 'server', 'instances'),
    trustDir: api.join(home, 'workspace-trust'),
    locks: api.join(home, 'locks', 'sessions'),
    config: api.join(home, 'config.toml'),
    program: api.join(home, 'bin', platform === 'win32' ? 'kimi.exe' : 'kimi'),
  };
}

/** Same folder: exact on macOS and Linux; on Windows without case and with either slash. */
export function sameFolder(a: string, b: string, platform: NodeJS.Platform): boolean {
  const trim = (value: string): string => (value.length > 1 ? value.replace(/[\\/]+$/, '') || value : value);
  if (platform !== 'win32') return trim(a) === trim(b);
  const norm = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}
