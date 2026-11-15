// Answers to AskUserQuestion from the panel through the PermissionRequest hook (spec M33 section 2.3,
// variant A1, facts T001). A hook process (wfk hook question) is a waiter: a record by its waiterId,
// bound to exactly one question of the transcript, waiting | decided | closed. The panel's answer
// becomes the decision of the bound waiting waiter once; the outcome is the result in the
// transcript. Details: questions.md.
import { createHash } from 'node:crypto';
import { QUESTION_HOOK_TIMEOUT_S } from '#kit-structure';
import { ProviderError, checkQuestionAnswer, questionAttemptsFile, questionKey, readQuestionAttempts } from '#provider-registry';
import type { ChatQuestion, ChatQuestionAnswer, ChatQuestionPart, Project, QuestionAttempt, QuestionHookReply, QuestionHookRequest, QuestionOutcome } from '#provider-registry';
import { CLAUDE_QUESTION_REASON, QUESTION_TOOL, partAnswerOf, partsOf } from './questions.ts';
import type { ClaudeRuntime } from './runtime.ts';
import { findSession } from './sessions.ts';

export const QUESTION_OLD_SESSION_REASON = 'Ответьте в приложении Claude: эта сессия запущена до обновления хуков проекта';
export const QUESTION_HOOK_ENDED_REASON = 'Ответьте в приложении Claude: хук вопроса завершился';

/** Timing of the waiters; tests make it short. */
export interface QuestionTiming {
  /** Longest hold of one hook request (the hook asks again after { wait: true }). */
  holdMs: number;
  /** A waiter without a request this long is closed. */
  recoveryMs: number;
  /** How long an answer waits for its result in the transcript. */
  confirmMs: number;
  /** How often a held request and a confirmation look at the transcript. */
  tickMs: number;
  /** A fresh question without a waiter yet keeps the plain reason this long (the hook comes ~0.1 s later). */
  graceMs: number;
  /** Life of a waiter from its registration (the timeout of the hook). */
  hookMs: number;
}

export const QUESTION_TIMING: QuestionTiming = { holdMs: 8 * 60_000, recoveryMs: 2 * 60_000, confirmMs: 10_000, tickMs: 500, graceMs: 5000, hookMs: QUESTION_HOOK_TIMEOUT_S * 1000 };
/** Closed waiters kept so that a late request of theirs gets release, not a new life. */
export const CLOSED_WAITERS_KEEP = 200;

type WaiterState = 'waiting' | 'decided' | 'closed';

interface Waiter {
  id: string;
  transcriptPath: string;
  contentKey: string;
  /** The tool input of the hook: updatedInput repeats it with the answers. */
  toolInput: Record<string, unknown>;
  registeredAt: number;
  lastSeen: number;
  open: number;
  state: WaiterState;
  questionId: string | null;
  decision?: Record<string, unknown>;
  wake: Set<() => void>;
}

interface Book { byId: Map<string, Waiter>; timing: QuestionTiming }
const books = new WeakMap<ClaudeRuntime, Book>();

function book(rt: ClaudeRuntime): Book {
  let found = books.get(rt);
  if (!found) books.set(rt, (found = { byId: new Map(), timing: QUESTION_TIMING }));
  return found;
}

/** Tests: shorter timing for one runtime. */
export function setQuestionTiming(rt: ClaudeRuntime, timing: Partial<QuestionTiming>): void {
  const b = book(rt);
  b.timing = { ...b.timing, ...timing };
}

const clock = (rt: ClaudeRuntime): number => rt.context.now().getTime();
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const usablePath = (file: string | null | undefined): file is string => typeof file === 'string' && file.endsWith('.jsonl');

/** sha256 of the normalized parts: header, question, multiSelect, options. */
export function contentKey(parts: readonly ChatQuestionPart[]): string {
  const shape = parts.map((p) => [p.header, p.question, p.multiSelect, p.options.map((o) => [o.label, o.description])]);
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}

function notify(w: Waiter): void {
  for (const wake of [...w.wake]) wake();
}

function close(w: Waiter): void {
  if (w.state === 'closed') return;
  w.state = 'closed';
  notify(w);
}

function trim(b: Book): void {
  const closed = [...b.byId.values()].filter((w) => w.state === 'closed');
  for (const w of closed.slice(0, Math.max(0, closed.length - CLOSED_WAITERS_KEEP))) b.byId.delete(w.id);
}

/** Closes a waiter past the hook timeout, or without a request longer than the recovery time. */
function expire(rt: ClaudeRuntime, w: Waiter): void {
  const { timing } = book(rt);
  const now = clock(rt);
  if (now - w.registeredAt >= timing.hookMs || (w.open === 0 && now - w.lastSeen >= timing.recoveryMs)) close(w);
}

const boundIds = (b: Book): Set<string> => new Set([...b.byId.values()].map((w) => w.questionId).filter((id): id is string => id !== null));

/** The latest pending question with the content of a waiter and no waiter bound yet. */
function candidate(b: Book, key: string, questions: readonly ChatQuestion[]): ChatQuestion | undefined {
  const bound = boundIds(b);
  return questions.filter((q) => q.state === 'pending' && !bound.has(q.id) && contentKey(q.parts) === key).at(-1);
}

/**
 * A closed question with the content of an unbound waiter, no waiter bound, asked at most graceMs
 * before the registration: the question of the hook, answered in the app before the transcript
 * showed it pending (live check T008: without the PreToolUse hook the call is written with its result).
 */
function answeredUnbound(b: Book, w: Waiter, questions: readonly ChatQuestion[]): ChatQuestion | undefined {
  const bound = boundIds(b);
  return questions.find((q) => q.state !== 'pending' && !bound.has(q.id) && contentKey(q.parts) === w.contentKey && q.at !== null && Date.parse(q.at) >= w.registeredAt - b.timing.graceMs);
}

/** Brings the waiters of a transcript up to date with its questions: binding, closing, expiry. */
function settle(rt: ClaudeRuntime, transcriptPath: string, questions: readonly ChatQuestion[]): void {
  const b = book(rt);
  for (const w of b.byId.values()) {
    if (w.transcriptPath !== transcriptPath || w.state === 'closed') continue;
    if (w.questionId === null) {
      const found = candidate(b, w.contentKey, questions);
      if (found) w.questionId = found.id;
    }
    if (w.questionId === null) {
      const answered = answeredUnbound(b, w, questions);
      if (answered) {
        w.questionId = answered.id;
        close(w);
        continue;
      }
    }
    const bound = w.questionId === null ? undefined : questions.find((q) => q.id === w.questionId);
    if (bound && bound.state !== 'pending') close(w);
    else expire(rt, w);
  }
  trim(b);
}

async function questionsOf(rt: ClaudeRuntime, transcriptPath: string): Promise<ChatQuestion[]> {
  return (await rt.chat.read(transcriptPath, 1)).questions ?? [];
}

/** A sent record of the attempts journal: the answer was handed out before a restart (spec 2.1). */
async function sentBefore(rt: ClaudeRuntime, project: Project, sessionId: string, questionId: string): Promise<boolean> {
  const key = questionKey('claude', project.id, sessionId, questionId);
  const records = await readQuestionAttempts(questionAttemptsFile(rt.context.dirs, rt.context.platform));
  return records.some((r) => r.key === key && r.state === 'sent');
}

function sleep(ms: number, w: Waiter | null, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      w?.wake.delete(done);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    w?.wake.add(done);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * One request of wfk hook question. A new waiterId registers a waiter (an unreadable transcript or
 * journal, or a question already answered before a restart, gives release); a known one goes on.
 * The request is held until a decision (printed by the hook), the end of the waiter (release) or
 * holdMs (wait). Other tools always get release.
 */
export async function questionHook(rt: ClaudeRuntime, project: Project, request: QuestionHookRequest, signal: AbortSignal): Promise<QuestionHookReply> {
  if (request.toolName !== QUESTION_TOOL || !isObject(request.toolInput)) return { release: true };
  const b = book(rt);
  let w = b.byId.get(request.waiterId);
  if (!w) {
    try {
      const transcriptPath = usablePath(request.transcriptPath) ? request.transcriptPath : (await findSession(rt, project, request.sessionId)).hook?.hook.transcriptPath;
      if (!usablePath(transcriptPath)) return { release: true };
      const key = contentKey(partsOf(request.toolInput).parts);
      const questions = await questionsOf(rt, transcriptPath);
      settle(rt, transcriptPath, questions);
      const found = candidate(b, key, questions);
      if (found && (await sentBefore(rt, project, request.sessionId, found.id))) return { release: true };
      w = b.byId.get(request.waiterId);
      if (!w) {
        const now = clock(rt);
        // A new waiter of the session displaces the older ones (one question at a time, T001 P7).
        for (const other of b.byId.values()) if (other.transcriptPath === transcriptPath) close(other);
        w = { id: request.waiterId, transcriptPath, contentKey: key, toolInput: request.toolInput, registeredAt: now, lastSeen: now, open: 0, state: 'waiting', questionId: null, wake: new Set() };
        b.byId.set(w.id, w);
        settle(rt, transcriptPath, questions);
      }
    } catch (error) {
      rt.context.log(`claude: question hook of ${request.sessionId} released: ${error instanceof Error ? error.message : String(error)}`);
      return { release: true };
    }
  }
  const waiter = w;
  expire(rt, waiter);
  waiter.open += 1;
  waiter.lastSeen = clock(rt);
  const deadline = clock(rt) + b.timing.holdMs;
  try {
    for (;;) {
      if (waiter.state === 'decided' && waiter.decision) return { decision: waiter.decision };
      if (waiter.state === 'closed') return { release: true };
      if (signal.aborted || clock(rt) >= deadline) return { wait: true };
      await sleep(Math.min(b.timing.tickMs, Math.max(1, deadline - clock(rt))), waiter, signal);
      settle(rt, waiter.transcriptPath, await questionsOf(rt, waiter.transcriptPath).catch(() => []));
    }
  } finally {
    waiter.open -= 1;
    waiter.lastSeen = clock(rt);
  }
}

/**
 * The questions of a page as the waiters see them: a pending question bound to a waiting waiter is
 * answerable; otherwise the reason says why not.
 */
export function withWaiters(rt: ClaudeRuntime, transcriptPath: string | null, questions: ChatQuestion[] | undefined): ChatQuestion[] | undefined {
  if (!questions || !usablePath(transcriptPath)) return questions;
  settle(rt, transcriptPath, questions);
  const b = book(rt);
  const now = clock(rt);
  return questions.map((q) => {
    if (q.state !== 'pending') return q;
    const bound = [...b.byId.values()].filter((w) => w.questionId === q.id);
    if (bound.some((w) => w.state === 'waiting')) {
      const { reason: _reason, ...rest } = q;
      return { ...rest, answerable: true };
    }
    const fresh = q.at !== null && now - Date.parse(q.at) < b.timing.graceMs;
    const reason = bound.length > 0 ? QUESTION_HOOK_ENDED_REASON : fresh ? CLAUDE_QUESTION_REASON : QUESTION_OLD_SESSION_REASON;
    return { ...q, answerable: false, reason };
  });
}

/** The value of one answer as the hook gives it: one label or own text as a string, several as an array. */
function answerValue(part: ChatQuestionPart, answer: ChatQuestionAnswer[string]): string | string[] {
  const values = [...answer.selected, ...(answer.other !== undefined ? [answer.other] : [])];
  return part.multiSelect && values.length > 1 ? values : values[0]!;
}

/** What the transcript shows for a value: Claude joins an array with ", " (T001, D2). */
const shown = (part: ChatQuestionPart, value: string | string[]): ReturnType<typeof partAnswerOf> => partAnswerOf(part, Array.isArray(value) ? value.join(', ') : value);

const stale = (): ProviderError => new ProviderError('question-stale', 'На вопрос уже ответили', { status: 409 });

/**
 * answerQuestion of the provider (rules of spec section 2.1): a fresh read, checkQuestionAnswer,
 * commit() (the journal), the decision to the bound waiting waiter once, then the result in the
 * transcript within confirmMs: the same answers — accepted, others or a cancel — question-stale,
 * an unknown format — unknown, nothing — question-timeout.
 */
export async function answerQuestion(rt: ClaudeRuntime, project: Project, sid: string, questionId: string, attempt: QuestionAttempt, commit: () => Promise<void>): Promise<QuestionOutcome> {
  const transcriptPath = (await findSession(rt, project, sid)).hook?.hook.transcriptPath ?? null;
  if (!usablePath(transcriptPath)) throw stale();
  const question = withWaiters(rt, transcriptPath, await questionsOf(rt, transcriptPath))?.find((q) => q.id === questionId);
  if (!question) throw stale();
  const answers = checkQuestionAnswer(question, attempt.answers);
  const b = book(rt);
  const waiter = [...b.byId.values()].find((w) => w.questionId === questionId && w.state === 'waiting');
  if (!waiter) throw new ProviderError('question-unavailable', QUESTION_HOOK_ENDED_REASON, { status: 409 });
  const texts = partsOf(waiter.toolInput).texts;
  const values = question.parts.map((part) => answerValue(part, answers[part.id]!));
  const updatedInput = { ...waiter.toolInput, answers: Object.fromEntries(question.parts.map((_, i) => [texts[i]!, values[i]!])) };
  await commit();
  // Nothing awaited between this check and the decision: it is given once, to a waiting waiter only.
  if (waiter.state !== 'waiting') throw waiter.state === 'closed' ? stale() : new ProviderError('question-sent', 'Ответ на этот вопрос уже отправлен', { status: 409 });
  waiter.state = 'decided';
  waiter.decision = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedInput } } };
  notify(waiter);
  const expected = Object.fromEntries(question.parts.map((part, i) => [part.id, shown(part, values[i]!)]));
  const deadline = clock(rt) + b.timing.confirmMs;
  for (;;) {
    const now = (await questionsOf(rt, transcriptPath).catch(() => [])).find((q) => q.id === questionId);
    if (now && now.state !== 'pending') {
      settle(rt, transcriptPath, [now]);
      if (now.state === 'cancelled') throw stale();
      if (!now.answers) return 'unknown';
      return JSON.stringify(now.answers) === JSON.stringify(expected) ? 'accepted' : (() => { throw stale(); })();
    }
    if (clock(rt) >= deadline) throw new ProviderError('question-timeout', 'Ответ отправлен, подтверждение не пришло. Проверьте чат провайдера', { status: 504 });
    await sleep(b.timing.tickMs, null);
  }
}
