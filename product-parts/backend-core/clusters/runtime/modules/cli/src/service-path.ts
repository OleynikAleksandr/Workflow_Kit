// The wfk launcher directory on the PATH of the service (spec M17 2.1): the Codex daemon, the
// Claude host and the Kimi server inherit it however the service was started.
import { launcherDir, mergePath, serviceLayout } from '#service-installer';

/**
 * Appends the launcher directory to PATH of env (in place) unless it is there; Windows spells
 * the key "Path" and compares directories without case. Returns the directory added, or null.
 */
export function withLauncherDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, homedir: string): string | null {
  const dir = launcherDir(serviceLayout({ platform, env, homedir }));
  if (!dir) return null;
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? (platform === 'win32' ? 'Path' : 'PATH');
  const current = env[key] ?? '';
  const next = mergePath(platform, current, dir);
  if (next === mergePath(platform, current)) return null;
  env[key] = next;
  return dir;
}
