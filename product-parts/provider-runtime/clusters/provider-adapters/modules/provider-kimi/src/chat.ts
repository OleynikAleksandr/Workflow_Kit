// The conversation of a Kimi session for the panel (M18, section 2.4): one page of
// GET /api/v1/sessions/{id}/messages, turned from newest-first into oldest-first. Reading changes
// nothing in Kimi: no prompt, no :takeover, no :reload.
import { ProviderError } from '#provider-registry';
import type { ChatMessage, ChatPage } from '#provider-registry';
import { describeKimiError } from './client.ts';
import type { KimiRuntime } from './provider.ts';
import { SESSION_ID } from './session-store.ts';
import { parseMessages } from './shapes.ts';
import type { KimiMessage } from './shapes.ts';

/** The largest page_size Kit asks Kimi for. */
export const CHAT_PAGE_SIZE_MAX = 100;

/** A message of Kimi as a message of the conversation; null for injections, tool calls and empty texts. */
export function chatMessage(item: KimiMessage): ChatMessage | null {
  if (item.text === '') return null;
  if (item.role === 'user' && item.origin === 'user') return { id: item.id, role: 'user', text: item.text, at: item.at };
  if (item.role === 'assistant') return { id: item.id, role: 'assistant', text: item.text, at: item.at };
  return null;
}

/** The newest messages of a session, oldest first; an unreadable server is chat-unavailable. */
export async function readKimiChat(rt: KimiRuntime, sessionId: string, opts: { limit: number }): Promise<ChatPage> {
  try {
    if (!SESSION_ID.test(sessionId)) throw new Error('неверный id сессии');
    const size = Math.max(1, Math.min(CHAT_PAGE_SIZE_MAX, Math.floor(opts.limit) || 1));
    const client = await rt.requireServer();
    const { items, hasMore } = parseMessages(await client.get(`/api/v1/sessions/${sessionId}/messages?page_size=${size}`));
    // A server that gives more than asked: the newest `size` are kept, the rest count as left out.
    const messages = items
      .slice(0, size)
      .reverse()
      .flatMap((item) => {
        const message = chatMessage(item);
        return message ? [message] : [];
      });
    return { messages, truncated: hasMore || items.length > size };
  } catch (error) {
    throw new ProviderError('chat-unavailable', `Kimi не отдал переписку: ${describeKimiError(error, rt.program().version)}`);
  }
}
