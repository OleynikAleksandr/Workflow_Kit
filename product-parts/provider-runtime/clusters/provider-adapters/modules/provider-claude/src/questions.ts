// AskUserQuestion calls of a Claude transcript as questions of the session feed (spec M33 section
// 2.2, facts T001): a tool_use of the assistant opens a question with the call id, the first
// tool_result of that id closes it (answered with the answers of toolUseResult, or cancelled on an
// error), a later message of the feed cancels a question still open. Details: questions.md.
import { QUESTIONS_PAGE_MAX } from '#provider-registry';
import type { ChatQuestion, ChatQuestionAnswer, ChatQuestionPart, ChatQuestionPartAnswer } from '#provider-registry';

/** The tool name of a question. */
export const QUESTION_TOOL = 'AskUserQuestion';
/** Why a pending question cannot be answered in the panel yet (no answer channel). */
export const CLAUDE_QUESTION_REASON = 'Ответьте в приложении Claude';
/** Questions a transcript keeps in memory: the newest, a pending one before the closed ones. */
export const QUESTIONS_KEEP = QUESTIONS_PAGE_MAX;

interface Entry {
  question: ChatQuestion;
  /** Original question texts by part index: toolUseResult.answers is keyed by them. */
  texts: string[];
}

/** The questions of one transcript, in the order of their calls. */
export interface QuestionBook {
  entries: Map<string, Entry>;
}

export const createQuestionBook = (): QuestionBook => ({ entries: new Map() });

type Row = Record<string, unknown>;
const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Parts of a question from the tool input (questions[]) and the original question texts. */
export function partsOf(input: unknown): { parts: ChatQuestionPart[]; texts: string[] } {
  const list = isObject(input) && Array.isArray(input['questions']) ? input['questions'].filter(isObject) : [];
  const parts = list.map((q, i): ChatQuestionPart => ({
    id: `q${i + 1}`,
    header: text(q['header']),
    question: text(q['question']),
    options: (Array.isArray(q['options']) ? q['options'].filter(isObject) : []).map((o) => ({ label: text(o['label']), description: text(o['description']) })),
    multiSelect: q['multiSelect'] === true,
    allowOther: true,
  }));
  return { parts, texts: list.map((q) => text(q['question'])) };
}

/**
 * One answer of toolUseResult.answers (facts T001, D2): an array — labels (other strings are own
 * text); a string equal to a label — that label; a string of a multiSelect part whose pieces split
 * by ", " are all labels — those labels; any other string — own text.
 */
export function partAnswerOf(part: ChatQuestionPart, raw: unknown): ChatQuestionPartAnswer | null {
  const labels = part.options.map((o) => o.label);
  if (Array.isArray(raw)) {
    const strings = raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
    const selected = strings.filter((s) => labels.includes(s));
    const rest = strings.filter((s) => !labels.includes(s));
    if (strings.length === 0) return null;
    return rest.length > 0 ? { selected, other: rest.join(', ') } : { selected };
  }
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  if (labels.includes(raw)) return { selected: [raw] };
  if (part.multiSelect) {
    const pieces = raw.split(', ');
    if (pieces.length > 1 && pieces.every((p) => labels.includes(p))) return { selected: pieces };
  }
  return { selected: [], other: raw };
}

function answersOf(entry: Entry, result: unknown): ChatQuestionAnswer | undefined {
  if (!isObject(result) || !isObject(result['answers'])) return undefined;
  const answers = result['answers'];
  const out: ChatQuestionAnswer = {};
  entry.question.parts.forEach((part, i) => {
    const key = entry.texts[i];
    if (key === undefined || !Object.hasOwn(answers, key)) return;
    const answer = partAnswerOf(part, answers[key]);
    if (answer) out[part.id] = answer;
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

function evict(book: QuestionBook): void {
  while (book.entries.size > QUESTIONS_KEEP) {
    let victim: string | undefined;
    for (const [id, entry] of book.entries) {
      if (entry.question.state !== 'pending') {
        victim = id;
        break;
      }
    }
    book.entries.delete(victim ?? book.entries.keys().next().value!);
  }
}

/**
 * Notes one transcript row: results first (they close their calls), then a message of the feed
 * (it cancels questions still open), then new calls (they stand after the latest message).
 * Sidechain rows (subagents) are ignored.
 */
export function noteQuestionRow(book: QuestionBook, row: Row, messageId: string | null, lastMessageId: string | null): void {
  if (row['isSidechain'] === true) return;
  const message = row['message'];
  const content = isObject(message) && Array.isArray(message['content']) ? message['content'].filter(isObject) : [];
  if (row['type'] === 'user') {
    for (const part of content) {
      if (part['type'] !== 'tool_result') continue;
      const entry = book.entries.get(text(part['tool_use_id']));
      if (!entry || entry.question.state !== 'pending') continue;
      const result = row['toolUseResult'];
      if (part['is_error'] === true || typeof result === 'string') entry.question.state = 'cancelled';
      else {
        entry.question.state = 'answered';
        const answers = answersOf(entry, result);
        if (answers) entry.question.answers = answers;
      }
    }
  }
  if (messageId !== null) {
    for (const entry of book.entries.values()) if (entry.question.state === 'pending') entry.question.state = 'cancelled';
  }
  if (row['type'] !== 'assistant') return;
  const at = typeof row['timestamp'] === 'string' ? row['timestamp'] : null;
  for (const part of content) {
    if (part['type'] !== 'tool_use' || part['name'] !== QUESTION_TOOL) continue;
    const id = text(part['id']);
    if (id === '' || book.entries.has(id)) continue;
    const { parts, texts } = partsOf(part['input']);
    book.entries.set(id, { question: { id, at, afterMessageId: messageId ?? lastMessageId, state: 'pending', parts, answerable: false }, texts });
  }
  evict(book);
}

/** The questions of a book, oldest first, as copies; a pending one carries the reason. */
export function bookQuestions(book: QuestionBook): ChatQuestion[] {
  return [...book.entries.values()].map(({ question }) => {
    const copy = structuredClone(question);
    if (copy.state === 'pending') copy.reason = CLAUDE_QUESTION_REASON;
    else delete copy.reason;
    return copy;
  });
}
