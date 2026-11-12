// Operations on one thread of the daemon: is it loaded, unload it now (thread/archive and
// thread/unarchive), wake it with a short turn (spec M12 section 2.3) and read its status (M18).
import type { RpcSession } from './rpc.ts';

/** Timeout of thread/unsubscribe after the service turn. */
export const UNSUBSCRIBE_TIMEOUT_MS = 5_000;

/**
 * thread/archive unloads a loaded thread at once and thread/unarchive returns it to the lists
 * without loading it again (verified 2026-11-06 on codex-cli 0.167.0: loaded/list is empty right
 * after archive, the rollout and the name stay). createSession uses the pair instead of waiting
 * out the daemon's idle minute; a daemon without thread/archive falls back to the wait.
 */
export const UNLOAD_METHODS = ['thread/archive', 'thread/unarchive'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Unloads an idle thread now: thread/archive, then thread/unarchive (tried twice, so the chat does
 * not stay in ChatGPT's archive). False when the daemon refused the archive (nothing changed).
 */
export async function unloadNow(session: RpcSession, threadId: string, log: (line: string) => void): Promise<boolean> {
  try {
    await session.request(UNLOAD_METHODS[0], { threadId }, UNSUBSCRIBE_TIMEOUT_MS);
  } catch (error) {
    log(`codex: thread ${threadId} not unloaded by thread/archive: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      await session.request(UNLOAD_METHODS[1], { threadId }, UNSUBSCRIBE_TIMEOUT_MS);
      log(`codex: thread ${threadId} unloaded by thread/archive and thread/unarchive`);
      return true;
    } catch (error) {
      if (attempt < 2) continue;
      log(`codex: thread ${threadId} stays archived, thread/unarchive failed: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
  }
}

/** Whether thread/loaded/list (all pages) has the thread; null when the daemon did not answer. */
export async function isLoaded(session: RpcSession, threadId: string): Promise<boolean | null> {
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

/** Text of the turn that wakes an idle chat; the prompt hook of that turn hands over the queue. */
export const WAKE_TEXT = 'Workflow Kit: для тебя есть сообщения панели.';

/**
 * Wakes an idle thread (spec M12 section 2.3): thread/resume when the daemon has not loaded it,
 * then turn/start with WAKE_TEXT, then thread/unsubscribe. In the shared daemon mode the ChatGPT
 * app is a client of the same daemon, so a chat open in the app takes the turn too (checked
 * 2026-11-11: the text shows as a message of the user).
 */
export async function wakeThread(session: RpcSession, threadId: string, text: string = WAKE_TEXT): Promise<void> {
  if ((await isLoaded(session, threadId)) !== true) await session.request('thread/resume', { threadId });
  try {
    await session.request('turn/start', { threadId, input: [{ type: 'text', text }] });
  } finally {
    await session.request('thread/unsubscribe', { threadId }, UNSUBSCRIBE_TIMEOUT_MS).catch(() => undefined);
  }
}

/**
 * Status of a thread (spec M18 section 2.3): `thread.status.type` of thread/read without turns
 * ("idle", "active", "notLoaded"). The read does not load the thread. Null when the daemon did
 * not answer or the answer has no status.
 */
export async function threadStatus(session: RpcSession, threadId: string): Promise<string | null> {
  let answer: unknown;
  try {
    answer = await session.request('thread/read', { threadId }, UNSUBSCRIBE_TIMEOUT_MS);
  } catch {
    return null;
  }
  const thread = isObject(answer) ? answer['thread'] : null;
  const status = isObject(thread) ? thread['status'] : null;
  return isObject(status) && typeof status['type'] === 'string' ? status['type'] : null;
}
