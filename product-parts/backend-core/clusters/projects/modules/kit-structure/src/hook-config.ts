// The Kit SessionStart hook entry inside .claude/settings.json and .codex/hooks.json. Both files
// use { hooks: { SessionStart: [{ matcher?, hooks: [{ type, command }] }] } }; foreign entries
// stay where they are, and the Kit group is only ever appended at the end (Codex approves hooks
// by position).
import { hookCommand } from './templates.ts';
import type { HookClient } from './templates.ts';

/** Hook event Kit listens to. */
export const HOOK_EVENT = 'SessionStart';

/** The config file has a shape Kit cannot safely edit (not an object, hooks not an object...). */
export class HookConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookConfigError';
  }
}

/** Where the Kit hook was found. */
export type HookLookup =
  | { kind: 'none' }
  | { kind: 'found'; group: number; index: number; hook: Record<string, unknown> };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The hook object Kit writes for a client. */
export function kitHookEntry(client: HookClient): JsonObject {
  return { type: 'command', command: hookCommand(client) };
}

/** True for a command that runs the Kit launcher's session-start hook (any client, any edit around it). */
export function isKitHookCommand(command: unknown): boolean {
  return typeof command === 'string' && command.includes('/.local/bin/wfk') && command.includes('hook session-start');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isObject(value)) return value;
  const sorted: JsonObject = {};
  for (const key of Object.keys(value).sort()) sorted[key] = sortKeys(value[key]);
  return sorted;
}

/** Normalized text of a hook entry (keys sorted, no spaces); its sha256 goes into the manifest. */
export function normalizeHook(hook: unknown): string {
  return JSON.stringify(sortKeys(hook));
}

/** The SessionStart group list, validating the shape on the way; undefined when absent. */
function sessionStartGroups(config: unknown): unknown[] | undefined {
  if (config === undefined) return undefined;
  if (!isObject(config)) throw new HookConfigError('the file must contain a JSON object');
  const hooks = config['hooks'];
  if (hooks === undefined) return undefined;
  if (!isObject(hooks)) throw new HookConfigError('"hooks" must be an object');
  const groups = hooks[HOOK_EVENT];
  if (groups === undefined) return undefined;
  if (!Array.isArray(groups)) throw new HookConfigError(`"hooks.${HOOK_EVENT}" must be an array`);
  return groups;
}

/** Finds the first Kit hook among the SessionStart groups. Throws HookConfigError on a bad shape. */
export function findKitHook(config: unknown): HookLookup {
  const groups = sessionStartGroups(config) ?? [];
  for (const [group, entry] of groups.entries()) {
    if (!isObject(entry) || !Array.isArray(entry['hooks'])) continue;
    for (const [index, hook] of entry['hooks'].entries()) {
      if (isObject(hook) && isKitHookCommand(hook['command'])) return { kind: 'found', group, index, hook };
    }
  }
  return { kind: 'none' };
}

/**
 * Returns a copy of the config with the Kit hook written: replaced in place when it exists,
 * otherwise appended as a new group at the end of SessionStart. Other entries are untouched.
 */
export function withKitHook(config: unknown, client: HookClient): JsonObject {
  const copy: JsonObject = config === undefined ? {} : (structuredClone(config) as JsonObject);
  const lookup = findKitHook(copy);
  const entry = kitHookEntry(client);
  if (lookup.kind === 'found') {
    const groups = sessionStartGroups(copy) ?? [];
    const group = groups[lookup.group] as JsonObject;
    (group['hooks'] as unknown[])[lookup.index] = entry;
    return copy;
  }
  const hooks = isObject(copy['hooks']) ? copy['hooks'] : {};
  copy['hooks'] = hooks;
  const groups = Array.isArray(hooks[HOOK_EVENT]) ? (hooks[HOOK_EVENT] as unknown[]) : [];
  hooks[HOOK_EVENT] = groups;
  groups.push({ hooks: [entry] });
  return copy;
}

/** Indentation used by an existing JSON text (default two spaces). */
export function detectIndent(text: string): string {
  const match = /^[ \t]+(?=")/m.exec(text);
  return match ? match[0] : '  ';
}

/** Serializes a config the way Kit writes it: existing indentation and a final newline. */
export function formatJson(value: unknown, previousText?: string): string {
  return `${JSON.stringify(value, null, previousText ? detectIndent(previousText) : 2)}\n`;
}
