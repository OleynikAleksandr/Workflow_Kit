// Deletion of ChatGPT threads when a project is deleted from disk (spec M3-autostart sections 7
// and 8). thread/delete is refused while another app-server writes the thread (the ChatGPT app
// with that chat open): such a thread waits in <state>/sessions/codex-deleting.json and is tried
// again (every minute and at the start of the service) until it is gone or 7 days passed. A thread
// gone leaves the ChatGPT app catalog too (app-catalog.ts).
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '#data-store';
import { providerSessionsFile } from '#provider-registry';
import { forgetInAppCatalog } from './app-catalog.ts';
import type { CodexRuntime } from './runtime.ts';

/** A thread that could not be deleted yet. */
export interface PendingDelete {
  threadId: string;
  project: string;
  since: string;
}

/** How long a refused thread is tried again. */
export const DELETE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** The daemon has no such thread any more: nothing to delete, it counts as deleted. */
export const THREAD_GONE = /no rollout found|thread not found|unknown thread/i;

export interface DeleteQueue {
  /** Deletes the threads now; refused ones (or all, without a daemon) wait. Resolves to the ids gone. */
  deleteThreads(threadIds: readonly string[], project: string): Promise<string[]>;
  /** Tries the waiting threads again; resolves to the ids gone now. */
  retry(): Promise<string[]>;
  pending(): Promise<PendingDelete[]>;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createDeleteQueue(rt: CodexRuntime): DeleteQueue {
  const { context } = rt;
  const file = path.join(path.dirname(providerSessionsFile(context.dirs, 'codex')), 'codex-deleting.json');
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task);
    chain = next.catch(() => undefined);
    return next;
  };

  async function read(): Promise<PendingDelete[]> {
    try {
      const data = (await readJsonFile(file)) as { threads?: unknown } | null;
      const list = Array.isArray(data?.threads) ? data.threads : [];
      return list.filter((t): t is PendingDelete => typeof t?.threadId === 'string' && typeof t?.project === 'string' && typeof t?.since === 'string');
    } catch {
      return [];
    }
  }

  /** thread/delete for each id: the ids gone and the ones refused with the reason. */
  async function attempt(ids: readonly string[]): Promise<{ gone: string[]; refused: Map<string, string> }> {
    const gone: string[] = [];
    const refused = new Map<string, string>();
    if (!(await rt.daemon(true)).running) {
      for (const id of ids) refused.set(id, 'демон Codex не запущен');
      return { gone, refused };
    }
    await rt.withDaemon(async (session) => {
      for (const threadId of ids) {
        try {
          await session.request('thread/delete', { threadId });
          gone.push(threadId);
        } catch (error) {
          if (THREAD_GONE.test(message(error))) gone.push(threadId);
          else refused.set(threadId, message(error));
        }
      }
    });
    return { gone, refused };
  }

  /** A thread gone from Codex leaves the app catalog too (section 9); a failure is only logged. */
  async function forgetInApp(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const removed = await forgetInAppCatalog({ codexHome: rt.paths.home, backupsDir: context.dirs.backupsDir, now: context.now(), threadIds: ids });
      if (removed > 0) context.log(`codex: removed ${removed} row(s) of ${ids.length} deleted thread(s) from the ChatGPT app catalog`);
    } catch (error) {
      context.log(`codex: the ChatGPT app catalog was not cleaned: ${message(error)}`);
    }
  }

  return {
    pending: read,
    deleteThreads: (threadIds, project) =>
      serial(async () => {
        if (threadIds.length === 0) return [];
        const { gone, refused } = await attempt(threadIds);
        if (refused.size > 0) {
          const since = context.now().toISOString();
          const waiting = (await read()).filter((t) => !refused.has(t.threadId));
          for (const [threadId, reason] of refused) {
            waiting.push({ threadId, project, since });
            context.log(`codex: thread ${threadId} of ${project} waits for deletion: ${reason}`);
          }
          await writeJsonAtomic(file, { version: 1, threads: waiting });
        }
        if (gone.length > 0) context.log(`codex: deleted ${gone.length} thread(s) of ${project}`);
        await forgetInApp(gone);
        return gone;
      }),
    retry: () =>
      serial(async () => {
        const waiting = await read();
        if (waiting.length === 0) return [];
        const now = context.now().getTime();
        const expired = waiting.filter((t) => now - Date.parse(t.since) > DELETE_KEEP_MS);
        for (const t of expired) context.log(`codex: thread ${t.threadId} of ${t.project} was not deleted in 7 days; no more attempts`);
        const live = waiting.filter((t) => !expired.includes(t));
        const { gone } = await attempt(live.map((t) => t.threadId)).catch(() => ({ gone: [] as string[] }));
        for (const t of live.filter((x) => gone.includes(x.threadId))) context.log(`codex: deleted the waiting thread ${t.threadId} of ${t.project}`);
        await writeJsonAtomic(file, { version: 1, threads: live.filter((t) => !gone.includes(t.threadId)) });
        await forgetInApp(gone);
        return gone;
      }),
  };
}
