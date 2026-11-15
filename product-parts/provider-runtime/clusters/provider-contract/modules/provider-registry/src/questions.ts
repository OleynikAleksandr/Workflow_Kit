// Interactive questions of an agent (spec M33 section 2.1): the shapes a provider gives with a chat
// page, the limits the route applies and the check of an answer. Details: questions.md of this module.
import { ProviderError } from './contract.ts';
import type { Project } from '#project-registry';

/** One option of a question part. */
export interface ChatQuestionOption {
  label: string;
  description: string;
}

/** One question of a card; options may be empty (then only own text, allowOther true). */
export interface ChatQuestionPart {
  id: string;
  header: string;
  question: string;
  options: ChatQuestionOption[];
  multiSelect: boolean;
  allowOther: boolean;
}

/** Chosen labels and own text of one part. */
export interface ChatQuestionPartAnswer {
  selected: string[];
  other?: string;
}

/** An answer: part id → chosen labels and own text. */
export type ChatQuestionAnswer = Record<string, ChatQuestionPartAnswer>;

export type ChatQuestionState = 'pending' | 'answered' | 'cancelled';

/** A question of the agent in the session feed. */
export interface ChatQuestion {
  id: string;
  at: string | null;
  /** Message of the feed the question stands after; null — at the start. */
  afterMessageId: string | null;
  state: ChatQuestionState;
  parts: ChatQuestionPart[];
  /** Kit can deliver an answer now (only a pending question without delivery). */
  answerable: boolean;
  /** Safe text: why the question cannot be answered here. */
  reason?: string;
  /** 'sent': Kit has handed an answer to the provider, the outcome is not confirmed yet. */
  delivery?: 'sent';
  /** Only a proven outcome of an answered question; absent — unknown. */
  answers?: ChatQuestionAnswer;
  /**
   * 'message': the answer reaches the agent as a user's message (the asynchronous question of
   * Codex, spec M33 section 2.7, M34 section 2.1). The panel still answers through the answer route
   * with an attempt; answers come from the reply message of the feed, whoever sent it. The card
   * stands after its message and leaves the status line alone.
   */
  reply?: 'message';
}

/** An answer attempt of the panel: the client's UUID and the answer. */
export interface QuestionAttempt {
  id: string;
  answers: ChatQuestionAnswer;
}

/** accepted: the provider confirmed the panel's answer; unknown: delivered, whose answer won is not known. */
export type QuestionOutcome = 'accepted' | 'unknown';

/** One request of a question hook (wfk hook question, spec M33 section 2.3). */
export interface QuestionHookRequest {
  client: string;
  sessionId: string;
  transcriptPath: string | null;
  cwd: string | null;
  projectDir: string | null;
  /** UUID the hook process made at its start; the same in every request of that process. */
  waiterId: string;
  toolName: string | null;
  toolInput: unknown;
}

/** wait: ask again; release: exit without output (the native dialog goes on); decision: print it. */
export type QuestionHookReply = { wait: true } | { release: true } | { decision: Record<string, unknown> };

/** The question methods of a provider (part of Provider). */
export interface ProviderQuestions {
  /** Answers an agent's question once: fresh read, checkQuestionAnswer, commit(), hand-out (questions.md). */
  answerQuestion?(project: Project, sessionId: string, questionId: string, attempt: QuestionAttempt, commit: () => Promise<void>): Promise<QuestionOutcome>;
  /** Holds a question hook request (at most a few minutes); the signal ends with the HTTP request. */
  questionHook?(project: Project, request: QuestionHookRequest, signal: AbortSignal): Promise<QuestionHookReply>;
}

/** Newest questions a page carries. */
export const QUESTIONS_PAGE_MAX = 20;
export const QUESTION_PARTS_MAX = 4;
export const QUESTION_OPTIONS_MAX = 8;
export const QUESTION_HEADER_MAX = 60;
export const QUESTION_LABEL_MAX = 200;
export const QUESTION_DESCRIPTION_MAX = 1000;
export const QUESTION_TEXT_MAX = 2000;
export const QUESTION_OTHER_MAX = 2000;
const ID_MAX = 200;
const PART_ID_MAX = 64;
const REASON_MAX = 300;

export const QUESTION_TOO_LARGE_REASON = 'Вопрос больше, чем показывает Workflow Kit. Ответьте в приложении провайдера';
export const QUESTION_SENT_REASON = 'Ответ отправлен, ждём подтверждения';
export const QUESTION_SENT_BEFORE_RESTART_REASON = 'Ответ был отправлен до перезапуска службы. Если вопрос ещё открыт, ответьте в приложении провайдера';
export const QUESTION_UNAVAILABLE_REASON = 'Ответьте в приложении провайдера';

const STATES: readonly string[] = ['pending', 'answered', 'cancelled'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Text without control characters other than \n and \t, CRLF as \n, trimmed. */
export function cleanAnswerText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '').trim();
}

/** A text field cut to max (never inside a surrogate pair); reports whether it was cut. */
function cut(value: unknown, max: number, mark: { large: boolean }): string {
  if (typeof value !== 'string') return '';
  if (value.length <= max) return value;
  mark.large = true;
  let end = max;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return value.slice(0, end) + '…';
}

function safeId(value: unknown, max = ID_MAX): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function safeLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const line = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return line ? (line.length > REASON_MAX ? line.slice(0, REASON_MAX) + '…' : line) : null;
}

function partOut(value: unknown, mark: { large: boolean }): ChatQuestionPart | null {
  if (!isObject(value)) return null;
  const id = safeId(value['id'], PART_ID_MAX);
  if (!id) return null;
  const all = Array.isArray(value['options']) ? value['options'].filter(isObject) : [];
  if (all.length > QUESTION_OPTIONS_MAX) mark.large = true;
  const options = all.slice(0, QUESTION_OPTIONS_MAX).map((o) => ({ label: cut(o['label'], QUESTION_LABEL_MAX, mark), description: cut(o['description'], QUESTION_DESCRIPTION_MAX, mark) }));
  return {
    id,
    header: cut(value['header'], QUESTION_HEADER_MAX, mark),
    question: cut(value['question'], QUESTION_TEXT_MAX, mark),
    options,
    multiSelect: value['multiSelect'] === true,
    allowOther: value['allowOther'] === true || options.length === 0,
  };
}

function answersOut(value: unknown, parts: ChatQuestionPart[]): ChatQuestionAnswer | undefined {
  if (!isObject(value)) return undefined;
  const out: ChatQuestionAnswer = {};
  for (const part of parts) {
    const raw = value[part.id];
    if (!isObject(raw)) continue;
    const selected = Array.isArray(raw['selected']) ? raw['selected'].filter((s): s is string => typeof s === 'string').slice(0, QUESTION_OPTIONS_MAX).map((s) => s.slice(0, QUESTION_LABEL_MAX)) : [];
    const other = typeof raw['other'] === 'string' && raw['other'].trim() ? raw['other'].slice(0, QUESTION_OTHER_MAX) : undefined;
    if (selected.length === 0 && other === undefined) continue;
    out[part.id] = other === undefined ? { selected } : { selected, other };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** One question as the route answers: contract fields only, limits applied. Null when invalid. */
export function questionOut(value: unknown): ChatQuestion | null {
  if (!isObject(value)) return null;
  const id = safeId(value['id']);
  const state = typeof value['state'] === 'string' && STATES.includes(value['state']) ? (value['state'] as ChatQuestionState) : null;
  if (!id || !state) return null;
  const mark = { large: false };
  const all = Array.isArray(value['parts']) ? value['parts'] : [];
  if (all.length > QUESTION_PARTS_MAX) mark.large = true;
  const parts = all.slice(0, QUESTION_PARTS_MAX).map((p) => partOut(p, mark)).filter((p): p is ChatQuestionPart => p !== null);
  const reply = value['reply'] === 'message' ? 'message' : undefined;
  const delivery = value['delivery'] === 'sent' ? 'sent' : undefined;
  let reason = safeLine(value['reason']) ?? undefined;
  if (mark.large) reason = QUESTION_TOO_LARGE_REASON;
  const answerable = value['answerable'] === true && state === 'pending' && delivery === undefined && !mark.large && parts.length > 0;
  if (!answerable && state === 'pending' && reason === undefined) reason = delivery ? QUESTION_SENT_REASON : QUESTION_UNAVAILABLE_REASON;
  const at = typeof value['at'] === 'string' ? value['at'] : null;
  const after = safeId(value['afterMessageId']);
  const answers = state === 'answered' ? answersOut(value['answers'], parts) : undefined;
  return {
    id,
    at,
    afterMessageId: after,
    state,
    parts,
    answerable,
    ...(reason === undefined || answerable ? {} : { reason }),
    ...(delivery ? { delivery } : {}),
    ...(answers ? { answers } : {}),
    ...(reply ? { reply } : {}),
  };
}

/** Questions of a page: valid ones, the newest QUESTIONS_PAGE_MAX, oldest first; undefined keeps the old contract. */
export function questionsOut(value: unknown): ChatQuestion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const all = value.map(questionOut).filter((q): q is ChatQuestion => q !== null);
  return all.length > QUESTIONS_PAGE_MAX ? all.slice(all.length - QUESTIONS_PAGE_MAX) : all;
}

/**
 * The common check of an answer against the current question (spec M33 section 2.1). Resolves to
 * the normalized answer, throws ProviderError question-stale, question-sent, question-unavailable
 * or question-invalid. A provider calls it on a fresh read right before handing the answer out.
 */
export function checkQuestionAnswer(question: ChatQuestion, answer: unknown): ChatQuestionAnswer {
  if (question.state !== 'pending') throw new ProviderError('question-stale', 'На вопрос уже ответили', { status: 409 });
  if (question.delivery === 'sent') throw new ProviderError('question-sent', 'Ответ на этот вопрос уже отправлен', { status: 409 });
  if (!question.answerable) throw new ProviderError('question-unavailable', question.reason ?? QUESTION_UNAVAILABLE_REASON, { status: 409 });
  const invalid = (): never => { throw new ProviderError('question-invalid', 'Ответ не подходит к вопросу', { status: 400 }); };
  if (!isObject(answer)) return invalid();
  const ids = question.parts.map((p) => p.id);
  if (Object.keys(answer).length !== ids.length || Object.keys(answer).some((k) => !ids.includes(k))) return invalid();
  const out: ChatQuestionAnswer = {};
  for (const part of question.parts) {
    const raw = answer[part.id];
    if (!isObject(raw) || Object.keys(raw).some((k) => k !== 'selected' && k !== 'other')) return invalid();
    const selected = raw['selected'];
    if (!Array.isArray(selected) || selected.some((s) => typeof s !== 'string')) return invalid();
    const labels = part.options.map((o) => o.label);
    if (new Set(selected).size !== selected.length || (selected as string[]).some((s) => !labels.includes(s))) return invalid();
    let other: string | undefined;
    if (raw['other'] !== undefined) {
      if (typeof raw['other'] !== 'string' || !part.allowOther) return invalid();
      other = cleanAnswerText(raw['other']);
      if (!other || other.length > QUESTION_OTHER_MAX) return invalid();
    }
    const count = selected.length + (other === undefined ? 0 : 1);
    if (part.multiSelect ? count < 1 : count !== 1) return invalid();
    out[part.id] = other === undefined ? { selected: [...(selected as string[])] } : { selected: [...(selected as string[])], other };
  }
  return out;
}
