// wfk link: points the launcher ~/.local/bin/wfk at the current clone (development). The
// SessionStart hook of every project calls this launcher, so linking makes hooks work.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from '#data-store';
import { gitBashLauncher, hookLauncherScript, isOwnLauncher, windowsLauncher } from '#service-installer';

/** Marker line that identifies a launcher written by Workflow Kit (link or install). */
export const LAUNCHER_MARK = '# Workflow Kit launcher';

/** Root of this clone: the directory with bin/wfk.mjs and package.json. */
export const REPO_ROOT: string = fileURLToPath(new URL('../../../../../../../', import.meta.url));

/** Inputs of linkLauncher; all machine-specific values are injectable for tests. */
export interface LinkOptions {
  homedir: string;
  platform: NodeJS.Platform;
  /** PATH of the user, to tell whether ~/.local/bin is reachable. */
  pathEnv?: string;
  /** Clone to link (default: this clone). */
  repoRoot?: string;
  /** Absolute node binary the launcher runs (default: the current one). */
  nodePath?: string;
  /** Replace a file that was not written by Workflow Kit. */
  force?: boolean;
  /** Windows: %LOCALAPPDATA% (default: <home>/AppData/Local). */
  localAppData?: string;
}

/** Result of a successful link. */
export interface LinkResult {
  launcher: string;
  entry: string;
  node: string;
  /** True when a previous launcher was replaced. */
  replaced: boolean;
  /** True when the launcher directory is in PATH. */
  inPath: boolean;
}

/** A link that cannot be done; the message is shown to the user. */
export class LinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkError';
  }
}

/** Path of the launcher in a home folder. */
export function launcherPath(homedir: string): string {
  return path.join(homedir, '.local', 'bin', 'wfk');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Text of the POSIX launcher script. */
export function launcherScript(nodePath: string, entry: string): string {
  return `#!/bin/sh\n${LAUNCHER_MARK} (wfk link: development clone)\nexec ${shellQuote(nodePath)} ${shellQuote(entry)} "$@"\n`;
}

/** Writes ~/.local/bin/wfk (0755) that runs bin/wfk.mjs of the clone with an absolute node. */
export async function linkLauncher(options: LinkOptions): Promise<LinkResult> {
  if (options.platform === 'win32') return linkWindows(options);
  const root = options.repoRoot ?? REPO_ROOT;
  const entry = path.join(root, 'bin', 'wfk.mjs');
  try {
    await readFile(entry);
  } catch {
    throw new LinkError(`не найден ${entry}: запускайте wfk link из клона Workflow Kit`);
  }
  const launcher = launcherPath(options.homedir);
  let previous: string | undefined;
  try {
    previous = await readFile(launcher, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (previous !== undefined && !previous.includes(LAUNCHER_MARK) && !options.force) {
    throw new LinkError(`${launcher} уже существует и создан не Workflow Kit; чтобы заменить его, повторите с --force`);
  }
  const node = options.nodePath ?? process.execPath;
  await writeFileAtomic(launcher, launcherScript(node, entry), { mode: 0o755, dirMode: 0o755 });
  const dir = path.dirname(launcher);
  const inPath = (options.pathEnv ?? '').split(path.delimiter).some((item) => item.replace(/\/+$/, '') === dir);
  return { launcher, entry, node, replaced: previous !== undefined, inPath };
}

/**
 * Windows (spec M5 section 6): the same three launchers as `wfk install` — wfk.cmd, `wfk` for Git
 * Bash and wfk.mjs for Kit hooks — in %LOCALAPPDATA%\\Workflow Kit, pointed at this clone.
 */
async function linkWindows(options: LinkOptions): Promise<LinkResult> {
  const root = options.repoRoot ?? REPO_ROOT;
  const entry = path.join(root, 'bin', 'wfk.mjs');
  try {
    await readFile(entry);
  } catch {
    throw new LinkError(`не найден ${entry}: запускайте wfk link из клона Workflow Kit`);
  }
  const dir = path.join(options.localAppData || path.join(options.homedir, 'AppData', 'Local'), 'Workflow Kit');
  const node = options.nodePath ?? process.execPath;
  const origin = 'wfk link: development clone';
  const files: Array<[string, string]> = [
    [path.join(dir, 'wfk.cmd'), windowsLauncher(node, entry, origin)],
    [path.join(dir, 'wfk'), gitBashLauncher(node, entry, origin)],
    [path.join(dir, 'wfk.mjs'), hookLauncherScript(entry, origin)],
  ];
  let replaced = false;
  for (const [file] of files) {
    let previous: string | undefined;
    try {
      previous = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (previous !== undefined && !isOwnLauncher(previous) && !options.force) {
      throw new LinkError(`${file} уже существует и создан не Workflow Kit; чтобы заменить его, повторите с --force`);
    }
    replaced ||= previous !== undefined;
  }
  for (const [file, text] of files) await writeFileAtomic(file, text, { mode: 0o644, dirMode: 0o755 });
  const wanted = dir.toLowerCase().replace(/[\\/]+$/, '');
  const inPath = (options.pathEnv ?? '').split(';').some((item) => item.toLowerCase().replace(/[\\/]+$/, '') === wanted);
  return { launcher: files[0]![0], entry, node, replaced, inPath };
}
