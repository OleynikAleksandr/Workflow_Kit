// Hooks of a project for Codex: the project's own .codex/hooks.json read locally, merged with what
// `hooks/list` of the app-server reports (key, currentHash, trustStatus). Only the Kit hook whose
// command equals hookCommand('codex') exactly may be approved.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hookCommand, isKitHookCommand } from '#kit-structure';
import type { HookEntry, HookState } from '#provider-registry';

/** Exact command of the Kit hook for Codex (spec section 7). */
export const KIT_HOOK_COMMAND = hookCommand('codex');

/** A hook as `hooks/list` reports it (fields Codex 0.166 returns). */
export interface ListedHook {
  key: string;
  eventName: string;
  command: string;
  sourcePath: string;
  currentHash: string;
  trustStatus: string;
}

/** A hook found in the project's .codex/hooks.json. */
export interface LocalHook {
  key: string;
  event: string;
  command: string;
}

/** Path of the project's Codex hooks file. */
export function projectHooksFile(projectPath: string): string {
  return path.join(projectPath, '.codex', 'hooks.json');
}

/** SessionStart → session_start (the event part of Codex approval keys). */
export function snakeEvent(event: string): string {
  return event.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Hooks of a parsed hooks.json with the positional keys Codex uses (<file>:<event>:<group>:<index>). */
export function localHooks(file: string, config: unknown): LocalHook[] {
  const result: LocalHook[] = [];
  if (!isObject(config) || !isObject(config['hooks'])) return result;
  for (const [event, groups] of Object.entries(config['hooks'])) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, g) => {
      if (!isObject(group) || !Array.isArray(group['hooks'])) return;
      group['hooks'].forEach((hook, i) => {
        if (!isObject(hook)) return;
        const command = typeof hook['command'] === 'string' ? hook['command'] : `(${String(hook['type'] ?? 'hook')})`;
        result.push({ key: `${file}:${snakeEvent(event)}:${g}:${i}`, event, command });
      });
    });
  }
  return result;
}

/** Reads the project's hooks.json: its text (null when missing) and hooks (error when invalid JSON). */
export async function readLocalHooks(projectPath: string): Promise<{ text: string | null; hooks: LocalHook[]; error: string | null }> {
  const file = projectHooksFile(projectPath);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { text: null, hooks: [], error: null };
    throw error;
  }
  try {
    return { text, hooks: localHooks(file, JSON.parse(text)), error: null };
  } catch {
    return { text, hooks: [], error: '.codex/hooks.json — невалидный JSON' };
  }
}

/** Project hooks from a hooks/list answer (the user's global hooks are left out). */
export function listedProjectHooks(answer: unknown, projectPath: string): ListedHook[] {
  const own = projectHooksFile(projectPath);
  const data = isObject(answer) && Array.isArray(answer['data']) ? answer['data'] : [];
  const result: ListedHook[] = [];
  for (const entry of data) {
    if (!isObject(entry) || !Array.isArray(entry['hooks'])) continue;
    for (const hook of entry['hooks']) {
      if (!isObject(hook) || hook['sourcePath'] !== own || typeof hook['key'] !== 'string') continue;
      if (result.some((h) => h.key === hook['key'])) continue;
      result.push({
        key: hook['key'],
        eventName: typeof hook['eventName'] === 'string' ? hook['eventName'] : '',
        command: typeof hook['command'] === 'string' ? hook['command'] : '',
        sourcePath: own,
        currentHash: typeof hook['currentHash'] === 'string' ? hook['currentHash'] : '',
        trustStatus: typeof hook['trustStatus'] === 'string' ? hook['trustStatus'] : 'unknown',
      });
    }
  }
  return result;
}

/** Codex trustStatus → contract status. */
export function hookStatus(trustStatus: string | undefined): HookEntry['status'] {
  if (trustStatus === 'trusted' || trustStatus === 'managed') return 'approved';
  if (trustStatus === 'untrusted') return 'pending';
  if (trustStatus === 'modified') return 'modified';
  return 'unknown';
}

/** Inputs of buildHookState. */
export interface HookStateInput {
  local: { text: string | null; hooks: LocalHook[]; error: string | null };
  /** hooks/list result for this project; null when not read (yet or at all). */
  listed: ListedHook[] | null;
  trusted: boolean | null;
  /** Why listed is null or stale (e.g. "проверяется…", an error message). */
  pendingNote?: string | null;
}

/** The contract HookState: the Kit hook first, foreign hooks with command and hash, completeness. */
export function buildHookState(input: HookStateInput): HookState {
  const byKey = new Map((input.listed ?? []).map((h) => [h.key, h]));
  const keys = new Set<string>();
  const entries: HookEntry[] = [];
  for (const hook of input.local.hooks) {
    keys.add(hook.key);
    const listed = byKey.get(hook.key);
    const command = listed?.command || hook.command;
    entries.push({ command, hash: listed?.currentHash ?? '', kit: command === KIT_HOOK_COMMAND, status: hookStatus(listed?.trustStatus), key: hook.key });
  }
  for (const listed of input.listed ?? []) {
    if (keys.has(listed.key)) continue;
    entries.push({ command: listed.command, hash: listed.currentHash, kit: listed.command === KIT_HOOK_COMMAND, status: hookStatus(listed.trustStatus), key: listed.key });
  }
  const kitHook = entries.find((e) => e.kit) ?? null;
  const hooks = entries.filter((e) => e !== kitHook);
  const notes: string[] = [];
  let complete: boolean | null = false;
  if (input.local.error) notes.push(input.local.error);
  if (!kitHook) {
    const edited = hooks.some((h) => isKitHookCommand(h.command));
    notes.push(edited ? 'команда хука Kit изменена вручную — переустановите структуру' : 'хук Kit не установлен (карточка «Структура»)');
  } else if (input.trusted === false) {
    notes.push('папка не доверена Codex — хуки проекта не выполняются');
  } else if (input.listed === null) {
    complete = null;
    notes.push(input.pendingNote ?? 'состояние хуков ещё не проверено');
  } else if (kitHook.status !== 'approved') {
    notes.push(kitHook.status === 'modified' ? 'хук Kit изменён после одобрения — одобрите заново' : 'хук Kit не одобрен — «Одобрить хук»');
  } else {
    complete = true;
  }
  if (complete === false) notes.push('список сессий неполон: сессии, начатые в ChatGPT, не попадают в журнал');
  else if (complete === true && input.pendingNote) notes.push(input.pendingNote);
  return { kitHook, hooks, complete, ...(notes.length > 0 ? { note: notes.join('; ') } : {}) };
}
