// The auto-compact window Claude Code applies to a model (M28 3.1). Claude's statusline input
// carries only the model window; /context counts against this threshold. Read-only.
import path from 'node:path';
import { readFile } from 'node:fs/promises';

export const AUTO_COMPACT_MIN = 100_000;
export const AUTO_COMPACT_MAX = 1_000_000;
export type AutoCompactSource = 'env' | 'managed' | 'project-local' | 'project' | 'user';
export interface AutoCompactWindow { window: number; source: AutoCompactSource }
export interface AutoCompactDeps {
  platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; cwd: string; homedir: string;
  read?: (file: string) => Promise<string>;
}
const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'];
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** The managed-settings.json of the machine (Claude Code 2.1.325 paths); MDM and server policy are not read. */
export function managedSettingsFile(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') return path.posix.join('/Library/Application Support/ClaudeCode', 'managed-settings.json');
  if (platform === 'linux') return path.posix.join('/etc/claude-code', 'managed-settings.json');
  if (platform === 'win32') return path.win32.join('C:\\Program Files\\ClaudeCode', 'managed-settings.json');
  return null;
}

/** 'auto' stops the search (the model window applies); an out-of-range or malformed value is skipped. */
type Value = { kind: 'window'; window: number } | { kind: 'auto' } | null;
function value(raw: unknown): Value {
  if (raw === 'auto') return { kind: 'auto' };
  const n = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  return typeof n === 'number' && Number.isInteger(n) && n >= AUTO_COMPACT_MIN && n <= AUTO_COMPACT_MAX ? { kind: 'window', window: n } : null;
}
/** Within one layer: the exact model id, then a family alias (opus, sonnet, ...), then the general key. */
function layerValue(settings: Record<string, unknown>, modelId: string): Value {
  const models = object(settings['modelSettings']);
  const family = /^claude-([a-z]+)-/.exec(modelId)?.[1];
  const keys = [modelId, ...(family && FAMILIES.includes(family) ? [family] : [])];
  for (const key of keys) {
    if (!Object.hasOwn(models, key)) continue;
    const found = value(object(models[key])['autoCompactWindow']);
    if (found) return found;
  }
  return value(settings['autoCompactWindow']);
}

/** Null when no threshold applies: the model window is the denominator then. */
export async function resolveAutoCompactWindow(modelId: string | null, deps: AutoCompactDeps): Promise<AutoCompactWindow | null> {
  const platform = deps.platform ?? process.platform; const env = deps.env ?? process.env;
  const read = deps.read ?? (file => readFile(file, 'utf8'));
  const fromEnv = value(env['CLAUDE_CODE_AUTO_COMPACT_WINDOW']);
  if (fromEnv) return fromEnv.kind === 'window' ? { window: fromEnv.window, source: 'env' } : null;
  if (!modelId) return null;
  const p = platform === 'win32' ? path.win32 : path.posix;
  const managed = managedSettingsFile(platform);
  const layers: Array<[AutoCompactSource, string | null]> = [
    ['managed', managed], ['project-local', p.join(deps.cwd, '.claude', 'settings.local.json')],
    ['project', p.join(deps.cwd, '.claude', 'settings.json')], ['user', p.join(deps.homedir, '.claude', 'settings.json')],
  ];
  for (const [source, file] of layers) {
    if (!file) continue;
    let settings: Record<string, unknown>;
    try { settings = object(JSON.parse(await read(file))); } catch { continue; /* Absent or malformed: next layer. */ }
    const found = layerValue(settings, modelId);
    if (found) return found.kind === 'window' ? { window: found.window, source } : null;
  }
  return null;
}
