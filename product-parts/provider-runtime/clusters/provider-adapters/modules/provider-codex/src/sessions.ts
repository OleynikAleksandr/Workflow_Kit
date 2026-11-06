// Codex sessions: created through the Mac-wide daemon (so the ChatGPT apps paired with this Mac
// can open them) and listed from the hook journal plus the panel's own records, with thread names
// from ~/.codex/session_index.jsonl.
import { readJsonFile, writeJsonAtomic } from '#data-store';
import { ProviderError, hookSessionInfo, providerSessionsFile, readHookSessions } from '#provider-registry';
import type { Project, RenameResult, SessionInfo, SessionLinks } from '#provider-registry';
import { parseSessionIndex, projectTrustLevel } from './codex-files.ts';
import type { RpcSession } from './rpc.ts';
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

// The service turn only makes Codex write the thread (ChatGPT does not open an empty one). It
// passes no sandboxPolicy/approvalPolicy overrides: per the protocol schema they would stick to
// the thread for later turns, so the thread keeps the user's own Codex settings (D1, as in the
// verified prototype).

/** How long createSession waits for the service turn to finish (it does not fail after that). */
export const SERVICE_TURN_WAIT_MS = 15_000;
/** How long the first message of a new session may run before the thread is released. */
export const FIRST_TURN_WAIT_MS = 180_000;

/** Timeout of thread/unsubscribe after the service turn. */
export const UNSUBSCRIBE_TIMEOUT_MS = 5_000;

/**
 * The daemon keeps a thread without subscribers loaded for about 60 s ("has no subscribers and is
 * idle; shutting down", verified 2026-11-05) and stays its only writer meanwhile: ChatGPT then
 * fails with "thread-store conflict: … already has an active writer" and says the chat is open in
 * another app. createSession waits until thread/loaded/list no longer has the thread.
 */
export const RELEASE_WAIT_MS = 90_000;

/** Interval of the thread/loaded/list polls while the daemon still holds the thread. */
export const RELEASE_POLL_MS = 2_000;

/** Note of a session whose thread the daemon still holds (no link until it is released). */
export const RELEASING_NOTE = 'Codex ещё держит чат (до минуты после создания): ссылка появится, когда он его отпустит.';

/** Note of a session whose thread was still loaded when the wait ended. */
export const HELD_NOTE = 'Codex мог ещё не отпустить чат: если ChatGPT скажет «Этот чат открыт в другом приложении», откройте его через минуту.';

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

/** Status of a thread/unsubscribe answer: unsubscribed | notSubscribed | notLoaded. */
function unsubscribeStatus(answer: unknown): string {
  return isObject(answer) && typeof answer['status'] === 'string' ? answer['status'] : 'unknown';
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
  createSession(project: Project, opts: { title: string; firstMessage?: string }): Promise<SessionInfo>;
  /** Panel records (tests and removeBlockers use them). */
  records(): Promise<CodexRecord[]>;
  /** thread/name/set, only while the daemon has the thread loaded (an open chat or a turn). */
  renameSession(project: Project, threadId: string, name: string): Promise<RenameResult>;
}

/** Why a name stays only in Workflow Kit for now. */
export const RENAME_LATER_NOTE = 'Чат сейчас не открыт: имя в ChatGPT обновится, когда в сессии начнётся ход';

/** Options of the session methods (tests shorten the waits). */
export interface SessionOptions {
  /** Wait for the first message's turn (default FIRST_TURN_WAIT_MS). */
  firstTurnWaitMs?: number;
  serviceTurnWaitMs?: number;
  releaseWaitMs?: number;
  releasePollMs?: number;
}

/** A thread created by this backend that the daemon may still hold. */
interface Releasing {
  projectId: string;
  projectPath: string;
  title: string;
  createdAt: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether thread/loaded/list (all pages) has the thread; null when the daemon did not answer. */
async function isLoaded(session: RpcSession, threadId: string): Promise<boolean | null> {
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    let answer: unknown;
    try {
      answer = await session.request('thread/loaded/list', cursor ? { cursor } : {}, UNSUBSCRIBE_TIMEOUT_MS);
    } catch {
      return null;
    }
    const data = isObject(answer) && Array.isArray(answer['data']) ? answer['data'] : [];
    if (data.includes(threadId)) return true;
    cursor = isObject(answer) && typeof answer['nextCursor'] === 'string' ? answer['nextCursor'] : null;
    if (!cursor) return false;
  }
  return false;
}

/** Creates the session methods over the runtime. */
export function createSessionParts(rt: CodexRuntime, options: SessionOptions = {}): SessionParts {
  const { context, paths } = rt;
  const turnWaitMs = options.serviceTurnWaitMs ?? SERVICE_TURN_WAIT_MS;
  const firstTurnWaitMs = options.firstTurnWaitMs ?? FIRST_TURN_WAIT_MS;
  const releaseWaitMs = options.releaseWaitMs ?? RELEASE_WAIT_MS;
  const releasePollMs = options.releasePollMs ?? RELEASE_POLL_MS;
  const releasing = new Map<string, Releasing>();
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

  /**
   * thread/start, name, service turn, thread/unsubscribe, then waits until the daemon unloads the
   * thread. The thread id goes to `started` (and to the releasing list) as soon as it is known.
   */
  const startThread = async (
    session: RpcSession,
    project: Project,
    title: string,
    started: { id: string | null },
    firstMessage: string | undefined,
  ): Promise<{ threadId: string; model?: string; held: boolean }> => {
    const answer = await session.request<{ thread?: { id?: unknown }; model?: unknown }>('thread/start', { cwd: project.path });
    const threadId = answer?.thread?.id;
    if (typeof threadId !== 'string' || threadId === '') throw new ProviderError('bad-answer', 'Codex не вернул id треда', { hint: 'Обновите Codex CLI.' });
    started.id = threadId;
    releasing.set(threadId, { projectId: project.id, projectPath: project.path, title, createdAt: context.now().toISOString() });
    try {
      await session.request('thread/name/set', { threadId, name: title });
      await session.request('turn/start', { threadId, input: [{ type: 'text', text: firstMessage ?? serviceTurnText(project.name) }] });
      await session.waitForNotification('turn/completed', firstMessage ? firstTurnWaitMs : turnWaitMs);
    } finally {
      // While this connection stays subscribed the daemon keeps the thread loaded and ChatGPT
      // says the chat is open in another app (D1): release it before the connection closes.
      await session.request('thread/unsubscribe', { threadId }, UNSUBSCRIBE_TIMEOUT_MS).then(
        (reply) => context.log(`codex: thread/unsubscribe ${threadId}: ${unsubscribeStatus(reply)}`),
        (error: unknown) => context.log(`codex: thread/unsubscribe ${threadId} failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
    // The daemon unloads an idle thread only about a minute after the unsubscribe; until then
    // ChatGPT cannot open it, so the session is handed out only once the thread is unloaded.
    let held: boolean | null = true;
    for (let waited = 0; ; waited += releasePollMs) {
      held = await isLoaded(session, threadId);
      if (held !== true || waited >= releaseWaitMs) break;
      await sleep(releasePollMs);
    }
    const outcome = held === false ? 'released by the daemon' : held === true ? `still held by the daemon after ${Math.round(releaseWaitMs / 1000)} s` : 'release not checked: thread/loaded/list failed';
    context.log(`codex: thread ${threadId} ${outcome}`);
    return { threadId, ...(typeof answer.model === 'string' ? { model: answer.model } : {}), held: held !== false };
  };

  return {
    records,

    async listSessions(project) {
      const [journal, own, titles] = await Promise.all([readHookSessions(project, 'codex'), records(), threadNames()]);
      const byId = new Map<string, SessionInfo>();
      for (const [threadId, held] of releasing) {
        if (held.projectId !== project.id && held.projectPath !== project.path) continue;
        byId.set(threadId, {
          provider: 'codex',
          localId: threadId,
          remoteId: threadId,
          title: titles.get(threadId) ?? held.title,
          createdAt: held.createdAt,
          origin: 'panel',
          state: 'running',
          links: {},
          note: RELEASING_NOTE,
          cwd: held.projectPath,
        });
      }
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
        if (!byId.has(record.threadId)) byId.set(record.threadId, info);
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
      const started: { id: string | null } = { id: null };
      try {
        const created = await rt.withDaemon(
          (session) => startThread(session, project, opts.title, started, opts.firstMessage),
          (opts.firstMessage ? firstTurnWaitMs : turnWaitMs) + UNSUBSCRIBE_TIMEOUT_MS + releaseWaitMs + 30_000,
        );
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
        if (created.held) info.note = HELD_NOTE;
        return info;
      } finally {
        // Dropped only after the record is written, so the session never vanishes from the list.
        if (started.id) releasing.delete(started.id);
      }
    },

    async renameSession(_project, threadId, name) {
      // Loading an idle thread would make the daemon hold it for a minute and ChatGPT would say
      // the chat is open in another app (D1): rename only a thread that is loaded anyway.
      return rt.withDaemon(async (session) => {
        if ((await isLoaded(session, threadId)) !== true) return { synced: false, note: RENAME_LATER_NOTE };
        await session.request('thread/name/set', { threadId, name });
        return { synced: true };
      }, UNSUBSCRIBE_TIMEOUT_MS * 2);
    },
  };
}
