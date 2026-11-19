// The conversation of a Claude session from its transcript (spec M18 section 2.2): user and
// assistant lines of the JSONL file at transcript_path of the hook journal. Transcripts only grow
// and carry large service lines, so each file is read incrementally (ino, offset, carry, decoder,
// as in transcripts.ts) and only the newest CHAT_PAGE_LIMIT messages stay in memory. The
// transcript directory is never computed here. AskUserQuestion calls become questions of the page
// (spec M33 section 2.2, questions.ts).
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { CHAT_PAGE_LIMIT, ProviderError } from '#provider-registry';
import type { ChatMessage, ChatPage } from '#provider-registry';
import { bookQuestions, createQuestionBook, noteQuestionRow } from './questions.ts';
import type { QuestionBook } from './questions.ts';

/** Bytes read per chunk. */
const CHUNK = 1024 * 1024;
/** A longer line is skipped (request records, never a message worth showing). */
export const CHAT_MAX_LINE = 8 * 1024 * 1024;

/** User texts Claude Code writes for itself, not typed by the user. */
const SERVICE_PREFIXES = ['<local-command', '<command-name>', '<command-message>', '<task-notification>', '<system-reminder>'];

/** Cheap filter before JSON.parse: only user and assistant records can be messages. */
const CANDIDATE = /"type"\s*:\s*"(?:user|assistant)"/;

interface ChatState {
  ino: number;
  offset: number;
  carry: string;
  skipping: boolean;
  messages: ChatMessage[];
  /** Older messages were dropped to keep the newest ones. */
  dropped: boolean;
  /** Id of the latest message, dropped or not: a new question stands after it. */
  lastMessageId: string | null;
  questions: QuestionBook;
  /** Kept across calls: a character split between two reads is decoded once both halves are in. */
  decoder: TextDecoder;
}

/** Reads the conversation of transcripts. */
export interface ChatReader {
  /** The newest limit messages, oldest first; an empty page without a transcript or file. */
  read(transcriptPath: string | null, limit: number): Promise<ChatPage>;
  clear(): void;
}

function isServiceText(text: string): boolean {
  const start = text.trimStart();
  return SERVICE_PREFIXES.some((prefix) => start.startsWith(prefix));
}

/**
 * M47: Claude 2.1.328 keeps a long paste (more than 6 lines) as `\n\n<pasted_content id="X">\n…\n
 * </pasted_content id="X">\n` in the user's message. Each pair with one id is replaced by its
 * content and the line breaks around a removed pair are trimmed; a text without a pair stays as is.
 */
const PASTED_PAIR = /<pasted_content id="([^"\n]{1,32})">\n?([\s\S]*?)\n?<\/pasted_content id="\1">/g;
export function unwrapPasted(text: string): string {
  if (!text.includes('<pasted_content id="')) return text;
  let removed = false;
  const plain = text.replace(PASTED_PAIR, (_pair, _id: string, content: string) => { removed = true; return content; });
  return removed ? plain.replace(/^\n+|\n+$/g, '') : text;
}

/** Text of a message content: a whole string or the parts of type "text", joined by a line break. */
function contentText(content: unknown, skipService: boolean): string {
  const texts: string[] = [];
  if (typeof content === 'string') texts.push(content);
  else if (Array.isArray(content)) {
    for (const part of content as unknown[]) {
      if (typeof part !== 'object' || part === null) continue;
      const row = part as Record<string, unknown>;
      if (row['type'] === 'text' && typeof row['text'] === 'string') texts.push(row['text']);
    }
  }
  return texts.filter((t) => !(skipService && isServiceText(t))).join('\n');
}

/** A user or assistant record of a transcript line; null for every other line. */
function rowOfLine(line: string): Record<string, unknown> | null {
  if (line.length > CHAT_MAX_LINE || !CANDIDATE.test(line)) return null;
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** One transcript line as a message; null for every other record. */
export function chatMessageOfLine(line: string): ChatMessage | null {
  const row = rowOfLine(line);
  return row ? messageOfRow(row) : null;
}

function messageOfRow(row: Record<string, unknown>): ChatMessage | null {
  const role = row['type'];
  if ((role !== 'user' && role !== 'assistant') || row['isSidechain'] === true) return null;
  if (role === 'user' && row['isMeta'] === true) return null;
  // The service summary of a compacted context is not a user message (spec M19 section 2.4).
  if (row['isCompactSummary'] === true) return null;
  const id = row['uuid'];
  if (typeof id !== 'string' || id === '') return null;
  const message = row['message'];
  if (typeof message !== 'object' || message === null) return null;
  const raw = contentText((message as Record<string, unknown>)['content'], role === 'user');
  const text = role === 'user' ? unwrapPasted(raw) : raw;
  if (text.trim() === '') return null;
  const at = typeof row['timestamp'] === 'string' ? row['timestamp'] : null;
  return { id, role, text, at };
}

const unavailable = (reason: string): ProviderError =>
  new ProviderError('chat-unavailable', `Claude не отдал переписку: ${reason}`, { status: 502 });

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Creates a reader; keep is how many newest messages a file keeps in memory. */
export function createChatReader(options: { keep?: number; maxFiles?: number } = {}): ChatReader {
  const keep = options.keep ?? CHAT_PAGE_LIMIT;
  const maxFiles = options.maxFiles ?? 200;
  const states = new Map<string, ChatState>();

  function add(state: ChatState, line: string): void {
    const row = rowOfLine(line);
    if (!row) return;
    const message = messageOfRow(row);
    noteQuestionRow(state.questions, row, message?.id ?? null, state.lastMessageId);
    if (!message) return;
    state.lastMessageId = message.id;
    state.messages.push(message);
    if (state.messages.length > keep) {
      state.messages.shift();
      state.dropped = true;
    }
  }

  function consume(state: ChatState, text: string): void {
    let data = state.carry + text;
    state.carry = '';
    for (;;) {
      const newline = data.indexOf('\n');
      if (newline < 0) break;
      const line = data.slice(0, newline);
      data = data.slice(newline + 1);
      if (state.skipping) {
        state.skipping = false;
        continue;
      }
      add(state, line);
    }
    if (data.length > CHAT_MAX_LINE) state.skipping = true;
    else if (!state.skipping) state.carry = data;
  }

  async function scan(file: string): Promise<ChatState | null> {
    let info;
    try {
      info = await stat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        states.delete(file);
        return null;
      }
      throw unavailable(reasonOf(error));
    }
    if (!info.isFile()) throw unavailable(`${file} — не файл`);
    let state = states.get(file);
    if (!state || state.ino !== info.ino || info.size < state.offset) {
      state = { ino: info.ino, offset: 0, carry: '', skipping: false, messages: [], dropped: false, lastMessageId: null, questions: createQuestionBook(), decoder: new TextDecoder('utf-8') };
    }
    states.delete(file);
    states.set(file, state);
    if (states.size > maxFiles) states.delete(states.keys().next().value!);
    if (info.size === state.offset) return state;
    let handle;
    try {
      handle = await open(file, 'r');
    } catch (error) {
      throw unavailable(reasonOf(error));
    }
    try {
      const buffer = Buffer.alloc(Math.min(CHUNK, info.size - state.offset));
      while (state.offset < info.size) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, info.size - state.offset), state.offset);
        if (bytesRead === 0) break;
        state.offset += bytesRead;
        consume(state, state.decoder.decode(buffer.subarray(0, bytesRead), { stream: true }));
      }
    } catch (error) {
      states.delete(file);
      throw unavailable(reasonOf(error));
    } finally {
      await handle.close();
    }
    return state;
  }

  function page(state: ChatState | null, limit: number): ChatPage {
    if (!state) return { messages: [], truncated: false };
    const count = Math.max(0, Math.min(limit, state.messages.length));
    const messages = state.messages.slice(state.messages.length - count).map((m) => ({ ...m }));
    const questions = bookQuestions(state.questions);
    // A transcript without questions keeps the page of M18 (no field).
    return { messages, truncated: state.dropped || count < state.messages.length, ...(questions.length > 0 ? { questions } : {}) };
  }

  /** One scan per file at a time: concurrent polls wait for the running one. */
  const running = new Map<string, Promise<ChatState | null>>();
  return {
    async read(transcriptPath, limit) {
      if (!transcriptPath || !path.isAbsolute(transcriptPath) || !transcriptPath.endsWith('.jsonl')) return { messages: [], truncated: false };
      let active = running.get(transcriptPath);
      if (!active) {
        active = scan(transcriptPath).finally(() => running.delete(transcriptPath));
        running.set(transcriptPath, active);
      }
      return page(await active, limit);
    },
    clear: () => states.clear(),
  };
}

/** A question of the transcript waits for an answer; text pasted now would become its answer (T001, P6). */
export async function hasOpenQuestion(chat: ChatReader, transcriptPath: string | null): Promise<boolean> {
  const page = await chat.read(transcriptPath, 1);
  return page.questions?.some((q) => q.state === 'pending') === true;
}
