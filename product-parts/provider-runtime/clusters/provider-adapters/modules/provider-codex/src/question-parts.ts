// Questions of the Codex provider (spec M33 section 2.4): the flag of the thread status from the
// feed poll (C0), the listener (C1, L1) subscribed by the flag and before a turn Kit starts, the
// questions of the page (with the asynchronous ones of the history, spec 2.7) and the answer.
// Details: questions.md.
import { ProviderError, QUESTION_UNAVAILABLE_REASON, questionAttemptsFile, questionKey, readQuestionAttempts } from '#provider-registry';
import type { ChatPage, ChatQuestion, Project, QuestionAttempt, QuestionOutcome } from '#provider-registry';
import { createQuestionListener } from './question-listener.ts';
import type { ListenerTiming, QuestionListener } from './question-listener.ts';
import { ASYNC_PREFIX, CODEX_WAITING_REASON, STUB_PREFIX, WAITING_FLAG, threadFlags, waitingStub } from './questions.ts';
import type { CodexRuntime } from './runtime.ts';

/** How long a turn Kit starts waits for the listener's subscription (spec 2.4). */
export const PREPARE_MS = 2000;
/** How long a feed poll waits for a subscription by the flag. */
export const POLL_SUBSCRIBE_MS = 2000;
/** Questions whose place in the feed is remembered. */
const PLACES_KEEP = 500;

export interface QuestionParts {
  readonly listener: QuestionListener;
  /** The thread/read metadata of a feed poll (null after a failed read). */
  observe(threadId: string, answer: unknown): void;
  /** The page with the questions of the thread; a page without any keeps the old contract. */
  decorate(threadId: string, page: ChatPage): Promise<ChatPage>;
  /** Before a turn Kit starts: the listener subscribes, at most PREPARE_MS. */
  prepare(threadId: string): Promise<void>;
  answer(project: Project, threadId: string, questionId: string, attempt: QuestionAttempt, commit: () => Promise<void>): Promise<QuestionOutcome>;
}

export function createQuestionParts(rt: CodexRuntime, timing?: Partial<ListenerTiming>): QuestionParts {
  const listener = createQuestionListener({ open: (options) => rt.listen(options), log: rt.context.log, now: () => Date.now(), ...(timing ? { timing } : {}) });
  const statuses = new Map<string, { type: string | null; flags: string[]; at: string }>();
  /** The message a question stands after: the newest one of the page where it was first seen. */
  const places = new Map<string, string | null>();
  const within = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([promise, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]).finally(() => clearTimeout(timer));
  };
  return {
    listener,
    observe(threadId, answer) {
      if (answer === null) return void statuses.delete(threadId);
      const { type, flags } = threadFlags(answer);
      const known = statuses.get(threadId);
      const waiting = type === 'active' && flags.includes(WAITING_FLAG);
      statuses.set(threadId, { type, flags, at: waiting && known?.flags.includes(WAITING_FLAG) ? known.at : new Date().toISOString() });
    },
    async decorate(threadId, page) {
      const status = statuses.get(threadId);
      const waiting = status?.type === 'active' && status.flags.includes(WAITING_FLAG);
      // L1: the daemon repeats a pending request to a new subscriber, so the flag is enough.
      if (waiting) await within(listener.ensure(threadId, POLL_SUBSCRIBE_MS), POLL_SUBSCRIBE_MS, false);
      else listener.touch(threadId);
      const last = page.messages.at(-1)?.id ?? null;
      const blocking: ChatQuestion[] = listener.questions(threadId).map((q) => {
        if (!places.has(q.id)) places.set(q.id, last);
        return { ...q, afterMessageId: places.get(q.id) ?? null };
      });
      while (places.size > PLACES_KEEP) places.delete(places.keys().next().value!);
      if (waiting && !blocking.some((q) => q.state === 'pending')) blocking.push(waitingStub(threadId, status!.at, last));
      // Asynchronous questions of the history first, then the blocking ones, oldest first by time.
      const time = (q: ChatQuestion): number => (q.at === null ? Infinity : Date.parse(q.at) || Infinity);
      const questions = [...(page.questions ?? []), ...blocking].map((q, i) => ({ q, i })).sort((a, b) => time(a.q) - time(b.q) || a.i - b.i).map(({ q }) => q);
      return questions.length > 0 ? { ...page, questions } : page;
    },
    async prepare(threadId) {
      await within(listener.ensure(threadId, PREPARE_MS), PREPARE_MS, false);
    },
    async answer(project, threadId, questionId, attempt, commit) {
      if (questionId.startsWith(STUB_PREFIX)) throw new ProviderError('question-unavailable', CODEX_WAITING_REASON, { status: 409 });
      // Asynchronous questions are answered by async-answer.ts (spec M34); the listener never has them.
      if (questionId.startsWith(ASYNC_PREFIX)) throw new ProviderError('question-unavailable', QUESTION_UNAVAILABLE_REASON, { status: 409 });
      // After a restart the daemon repeats a request Kit already answered: a sent record of the
      // attempts journal forbids a second answer (spec 2.1; the route checks it too).
      const key = questionKey('codex', project.id, threadId, questionId);
      const records = await readQuestionAttempts(questionAttemptsFile(rt.context.dirs, rt.context.platform));
      if (records.some((r) => r.key === key && r.state === 'sent')) throw new ProviderError('question-sent', 'Ответ на этот вопрос уже отправлен', { status: 409 });
      return listener.answer(threadId, questionId, attempt, commit);
    },
  };
}
