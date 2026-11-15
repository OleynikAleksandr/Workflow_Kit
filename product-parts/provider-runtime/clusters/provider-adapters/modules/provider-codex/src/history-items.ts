// Parsing of Codex history answers (spec M32 section 2.2; chat.md of this module): the visible
// message of an item and the turns of thread/turns/list. Shared by the feed and its reader.
import { cutChatText } from '#provider-registry';
import type { ChatMessage } from '#provider-registry';
import { parseReply, replyReadable } from './question-reply.ts';

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Below this an epoch number is in seconds (the turn's startedAt), above it in milliseconds. */
const SECONDS_BELOW = 1e11;

/** ISO time of epoch seconds or milliseconds or of a time string; null when there is none. */
export function isoTime(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  let input: number | string = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof input === 'number' && input > 0 && input < SECONDS_BELOW) input *= 1000;
  const time = new Date(input);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

/** The raw text of a userMessage: its text parts joined by line breaks; null for other items. */
export function userText(item: Record<string, unknown>): string | null {
  if (item['type'] !== 'userMessage') return null;
  const parts = Array.isArray(item['content']) ? item['content'] : [];
  return parts.filter(isObject).map((part) => part['text']).filter((text): text is string => typeof text === 'string').join('\n');
}

/**
 * Text of an item: the text parts of a userMessage, the text of an agentMessage; null for others.
 * A reply message of an asynchronous question shows as its answers (spec M34 section 2.4).
 */
export function itemMessage(item: Record<string, unknown>): { role: ChatMessage['role']; text: string } | null {
  const raw = userText(item);
  if (raw !== null) {
    // An empty answer keeps the raw text: the message must stay in the feed to close its question.
    const readable = parseReply(raw);
    const text = readable ? replyReadable(readable) : '';
    return { role: 'user', text: text.trim() !== '' ? text : raw };
  }
  if (item['type'] === 'agentMessage') return { role: 'assistant', text: typeof item['text'] === 'string' ? item['text'] : '' };
  return null;
}

/**
 * The feed message of an item with a proven id, its text already cut by the shared cutChatText
 * (the cache keeps no longer text); null for an item that is not a message or has an empty text.
 */
export function feedMessage(item: Record<string, unknown>, id: string, at: unknown, turnAt: unknown): ChatMessage | null {
  const message = itemMessage(item);
  if (!message || message.text.trim() === '') return null;
  return { id, role: message.role, text: cutChatText(message.text), at: isoTime(at) ?? isoTime(item['startedAtMs']) ?? isoTime(turnAt) };
}

/** A turn of thread/turns/list: its id, status, start time and the items of the requested view. */
export interface ListedTurn {
  id: string;
  status: string;
  startedAt: unknown;
  items: Record<string, unknown>[];
}

/** The turns of a thread/turns/list answer; null when the answer has another shape. */
export function listedTurns(answer: unknown): { turns: ListedTurn[]; nextCursor: string | null } | null {
  if (!isObject(answer) || !Array.isArray(answer['data'])) return null;
  const turns: ListedTurn[] = [];
  for (const turn of answer['data']) {
    if (!isObject(turn) || typeof turn['id'] !== 'string' || !turn['id'] || typeof turn['status'] !== 'string') return null;
    if (turn['items'] !== undefined && !Array.isArray(turn['items'])) return null;
    const items = Array.isArray(turn['items']) ? turn['items'].filter(isObject) : [];
    turns.push({ id: turn['id'], status: turn['status'], startedAt: turn['startedAt'], items });
  }
  const next = answer['nextCursor'];
  return { turns, nextCursor: typeof next === 'string' && next ? next : null };
}

/** An item of a thread/items/list answer: the item, its id and the start time of the entry. */
export interface ListedItem {
  id: string;
  item: Record<string, unknown>;
  startedAtMs: unknown;
}

/** The items of a thread/items/list answer; null when the answer has another shape. */
export function listedItems(answer: unknown): { items: ListedItem[]; nextCursor: string | null } | null {
  if (!isObject(answer) || !Array.isArray(answer['data'])) return null;
  const items: ListedItem[] = [];
  for (const entry of answer['data']) {
    const item = isObject(entry) ? entry['item'] : null;
    if (!isObject(entry) || !isObject(item) || typeof item['id'] !== 'string' || !item['id']) return null;
    items.push({ id: item['id'], item, startedAtMs: entry['startedAtMs'] });
  }
  const next = answer['nextCursor'];
  return { items, nextCursor: typeof next === 'string' && next ? next : null };
}
