// Conversation of a ChatGPT session (spec M18 section 2.3, M32; details: chat.md of this module):
// the feed is read in portions by the history reader (the read does not load the chat), a direct
// message starts a turn with its own text in the shared daemon mode while the chat is not working.
import { ProviderError } from '#provider-registry';
import type { ChatMessage, ChatPage } from '#provider-registry';
import type { InitializeResult, RpcSession } from './rpc.ts';
import { threadStatus, wakeThread } from './thread-ops.ts';
import { isObject, isoTime, itemMessage } from './history-items.ts';
import { createHistoryReader } from './history-reader.ts';
import type { OfflineState } from './connection.ts';

/** Timeout of the connection that sends a direct message (a feed poll has its own 5 s budget). */
export const CHAT_TIMEOUT_MS = 30_000;

/** Statuses of a thread in which a direct message may start a turn (not "active"). */
export const DIRECT_STATUSES: readonly string[] = ['idle', 'notLoaded'];

const THREAD_ID = /^[A-Za-z0-9_-]{1,128}$/;

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
  /** Opens a connection to the daemon (CodexRuntime.withDaemon): direct messages. */
  withDaemon<T>(fn: (session: RpcSession, init: InitializeResult) => Promise<T>, timeoutMs?: number): Promise<T>;
  /** A safe read through the connection coordinator (CodexRuntime.readDaemon): the feed; default withDaemon. */
  readDaemon?<T>(fn: (session: RpcSession, init: InitializeResult) => Promise<T>, timeoutMs: number): Promise<T>;
  /** Offline state and server identity of the coordinator (M32 T003). */
  offline?(): OfflineState | null;
  serverIdentity?(): string | null;
  /** The shared daemon mode is on (SharedMode.refresh). */
  shared(): Promise<boolean>;
  log(line: string): void;
  /** Gets the metadata and newest turns every feed poll reads (the Stop snapshot); null after a failure. */
  onThreadRead?(threadId: string, answer: unknown): void;
  /** CODEX_HOME of the provider: part of the cache key of the feed. */
  home?: string;
  /** The daemon pid last observed (CodexRuntime.cachedDaemon), part of the server identity of gaps. */
  serverPid?(): number | null;
  /** Monotonic clock of the feed poll (tests inject it). */
  now?(): number;
}

/** readMessages and sendDirect of the Codex provider; the session id is the thread id. */
export interface ChatParts {
  /** The newest messages; scope (the project id) separates the caches of projects. */
  readMessages(threadId: string, limit: number, scope?: string): Promise<ChatPage>;
  sendDirect(threadId: string, text: string): Promise<boolean>;
}

/** Creates the chat parts over the daemon connection of the provider. */
export function createChatParts(deps: ChatDeps): ChatParts {
  const history = createHistoryReader({
    withDaemon: (fn, timeoutMs) => (deps.readDaemon ? deps.readDaemon(fn, timeoutMs ?? CHAT_TIMEOUT_MS) : deps.withDaemon(fn, timeoutMs)),
    ...(deps.onThreadRead ? { onThreadRead: deps.onThreadRead } : {}),
    ...(deps.offline ? { offline: deps.offline } : {}),
    ...(deps.serverIdentity ? { serverIdentity: deps.serverIdentity } : {}),
    ...(deps.serverPid ? { serverPid: deps.serverPid } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
  return {
    async readMessages(threadId, limit, scope = '') {
      if (!THREAD_ID.test(threadId)) throw new ProviderError('chat-unavailable', 'Codex не отдал переписку: неверный id чата', { status: 502 });
      return history.read(`${deps.home ?? ''}\n${scope}\n${threadId}`, threadId, limit);
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
