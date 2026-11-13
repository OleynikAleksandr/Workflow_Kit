// Conversation of a ChatGPT session (spec M18 section 2.3; details: chat.md of this module): the
// feed comes from thread/read with turns (the read does not load the chat), a direct message
// starts a turn with its own text in the shared daemon mode while the chat is not working.
import { ProviderError } from '#provider-registry';
import type { ChatMessage, ChatPage } from '#provider-registry';
import type { RpcSession } from './rpc.ts';
import { threadStatus, wakeThread } from './thread-ops.ts';

/** Timeout of one connection that reads the feed or sends a direct message. */
export const CHAT_TIMEOUT_MS = 30_000;

/** Statuses of a thread in which a direct message may start a turn (not "active"). */
export const DIRECT_STATUSES: readonly string[] = ['idle', 'notLoaded'];

const THREAD_ID = /^[A-Za-z0-9_-]{1,128}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Below this an epoch number is in seconds (the turn's startedAt), above it in milliseconds. */
const SECONDS_BELOW = 1e11;

/** ISO time of epoch seconds or milliseconds or of a time string; null when there is none. */
function isoTime(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  let input: number | string = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof input === 'number' && input > 0 && input < SECONDS_BELOW) input *= 1000;
  const time = new Date(input);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

/** Text of an item: the text parts of a userMessage, the text of an agentMessage; null for others. */
function itemMessage(item: Record<string, unknown>): { role: ChatMessage['role']; text: string } | null {
  if (item['type'] === 'userMessage') {
    const parts = Array.isArray(item['content']) ? item['content'] : [];
    const texts = parts.filter(isObject).map((part) => part['text']).filter((text): text is string => typeof text === 'string');
    return { role: 'user', text: texts.join('\n') };
  }
  if (item['type'] === 'agentMessage') return { role: 'assistant', text: typeof item['text'] === 'string' ? item['text'] : '' };
  return null;
}

/**
 * The messages of a thread/read answer with turns, oldest first: userMessage and agentMessage
 * items with a non-empty text. The time is the item's startedAtMs, else the turn's startedAt.
 */
export function threadMessages(answer: unknown): ChatMessage[] {
  const thread = isObject(answer) ? answer['thread'] : null;
  const turns = isObject(thread) && Array.isArray(thread['turns']) ? thread['turns'] : [];
  const messages: ChatMessage[] = [];
  for (const turn of turns) {
    if (!isObject(turn) || !Array.isArray(turn['items'])) continue;
    const turnAt = isoTime(turn['startedAt']);
    turn['items'].forEach((item: unknown, index: number) => {
      if (!isObject(item)) return;
      const message = itemMessage(item);
      if (!message || message.text.trim() === '') return;
      const id = typeof item['id'] === 'string' && item['id'] ? item['id'] : `${String(turn['id'] ?? 'turn')}:${index}`;
      messages.push({ id, role: message.role, text: message.text, at: isoTime(item['startedAtMs']) ?? turnAt });
    });
  }
  return messages;
}

/** At most limit newest messages, truncated when older ones were left out. */
export function chatPage(messages: ChatMessage[], limit: number): ChatPage {
  const keep = Math.max(0, Math.floor(limit));
  if (messages.length <= keep) return { messages, truncated: false };
  return { messages: keep === 0 ? [] : messages.slice(messages.length - keep), truncated: true };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What the chat parts need from the provider. */
export interface ChatDeps {
  /** Opens a connection to the daemon (CodexRuntime.withDaemon). */
  withDaemon<T>(fn: (session: RpcSession) => Promise<T>, timeoutMs?: number): Promise<T>;
  /** The shared daemon mode is on (SharedMode.refresh). */
  shared(): Promise<boolean>;
  log(line: string): void;
  /** Reuses the existing feed read for interruption availability; no additional RPC. */
  onThreadRead?(threadId: string, answer: unknown): void;
}

/** readMessages and sendDirect of the Codex provider; the session id is the thread id. */
export interface ChatParts {
  readMessages(threadId: string, limit: number): Promise<ChatPage>;
  sendDirect(threadId: string, text: string): Promise<boolean>;
}

/** Creates the chat parts over the daemon connection of the provider. */
export function createChatParts(deps: ChatDeps): ChatParts {
  return {
    async readMessages(threadId, limit) {
      if (!THREAD_ID.test(threadId)) throw new ProviderError('chat-unavailable', 'Codex не отдал переписку: неверный id чата', { status: 502 });
      let answer: unknown;
      try {
        answer = await deps.withDaemon((session) => session.request('thread/read', { threadId, includeTurns: true }, CHAT_TIMEOUT_MS), CHAT_TIMEOUT_MS);
      } catch (error) {
        deps.onThreadRead?.(threadId, null);
        throw new ProviderError('chat-unavailable', `Codex не отдал переписку: ${reason(error)}`, { status: 502 });
      }
      deps.onThreadRead?.(threadId, answer);
      return chatPage(threadMessages(answer), limit);
    },
    async sendDirect(threadId, text) {
      if (!THREAD_ID.test(threadId) || text.trim() === '') return false;
      try {
        if (!(await deps.shared())) return false;
        return await deps.withDaemon(async (session) => {
          const status = await threadStatus(session, threadId);
          if (status === null || !DIRECT_STATUSES.includes(status)) {
            deps.log(`codex: direct message to thread ${threadId} not sent, status ${status ?? 'unknown'}`);
            return false;
          }
          await wakeThread(session, threadId, text);
          deps.log(`codex: direct message started a turn of thread ${threadId}`);
          return true;
        }, CHAT_TIMEOUT_MS);
      } catch (error) {
        deps.log(`codex: direct message to thread ${threadId} failed: ${reason(error)}`);
        return false;
      }
    },
  };
}
