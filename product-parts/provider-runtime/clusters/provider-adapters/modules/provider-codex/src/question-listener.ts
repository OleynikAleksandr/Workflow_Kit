// The question listener of Codex (spec M33 section 2.4, C1 with L1, facts T002): one long
// connection to the daemon, subscribed (thread/resume, excludeTurns) to at most maxThreads threads.
// It gets item/tool/requestUserInput, keeps the request unanswered until the user presses the
// panel's button, and answers it once with the result of that request. Other requests of the
// server stay without an answer. Notifications are not kept. Details: questions.md.
import { ProviderError, checkQuestionAnswer } from '#provider-registry';
import type { ChatQuestion, QuestionAttempt, QuestionOutcome } from '#provider-registry';
import type { RpcNotification, RpcServerRequest, RpcSession, RpcSessionOptions } from './rpc.ts';
import { CODEX_LOST_REASON, USER_INPUT_METHOD, answerResult, questionOfRequest } from './questions.ts';

export interface ListenerTiming {
  maxThreads: number;
  /** A subscription ends this long after the end of the turn. */
  afterTurnMs: number;
  /** A subscription ends this long without a poll of the feed. */
  idleMs: number;
  /** How long an answer waits for serverRequest/resolved. */
  confirmMs: number;
  /** How often the subscriptions are swept. */
  sweepMs: number;
  /** Pauses before reconnect attempts after the 1st, 2nd, … failure; the last one repeats. */
  retryMs: readonly number[];
  /** Closed questions kept per thread. */
  closedKeep: number;
}

export const LISTENER_TIMING: ListenerTiming = { maxThreads: 8, afterTurnMs: 30_000, idleMs: 60_000, confirmMs: 10_000, sweepMs: 5000, retryMs: [1000, 2000, 5000, 10_000, 30_000], closedKeep: 20 };

interface Pending {
  question: ChatQuestion;
  requestId: string | number;
  /** Generation of the connection that got the request: only it can answer. */
  generation: number;
  sent: boolean;
  resolved: (() => void) | null;
}

interface ThreadState {
  subscribed: boolean;
  lastPoll: number;
  turnEndedAt: number | null;
  pending: Map<string, Pending>;
  closed: ChatQuestion[];
}

export interface QuestionListenerDeps {
  /** Opens the long connection (CodexRuntime.listen). */
  open(options: RpcSessionOptions): Promise<RpcSession>;
  log(line: string): void;
  now(): number;
  timing?: Partial<ListenerTiming>;
}

export interface QuestionListener {
  /** Subscribes the thread (at once when subscribed); false when it cannot now. Never throws. */
  ensure(threadId: string, timeoutMs?: number): Promise<boolean>;
  /** A poll of the feed keeps the subscription. */
  touch(threadId: string): void;
  subscribed(threadId: string): boolean;
  /** Questions of the thread, oldest first: closed ones, then pending ones. */
  questions(threadId: string): ChatQuestion[];
  /** Answers a pending question once; commit() runs right before the hand-out (spec 2.1). */
  answer(threadId: string, questionId: string, attempt: QuestionAttempt, commit: () => Promise<void>): Promise<QuestionOutcome>;
  close(): void;
}

const stale = (): ProviderError => new ProviderError('question-stale', 'На вопрос уже ответили', { status: 409 });

export function createQuestionListener(deps: QuestionListenerDeps): QuestionListener {
  const timing: ListenerTiming = { ...LISTENER_TIMING, ...deps.timing };
  const threads = new Map<string, ThreadState>();
  let session: RpcSession | null = null;
  let opening: Promise<RpcSession | null> | null = null;
  let generation = 0;
  let failures = 0;
  let nextAttemptAt = 0;
  let sweeper: ReturnType<typeof setInterval> | null = null;

  const stateOf = (threadId: string): ThreadState => {
    let state = threads.get(threadId);
    if (!state) threads.set(threadId, (state = { subscribed: false, lastPoll: deps.now(), turnEndedAt: null, pending: new Map(), closed: [] }));
    return state;
  };

  const finish = (state: ThreadState, entry: Pending, closed: ChatQuestion): void => {
    state.pending.delete(entry.question.id);
    state.closed.push(closed);
    if (state.closed.length > timing.closedKeep) state.closed.splice(0, state.closed.length - timing.closedKeep);
    entry.resolved?.();
  };

  const onRequest = (gen: number) => (request: RpcServerRequest): void => {
    // Only questions are kept; approvals and the rest stay unanswered and are forgotten (T002 Q6).
    if (request.method !== USER_INPUT_METHOD) return;
    const found = questionOfRequest(request.params, new Date(deps.now()).toISOString());
    if (!found) return;
    const state = stateOf(found.threadId);
    if (state.closed.some((q) => q.id === found.question.id)) return;
    const known = state.pending.get(found.question.id);
    // A repeat after a new subscription (L1) replaces the request of a broken connection.
    if (known && known.generation === gen && known.requestId === request.id) return;
    if (known?.sent) {
      known.generation = gen;
      return;
    }
    state.pending.set(found.question.id, { question: { ...found.question, afterMessageId: known?.question.afterMessageId ?? null, at: known?.question.at ?? found.question.at }, requestId: request.id, generation: gen, sent: false, resolved: null });
    state.turnEndedAt = null;
  };

  const onNotification = (note: RpcNotification): void => {
    const params = (typeof note.params === 'object' && note.params !== null ? note.params : {}) as Record<string, unknown>;
    const threadId = typeof params['threadId'] === 'string' ? params['threadId'] : null;
    if (note.method === 'serverRequest/resolved') {
      // A request keeps its id when the daemon repeats it to a new subscriber (T002 Q3).
      for (const [id, state] of threads) {
        if (threadId !== null && id !== threadId) continue;
        for (const entry of [...state.pending.values()]) {
          if (entry.requestId !== params['requestId']) continue;
          // No winner is told (T002 Q5): answered without answers, whoever answered.
          const { reason: _r, answers: _a, ...rest } = entry.question;
          finish(state, entry, { ...rest, state: 'answered', answerable: false });
        }
      }
      return;
    }
    if (!threadId) return;
    const state = threads.get(threadId);
    if (!state) return;
    if (note.method === 'turn/completed') {
      state.turnEndedAt = deps.now();
      for (const entry of [...state.pending.values()]) {
        const { reason: _r, answers: _a, ...rest } = entry.question;
        finish(state, entry, { ...rest, state: 'cancelled', answerable: false });
      }
    } else if (note.method === 'turn/started') state.turnEndedAt = null;
    else if (note.method === 'thread/closed') state.subscribed = false;
  };

  const onClose = (gen: number) => (): void => {
    if (gen !== generation) return;
    session = null;
    for (const state of threads.values()) state.subscribed = false;
    deps.log('codex: question listener connection closed');
  };

  const connect = async (): Promise<RpcSession | null> => {
    if (session) return session;
    if (deps.now() < nextAttemptAt) return null;
    opening ??= (async () => {
      const gen = generation + 1;
      try {
        const opened = await deps.open({ keepNotifications: false, onRequest: onRequest(gen), onNotification, onClose: onClose(gen) });
        generation = gen;
        session = opened;
        failures = 0;
        sweeper ??= setInterval(sweep, timing.sweepMs);
        sweeper.unref?.();
        return opened;
      } catch (error) {
        nextAttemptAt = deps.now() + timing.retryMs[Math.min(failures, timing.retryMs.length - 1)]!;
        failures += 1;
        deps.log(`codex: question listener cannot connect: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      } finally {
        opening = null;
      }
    })();
    return opening;
  };

  const unsubscribe = (threadId: string, state: ThreadState): void => {
    state.subscribed = false;
    // Its pending requests come again with the next subscription (L1).
    for (const entry of [...state.pending.values()]) if (!entry.sent) state.pending.delete(entry.question.id);
    void session?.request('thread/unsubscribe', { threadId }, 5000).catch(() => undefined);
  };

  function sweep(): void {
    const now = deps.now();
    for (const [threadId, state] of threads) {
      if (!state.subscribed) continue;
      if ((state.turnEndedAt !== null && now - state.turnEndedAt >= timing.afterTurnMs) || now - state.lastPoll >= timing.idleMs) unsubscribe(threadId, state);
    }
    if (![...threads.values()].some((s) => s.subscribed) && session) {
      session.close();
      session = null;
      if (sweeper) clearInterval(sweeper);
      sweeper = null;
    }
  }

  const listener: QuestionListener = {
    async ensure(threadId, timeoutMs = 5000) {
      const state = stateOf(threadId);
      state.lastPoll = deps.now();
      if (state.subscribed && session) return true;
      const count = [...threads.values()].filter((s) => s.subscribed).length;
      if (count >= timing.maxThreads) {
        sweep();
        const others = [...threads.entries()].filter(([, s]) => s.subscribed && s.pending.size === 0).sort((a, b) => a[1].lastPoll - b[1].lastPoll);
        if ([...threads.values()].filter((s) => s.subscribed).length >= timing.maxThreads) {
          const victim = others[0];
          if (!victim) return false;
          unsubscribe(victim[0], victim[1]);
        }
      }
      const open = await connect();
      if (!open) return false;
      try {
        await open.request('thread/resume', { threadId, excludeTurns: true }, timeoutMs);
        state.subscribed = true;
        return true;
      } catch (error) {
        deps.log(`codex: question listener cannot subscribe ${threadId}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
    touch(threadId) {
      const state = threads.get(threadId);
      if (state) state.lastPoll = deps.now();
    },
    subscribed: (threadId) => threads.get(threadId)?.subscribed === true && session !== null,
    questions(threadId) {
      const state = threads.get(threadId);
      if (!state) return [];
      const pending = [...state.pending.values()].map((entry) => {
        const lost = entry.generation !== generation || session === null;
        if (entry.sent) return { ...entry.question, answerable: false, delivery: 'sent' as const };
        return lost ? { ...entry.question, answerable: false, reason: CODEX_LOST_REASON } : { ...entry.question };
      });
      return [...state.closed.map((q) => ({ ...q })), ...pending];
    },
    async answer(threadId, questionId, attempt, commit) {
      const state = threads.get(threadId);
      const current = listener.questions(threadId).find((q) => q.id === questionId);
      if (!state || !current) throw stale();
      const answers = checkQuestionAnswer(current, attempt.answers);
      const entry = state.pending.get(questionId);
      if (!entry) throw stale();
      const lost = (): ProviderError => new ProviderError('question-failed', 'ChatGPT не принял ответ: связь прервалась', { status: 502 });
      if (!session || entry.generation !== generation) throw lost();
      await commit();
      // Nothing awaited from here to respond: the request is answered once, on its own connection.
      const open = session;
      if (!state.pending.has(questionId)) throw stale();
      if (entry.sent) throw new ProviderError('question-sent', 'Ответ на этот вопрос уже отправлен', { status: 409 });
      if (!open || entry.generation !== generation) throw lost();
      entry.sent = true;
      const done = new Promise<void>((resolve) => { entry.resolved = resolve; });
      open.respond(entry.requestId, answerResult(current.parts, answers));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const closed = await Promise.race([done.then(() => true), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timing.confirmMs); })]);
      clearTimeout(timer);
      if (!closed) throw new ProviderError('question-timeout', 'Ответ отправлен, подтверждение не пришло. Проверьте чат провайдера', { status: 504 });
      // serverRequest/resolved does not say whose answer won (T002 Q5).
      return 'unknown';
    },
    close() {
      if (sweeper) clearInterval(sweeper);
      sweeper = null;
      session?.close();
      session = null;
    },
  };
  return listener;
}
