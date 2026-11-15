// @ts-check
// The pure model of an agent's question card (spec M33 section 2.5): which questions of a page are
// shown where, what the user has chosen, when «Отправить» is active, the body of the answer and
// the lines of every state of an attempt. No DOM here: question-card.js draws it.

/** @typedef {{ label: string, description: string }} QuestionOption */
/** @typedef {{ id: string, header: string, question: string, options: QuestionOption[], multiSelect: boolean, allowOther: boolean }} QuestionPart */
/**
 * @typedef {object} Question
 * @property {string} id
 * @property {string | null} at
 * @property {string | null} afterMessageId
 * @property {'pending' | 'answered' | 'cancelled'} state
 * @property {QuestionPart[]} parts
 * @property {boolean} answerable
 * @property {string} [reason]
 * @property {'sent'} [delivery]
 * @property {Record<string, { selected: string[], other?: string }>} [answers]
 */
/** One part as chosen: labels, own text and whether «Свой вариант» is on. @typedef {{ selected: string[], other: string, otherOn: boolean }} PartChoice */
/** @typedef {Record<string, PartChoice>} Choice */
/**
 * The attempt of the card: idle, sending (with its attemptId), sent and waiting for the outcome,
 * refused with a line (a new attempt allowed), or done with the outcome.
 * @typedef {{ phase: 'idle' } | { phase: 'sending', attemptId: string } | { phase: 'waiting', attemptId: string } | { phase: 'refused', text: string } | { phase: 'done', outcome: 'accepted' | 'unknown' }} Attempt
 */

export const WAITING_STATUS = 'Агент ждёт вашего ответа';
export const SEND_LABEL = 'Отправить';
export const OTHER_LABEL = 'Свой вариант';
export const OTHER_PLACEHOLDER = 'Напишите свой ответ';
export const SENDING_TEXT = 'Отправляю ответ…';
export const SENT_WAITING_TEXT = 'Ответ отправлен, ждём подтверждения';
export const ANSWERED_IN_APP_TEXT = 'Ответ дан в приложении';
export const UNKNOWN_OUTCOME_TEXT = 'Ответ отправлен. Какой ответ принят, провайдер не сообщил';
export const CANCELLED_TEXT = 'Вопрос отменён';
export const OPEN_APP_TEXT = 'Открыть чат провайдера';
/** Tries of one attempt after network errors (the same attemptId), and the pause between them. */
export const SEND_TRIES = 3;
export const RETRY_MS = 1000;
/** Codes after which nothing was handed out: the same button makes a new attempt. */
export const RETRY_CODES = ['question-invalid', 'question-unavailable', 'question-failed'];
/** Codes after which the answer may have been handed out: no button, the outcome comes by polling. */
export const WAIT_CODES = ['question-timeout', 'question-sent'];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The questions of a page; undefined when the provider gives none (old page).
 * @param {unknown} page
 * @returns {Question[] | undefined}
 */
export function questionsOf(page) {
  if (!isObject(page) || !Array.isArray(page['questions'])) return undefined;
  return /** @type {Question[]} */ (page['questions'].filter((q) => isObject(q) && typeof q['id'] === 'string' && Array.isArray(q['parts'])));
}

/**
 * The newest pending question (it stands at the end of the feed); null without one.
 * @param {Question[] | undefined} questions
 * @returns {Question | null}
 */
export function pendingQuestion(questions) {
  return [...(questions ?? [])].reverse().find((q) => q.state === 'pending') ?? null;
}

/**
 * The closed questions placed after their message: message id → questions; '' — before every message.
 * @param {Question[] | undefined} questions
 * @param {ReadonlySet<string>} messageIds
 * @returns {Map<string, Question[]>}
 */
export function closedPlaces(questions, messageIds) {
  /** @type {Map<string, Question[]>} */
  const places = new Map();
  for (const q of questions ?? []) {
    if (q.state === 'pending') continue;
    const after = q.afterMessageId && messageIds.has(q.afterMessageId) ? q.afterMessageId : '';
    places.set(after, [...(places.get(after) ?? []), q]);
  }
  return places;
}

/** @param {Question} question @returns {Choice} */
export function emptyChoice(question) {
  return Object.fromEntries(question.parts.map((p) => [p.id, { selected: [], other: '', otherOn: false }]));
}

/**
 * One option pressed: a radio replaces the choice (and turns own text off), a checkbox toggles.
 * @param {Choice} choice
 * @param {QuestionPart} part
 * @param {string} label
 * @returns {Choice}
 */
export function pick(choice, part, label) {
  const current = choice[part.id] ?? { selected: [], other: '', otherOn: false };
  if (!part.multiSelect) return { ...choice, [part.id]: { ...current, selected: [label], otherOn: false } };
  const selected = current.selected.includes(label) ? current.selected.filter((l) => l !== label) : [...current.selected, label];
  return { ...choice, [part.id]: { ...current, selected } };
}

/**
 * «Свой вариант» turned on or off; for a single choice it replaces the options.
 * @param {Choice} choice @param {QuestionPart} part @param {boolean} on
 * @returns {Choice}
 */
export function toggleOther(choice, part, on) {
  const current = choice[part.id] ?? { selected: [], other: '', otherOn: false };
  return { ...choice, [part.id]: { ...current, otherOn: on, selected: on && !part.multiSelect ? [] : current.selected } };
}

/** @param {Choice} choice @param {QuestionPart} part @param {string} text @returns {Choice} */
export function writeOther(choice, part, text) {
  const current = choice[part.id] ?? { selected: [], other: '', otherOn: false };
  return { ...choice, [part.id]: { ...current, other: text, otherOn: true, selected: part.multiSelect ? current.selected : [] } };
}

/**
 * The answer of the card, or null while a part has no answer: a single choice — one label or own
 * text; multiSelect — at least one label or own text. Labels keep the order of the options.
 * @param {Question} question
 * @param {Choice} choice
 * @returns {Record<string, { selected: string[], other?: string }> | null}
 */
export function answerOf(question, choice) {
  /** @type {Record<string, { selected: string[], other?: string }>} */
  const out = {};
  for (const part of question.parts) {
    const c = choice[part.id];
    if (!c) return null;
    const other = part.allowOther && c.otherOn ? c.other.trim() : '';
    const selected = part.options.map((o) => o.label).filter((l) => c.selected.includes(l));
    if (!part.multiSelect && selected.length + (other ? 1 : 0) !== 1) return null;
    if (part.multiSelect && selected.length === 0 && !other) return null;
    out[part.id] = other ? { selected, other } : { selected };
  }
  return question.parts.length > 0 ? out : null;
}

/**
 * What the card of a pending question shows under its parts: the line, its tone, whether the
 * options can be chosen and whether «Отправить» is there and active.
 * @param {Question} question
 * @param {Choice} choice
 * @param {Attempt} attempt
 * @returns {{ text: string, tone: 'muted' | 'error' | '', choosable: boolean, button: boolean, active: boolean, openApp: boolean }}
 */
export function cardView(question, choice, attempt) {
  if (question.delivery === 'sent' || attempt.phase === 'waiting') {
    // Sent before a restart of the service: its own reason and the link to the provider's chat.
    const restart = question.delivery === 'sent' && question.reason !== undefined && question.reason !== SENT_WAITING_TEXT;
    return { text: restart ? /** @type {string} */ (question.reason) : SENT_WAITING_TEXT, tone: 'muted', choosable: false, button: false, active: false, openApp: restart };
  }
  if (!question.answerable) return { text: question.reason ?? '', tone: 'muted', choosable: false, button: false, active: false, openApp: true };
  if (attempt.phase === 'sending') return { text: SENDING_TEXT, tone: 'muted', choosable: false, button: true, active: false, openApp: false };
  const ready = answerOf(question, choice) !== null;
  return { text: attempt.phase === 'refused' ? attempt.text : '', tone: attempt.phase === 'refused' ? 'error' : '', choosable: true, button: true, active: ready, openApp: false };
}

/**
 * The line of a closed question: the proven answer, or what is known. The panel's own choice is
 * never put in place of an unknown outcome.
 * @param {Question} question
 * @param {Attempt} [attempt] the card's attempt of this question, when it had one
 * @returns {{ answers: Array<{ header: string, text: string }>, note: string }}
 */
export function closedView(question, attempt) {
  if (question.state === 'cancelled') return { answers: [], note: CANCELLED_TEXT };
  if (question.answers) {
    const answers = question.parts.filter((p) => question.answers?.[p.id]).map((p) => {
      const a = /** @type {{ selected: string[], other?: string }} */ (question.answers?.[p.id]);
      return { header: p.header || p.question, text: [...a.selected, ...(a.other ? [a.other] : [])].join(', ') };
    });
    return { answers, note: '' };
  }
  const ours = attempt && (attempt.phase === 'done' || attempt.phase === 'waiting' || attempt.phase === 'sending');
  return { answers: [], note: ours ? UNKNOWN_OUTCOME_TEXT : ANSWERED_IN_APP_TEXT };
}

/**
 * The attempt after a refusal of the route (HttpError of the panel api: status, code, message).
 * @param {unknown} error
 * @param {string} attemptId
 * @returns {{ attempt: Attempt, repoll: boolean, retry: boolean }}
 */
export function afterError(error, attemptId) {
  const e = isObject(error) ? error : {};
  const code = typeof e['code'] === 'string' ? e['code'] : '';
  const message = typeof e['message'] === 'string' && e['message'] ? e['message'] : 'Ответ не отправлен';
  if (code === 'question-stale') return { attempt: { phase: 'idle' }, repoll: true, retry: false };
  if (WAIT_CODES.includes(code)) return { attempt: { phase: 'waiting', attemptId }, repoll: true, retry: false };
  if (RETRY_CODES.includes(code)) return { attempt: { phase: 'refused', text: message }, repoll: code === 'question-unavailable', retry: false };
  // No answer of the route (a network error, status 0 or a gateway failure): the same attemptId again.
  const status = typeof e['status'] === 'number' ? e['status'] : 0;
  if (status === 0 || code === '' || code === 'network') return { attempt: { phase: 'sending', attemptId }, repoll: false, retry: true };
  return { attempt: { phase: 'refused', text: message }, repoll: true, retry: false };
}

/**
 * URL of the answer route of a question.
 * @param {string} messagesUrl the URL of the session's messages (chat-model messagesUrl)
 * @param {string} questionId
 */
export function answerUrl(messagesUrl, questionId) {
  return `${messagesUrl.replace(/\/messages$/, '')}/questions/${encodeURIComponent(questionId)}/answer`;
}

/** A new attemptId (UUID v4). */
export function newAttemptId() {
  return globalThis.crypto.randomUUID();
}
