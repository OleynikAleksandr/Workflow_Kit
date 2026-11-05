// Codex sessions: created through the Mac-wide daemon (so the ChatGPT apps paired with this Mac
// can open them) and listed from the hook journal plus the panel's own records, with thread names
// from ~/.codex/session_index.jsonl.
import { readJsonFile, writeJsonAtomic } from '#data-store';
import { ProviderError, hookSessionInfo, providerSessionsFile, readHookSessions } from '#provider-registry';
import type { Project, SessionInfo, SessionLinks } from '#provider-registry';
import { parseSessionIndex, projectTrustLevel } from './codex-files.ts';
import type { CodexRuntime } from './runtime.ts';

/** A session created by the panel (sessions/codex.json). */
export interface CodexRecord {
  threadId: string;
  projectId: string;
  projectPath: string;
  title: string;
  createdAt: string;
  model?: string;
}

/**
 * Parameters of the service turn. The turn only makes Codex write the thread (ChatGPT does not
 * open an empty one): no writes (readOnly, no network) and no approval prompts, since nobody
 * would answer them. Per the protocol schema they also apply to later turns unless the client of
 * that turn overrides them; to be checked on the device at acceptance.
 */
export const SERVICE_TURN_POLICY = { sandboxPolicy: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never' } as const;

/** How long createSession waits for the service turn to finish (it does not fail after that). */
export const SERVICE_TURN_WAIT_MS = 15_000;

/** Text of the service turn. */
export function serviceTurnText(projectName: string): string {
  return `Сессия создана панелью Workflow Kit для проекта «${projectName}». Ответь одним словом: готов.`;
}

/** codex://threads/<id> opens the thread in ChatGPT on the Mac and on the iPad. */
export function threadLinks(threadId: string): SessionLinks {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(threadId)) return {};
  const link = `codex://threads/${threadId}`;
  return { desktop: link, mobile: link };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecords(value: unknown): CodexRecord[] {
  const list = isObject(value) && Array.isArray(value['sessions']) ? value['sessions'] : [];
  return list.filter((r): r is CodexRecord =>
    isObject(r) && typeof r['threadId'] === 'string' && typeof r['projectId'] === 'string' && typeof r['projectPath'] === 'string' &&
    typeof r['title'] === 'string' && typeof r['createdAt'] === 'string');
}

/** Session methods of the provider. */
export interface SessionParts {
  listSessions(project: Project): Promise<SessionInfo[]>;
  createSession(project: Project, opts: { title: string }): Promise<SessionInfo>;
  /** Panel records (tests and removeBlockers use them). */
  records(): Promise<CodexRecord[]>;
}

/** Creates the session methods over the runtime. */
export function createSessionParts(rt: CodexRuntime): SessionParts {
  const { context, paths } = rt;
  const file = providerSessionsFile(context.dirs, 'codex');
  let names: { text: string | null; map: Map<string, string> } = { text: null, map: new Map() };

  const threadNames = async (): Promise<Map<string, string>> => {
    const text = await rt.readText(paths.sessionIndex).catch(() => null);
    if (text !== names.text) names = { text, map: text ? parseSessionIndex(text) : new Map() };
    return names.map;
  };

  const records = async (): Promise<CodexRecord[]> => {
    try {
      return parseRecords(await readJsonFile(file));
    } catch {
      return [];
    }
  };

  const links = (id: string): SessionLinks => (context.platform === 'win32' ? {} : threadLinks(id));

  return {
    records,

    async listSessions(project) {
      const [journal, own, titles] = await Promise.all([readHookSessions(project, 'codex'), records(), threadNames()]);
      const byId = new Map<string, SessionInfo>();
      for (const record of own.filter((r) => r.projectId === project.id || r.projectPath === project.path)) {
        const info: SessionInfo = {
          provider: 'codex',
          localId: record.threadId,
          remoteId: record.threadId,
          title: titles.get(record.threadId) ?? record.title,
          createdAt: record.createdAt,
          origin: 'panel',
          state: 'unknown',
          links: links(record.threadId),
          cwd: record.projectPath,
        };
        if (record.model) info.model = record.model;
        byId.set(record.threadId, info);
      }
      for (const session of journal) {
        const existing = byId.get(session.sessionId);
        if (existing) {
          if (session.model) existing.model = session.model;
          continue;
        }
        const title = titles.get(session.sessionId);
        byId.set(session.sessionId, hookSessionInfo('codex', session, { remoteId: session.sessionId, links: links(session.sessionId), ...(title ? { title } : {}) }));
      }
      return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createSession(project, opts) {
      const daemon = await rt.daemon(true);
      if (!daemon.running) {
        throw new ProviderError('daemon-not-running', 'Демон Codex не запущен', { hint: 'Нажмите «Запустить демон» в карточке Codex.' });
      }
      if (daemon.remoteControl === 'errored') {
        throw new ProviderError('codex-login', 'Демон Codex не подключён к ChatGPT', { hint: 'Выполните codex login в Терминале, затем «Запустить демон».' });
      }
      const config = await rt.readText(paths.config);
      if (projectTrustLevel(config ?? '', project.path) !== 'trusted') {
        throw new ProviderError('not-trusted', 'Папка не доверена Codex', { hint: 'Сначала «Доверять» папке в Codex: иначе хук Kit не сработает.' });
      }
      const created = await rt.withDaemon(async (session) => {
        const started = await session.request<{ thread?: { id?: unknown }; model?: unknown }>('thread/start', { cwd: project.path });
        const threadId = started?.thread?.id;
        if (typeof threadId !== 'string' || threadId === '') throw new ProviderError('bad-answer', 'Codex не вернул id треда', { hint: 'Обновите Codex CLI.' });
        await session.request('thread/name/set', { threadId, name: opts.title });
        await session.request('turn/start', {
          threadId,
          input: [{ type: 'text', text: serviceTurnText(project.name) }],
          ...SERVICE_TURN_POLICY,
        });
        await session.waitForNotification('turn/completed', SERVICE_TURN_WAIT_MS);
        return { threadId, model: typeof started.model === 'string' ? started.model : undefined };
      }, 60_000);
      const record: CodexRecord = {
        threadId: created.threadId,
        projectId: project.id,
        projectPath: project.path,
        title: opts.title,
        createdAt: context.now().toISOString(),
        ...(created.model ? { model: created.model } : {}),
      };
      await writeJsonAtomic(file, { version: 1, sessions: [...(await records()), record] });
      context.log(`codex: session ${record.threadId} created in ${project.path}`);
      const info: SessionInfo = {
        provider: 'codex',
        localId: record.threadId,
        remoteId: record.threadId,
        title: record.title,
        createdAt: record.createdAt,
        origin: 'panel',
        state: 'unknown',
        links: links(record.threadId),
        cwd: project.path,
      };
      if (record.model) info.model = record.model;
      return info;
    },
  };
}
