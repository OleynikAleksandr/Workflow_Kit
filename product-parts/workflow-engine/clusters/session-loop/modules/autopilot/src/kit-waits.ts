// M48 T004: a press of the user that Kit refuses with LOCKED («Another workflow operation is
// running»: the agent's command holds the Kit lock, for example `commit --task` with its checks)
// is not lost. The route answers at once that the press waits; the service tries the same action
// again every 2 s for up to 15 minutes and applies it once. A second press of the same decision
// while it waits joins the wait instead of running again. Any other answer of Kit ends the wait
// with its reason; after 15 minutes the wait ends with a reason and the user presses again.
import { jsonResult } from '#http-server';
import type { JsonResult } from '#http-server';

export const KIT_WAIT_RETRY_MS = 2_000;
export const KIT_WAIT_LIMIT_MS = 15 * 60_000;
/** How long a finished wait stays in the panel state. */
const KEEP_MS = 10 * 60_000;

export const KIT_WAIT_TEXTS = {
  waiting: 'Ждёт: агент выполняет команду Kit. Нажатие применится, как только Kit освободится.',
  expired: 'Kit был занят 15 минут, нажатие не применено. Нажмите кнопку ещё раз.',
} as const;

export interface KitWait {
  id: string;
  projectId: string;
  /** The pressed action (`confirm-delivery`, `decision:accept`, `start`, …). */
  action: string;
  since: string;
  attempts: number;
  state: 'waiting' | 'done' | 'failed';
  /** Why a wait failed (Kit's other answer or the time limit), in Russian for the card. */
  error: string | null;
  text: string;
  finishedAt: string | null;
}

/** True for Kit's refusal while another workflow operation holds its lock. */
export function kitLocked(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === 'LOCKED' || (typeof e?.message === 'string' && e.message.includes('Another workflow operation is running'));
}

export interface KitWaitsDeps {
  now?: () => Date;
  /** Timers (tests drive them). */
  schedule?: (run: () => void, ms: number) => void;
  retryMs?: number;
  limitMs?: number;
  log?: (line: string) => void;
}

export function createKitWaits(deps: KitWaitsDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const schedule = deps.schedule ?? ((run: () => void, ms: number) => void setTimeout(run, ms).unref?.());
  const retryMs = deps.retryMs ?? KIT_WAIT_RETRY_MS;
  const limitMs = deps.limitMs ?? KIT_WAIT_LIMIT_MS;
  const log = deps.log ?? (() => undefined);
  const waits = new Map<string, KitWait>();
  let next = 0;

  const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));
  const finish = (wait: KitWait, state: 'done' | 'failed', error: string | null, text: string): void => {
    Object.assign(wait, { state, error, text, finishedAt: now().toISOString() });
  };

  function retry(signature: string, wait: KitWait, action: () => Promise<unknown>): void {
    schedule(() => {
      void (async () => {
        if (waits.get(signature) !== wait || wait.state !== 'waiting') return;
        if (now().getTime() - Date.parse(wait.since) >= limitMs) {
          finish(wait, 'failed', KIT_WAIT_TEXTS.expired, KIT_WAIT_TEXTS.expired);
          log(`kit-wait: ${wait.projectId} ${wait.action} expired after ${wait.attempts} attempts`);
          return;
        }
        wait.attempts += 1;
        try {
          await action();
          finish(wait, 'done', null, '');
          log(`kit-wait: ${wait.projectId} ${wait.action} applied after ${wait.attempts} attempts`);
        } catch (error) {
          if (kitLocked(error)) return retry(signature, wait, action);
          finish(wait, 'failed', message(error), message(error));
          log(`kit-wait: ${wait.projectId} ${wait.action} refused: ${message(error)}`);
        }
      })();
    }, retryMs);
  }

  return {
    /**
     * Runs the press; Kit's LOCKED makes it a wait (202 `{ pending: true, wait }`). `signature`
     * names the decision (the action and what the card showed): the same one joins its wait.
     */
    async run<T>(projectId: string, action: string, signature: string, act: () => Promise<T>): Promise<T | JsonResult> {
      const key = `${projectId}\n${signature}`;
      const known = waits.get(key);
      if (known?.state === 'waiting') return jsonResult(202, { pending: true, wait: { ...known } });
      try {
        return await act();
      } catch (error) {
        if (!kitLocked(error)) throw error;
        next += 1;
        const wait: KitWait = { id: `wait-${next}`, projectId, action, since: now().toISOString(), attempts: 1, state: 'waiting', error: null, text: KIT_WAIT_TEXTS.waiting, finishedAt: null };
        waits.set(key, wait);
        log(`kit-wait: ${projectId} ${action} waits for the Kit lock`);
        retry(key, wait, act);
        return jsonResult(202, { pending: true, wait: { ...wait } });
      }
    },
    /** The waits of each project for the panel (finished ones for a while, so the card can tell the end). */
    section(): { projects: Record<string, KitWait[]> } {
      const projects: Record<string, KitWait[]> = {};
      const cutoff = now().getTime() - KEEP_MS;
      for (const [key, wait] of waits) {
        if (wait.finishedAt && Date.parse(wait.finishedAt) < cutoff) {
          waits.delete(key);
          continue;
        }
        (projects[wait.projectId] ??= []).push({ ...wait });
      }
      return { projects };
    },
  };
}

export type KitWaits = ReturnType<typeof createKitWaits>;

/** The signature of a press: the action and the body without the press id (a new id per press). */
export function pressSignature(action: string, body: unknown): string {
  const fields = body && typeof body === 'object' && !Array.isArray(body) ? { ...(body as Record<string, unknown>) } : {};
  delete fields['requestId'];
  const sorted = Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)));
  return `${action}:${JSON.stringify(sorted)}`;
}
