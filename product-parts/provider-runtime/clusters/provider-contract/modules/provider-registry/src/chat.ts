// Conversation of a session (spec M18 section 2.1): the shapes Provider.readMessages returns and
// the limits the messages route applies. Details: chat.md of this module.
import { questionsOut } from './questions.ts';
import type { ChatQuestion } from './questions.ts';

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

/** State of reading a conversation (spec M32 section 2.7); absent means the old contract. */
export type ChatSyncState = 'loading' | 'ready' | 'partial' | 'reconnecting' | 'unavailable';

/**
 * A known hole in the history: one item (itemId, when its identity is proven) or an unread range
 * between two items of the turn (beforeItemId/afterItemId; a missing bound is the edge of the turn).
 */
export interface ChatGap {
  turnId: string;
  reason: string;
  itemId?: string;
  beforeItemId?: string;
  afterItemId?: string;
}

/** How complete and how fresh the page is; reason is a safe text for the panel. */
export interface ChatSync {
  state: ChatSyncState;
  reason?: string;
  /** Milliseconds until the provider tries again (reconnecting, unavailable). */
  retryAfterMs?: number;
  /** The newest CHAT_SYNC_GAPS_MAX known gaps of the current pass. */
  gaps?: ChatGap[];
  /** All known gaps of the current pass (may exceed gaps.length). */
  gapCount?: number;
}

/** The newest messages of a session, oldest first. */
export interface ChatPage {
  messages: ChatMessage[];
  /** True when older messages exist but were left out (limit), not when a read failed. */
  truncated: boolean;
  /** Optional reading state; providers without it keep the M18 contract. */
  sync?: ChatSync;
  /** Questions of the agent (spec M33), oldest first; absent: the provider gives none. */
  questions?: ChatQuestion[];
}

/** Messages per page: the limit the route passes to readMessages. */
export const CHAT_PAGE_LIMIT = 100;

/** Longest message text the route returns; a longer one is cut at the end with CHAT_TEXT_CUT_NOTE. */
export const CHAT_TEXT_MAX_CHARS = 20_000;

/** Mark appended to a text cut by the route. */
export const CHAT_TEXT_CUT_NOTE = '\n… (обрезано, полный текст — в чате провайдера)';

/**
 * Cuts a text longer than max at the end (never inside a surrogate pair) and appends the mark.
 * Idempotent: a text this function already cut comes back unchanged, so a provider may apply it
 * before caching and the route may apply it again.
 */
export function cutChatText(text: string, max = CHAT_TEXT_MAX_CHARS): string {
  if (text.length <= max) return text;
  if (text.endsWith(CHAT_TEXT_CUT_NOTE) && text.length - CHAT_TEXT_CUT_NOTE.length <= max) return text;
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end) + CHAT_TEXT_CUT_NOTE;
}

/** Gaps the answer carries at most (the newest ones). */
export const CHAT_SYNC_GAPS_MAX = 64;
/** Longest retryAfterMs the answer carries (10 s backoff plus 10 % jitter). */
export const CHAT_SYNC_RETRY_MAX_MS = 11_000;
/** Longest reason text the answer carries. */
export const CHAT_SYNC_REASON_MAX_CHARS = 300;
/** Reason of a partial page that came without one. */
export const CHAT_SYNC_PARTIAL_REASON = 'Часть диалога недоступна';

const SYNC_STATES: readonly string[] = ['loading', 'ready', 'partial', 'reconnecting', 'unavailable'];
const ID_MAX_CHARS = 200;

/** A one-line text without control characters, at most max characters; null when empty or not a string. */
function safeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const line = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return line ? cutChatText(line, max).replace(CHAT_TEXT_CUT_NOTE, '…') : null;
}

function safeId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= ID_MAX_CHARS ? value : null;
}

function gapOut(value: unknown): ChatGap | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const turnId = safeId(raw['turnId']);
  const reason = safeText(raw['reason'], CHAT_SYNC_REASON_MAX_CHARS);
  if (!turnId || !reason) return null;
  const gap: ChatGap = { turnId, reason };
  for (const key of ['itemId', 'beforeItemId', 'afterItemId'] as const) {
    const id = safeId(raw[key]);
    if (id) gap[key] = id;
  }
  return gap;
}

/**
 * The sync object an answer may carry: only the contract fields, a known state, a bounded
 * retryAfterMs, the newest CHAT_SYNC_GAPS_MAX valid gaps and gapCount covering all of them.
 * A page with gaps is never ready: it becomes partial, and a partial page always has a reason.
 * Anything else (no object, unknown state) is undefined: the old contract.
 */
export function chatSyncOut(value: unknown): ChatSync | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw['state'] !== 'string' || !SYNC_STATES.includes(raw['state'])) return undefined;
  const all = Array.isArray(raw['gaps']) ? raw['gaps'].map(gapOut).filter((g): g is ChatGap => g !== null) : [];
  const gaps = all.length > CHAT_SYNC_GAPS_MAX ? all.slice(all.length - CHAT_SYNC_GAPS_MAX) : all;
  const declared = typeof raw['gapCount'] === 'number' && Number.isInteger(raw['gapCount']) && raw['gapCount'] >= 0 ? raw['gapCount'] : 0;
  let state = raw['state'] as ChatSyncState;
  if (state === 'ready' && gaps.length > 0) state = 'partial';
  const sync: ChatSync = { state };
  const reason = safeText(raw['reason'], CHAT_SYNC_REASON_MAX_CHARS) ?? (state === 'partial' ? CHAT_SYNC_PARTIAL_REASON : null);
  if (reason) sync.reason = reason;
  const retry = raw['retryAfterMs'];
  if (typeof retry === 'number' && Number.isFinite(retry) && retry >= 0) sync.retryAfterMs = Math.min(Math.round(retry), CHAT_SYNC_RETRY_MAX_MS);
  if (gaps.length > 0) sync.gaps = gaps;
  const count = Math.max(declared, all.length);
  if (count > 0) sync.gapCount = count;
  return sync;
}

/**
 * The page the route answers with: at most limit newest messages (truncated when more came),
 * only the contract fields, texts cut to CHAT_TEXT_MAX_CHARS, sync normalized by chatSyncOut.
 */
export function chatPageOut(page: ChatPage, limit = CHAT_PAGE_LIMIT): ChatPage {
  const all = Array.isArray(page.messages) ? page.messages : [];
  const kept = all.length > limit ? all.slice(all.length - limit) : all;
  const sync = chatSyncOut(page.sync);
  const questions = questionsOut(page.questions);
  return {
    messages: kept.map((m) => ({ id: m.id, role: m.role, text: cutChatText(m.text), at: m.at ?? null })),
    truncated: page.truncated === true || kept.length < all.length,
    ...(sync ? { sync } : {}),
    ...(questions ? { questions } : {}),
  };
}
