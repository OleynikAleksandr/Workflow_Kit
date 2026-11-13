// The last answer of a Kimi session and the delivery of a message as a prompt (protocol,
// section 9). A message goes to the session only through the server of Kit; :takeover is never
// called. Calls of one session run strictly one after another.
import { ProviderError } from '#provider-registry';
import type { Project } from '#provider-registry';
import { KIMI_CODES, KimiError, describeKimiError } from './client.ts';
import type { KimiClient } from './client.ts';
import type { KimiRuntime } from './provider.ts';
import { ARCHIVED_NOTE, WAITING_NOTE } from './session-list.ts';
import type { SessionNotes } from './session-list.ts';
import { SESSION_ID } from './session-store.ts';
import { createTurnGate } from './turn-gate.ts';
import type { KimiTurnGate, SendGuard } from './turn-gate.ts';
import { parseConfig, parseMessages, parsePrompt, parseSession } from './shapes.ts';

/** Pages of the messages read back for the last answer. */
export const ANSWER_PAGE_LIMIT = 10;
export const ANSWER_PAGE_SIZE = 50;
/** Timeout of POST …/prompts. */
export const PROMPT_TIMEOUT_MS = 30_000;
/** Waits before the retries of a prompt the session refused because another server holds it (40931). */
export const FOREIGN_RETRY_MS: readonly number[] = [4000, 8000, 16_000];
export const deliveryNote = (reason: string): string => `сообщение не доставлено: ${reason}`;

export interface KimiMessages {
  lastAnswer(project: Project, sessionId: string): Promise<string | null>;
  sendMessage(project: Project, sessionId: string, text: string, delivery: { id: string }): Promise<boolean>;
}

/** Replacements for tests. */
export interface KimiMessageDeps {
  /** Waits before the retries after 40931 (default 4, 8 and 16 s). */
  retryDelaysMs?: readonly number[];
}

export function createKimiMessages(rt: KimiRuntime, notes: SessionNotes, deps: KimiMessageDeps = {}, gate: KimiTurnGate = createTurnGate()): KimiMessages {
  const { context } = rt;
  const delays = deps.retryDelaysMs ?? FOREIGN_RETRY_MS;
  const describe = (error: unknown): string => describeKimiError(error, rt.program().version);

  const send = async (project: Project, sessionId: string, text: string, delivery: { id: string }, guard: SendGuard): Promise<boolean> => {
    const refuse = (reason: string, note = true): false => {
      if (note) notes.set(sessionId, 'delivery', deliveryNote(reason));
      context.log(`kimi: message ${delivery.id} was not delivered to ${sessionId}: ${reason}`);
      void context.events.append('kimi.delivery.refused', { project: project.id, sessionId, delivery: delivery.id, reason }).catch(() => undefined);
      return false;
    };
    if (!SESSION_ID.test(sessionId)) return refuse('неверный id сессии');
    let client: KimiClient;
    const body: Record<string, unknown> = { content: [{ type: 'text', text }], prompt_id: `kit-${delivery.id}` };
    try {
      client = await rt.requireReady();
      const session = parseSession(await client.get(`/api/v1/sessions/${sessionId}`));
      if (session.archived) return refuse(ARCHIVED_NOTE, false);
      const model = session.model ?? parseConfig(await client.get('/api/v1/config')).defaultModel;
      if (!session.model && model) body['model'] = model;
    } catch (error) {
      return refuse(describe(error));
    }
    let foreign = 0;
    let reloaded = false;
    let reconnected = false;
    for (;;) {
      if (!guard.current()) return false;
      try {
        const status = parsePrompt(await client.post(`/api/v1/sessions/${sessionId}/prompts`, body, { timeoutMs: PROMPT_TIMEOUT_MS }));
        notes.set(sessionId, 'delivery', status === 'blocked' ? WAITING_NOTE : null);
        return true;
      } catch (error) {
        if (!guard.current()) return false;
        if (!(error instanceof KimiError)) return refuse(describe(error));
        // The prompt was accepted by an earlier attempt of the same delivery.
        if (error.code === KIMI_CODES.promptUsed) {
          notes.set(sessionId, 'delivery', null);
          return true;
        }
        const wait = error.code === KIMI_CODES.foreignSession ? delays[foreign] : undefined;
        if (wait !== undefined) {
          foreign += 1;
          await guard.wait(wait);
          continue;
        }
        try {
          if (error.code === KIMI_CODES.reloadNeeded && !reloaded) {
            reloaded = true;
            await client.post(`/api/v1/sessions/${sessionId}:reload`, {});
            continue;
          }
          if (error.kind === 'transport' && !reconnected) {
            reconnected = true;
            client = await rt.requireReady();
            continue;
          }
        } catch (again) {
          return refuse(describe(again));
        }
        return refuse(describe(error));
      }
    }
  };

  return {
    sendMessage: (project, sessionId, text, delivery) => gate.send(sessionId, (guard) => send(project, sessionId, text, delivery, guard)),
    async lastAnswer(_project, sessionId) {
      try {
        if (!SESSION_ID.test(sessionId)) throw new Error('неверный id сессии');
        const client = await rt.requireServer();
        let answer: string | null = null;
        let before: string | null = null;
        for (let page = 0; page < ANSWER_PAGE_LIMIT; page += 1) {
          const route: string = `/api/v1/sessions/${sessionId}/messages?page_size=${ANSWER_PAGE_SIZE}${before ? `&before_id=${encodeURIComponent(before)}` : ''}`;
          const { items, hasMore } = parseMessages(await client.get(route));
          for (const item of items) {
            // The turn starts at the newest message the user (or Kit) sent; injections of Kimi are not it.
            if (item.role === 'user' && item.origin === 'user') return answer;
            if (item.role === 'assistant' && answer === null && item.text !== '') answer = item.text;
          }
          const last = items[items.length - 1];
          if (!hasMore || !last) break;
          before = last.id;
        }
        throw new Error('начало хода не найдено');
      } catch (error) {
        throw new ProviderError('answer-unavailable', `Ответ Kimi не прочитан: ${describe(error)}`);
      }
    },
  };
}
