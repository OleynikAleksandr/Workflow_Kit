// What the installed copy needs besides the code (spec speech-integration 2.3): the runtime
// packages of package-lock.json in app/<version>/node_modules and, on macOS Apple Silicon, the
// speech helper with its version record in <data>/speech.
import { randomBytes } from 'node:crypto';
import { ServiceError } from './control.ts';
import { pathApi } from './fs.ts';
import type { InstallerFs } from './fs.ts';
import type { ServiceLayout } from './layout.ts';

/** Where the source keeps the release build of the helper (relative to the source root). */
export const HELPER_ARTIFACT: readonly string[] = [
  'product-parts', 'speech-input', 'clusters', 'local-recognition', 'modules', 'speech-helper', 'target', 'release', 'wfk-speech-helper',
];
export const HELPER_NAME = 'wfk-speech-helper';
export const HELPER_RECORD = 'helper.json';
export const NOTICES = 'THIRD_PARTY_NOTICES.md';

/** The helper record next to the executable. */
export interface HelperRecord {
  version: string;
  sha256: string;
}

/** What happened to the helper during install. */
export interface HelperOutcome {
  state: 'installed' | 'kept' | 'removed' | 'absent' | 'unsupported';
  warnings: string[];
}

/** The helper is delivered only where it runs: macOS on Apple Silicon. */
export function helperSupported(platform: NodeJS.Platform, arch: string): boolean {
  return platform === 'darwin' && arch === 'arm64';
}

/** Package paths (`node_modules/<name>`) of package-lock.json that are not dev; [] without a lock. */
export async function runtimePackages(fs: InstallerFs, platform: NodeJS.Platform, root: string): Promise<string[]> {
  const text = await fs.readText(pathApi(platform).join(root, 'package-lock.json'));
  if (text === undefined) return [];
  let lock: { packages?: Record<string, { dev?: boolean }> };
  try {
    lock = JSON.parse(text) as typeof lock;
  } catch {
    throw new ServiceError(`${pathApi(platform).join(root, 'package-lock.json')} — не JSON`);
  }
  return Object.entries(lock.packages ?? {})
    .filter(([key, entry]) => key.startsWith('node_modules/') && entry.dev !== true)
    .map(([key]) => key)
    .sort();
}

/** Runtime packages of the lock that are missing under the root (the names, without node_modules/). */
export async function missingPackages(fs: InstallerFs, platform: NodeJS.Platform, root: string): Promise<string[]> {
  const p = pathApi(platform);
  const missing: string[] = [];
  for (const key of await runtimePackages(fs, platform, root)) {
    if (!(await fs.exists(p.join(root, ...key.split('/'))))) missing.push(key.slice('node_modules/'.length));
  }
  return missing;
}

/** Refuses before any change when the source lacks a runtime package (DEPENDENCY_MISSING). */
export async function ensureDependencies(fs: InstallerFs, platform: NodeJS.Platform, sourceRoot: string): Promise<void> {
  const missing = await missingPackages(fs, platform, sourceRoot);
  if (missing.length > 0) {
    throw new ServiceError(`DEPENDENCY_MISSING: в ${pathApi(platform).join(sourceRoot, 'node_modules')} нет ${missing.join(', ')} — запустите npm ci в клоне и повторите установку`);
  }
}

/** Copies the runtime packages of the source into a copy being prepared (tmp of app/<version>). */
export async function copyDependencies(fs: InstallerFs, platform: NodeJS.Platform, sourceRoot: string, target: string): Promise<void> {
  const p = pathApi(platform);
  for (const key of await runtimePackages(fs, platform, sourceRoot)) {
    const parts = key.split('/');
    await fs.copyTree(p.join(sourceRoot, ...parts), p.join(target, ...parts), (source) => !source.endsWith('.DS_Store'));
  }
}

/** Paths of the helper files in <data>/speech; models and settings live elsewhere and stay. */
export function helperPaths(layout: ServiceLayout): { dir: string; helper: string; record: string; notices: string } {
  const p = pathApi(layout.platform);
  const dir = p.join(layout.dirs.appDir, 'speech');
  return { dir, helper: p.join(dir, HELPER_NAME), record: p.join(dir, HELPER_RECORD), notices: p.join(dir, NOTICES) };
}

/** Reads helper.json; null when missing or malformed. */
export async function readHelperRecord(fs: InstallerFs, layout: ServiceLayout): Promise<HelperRecord | null> {
  const text = await fs.readText(helperPaths(layout).record);
  if (text === undefined) return null;
  try {
    const value = JSON.parse(text) as Partial<HelperRecord>;
    return typeof value.version === 'string' && typeof value.sha256 === 'string' ? { version: value.version, sha256: value.sha256 } : null;
  } catch {
    return null;
  }
}

/** Removes exactly the helper, its record and its notices; returns what existed. */
export async function removeHelper(fs: InstallerFs, layout: ServiceLayout): Promise<string[]> {
  const paths = helperPaths(layout);
  const removed: string[] = [];
  for (const file of [paths.helper, paths.record, paths.notices]) {
    if (await fs.exists(file)) {
      await fs.remove(file);
      removed.push(file);
    }
  }
  return removed;
}

const unavailable = (version: string, why: string): string => `диктовка недоступна: helper версии ${version} ${why}`;

/**
 * Delivers the helper of this version: a release build of the source replaces the old one
 * atomically; without one an old helper stays only when helper.json names this version and the
 * bytes match. Any failure leaves no helper, so dictation never runs a helper of another version.
 */
export async function deployHelper(fs: InstallerFs, layout: ServiceLayout, sourceRoot: string, version: string, arch: string): Promise<HelperOutcome> {
  if (!helperSupported(layout.platform, arch)) return { state: 'unsupported', warnings: [] };
  const p = pathApi(layout.platform);
  const paths = helperPaths(layout);
  const artifact = p.join(sourceRoot, ...HELPER_ARTIFACT);
  if (await fs.exists(artifact)) {
    const tmp = p.join(paths.dir, `.${HELPER_NAME}.${randomBytes(4).toString('hex')}.tmp`);
    try {
      await fs.ensureDir(paths.dir);
      await fs.copyFile(artifact, tmp, 0o755);
      const sha256 = await fs.sha256(tmp);
      if (!sha256) throw new Error('временная копия исчезла');
      await fs.rename(tmp, paths.helper);
      await fs.writeText(paths.record, `${JSON.stringify({ version, sha256 } satisfies HelperRecord, null, 2)}\n`);
      const notices = p.join(sourceRoot, NOTICES);
      if (await fs.exists(notices)) await fs.copyFile(notices, paths.notices, 0o644);
      return { state: 'installed', warnings: [] };
    } catch (error) {
      await fs.remove(tmp);
      await removeHelper(fs, layout);
      return { state: 'removed', warnings: [unavailable(version, `не установлен: ${error instanceof Error ? error.message : String(error)}`)] };
    }
  }
  const record = await readHelperRecord(fs, layout);
  const sha256 = await fs.sha256(paths.helper);
  if (record && record.version === version && sha256 === record.sha256) return { state: 'kept', warnings: [] };
  const removed = await removeHelper(fs, layout);
  return { state: removed.length > 0 ? 'removed' : 'absent', warnings: [unavailable(version, 'не собран (cargo build --release --locked)')] };
}
