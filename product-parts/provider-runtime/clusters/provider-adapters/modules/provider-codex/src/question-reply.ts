// The reply message of an asynchronous question (spec M34 section 2.2): the same wrapper the
// ChatGPT app sends as a user's message when its card answers request_user_input_async. Kit builds
// it for an answer of the panel and parses it in the feed. Details: questions.md.
import type { ChatQuestionAnswer, ChatQuestionPart } from '#provider-registry';

/** The tool whose questions the wrapper answers. */
export const REPLY_TOOL = 'request_user_input_async';
export const REPLY_OPEN = '<send_user_message_question_reply>';
export const REPLY_CLOSE = '</send_user_message_question_reply>';

/** One answered question of a reply message. */
export interface ReplyEntry {
  /** Id of the agentMessage item (the call id) the question belongs to. */
  itemId: string;
  /** Number of the question in the call, from 0. */
  index: number;
  question: string;
  answer: string;
}

type Row = Record<string, unknown>;
const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The answer text of one part: own text when given, else the chosen label. */
function answerOf(answer: ChatQuestionAnswer[string] | undefined): string {
  if (!answer) return '';
  if (answer.other !== undefined && answer.other.trim() !== '') return answer.other;
  return answer.selected[0] ?? '';
}

/**
 * The wrapper text of an answer: the opening tag, the JSON array on one line, the closing tag, each
 * followed by a line break. One entry per part, in order; key order questionItemId, question, answer.
 */
export function replyText(itemId: string, parts: readonly ChatQuestionPart[], answers: ChatQuestionAnswer): string {
  const entries = parts.map((part, index) => ({
    questionItemId: JSON.stringify([REPLY_TOOL, itemId, index]),
    question: part.question,
    answer: answerOf(answers[part.id]),
  }));
  return `${REPLY_OPEN}\n${JSON.stringify(entries)}\n${REPLY_CLOSE}\n`;
}

/** The [tool, item id, index] of a questionItemId, or null. */
function itemRef(value: unknown): { itemId: string; index: number } | null {
  if (typeof value !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [tool, itemId, index] = parsed as unknown[];
  if (tool !== REPLY_TOOL || typeof itemId !== 'string' || itemId === '') return null;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
  return { itemId, index };
}

/**
 * The entries of a reply message, or null when the text (without surrounding whitespace) is not
 * exactly one wrapper with a JSON array of entries whose fields are strings and whose
 * questionItemId names request_user_input_async, an item and an index.
 */
export function parseReply(text: string): ReplyEntry[] | null {
  const body = text.trim();
  if (!body.startsWith(REPLY_OPEN) || !body.endsWith(REPLY_CLOSE)) return null;
  const inner = body.slice(REPLY_OPEN.length, body.length - REPLY_CLOSE.length).trim();
  if (inner.includes(REPLY_OPEN) || inner.includes(REPLY_CLOSE)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const entries: ReplyEntry[] = [];
  for (const raw of parsed) {
    if (!isObject(raw) || typeof raw['question'] !== 'string' || typeof raw['answer'] !== 'string') return null;
    const ref = itemRef(raw['questionItemId']);
    if (!ref) return null;
    entries.push({ ...ref, question: raw['question'], answer: raw['answer'] });
  }
  return entries;
}
