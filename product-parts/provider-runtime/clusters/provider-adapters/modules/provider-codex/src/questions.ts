// Questions of a Codex agent (request_user_input, spec M33 section 2.4, facts T002): the request
// item/tool/requestUserInput as a question of the feed, the answer as the result of that request,
// the flag waitingOnUserInput of the thread status and the stub question C0. Details: questions.md.
import type { ChatQuestion, ChatQuestionAnswer, ChatQuestionPart } from '#provider-registry';

/** The server request of a question. */
export const USER_INPUT_METHOD = 'item/tool/requestUserInput';
/** The flag of an active thread whose agent waits for an answer. */
export const WAITING_FLAG = 'waitingOnUserInput';
export const CODEX_WAITING_REASON = 'Агент ждёт ответа. Ответьте в приложении ChatGPT';
export const CODEX_SECRET_REASON = 'Секретный ответ вводится только в приложении ChatGPT';
export const CODEX_LOST_REASON = 'Связь Workflow Kit с ChatGPT прервалась. Ответьте в приложении ChatGPT или подождите, пока вопрос придёт снова';
/** Id prefix of the stub question C0 (the flag without the content). */
export const STUB_PREFIX = 'waiting-';

type Row = Record<string, unknown>;
const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Status type and active flags of a thread/read answer (or of thread/status/changed params). */
export function threadFlags(answer: unknown): { type: string | null; flags: string[] } {
  const thread = isObject(answer) && isObject(answer['thread']) ? answer['thread'] : answer;
  const status = isObject(thread) ? thread['status'] : null;
  if (!isObject(status)) return { type: null, flags: [] };
  const flags = Array.isArray(status['activeFlags']) ? status['activeFlags'].filter((f): f is string => typeof f === 'string') : [];
  return { type: typeof status['type'] === 'string' ? status['type'] : null, flags };
}

/** A question of the request params, or null when the params do not name a thread and an item. */
export function questionOfRequest(params: unknown, at: string): { threadId: string; turnId: string | null; question: ChatQuestion; secret: boolean } | null {
  if (!isObject(params)) return null;
  const threadId = text(params['threadId']);
  const itemId = text(params['itemId']);
  if (threadId === '' || itemId === '') return null;
  const list = Array.isArray(params['questions']) ? params['questions'].filter(isObject) : [];
  const parts = list.map((q, i): ChatQuestionPart => {
    const options = (Array.isArray(q['options']) ? q['options'].filter(isObject) : []).map((o) => ({ label: text(o['label']), description: text(o['description']) }));
    return { id: text(q['id']) || `q${i + 1}`, header: text(q['header']), question: text(q['question']), options, multiSelect: false, allowOther: q['isOther'] === true || options.length === 0 };
  });
  const secret = list.some((q) => q['isSecret'] === true);
  const question: ChatQuestion = { id: itemId, at, afterMessageId: null, state: 'pending', parts, answerable: !secret, ...(secret ? { reason: CODEX_SECRET_REASON } : {}) };
  return { threadId, turnId: text(params['turnId']) || null, question, secret };
}

/** The result of the request: { answers: { [question id]: { answers: [label or own text] } } } (T002 Q4). */
export function answerResult(parts: readonly ChatQuestionPart[], answers: ChatQuestionAnswer): { answers: Record<string, { answers: string[] }> } {
  const out: Record<string, { answers: string[] }> = {};
  for (const part of parts) {
    const answer = answers[part.id];
    if (!answer) continue;
    out[part.id] = { answers: [...answer.selected, ...(answer.other !== undefined ? [answer.other] : [])] };
  }
  return { answers: out };
}

/** The stub C0: the agent waits, Kit does not know the question. */
export function waitingStub(threadId: string, at: string, afterMessageId: string | null): ChatQuestion {
  return { id: `${STUB_PREFIX}${threadId}`, at, afterMessageId, state: 'pending', parts: [], answerable: false, reason: CODEX_WAITING_REASON };
}
