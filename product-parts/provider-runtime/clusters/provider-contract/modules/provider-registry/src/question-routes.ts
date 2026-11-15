// Route of an answer to an agent's question (spec M33 section 2.1) and the journal's view of the
// questions of a page. The attempt rules live here, once for all providers.
import { HttpError } from '#http-server';
import type { EventLog } from '#data-store';
import type { ChatRouteParts } from './chat-routes.ts';
import { ProviderError } from './contract.ts';
import { providerLabel } from './contract.ts';
import { QUESTION_JOURNAL_FULL_REASON, ATTEMPTS_MAX, questionKey } from './question-attempts.ts';
import type { QuestionAttempts } from './question-attempts.ts';
import { QUESTION_LABEL_MAX, QUESTION_OPTIONS_MAX, QUESTION_OTHER_MAX, QUESTION_PARTS_MAX, QUESTION_SENT_BEFORE_RESTART_REASON, QUESTION_SENT_REASON } from './questions.ts';
import type { ChatQuestion, ChatQuestionAnswer, QuestionOutcome } from './questions.ts';

const QUESTION_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An attempt in progress: same attemptId waits for it, another one is refused. */
interface Inflight { attemptId: string; promise: Promise<QuestionOutcome> }

export interface QuestionRouteParts extends ChatRouteParts {
  attempts: QuestionAttempts;
  events?: EventLog;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The body { attemptId, answers }: shape only; the provider checks the answer against the question. */
function bodyOf(body: unknown): { attemptId: string; answers: ChatQuestionAnswer } {
  const invalid = (): never => { throw new HttpError(400, 'question-invalid', 'Ответ не подходит к вопросу'); };
  if (!isObject(body) || Object.keys(body).some((k) => k !== 'attemptId' && k !== 'answers')) return invalid();
  const attemptId = body['attemptId'];
  const answers = body['answers'];
  if (typeof attemptId !== 'string' || !UUID.test(attemptId) || !isObject(answers)) return invalid();
  const entries = Object.entries(answers);
  if (entries.length === 0 || entries.length > QUESTION_PARTS_MAX) return invalid();
  for (const [id, part] of entries) {
    if (id.length === 0 || id.length > 64 || !isObject(part) || Object.keys(part).some((k) => k !== 'selected' && k !== 'other')) return invalid();
    const selected = part['selected'];
    if (!Array.isArray(selected) || selected.length > QUESTION_OPTIONS_MAX || selected.some((s) => typeof s !== 'string' || s.length > QUESTION_LABEL_MAX)) return invalid();
    if (part['other'] !== undefined && (typeof part['other'] !== 'string' || part['other'].length > QUESTION_OTHER_MAX)) return invalid();
  }
  return { attemptId, answers: answers as ChatQuestionAnswer };
}

/** Coordinates attempts of all providers; one per service. */
export function createQuestionCoordinator(attempts: QuestionAttempts) {
  const inflight = new Map<string, Inflight>();
  return {
    inflight,
    /**
     * The questions of a page as the journal sees them: a pending question with a sent record is not
     * answerable (delivery sent); a closed question finishes its sent record.
     */
    async apply(provider: string, project: string, session: string, questions: ChatQuestion[] | undefined): Promise<ChatQuestion[] | undefined> {
      if (!questions) return questions;
      try { await attempts.ready(); } catch { return questions.map((q) => (q.state === 'pending' ? { ...q, answerable: false, reason: 'Журнал ответов не читается. Ответьте в приложении провайдера' } : q)); }
      const out: ChatQuestion[] = [];
      for (const q of questions) {
        const key = questionKey(provider, project, session, q.id);
        const record = attempts.find(key);
        if (record?.state === 'sent' && q.state !== 'pending' && !inflight.has(key)) await attempts.finish(key, 'closed').catch(() => undefined);
        if (record?.state === 'sent' && q.state === 'pending') {
          const { answers: _a, ...rest } = q;
          out.push({ ...rest, answerable: false, delivery: 'sent', reason: inflight.has(key) ? QUESTION_SENT_REASON : QUESTION_SENT_BEFORE_RESTART_REASON });
        } else out.push(q);
      }
      return out;
    },
  };
}

export type QuestionCoordinator = ReturnType<typeof createQuestionCoordinator>;

/** Registers POST /api/projects/:id/providers/:p/sessions/:sid/questions/:qid/answer. */
export function registerQuestionRoutes(parts: QuestionRouteParts & { coordinator: QuestionCoordinator }): void {
  const { router, attempts, coordinator, events } = parts;
  router.post('/api/projects/:id/providers/:p/sessions/:sid/questions/:qid/answer', async (ctx) => {
    const qid = ctx.params['qid'] ?? '';
    if (!QUESTION_ID.test(qid)) throw new HttpError(400, 'question-invalid', 'Ответ не подходит к вопросу');
    const provider = parts.providerOf(ctx);
    const project = await parts.projectOf(ctx);
    const sid = parts.sessionIdOf(ctx);
    const { attemptId, answers } = bodyOf(ctx.body);
    const answer = provider.answerQuestion?.bind(provider);
    if (!answer) throw new HttpError(404, 'unsupported', 'Ответ на вопросы не поддерживается');
    const sessions = await provider.listSessions(project).catch((error: unknown) => Promise.reject(parts.toHttpError(error)));
    const session = sessions.find((s) => s.localId === sid) ?? sessions.find((s) => s.remoteId === sid);
    if (!session) throw new HttpError(404, 'unknown-session', 'Сессия не найдена');
    try { await attempts.ready(); } catch {
      throw new HttpError(502, 'question-failed', `${providerLabel(provider)} не принял ответ: журнал ответов не читается`);
    }
    const key = questionKey(provider.id, project.id, session.localId, qid);
    // From here to inflight.set there is no await: the check and the registration are one step.
    const running = coordinator.inflight.get(key);
    const record = attempts.find(key);
    let promise: Promise<QuestionOutcome>;
    if (running) {
      if (running.attemptId !== attemptId) throw new HttpError(409, 'question-sent', 'Ответ на этот вопрос уже отправлен');
      promise = running.promise;
    } else if (record) {
      if (record.attemptId !== attemptId) {
        throw record.state === 'done' ? new HttpError(409, 'question-stale', 'На вопрос уже ответили') : new HttpError(409, 'question-sent', 'Ответ на этот вопрос уже отправлен');
      }
      if (record.state === 'sent') throw new HttpError(504, 'question-timeout', 'Ответ отправлен, подтверждение не пришло. Проверьте чат провайдера');
      if (record.outcome === 'accepted' || record.outcome === 'unknown') return { answered: true, outcome: record.outcome };
      throw new HttpError(409, 'question-stale', 'На вопрос уже ответили');
    } else {
      if (attempts.sentCount() >= ATTEMPTS_MAX) throw new HttpError(409, 'question-unavailable', QUESTION_JOURNAL_FULL_REASON);
      let committed = false;
      const commit = async (): Promise<void> => {
        if (committed) return;
        try { await attempts.begin(key, attemptId); } catch {
          throw new ProviderError('question-failed', `${providerLabel(provider)} не принял ответ: журнал ответов не записан`, { status: 502 });
        }
        committed = true;
      };
      promise = (async () => {
        try {
          const outcome = await answer(project, session.localId, qid, { id: attemptId, answers }, commit);
          if (!committed) throw new ProviderError('question-failed', `${providerLabel(provider)} не принял ответ: ответ не передан`, { status: 502 });
          await attempts.finish(key, outcome).catch(() => undefined);
          await events?.append('provider.question.answered', { provider: provider.id, project: project.id, session: session.localId, question: qid, outcome }).catch(() => undefined);
          return outcome;
        } catch (error) {
          if (committed && error instanceof ProviderError && error.code === 'question-stale') await attempts.finish(key, 'stale').catch(() => undefined);
          throw error;
        }
      })();
      const entry = { attemptId, promise };
      coordinator.inflight.set(key, entry);
      void promise.then(() => undefined, () => undefined).finally(() => { if (coordinator.inflight.get(key) === entry) coordinator.inflight.delete(key); });
    }
    try {
      return { answered: true, outcome: await promise };
    } catch (error) {
      if (error instanceof ProviderError && error.code.startsWith('question-')) {
        const status = { 'question-invalid': 400, 'question-stale': 409, 'question-sent': 409, 'question-unavailable': 409, 'question-failed': 502, 'question-timeout': 504 }[error.code] ?? error.status;
        throw new HttpError(status, error.code, error.message, { ...error.details, ...(error.hint ? { hint: error.hint } : {}) });
      }
      throw parts.toHttpError(error);
    }
  });
}
