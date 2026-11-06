// The Claude provider (docs/planning/M1-providers.md, section 2) assembled from its parts: status
// and capabilities, trust, the Kit hook, sessions and the folder environment.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ProviderError, createTokenStore } from '#provider-registry';
import type { HookEntry, HookState, Project, ProjectProviderState, Provider, ProviderContext, ProviderStatus, TrustState } from '#provider-registry';
import { findKitHook, isKitHookCommand, normalizeHook, sha256 } from '#kit-structure';
import { ENVIRONMENT_START, ENVIRONMENT_STOP, environmentActions, environmentBlockers, startEnvironment, stopEnvironment } from './environment.ts';
import { claudeCapabilities, ptyUnavailableReason } from './programs.ts';
import { PROVIDER_ID, createRuntime } from './runtime.ts';
import type { ClaudeProviderOptions, ClaudeRuntime } from './runtime.ts';
import { createSession, listSessions, renameSession, resumeSession, stopSession } from './sessions.ts';
import { grantTrust, previewTrust, readTrust } from './trust.ts';

/** Claude settings files whose hooks are listed (the Kit hook lives in the first one). */
const SETTINGS_FILES = ['.claude/settings.json', '.claude/settings.local.json'];

async function status(rt: ClaudeRuntime): Promise<ProviderStatus> {
  const [programs, config] = await Promise.all([rt.programs(), rt.claudeConfig.read()]);
  const reason = ptyUnavailableReason(rt.context.platform, programs, rt.version());
  const account = config.loggedIn === true ? 'вход выполнен' : config.loggedIn === false ? 'нет входа' : 'неизвестно';
  const base = {
    implemented: true,
    installed: programs.claude !== null,
    version: rt.version(),
    path: programs.claude,
    checkedAt: rt.checkedAt(),
    details: { expect: programs.expect ?? 'не найден', account, config: config.error ? `${config.file}: ${config.error}` : config.file },
  };
  if (!programs.claude) return { ...base, state: 'not-installed', label: 'не установлен', note: reason ?? 'claude не найден' };
  if (reason) return { ...base, state: 'unavailable', label: 'недоступно', note: reason };
  if (config.loggedIn === false) return { ...base, state: 'ready', label: 'готов', note: 'в ~/.claude.json нет входа: выполните claude, затем /login' };
  return { ...base, state: 'ready', label: 'готов' };
}

async function readSettings(file: string): Promise<{ config?: unknown; error?: string }> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return {};
  }
  try {
    return { config: JSON.parse(text) as unknown };
  } catch {
    return { error: 'не читается как JSON' };
  }
}

function hookEntries(config: unknown): HookEntry[] {
  const entries: HookEntry[] = [];
  const hooks = (config as { hooks?: unknown } | undefined)?.hooks;
  if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) return entries;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups as Array<{ hooks?: unknown }>) {
      if (!Array.isArray(group?.hooks)) continue;
      for (const hook of group.hooks as Array<Record<string, unknown>>) {
        const command = typeof hook?.['command'] === 'string' ? hook['command'] : JSON.stringify(hook);
        // Claude runs the hooks of a trusted folder without a separate approval.
        entries.push({ command, hash: sha256(normalizeHook(hook)), kit: isKitHookCommand(command), status: 'approved', key: event });
      }
    }
  }
  return entries;
}

/** The Kit hook and the other hooks of the folder; Claude needs no hook approval. */
async function hooks(project: Project): Promise<HookState> {
  const all: HookEntry[] = [];
  const problems: string[] = [];
  let kitHook: HookEntry | null = null;
  for (const relative of SETTINGS_FILES) {
    const { config, error } = await readSettings(path.join(project.path, ...relative.split('/')));
    if (error) problems.push(`${relative}: ${error}`);
    const entries = hookEntries(config);
    all.push(...entries);
    if (!kitHook && relative === SETTINGS_FILES[0]) {
      let found = false;
      try {
        found = findKitHook(config).kind === 'found';
      } catch {
        found = false;
      }
      kitHook = found ? (entries.find((e) => e.kit && e.key === 'SessionStart') ?? null) : null;
    }
  }
  const note = [
    ...(kitHook ? [] : ['хук Kit не найден в .claude/settings.json: сессии, начатые в приложениях, не попадут в список (установите структуру Kit)']),
    ...problems,
  ].join('; ');
  return { kitHook, hooks: all.filter((e) => e !== kitHook), complete: kitHook !== null, ...(note ? { note } : {}) };
}

/** Creates the Claude provider; options shorten waits in tests. */
export function createClaudeProvider(context: ProviderContext, options: ClaudeProviderOptions = {}): Provider {
  const rt = createRuntime(context, options);
  const tokens = createTokenStore({ now: context.now });
  /** Copies of ~/.claude.json taken by the last grantTrust per folder (until the service restarts). */
  const backups = new Map<string, string | null>();

  const provider: Provider = {
    id: PROVIDER_ID,
    title: 'Claude',
    capabilities: async () => claudeCapabilities(context.platform, await rt.programs(), rt.version()),
    status: () => status(rt),
    async refresh() {
      await rt.refresh();
      rt.bridge.clear();
      return status(rt);
    },
    previewTrust: (project) => previewTrust(rt, tokens, project),
    async grantTrust(project, token, choices) {
      const state = await grantTrust(rt, tokens, project, token, choices ?? {});
      if (state.backup !== undefined) backups.set(project.path, state.backup);
      return state;
    },
    async trust(project): Promise<TrustState> {
      const state = await readTrust(rt, project);
      return backups.has(project.path) ? { ...state, backup: backups.get(project.path) ?? null } : state;
    },
    hooks,
    listSessions: (project) => listSessions(rt, project),
    createSession: (project, opts) => createSession(rt, project, opts.title, opts.firstMessage),
    resumeSession: (project, sid) => resumeSession(rt, project, sid),
    stopSession: (project, sid) => stopSession(rt, project, sid),
    renameSession: (project, sid, name) => renameSession(rt, project, sid, name),
    actions: async (project) => (project ? environmentActions(rt, project) : []),
    async runAction(id, project) {
      if (!project || (id !== ENVIRONMENT_START && id !== ENVIRONMENT_STOP)) {
        throw new ProviderError('unknown-action', `Claude: нет действия ${id}`, { status: 404 });
      }
      if (id === ENVIRONMENT_START) await startEnvironment(rt, project);
      else await stopEnvironment(rt, project);
      return projectState(project);
    },
    removeBlockers: (project) => environmentBlockers(rt, project),
  };

  async function projectState(project: Project): Promise<ProjectProviderState> {
    const [trust, hookState, sessions, actions] = await Promise.all([
      provider.trust(project),
      hooks(project),
      listSessions(rt, project),
      environmentActions(rt, project),
    ]);
    return { provider: PROVIDER_ID, trust, hooks: hookState, sessions, actions, errors: {} };
  }

  return provider;
}
