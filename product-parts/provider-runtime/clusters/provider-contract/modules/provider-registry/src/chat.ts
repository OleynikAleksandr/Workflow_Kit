// Conversation of a session (spec M18 section 2.1): the shapes Provider.readMessages returns and
// the limits the messages route applies. Details: chat.md of this module.

/** One message of a session's conversation, as the provider recorded it. */
export interface ChatMessage {
  /** Stable id inside the session (provider's own id of the message). */
  id: string;
  role: 'user' | 'assistant';
  /** Plain text; tool calls, reasoning and service records are not messages. */
  text: string;
  /** ISO time, or null when the provider does not give it. */
  at: string | null;
}

/** The newest messages of a session, oldest first. */
export interface ChatPage {
  messages: ChatMessage[];
  /** True when older messages exist but were left out (limit). */
  truncated: boolean;
}

/** Messages per page: the limit the route passes to readMessages. */
export const CHAT_PAGE_LIMIT = 100;

/** Longest message text the route returns; a longer one is cut at the end with CHAT_TEXT_CUT_NOTE. */
export const CHAT_TEXT_MAX_CHARS = 20_000;

/** Mark appended to a text cut by the route. */
export const CHAT_TEXT_CUT_NOTE = '\n… (обрезано, полный текст — в чате провайдера)';

/** Cuts a text longer than max at the end (never inside a surrogate pair) and appends the mark. */
export function cutChatText(text: string, max = CHAT_TEXT_MAX_CHARS): string {
  if (text.length <= max) return text;
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end) + CHAT_TEXT_CUT_NOTE;
}

/**
 * The page the route answers with: at most limit newest messages (truncated when more came),
 * only the contract fields, texts cut to CHAT_TEXT_MAX_CHARS.
 */
export function chatPageOut(page: ChatPage, limit = CHAT_PAGE_LIMIT): ChatPage {
  const all = Array.isArray(page.messages) ? page.messages : [];
  const kept = all.length > limit ? all.slice(all.length - limit) : all;
  return {
    messages: kept.map((m) => ({ id: m.id, role: m.role, text: cutChatText(m.text), at: m.at ?? null })),
    truncated: page.truncated === true || kept.length < all.length,
  };
}
