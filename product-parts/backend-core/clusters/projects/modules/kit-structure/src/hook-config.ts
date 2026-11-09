// Kit hook entries inside .claude/settings.json and .codex/hooks.json (structure v2): SessionStart,
// Stop and UserPromptSubmit. Both files use { hooks: { <Event>: [{ matcher?, hooks: [{ type,
// command, timeout? }] }] } }; foreign entries stay where they are, and a Kit group is only ever
// appended at the end of its event list (Codex approves hooks by position).
import { defaultHookHost, forwardSlashes, hookArgs, hookText, powershellHookCommand } from './hook-host.ts';
import type { HookHost } from './hook-host.ts';
import { hookCommand, KIT_HOOK_EVENTS } from './templates.ts';
import type { HookClient, KitHookEvent } from './templates.ts';

/** Hook event of structure v1 (kept for callers that only care about the session start). */
export const HOOK_EVENT = 'SessionStart';

/** Seconds a Stop hook may wait for the service (the service answers within 9 minutes). */
export const STOP_HOOK_TIMEOUT_S = 600;
/** Seconds a UserPromptSubmit hook may take. */
export const PROMPT_HOOK_TIMEOUT_S = 30;

/** The config file has a shape Kit cannot safely edit (not an object, hooks not an object...). */
export class HookConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookConfigError';
  }
}

/** Where a Kit hook was found. */
export type HookLookup =
  | { kind: 'none' }
  | { kind: 'found'; group: number; index: number; hook: Record<string, unknown> };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SUBCOMMANDS: Readonly<Record<KitHookEvent, string>> = {
  SessionStart: 'session-start',
  Stop: 'stop',
  UserPromptSubmit: 'prompt',
};

/**
 * The hook object Kit writes for a client and an event (SessionStart by default). Windows (spec M5
 * section 6): Claude gets the exec form { command: node.exe, args: [wfk.mjs, hook, …] }, Codex keeps
 * the POSIX command and gets commandWindows (PowerShell).
 */
export function kitHookEntry(client: HookClient, event: KitHookEvent = 'SessionStart', host: HookHost = defaultHookHost()): JsonObject {
  const entry: JsonObject = { type: 'command', command: hookCommand(client, event) };
  if (host.platform === 'win32' && client === 'claude') {
    entry['command'] = forwardSlashes(host.node);
    entry['args'] = [forwardSlashes(host.launcher), ...hookArgs(SUBCOMMANDS[event], client)];
  } else if (host.platform === 'win32') {
    entry['commandWindows'] = powershellHookCommand(host, SUBCOMMANDS[event], client);
  }
  const timeout = event === 'Stop' ? STOP_HOOK_TIMEOUT_S : event === 'UserPromptSubmit' ? PROMPT_HOOK_TIMEOUT_S : undefined;
  // Claude reads `timeout`, Codex reads `timeoutSec` (seconds in both).
  if (timeout !== undefined) entry[client === 'codex' ? 'timeoutSec' : 'timeout'] = timeout;
  return entry;
}

/** True for text that calls the Kit launcher: ~/.local/bin/wfk, or wfk.mjs on Windows. */
function callsLauncher(text: string): boolean {
  return text.includes('/.local/bin/wfk') || text.includes('wfk.mjs');
}

/** True for a command that runs the Kit launcher's hook of an event (any client, any edit around it). */
export function isKitEventCommand(command: unknown, event: KitHookEvent): boolean {
  return typeof command === 'string' && callsLauncher(command) && command.includes(`hook ${SUBCOMMANDS[event]} `);
}

/** True for the Kit SessionStart hook command. */
export function isKitHookCommand(command: unknown): boolean {
  return typeof command === 'string' && callsLauncher(command) && command.includes('hook session-start');
}

/** True for a Kit hook entry of any event: command, exec-form args or commandWindows. */
export function isKitHookEntry(hook: unknown): boolean {
  return isObject(hook) && KIT_HOOK_EVENTS.some((event) => isKitEventCommand(hookText(hook), event));
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

/** The group list of an event, validating the shape on the way; undefined when absent. */
function eventGroups(config: unknown, event: string): unknown[] | undefined {
  if (config === undefined) return undefined;
  if (!isObject(config)) throw new HookConfigError('the file must contain a JSON object');
  const hooks = config['hooks'];
  if (hooks === undefined) return undefined;
  if (!isObject(hooks)) throw new HookConfigError('"hooks" must be an object');
  const groups = hooks[event];
  if (groups === undefined) return undefined;
  if (!Array.isArray(groups)) throw new HookConfigError(`"hooks.${event}" must be an array`);
  return groups;
}

/** Finds the first Kit hook of an event (SessionStart by default). Throws HookConfigError on a bad shape. */
export function findKitHook(config: unknown, event: KitHookEvent = 'SessionStart'): HookLookup {
  const groups = eventGroups(config, event) ?? [];
  for (const [group, entry] of groups.entries()) {
    if (!isObject(entry) || !Array.isArray(entry['hooks'])) continue;
    for (const [index, hook] of entry['hooks'].entries()) {
      if (isObject(hook) && isKitEventCommand(hookText(hook), event)) return { kind: 'found', group, index, hook };
    }
  }
  return { kind: 'none' };
}

/**
 * Returns a copy of the config with the Kit hook of one event written: replaced in place when it
 * exists, otherwise appended as a new group at the end of the event list.
 */
export function withKitHook(config: unknown, client: HookClient, event: KitHookEvent = 'SessionStart', host: HookHost = defaultHookHost()): JsonObject {
  const copy: JsonObject = config === undefined ? {} : (structuredClone(config) as JsonObject);
  const lookup = findKitHook(copy, event);
  const entry = kitHookEntry(client, event, host);
  if (lookup.kind === 'found') {
    const groups = eventGroups(copy, event) ?? [];
    const group = groups[lookup.group] as JsonObject;
    (group['hooks'] as unknown[])[lookup.index] = entry;
    return copy;
  }
  const hooks = isObject(copy['hooks']) ? copy['hooks'] : {};
  copy['hooks'] = hooks;
  const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
  hooks[event] = groups;
  groups.push({ hooks: [entry] });
  return copy;
}

/** All Kit hooks of structure v2 written into a config. */
export function withKitHooks(config: unknown, client: HookClient, host: HookHost = defaultHookHost()): JsonObject {
  let result: unknown = config;
  for (const event of KIT_HOOK_EVENTS) result = withKitHook(result, client, event, host);
  return result as JsonObject;
}

/**
 * The managed text of the Kit hooks of a config: undefined without any Kit hook; the v1 form
 * (the SessionStart entry alone) when only that one exists, so a v1 manifest hash still matches;
 * otherwise the normalized object { <event>: entry } of the Kit hooks found.
 */
export function kitHooksText(config: unknown): string | undefined {
  const found: JsonObject = {};
  for (const event of KIT_HOOK_EVENTS) {
    const lookup = findKitHook(config, event);
    if (lookup.kind === 'found') found[event] = lookup.hook;
  }
  const events = Object.keys(found);
  if (events.length === 0) return undefined;
  if (events.length === 1 && events[0] === 'SessionStart') return normalizeHook(found['SessionStart']);
  return normalizeHook(found);
}

/** The managed text Kit writes for a client (all events). */
export function expectedKitHooksText(client: HookClient, host: HookHost = defaultHookHost()): string {
  const all: JsonObject = {};
  for (const event of KIT_HOOK_EVENTS) all[event] = kitHookEntry(client, event, host);
  return normalizeHook(all);
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
