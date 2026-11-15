// Answer of the panel to an asynchronous question of Codex (spec M34 section 2.3): a fresh read of
// the feed, the common check, the wrapper of question-reply.ts, then one hand-out in the shared
// daemon: turn/steer into the running turn, or a turn started with the wrapper when the thread is
// idle. A refused steer (the turn ended or changed) is retried once by the same rules. Details:
// questions.md.
import { ProviderError, QUESTION_UNAVAILABLE_REASON, checkQuestionAnswer } from '#provider-registry';
import type { ChatPage, Project, QuestionAttempt, QuestionOutcome } from '#provider-registry';
import { RpcError } from './rpc.ts';
import type { RpcSession } from './rpc.ts';
import { ASYNC_PREFIX } from './questions.ts';
import { replyText } from './question-reply.ts';
import { steerTurn, wakeThread } from './thread-ops.ts';
import { nativeTurn, object } from './turn-snapshot.ts';

/** Newest turns read to find the running one (as the interruption does). */
export const ASYNC_TURNS_PAGE = 10;
/** Budget of the connection that hands the answer out. */
export const ASYNC_ANSWER_TIMEOUT_MS = 30_000;
export const CODEX_APP_REASON = 'Ответьте в приложении ChatGPT';
export const CODEX_FEED_UNREAD_REASON = 'Лента ChatGPT сейчас не читается. Повторите ответ или ответьте в приложении ChatGPT';

const THREAD_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** What the answer needs from the provider. */
export interface AsyncAnswerDeps {
  /** The shared daemon mode is on (SharedMode.refresh). */
  shared(): Promise<boolean>;
  /** A fresh page of the feed with the asynchronous questions of the history. */
  read(project: Project, threadId: string): Promise<ChatPage>;
  withDaemon<T>(fn: (session: RpcSession) => Promise<T>, timeoutMs?: number): Promise<T>;
  /** Before a turn Kit starts: the question listener subscribes (spec M33 section 2.4). */
  prepareTurn(threadId: string): Promise<void>;
  log(line: string): void;
}

/** Where the answer goes: the running turn, a new turn, or nowhere (unknown state). */
export type AnswerTarget = { kind: 'steer'; turnId: string } | { kind: 'start' } | null;

/** The daemon answered the request with an error: the text was not taken. */
export function refusedByDaemon(error: unknown): boolean {
  return error instanceof RpcError && typeof error.code === 'number' && error.transport === null;
}

const unavailable = (reason: string): ProviderError => new ProviderError('question-unavailable', reason, { status: 409 });
const failed = (error: unknown): ProviderError => new ProviderError('question-failed', `ChatGPT не принял ответ: ${error instanceof Error ? error.message : String(error)}`, { status: 502 });
const timedOut = (): ProviderError => new ProviderError('question-timeout', 'Ответ отправлен, подтверждение не пришло. Проверьте чат провайдера', { status: 504 });

/** The state of the thread and its running turn: thread/read, then the newest turns when active. */
export async function answerTarget(session: RpcSession, threadId: string): Promise<AnswerTarget> {
  const meta = await session.request('thread/read', { threadId }, ASYNC_ANSWER_TIMEOUT_MS);
  const thread = object(meta) ? meta['thread'] : null;
  const status = object(thread) && object(thread['status']) ? thread['status']['type'] : null;
  if (status === 'idle' || status === 'notLoaded') return { kind: 'start' };
  if (status !== 'active') return null;
  const page = await session.request('thread/turns/list', { threadId, limit: ASYNC_TURNS_PAGE, sortDirection: 'desc', itemsView: 'notLoaded' }, ASYNC_ANSWER_TIMEOUT_MS);
  const listed = object(page) && Array.isArray(page['data']) ? page['data'] : [];
  const running = listed.map(nativeTurn).find((turn) => turn?.status === 'inProgress');
  return running ? { kind: 'steer', turnId: running.id } : null;
}

export interface AsyncAnswer {
  answer(project: Project, threadId: string, questionId: string, attempt: QuestionAttempt, commit: () => Promise<void>): Promise<QuestionOutcome>;
}

export function createAsyncAnswer(deps: AsyncAnswerDeps): AsyncAnswer {
  /** One hand-out; the log line names the way, never the text. */
  const handOut = async (session: RpcSession, threadId: string, target: Exclude<AnswerTarget, null>, text: string): Promise<void> => {
    if (target.kind === 'steer') {
      const turnId = await steerTurn(session, threadId, target.turnId, text);
      deps.log(`codex: question answer steered into turn ${turnId ?? target.turnId} of thread ${threadId}`);
      return;
    }
    await deps.prepareTurn(threadId);
    await wakeThread(session, threadId, text);
    deps.log(`codex: question answer started a turn of thread ${threadId}`);
  };

  return {
    async answer(project, threadId, questionId, attempt, commit) {
      if (!questionId.startsWith(ASYNC_PREFIX) || !THREAD_ID.test(threadId)) throw unavailable(QUESTION_UNAVAILABLE_REASON);
      if (!(await deps.shared())) throw unavailable(CODEX_APP_REASON);
      let page: ChatPage;
      try {
        page = await deps.read(project, threadId);
      } catch {
        throw unavailable(CODEX_FEED_UNREAD_REASON);
      }
      const question = page.questions?.find((q) => q.id === questionId && q.reply === 'message');
      if (!question) throw unavailable(QUESTION_UNAVAILABLE_REASON);
      const answers = checkQuestionAnswer(question, attempt.answers);
      const text = replyText(questionId.slice(ASYNC_PREFIX.length), question.parts, answers);
      let committed = false;
      try {
        return await deps.withDaemon(async (session) => {
          const target = await answerTarget(session, threadId);
          if (!target) throw unavailable(CODEX_APP_REASON);
          await commit();
          committed = true;
          try {
            await handOut(session, threadId, target, text);
          } catch (error) {
            if (!refusedByDaemon(error)) throw error;
            // Nothing was taken: the turn ended or changed meanwhile. One more read and hand-out.
            const again = await answerTarget(session, threadId);
            if (!again) throw failed(error);
            await handOut(session, threadId, again, text);
          }
          return 'accepted' as const;
        }, ASYNC_ANSWER_TIMEOUT_MS);
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (!committed || refusedByDaemon(error)) throw failed(error);
        throw timedOut();
      }
    },
  };
}
