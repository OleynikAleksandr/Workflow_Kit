// The `kimi` program: where it is and which version it reports (spec M8, section 2.1).
import { access } from 'node:fs/promises';
import { cleanEnv } from '#process-supervisor';
import type { ProviderContext } from '#provider-registry';
import type { KimiPaths } from './paths.ts';

/** The oldest Kimi Code this provider works with. */
export const MIN_KIMI_VERSION = '2.5.2';

/** Note of a version below MIN_KIMI_VERSION. */
export const OLD_VERSION_NOTE = `нужна версия Kimi Code не ниже ${MIN_KIMI_VERSION}`;

/** What is known about the program; installed null means never checked. */
export interface ProgramState {
  path: string | null;
  version: string | null;
  installed: boolean | null;
  error: string | null;
  /** Set when the version is too old. */
  unsupported: string | null;
  checkedAt: string | null;
}

/** State before the first check. */
export const UNCHECKED_PROGRAM: ProgramState = { path: null, version: null, installed: null, error: null, unsupported: null, checkedAt: null };

/** First x.y.z of the output of `kimi --version`. */
export function parseVersion(output: string): string | null {
  return /\b(\d+\.\d+\.\d+)\b/.exec(output)?.[1] ?? null;
}

/** Negative, zero or positive: order of two x.y.z versions. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True for the line of versions that was checked with Workflow Kit (2.5.x). */
export function testedVersion(version: string): boolean {
  return /^2\.5\./.test(version);
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** The path saved by `wfk install`, else the program inside the Kimi home; null when neither exists. */
export async function findKimiProgram(saved: string | undefined, paths: KimiPaths): Promise<string | null> {
  for (const candidate of [saved, paths.program]) if (candidate && (await exists(candidate))) return candidate;
  return null;
}

/** Finds the program and runs `kimi --version`. */
export async function readProgram(context: ProviderContext, paths: KimiPaths): Promise<ProgramState> {
  const checkedAt = context.now().toISOString();
  const found = await findKimiProgram(context.config.programs['kimi'], paths);
  if (!found) return { ...UNCHECKED_PROGRAM, installed: false, error: 'Kimi Code не найден', checkedAt };
  const result = await context.runCommand(found, ['--version'], { cwd: context.homedir, env: cleanEnv(context.env, { platform: context.platform }), timeoutMs: 15_000 });
  if (result.startError) return { ...UNCHECKED_PROGRAM, path: found, installed: false, error: `kimi не запустился: ${result.startError}`, checkedAt };
  const version = parseVersion(`${result.stdout}\n${result.stderr}`);
  if (!version) {
    const reason = result.timedOut ? 'не ответил за 15 с' : `код ${result.code}`;
    return { ...UNCHECKED_PROGRAM, path: found, installed: true, error: `kimi --version: ${reason}`, checkedAt };
  }
  const unsupported = compareVersions(version, MIN_KIMI_VERSION) < 0 ? OLD_VERSION_NOTE : null;
  return { path: found, version, installed: true, error: null, unsupported, checkedAt };
}
