// Loads the vendored node-pty 1.1.0 (Windows ConPTY only, spec M5 section 2) for this process's
// architecture. macOS and Linux keep expect: there is no build for them here on purpose.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NODE_PTY_VERSION = '1.1.0';

/** The vendored package folder. */
export function vendorDir(): string {
  return fileURLToPath(new URL(`../vendor/node-pty-${NODE_PTY_VERSION}/`, import.meta.url));
}

/** The subset of the node-pty API this service uses. */
export interface NodePtyProcess {
  readonly pid: number;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
  write(data: string | Buffer): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface NodePtyOptions {
  name?: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
  useConpty?: boolean;
  useConptyDll?: boolean;
  conptyInheritCursor?: boolean;
}

export interface NodePty {
  spawn(file: string, args: string[] | string, options: NodePtyOptions): NodePtyProcess;
}

export class PtyUnavailableError extends Error {
  readonly code = 'pty-unavailable';
  constructor(message: string) {
    super(message);
    this.name = 'PtyUnavailableError';
  }
}

/** Why the pty cannot run here, or null when the vendored build fits the platform. */
export function ptyUnavailable(platform: NodeJS.Platform, arch: string, dir: string = vendorDir()): string | null {
  if (platform !== 'win32') return 'ConPTY есть только на Windows';
  const build = path.join(dir, 'prebuilds', `win32-${arch}`);
  for (const file of ['conpty.node', path.join('conpty', 'conpty.dll'), path.join('conpty', 'OpenConsole.exe')]) {
    if (!existsSync(path.join(build, file))) return `pty недоступен: нет сборки node-pty для win32-${arch}`;
  }
  return null;
}

/** Requires the vendored node-pty; throws PtyUnavailableError when it cannot run here. */
export function loadNodePty(platform: NodeJS.Platform = process.platform, arch: string = process.arch, dir: string = vendorDir()): NodePty {
  const reason = ptyUnavailable(platform, arch, dir);
  if (reason) throw new PtyUnavailableError(reason);
  const require = createRequire(path.join(dir, 'package.json'));
  try {
    return require('./lib/index.js') as NodePty;
  } catch (error) {
    throw new PtyUnavailableError(`pty недоступен: node-pty не загрузился (${error instanceof Error ? error.message : String(error)})`);
  }
}
