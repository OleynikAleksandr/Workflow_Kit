// Claude sessions: the list (hook journal + panel records, merged by local or Remote Control id),
// creation and resumption under session.exp, renaming through session.exp (/rename) and stopping
// only the panel's own processes (D9).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ProviderError, hookSessionInfo, readHookSessions } from '#provider-registry';
import type { HookSession, Project, RenameResult, SessionInfo } from '#provider-registry';
import { ProcessError } from '#process-supervisor';
import { sessionLinks } from './links.ts';
import { debugSessionId, dialogError, logTail, parseMarkers, poll, readText } from './pty.ts';
import type { SessionRecord } from './records.ts';
import { PROVIDER_ID } from './runtime.ts';
import type { ClaudeRuntime } from './runtime.ts';

/** Hook sessions whose transcripts are inspected per list (newest first). */
export const HOOK_SESSIONS_INSPECTED = 100;

/** Note of a session without a Remote Control id. */
export const NO_REMOTE_NOTE = 'без Remote Control — ссылки нет';

/** A started session process. */
interface StartedSession {
  remoteId: string;
  claudePid: number | null;
  /** screen: SESSION_URL; debug: the debug file fallback. */
  source: 'screen' | 'debug';
  processId: string;
  logFile: string;
  debugFile: string;
  startedAt: string;
}

/** A hook session with its Remote Control id (null until the transcript has bridge-session). */
interface ResolvedHook {
  hook: HookSession;
  remoteId: string | null;
}

function failure(code: string, message: string, logFile: string, log: string): ProviderError {
  const tail = logTail(log);
  return new ProviderError(code, tail ? `${message}\n${tail}` : message, {
    hint: `Журнал сессии: ${logFile}. Проверьте вход (claude, затем /login) и доверие к папке.`,
    details: { log: logFile },
  });
}

/** Waits for the Remote Control id of a just started session.exp; tracks the claude pid (D9). */
async function followSession(rt: ClaudeRuntime, processId: string, logFile: string, debugFile: string): Promise<Omit<StartedSession, 'processId' | 'logFile' | 'debugFile' | 'startedAt'>> {
  const { supervisor } = rt.context;
  let claudePid: number | null = null;
  let noUrlSince: number | null = null;
  const fromDebug = async (): Promise<string | null> => debugSessionId(await readText(debugFile));
  const found = await poll<{ remoteId: string; source: 'screen' | 'debug' }>(
    async () => {
      const log = await readText(logFile);
      const markers = parseMarkers(log);
      claudePid = markers.claudePid ?? claudePid;
      if (markers.sessionId) return { remoteId: markers.sessionId, source: 'screen' };
      if (markers.dialog) throw dialogError(markers.dialog, log, logFile);
      if (markers.failure === 'not-trusted') throw failure('not-trusted', 'Claude: «Workspace not trusted» — папка не доверена', logFile, log);
      if (markers.noSessionUrl) {
        const id = await fromDebug();
        if (id) return { remoteId: id, source: 'debug' };
        noUrlSince ??= Date.now();
        if (Date.now() - noUrlSince > rt.options.debugGraceMs) throw failure('no-session-url', 'Claude не сообщил ссылку Remote Control', logFile, log);
      }
      if (markers.failure === 'exited' || !(await rt.isAlive(processId))) {
        const lastLog = await readText(logFile);
        const last = parseMarkers(lastLog);
        if (last.sessionId) return { remoteId: last.sessionId, source: 'screen' };
        if (last.dialog) throw dialogError(last.dialog, lastLog, logFile);
        throw failure('session-exited', 'Claude завершился до появления ссылки Remote Control', logFile, await readText(logFile));
      }
      return undefined;
    },
    { timeoutMs: rt.options.sessionTimeoutMs, pollMs: rt.options.pollMs },
  );
  // The claude pid is tracked once the session is up: by then expect has exec-ed it for sure.
  const track = async (): Promise<void> => {
    if (claudePid === null) return;
    await supervisor.track(processId, claudePid).catch((error: unknown) => rt.context.log(`claude: track ${claudePid}: ${String(error)}`));
  };
  if (found) {
    await track();
    return { ...found, claudePid };
  }
  const id = await fromDebug();
  if (id) {
    await track();
    return { remoteId: id, source: 'debug', claudePid };
  }
  throw failure('no-session-url', 'Claude не сообщил ссылку Remote Control вовремя', logFile, await readText(logFile));
}

/** Starts session.exp (new session, or --resume <localId>) and waits for its Remote Control id. */
async function startSessionProcess(rt: ClaudeRuntime, project: Project, title: string, resume: string | null, firstMessage?: string): Promise<StartedSession> {
  const { claude, expect } = await rt.requirePty();
  await rt.requireTrust(project);
  const key = rt.newKey('session');
  const logFile = path.join(rt.logsDir, `${key}.log`);
  const debugFile = path.join(rt.logsDir, `${key}.debug.log`);
  const args = [rt.options.scripts.session, project.path, claude, title, debugFile, ...(resume ? [resume] : [])];
  let record;
  try {
    record = await rt.context.supervisor.spawn({
      owner: { provider: PROVIDER_ID, project: project.id, kind: 'session', ref: resume ?? key },
      command: expect,
      args,
      cwd: project.path,
      // session.exp types the first message into the session once the link is there.
      env: firstMessage ? { ...rt.context.env, WFK_FIRST_MESSAGE: firstMessage.replace(/\s+/g, ' ').trim() } : rt.context.env,
      logFile,
    });
  } catch (error) {
    if (error instanceof ProcessError) throw failure(`process-${error.code}`, `Claude: ${error.message}`, logFile, await readText(logFile));
    throw error;
  }
  try {
    const followed = await followSession(rt, record.id, logFile, debugFile);
    if (followed.source === 'debug') rt.context.log(`claude: session id of ${key} taken from the debug file`);
    return { ...followed, processId: record.id, logFile, debugFile, startedAt: rt.context.now().toISOString() };
  } catch (error) {
    // The claude child is in its own pty session: add it to the record so the stop reaches it too.
    const pid = parseMarkers(await readText(logFile)).claudePid;
    if (pid !== null) await rt.context.supervisor.track(record.id, pid).catch(() => undefined);
    await rt.context.supervisor.stop(record.id, { graceMs: 2000 }).catch(() => undefined);
    throw error;
  }
}

function recordInfo(record: SessionRecord, running: boolean, hook: HookSession | undefined): SessionInfo {
  const info: SessionInfo = {
    provider: PROVIDER_ID,
    localId: record.localId ?? hook?.sessionId ?? record.remoteId,
    remoteId: record.remoteId,
    title: record.title,
    createdAt: record.createdAt,
    origin: record.origin,
    state: running ? 'running' : 'stopped',
    links: sessionLinks(record.remoteId),
    cwd: record.projectPath,
  };
  if (hook?.model) info.model = hook.model;
  return info;
}

function hookInfo(resolved: ResolvedHook): SessionInfo {
  if (!resolved.remoteId) return hookSessionInfo(PROVIDER_ID, resolved.hook, { note: NO_REMOTE_NOTE });
  return hookSessionInfo(PROVIDER_ID, resolved.hook, { remoteId: resolved.remoteId, links: sessionLinks(resolved.remoteId) });
}

async function resolveHooks(rt: ClaudeRuntime, project: Project): Promise<ResolvedHook[]> {
  const hooks = (await readHookSessions(project, PROVIDER_ID)).slice(0, HOOK_SESSIONS_INSPECTED);
  return Promise.all(hooks.map(async (hook) => ({ hook, remoteId: await rt.bridge.remoteIdOf(hook.transcriptPath) })));
}

function matchHook(record: SessionRecord, hooks: ResolvedHook[]): ResolvedHook | undefined {
  return hooks.find((h) => (record.localId !== null && h.hook.sessionId === record.localId) || h.remoteId === record.remoteId);
}

/** The final list: panel records (with state from the supervisor) and the remaining hook sessions. */
export async function listSessions(rt: ClaudeRuntime, project: Project): Promise<SessionInfo[]> {
  const [hooks, records] = await Promise.all([resolveHooks(rt, project), rt.store.read()]);
  const used = new Set<ResolvedHook>();
  const list: SessionInfo[] = [];
  for (const record of records.sessions.filter((r) => r.projectPath === project.path)) {
    const hook = matchHook(record, hooks);
    if (hook) used.add(hook);
    list.push(recordInfo(record, await rt.isAlive(record.processId), hook?.hook));
  }
  for (const hook of hooks) if (!used.has(hook)) list.push(hookInfo(hook));
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Starts a Remote Control session in the project folder and records it (D9). */
export async function createSession(rt: ClaudeRuntime, project: Project, title: string, firstMessage?: string): Promise<SessionInfo> {
  const started = await startSessionProcess(rt, project, title, null, firstMessage);
  const record: SessionRecord = {
    localId: null,
    remoteId: started.remoteId,
    title,
    projectId: project.id,
    projectPath: project.path,
    origin: 'panel',
    createdAt: started.startedAt,
    startedAt: started.startedAt,
    processId: started.processId,
    claudePid: started.claudePid,
    logFile: started.logFile,
    debugFile: started.debugFile,
    stoppedAt: null,
  };
  await rt.store.update((records) => void records.sessions.push(record));
  return recordInfo(record, true, undefined);
}

/** Finds a session by the id the panel shows (local id or session_<X>). */
async function findSession(rt: ClaudeRuntime, project: Project, sid: string): Promise<{ record?: SessionRecord; hook?: ResolvedHook }> {
  const [hooks, records] = await Promise.all([resolveHooks(rt, project), rt.store.read()]);
  const own = records.sessions.filter((r) => r.projectPath === project.path);
  let record = own.find((r) => r.localId === sid || r.remoteId === sid);
  let hook = hooks.find((h) => h.hook.sessionId === sid);
  if (!record && hook?.remoteId) record = own.find((r) => r.remoteId === hook!.remoteId);
  if (record && !hook) hook = matchHook(record, hooks);
  return { ...(record ? { record } : {}), ...(hook ? { hook } : {}) };
}

/** Resumes in flight per runtime and local id: a second call waits for the first process. */
const resuming = new WeakMap<ClaudeRuntime, Map<string, Promise<SessionInfo>>>();

/** Resumes a session under the same Remote Control id (claude --resume <localId> --remote-control). */
export async function resumeSession(rt: ClaudeRuntime, project: Project, sid: string): Promise<SessionInfo> {
  const { record, hook } = await findSession(rt, project, sid);
  const key = record?.localId ?? hook?.hook.sessionId ?? record?.remoteId ?? sid;
  let inFlight = resuming.get(rt);
  if (!inFlight) resuming.set(rt, (inFlight = new Map()));
  const running = inFlight.get(key);
  if (running) return running;
  const started = resumeFound(rt, project, sid, record, hook).finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

async function resumeFound(rt: ClaudeRuntime, project: Project, sid: string, record: SessionRecord | undefined, hook: ResolvedHook | undefined): Promise<SessionInfo> {
  if (!record && !hook) throw new ProviderError('not-found', `Сессия ${sid} не найдена`, { status: 404 });
  if (record && (await rt.isAlive(record.processId))) return recordInfo(record, true, hook?.hook);
  const localId = record?.localId ?? hook?.hook.sessionId ?? null;
  if (!localId) {
    throw new ProviderError('local-id-unknown', 'Локальный id сессии ещё не известен', {
      hint: 'Он появится, когда хук Kit запишет сессию (структура Kit должна быть установлена). Сессию можно открыть по ссылке.',
    });
  }
  const title = record?.title ?? hookSessionInfo(PROVIDER_ID, hook!.hook).title;
  const started = await startSessionProcess(rt, project, title, localId);
  const previous = record?.remoteId ?? hook?.remoteId ?? null;
  if (previous && previous !== started.remoteId) rt.context.log(`claude: resumed ${localId} as ${started.remoteId} instead of ${previous}`);
  const saved = await rt.store.update((records) => {
    const existing = records.sessions.find((r) => r.projectPath === project.path && (r.localId === localId || (previous !== null && r.remoteId === previous)));
    const next: SessionRecord = {
      localId,
      remoteId: started.remoteId,
      title,
      projectId: project.id,
      projectPath: project.path,
      origin: existing?.origin ?? 'hook',
      createdAt: existing?.createdAt ?? hook?.hook.firstSeen ?? started.startedAt,
      startedAt: started.startedAt,
      processId: started.processId,
      claudePid: started.claudePid,
      logFile: started.logFile,
      debugFile: started.debugFile,
      stoppedAt: null,
    };
    if (existing) Object.assign(existing, next);
    else records.sessions.push(next);
    return next;
  });
  const info = recordInfo(saved, true, hook?.hook);
  if (previous && previous !== started.remoteId) info.note = `Remote Control выдал новый id (был ${previous})`;
  return info;
}

/** Stops the panel's own process of a session after verifying its identity (D9). */
export async function stopSession(rt: ClaudeRuntime, project: Project, sid: string): Promise<void> {
  const { record } = await findSession(rt, project, sid);
  if (!record) {
    throw new ProviderError('not-own-session', 'Эту сессию запустила не панель', { hint: 'Завершите её в приложении Claude (/exit) или в терминале, где она идёт.' });
  }
  if (!record.processId) return;
  let outcome: string;
  try {
    outcome = (await rt.context.supervisor.stop(record.processId, { graceMs: rt.options.stopGraceMs })).outcome;
  } catch (error) {
    if (!(error instanceof ProcessError && error.code === 'not-found')) throw error;
    outcome = 'already-gone';
  }
  if (outcome === 'still-running') {
    throw new ProviderError('stop-failed', 'Процесс сессии не завершился', { hint: `Проверьте процесс ${record.claudePid ?? ''} вручную; журнал: ${record.logFile}` });
  }
  if (outcome === 'unverifiable') throw new ProviderError('unverifiable', 'Процесс сессии нельзя проверить на этой ОС');
  if (outcome === 'mismatch') rt.context.log(`claude: pid of session ${record.remoteId} belongs to another process now; nothing was signalled`);
  await rt.store.update((records) => {
    const stored = records.sessions.find((r) => r.remoteId === record.remoteId && r.projectPath === record.projectPath);
    if (stored) Object.assign(stored, { processId: null, claudePid: null, stoppedAt: rt.context.now().toISOString() });
  });
}

/** How long renameSession waits for session.exp to type /rename (it looks once a second). */
export const RENAME_WAIT_MS = 5000;
/** A session Kit does not run: the name goes to Claude with the next prompt (the prompt hook). */
export const RENAME_BY_HOOK_NOTE = 'Сессию запустила не панель: имя уйдёт в Claude со следующим сообщением';

const renamedCount = (log: string): number => (log.match(/^RENAMED\s*$/gm) ?? []).length;

/**
 * Renames a session that runs under the panel's session.exp: writes <debug file>.rename, which the
 * script types as /rename <name> (Claude also renames the Remote Control session). The caller
 * makes sure the session is not in a turn, so the keys cannot answer a permission dialog.
 */
export async function renameSession(rt: ClaudeRuntime, project: Project, sid: string, name: string): Promise<RenameResult> {
  const { record } = await findSession(rt, project, sid);
  if (!record || !(await rt.isAlive(record.processId))) return { synced: false, note: RENAME_BY_HOOK_NOTE };
  const clean = name.replace(/\s+/g, ' ').trim();
  const before = renamedCount(await readText(record.logFile));
  await writeFile(`${record.debugFile}.rename`, `${clean}\n`, 'utf8');
  const done = await poll(async () => (renamedCount(await readText(record.logFile)) > before ? true : undefined), { timeoutMs: RENAME_WAIT_MS, pollMs: 200 });
  if (!done) return { synced: false, note: 'Claude не подтвердил переименование' };
  await rt.store.update((records) => {
    const stored = records.sessions.find((r) => r.remoteId === record.remoteId && r.projectPath === record.projectPath);
    if (stored) stored.title = clean;
  });
  return { synced: true };
}

/**
 * Wakes an idle session that runs under the panel's session.exp: the script types a short prompt,
 * and the prompt hook hands the panel's queued messages to the agent. False when the panel does
 * not run the session (nothing to type into). The caller wakes only sessions out of a turn.
 */
export async function wakeSession(rt: ClaudeRuntime, project: Project, sid: string): Promise<boolean> {
  let { record } = await findSession(rt, project, sid);
  if (!record) return false;
  if (!(await rt.isAlive(record.processId))) {
    // An interrupted session (reboot, crash) comes back first; one stopped on purpose stays stopped.
    if (!isInterrupted(record)) return false;
    await resumeSession(rt, project, sid);
    ({ record } = await findSession(rt, project, sid));
    if (!record || !(await rt.isAlive(record.processId))) return false;
  }
  await writeFile(`${record.debugFile}.message`, 'wake\n', 'utf8');
  return true;
}

/** Started by the panel and never stopped on purpose: its process ended on its own. */
function isInterrupted(record: SessionRecord): boolean {
  return record.processId !== null && record.stoppedAt === null;
}

/**
 * Brings back the interrupted panel sessions of a project (start of the service after a reboot or
 * a crash) under their Remote Control ids. Resolves to the local ids resumed; a failure of one
 * session is logged and the others go on.
 */
export async function resumeInterrupted(rt: ClaudeRuntime, project: Project): Promise<string[]> {
  const records = (await rt.store.read()).sessions.filter((r) => r.projectId === project.id && isInterrupted(r));
  const resumed: string[] = [];
  for (const record of records) {
    if (await rt.isAlive(record.processId)) continue;
    const sid = record.localId ?? record.remoteId;
    try {
      await resumeSession(rt, project, sid);
      resumed.push(sid);
    } catch (error) {
      rt.context.log(`claude: interrupted session ${sid} was not resumed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return resumed;
}
