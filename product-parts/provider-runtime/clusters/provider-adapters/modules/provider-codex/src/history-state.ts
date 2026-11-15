// Cached state of a Codex thread history (spec M32 sections 2.2-2.3; chat.md of this module):
// turns as runs of items with gaps between them, the joining of a new page of turns, the page
// built from the cache and the limits of what the cache keeps; asynchronous questions of the agent
// (spec M33 section 2.7) ride on their items.
import { CHAT_PAGE_LIMIT, ProviderError } from '#provider-registry';
import type { ChatGap, ChatMessage, ChatQuestion } from '#provider-registry';
import { feedMessage, isoTime } from './history-items.ts';
import type { ListedItem, ListedTurn } from './history-items.ts';
import { HISTORY_GAP_REASON, HISTORY_PAGE_SIZE, HISTORY_TURNS_MAX } from './history-poll.ts';
import { asyncAsks, asyncQuestion } from './questions.ts';
import type { AsyncAsk } from './questions.ts';

/** An item of the cache: its feed message and the asynchronous questions it carries (with their time). */
export interface Entry { id: string; message: ChatMessage | null; asks?: AsyncAsk[]; at?: string | null }
/** An asynchronous question met while the messages were collected: position — messages before it and its own. */
export interface Asked { id: string; asks: AsyncAsk[]; at: string | null; after: string | null; position: number }
/** An unread range after item `after` and before item `before` (null: the edge of the turn). */
export interface Gap { after: string | null; before: string | null; identity: string | null; status: string; checkedAt: number }
export interface TurnState {
  id: string;
  status: string;
  startedAt: unknown;
  /** Contiguous runs of items; gaps[i] lies between segments[i] and segments[i + 1]. */
  segments: Entry[][];
  gaps: Gap[];
  ids: Set<string>;
  /** Status at which the turn was last read to its end; null: never read. */
  synced: string | null;
  /** Items per page for this turn: halved by a refused page, kept between polls. */
  size: number;
  /** Read once, then left out of the cache: older than the kept messages. */
  dropped: boolean;
}
export interface Snapshot { messages: ChatMessage[]; truncated: boolean; gaps: ChatGap[]; pending: boolean; questions?: ChatQuestion[] }
export interface ThreadState {
  threadId: string;
  mode: string | null;
  turns: TurnState[];
  /** Cursor of older turns (desc); null when the start of the thread was reached or cut off. */
  older: string | null;
  cutOff: boolean;
  legacy: Snapshot | null;
  published: Snapshot | null;
  resetting: boolean;
  bytes: number;
  inflight: Promise<void> | null;
}

export const textBytes = (messages: Iterable<ChatMessage | null>): number => {
  let total = 0;
  for (const message of messages) if (message) total += Buffer.byteLength(message.text, 'utf8');
  return total;
};
/** UTF-8 bytes of the asynchronous questions of entries (titles and options). */
const askBytes = (entries: readonly Entry[]): number => {
  let total = 0;
  for (const entry of entries) for (const ask of entry.asks ?? []) total += Buffer.byteLength(ask.title + ask.options.join(''), 'utf8');
  return total;
};

export function newTurn(turn: ListedTurn): TurnState {
  return { id: turn.id, status: turn.status, startedAt: turn.startedAt, segments: [[]], gaps: [], ids: new Set(), synced: null, size: HISTORY_PAGE_SIZE, dropped: false };
}
export function resetTurn(turn: TurnState): void {
  turn.segments = [[]];
  turn.gaps = [];
  turn.ids.clear();
  turn.synced = null;
  turn.dropped = false;
}
/** The entry of an item; startedAtMs — the time of the entry, turnAt — of its turn. */
export function itemEntry(item: Record<string, unknown>, id: string, startedAtMs: unknown, turnAt: unknown): Entry {
  const message = feedMessage(item, id, startedAtMs, turnAt);
  const asks = asyncAsks(item);
  if (!asks) return { id, message };
  return { id, message, asks, at: message?.at ?? isoTime(startedAtMs) ?? isoTime(item['startedAtMs']) ?? isoTime(turnAt) };
}
export function entryOf(turn: TurnState, listed: ListedItem): Entry {
  return itemEntry(listed.item, listed.id, listed.startedAtMs, turn.startedAt);
}
/** Adds the message of an entry to the feed and notes its asynchronous questions. */
export function pushEntry(messages: ChatMessage[], asked: Asked[], entry: Entry): void {
  if (entry.message) messages.push(entry.message);
  if (entry.asks) asked.push({ id: entry.id, asks: entry.asks, at: entry.at ?? null, after: messages.at(-1)?.id ?? null, position: messages.length });
}
export function append(turn: TurnState, segment: number, items: ListedItem[]): void {
  for (const item of items) {
    turn.segments[segment]!.push(entryOf(turn, item));
    turn.ids.add(item.id);
  }
}
export const lastId = (turn: TurnState): string | null => turn.segments.at(-1)!.at(-1)?.id ?? null;
export const openAtEnd = (turn: TurnState): boolean => turn.gaps.length > 0 && turn.segments.at(-1)!.length === 0;
export const messageCount = (turn: TurnState): number => turn.segments.reduce((sum, run) => sum + run.filter((entry) => entry.message).length, 0);
/** A page repeated an item an exclusive anchor had excluded: read the turn again next time and refuse. */
export function cycle(turn: TurnState): ProviderError {
  resetTurn(turn);
  return new ProviderError('chat-unavailable', 'Codex не отдал переписку: страница истории повторила уже прочитанный элемент', { status: 502 });
}

export function reset(state: ThreadState, turns: ListedTurn[], nextCursor: string | null): void {
  if (state.published) state.resetting = true;
  state.turns = turns.map(newTurn);
  state.older = nextCursor;
  state.cutOff = false;
}

/** Joins the newest page of turns with the cache; a vanished or reordered turn starts a new pass. */
export function merge(state: ThreadState, latest: ListedTurn[], nextCursor: string | null): void {
  if (state.turns.length === 0) { reset(state, latest, nextCursor); return; }
  const ids = latest.map((turn) => turn.id);
  const inPage = new Set(ids);
  const cached = state.turns.map((turn) => turn.id);
  const byId = new Map(state.turns.map((turn) => [turn.id, turn]));
  const start = ids.length > 0 ? cached.indexOf(ids[0]!) : -1;
  let keep: TurnState[] = [];
  if (nextCursor === null || ids.length === 0) {
    if (cached.some((id) => !inPage.has(id))) { reset(state, latest, nextCursor); return; }
  } else if (start >= 0) {
    if (cached.slice(start).some((id) => !inPage.has(id))) { reset(state, latest, nextCursor); return; }
    keep = state.turns.slice(0, start);
  } else {
    // The cache starts inside this page: all of it must be there, and older turns must exist.
    if (state.older === null || cached.some((id) => !inPage.has(id))) { reset(state, latest, nextCursor); return; }
    state.older = nextCursor;
  }
  if (cached.filter((id) => inPage.has(id)).join('\n') !== ids.filter((id) => byId.has(id)).join('\n')) { reset(state, latest, nextCursor); return; }
  state.turns = [...keep, ...latest.map((listed) => {
    const turn = byId.get(listed.id);
    if (!turn) return newTurn(listed);
    turn.status = listed.status;
    return turn;
  })];
}

export const gapOut = (turnId: string, gap: Gap): ChatGap => ({
  turnId,
  reason: HISTORY_GAP_REASON,
  ...(gap.after ? { afterItemId: gap.after } : {}),
  ...(gap.before ? { beforeItemId: gap.before } : {}),
});

/**
 * The newest limit messages, the gaps among or right before them and the asynchronous questions
 * among them: answered (without answers) once a user message follows the question.
 */
export function window(messages: ChatMessage[], gaps: { gap: ChatGap; at: number }[], limit: number, older: boolean, pending: boolean, asked: Asked[] = []): Snapshot {
  const from = Math.max(0, messages.length - limit);
  const questions = asked.filter((a) => a.position >= from).map((a) => asyncQuestion(a.id, a.asks, a.at, a.after, messages.slice(a.position).some((m) => m.role === 'user')));
  return { messages: messages.slice(from), truncated: older || messages.length > limit, gaps: gaps.filter((gap) => gap.at >= from).map((gap) => gap.gap), pending, ...(questions.length > 0 ? { questions } : {}) };
}

export function assemble(state: ThreadState, limit: number): Snapshot {
  const messages: ChatMessage[] = [];
  const gaps: { gap: ChatGap; at: number }[] = [];
  const asked: Asked[] = [];
  for (const turn of state.turns) {
    turn.segments.forEach((run, index) => {
      for (const entry of run) pushEntry(messages, asked, entry);
      const gap = turn.gaps[index];
      if (gap) gaps.push({ gap: gapOut(turn.id, gap), at: messages.length });
    });
  }
  let count = 0;
  let pending = false;
  for (let index = state.turns.length - 1; index >= 0 && count < limit; index -= 1) {
    const turn = state.turns[index]!;
    if (turn.synced === null && !turn.dropped) pending = true;
    count += messageCount(turn);
  }
  if (count < limit && state.older !== null) pending = true;
  const older = state.older !== null || state.cutOff || state.turns.some((turn) => turn.dropped || turn.synced === null);
  return window(messages, gaps, limit, older, pending, asked);
}

/** Drops the texts of turns older than the kept messages and caps the number of turns. */
export function prune(state: ThreadState, limit: number): void {
  const keep = Math.max(limit, CHAT_PAGE_LIMIT);
  let count = 0;
  for (let index = state.turns.length - 1; index >= 0; index -= 1) {
    const turn = state.turns[index]!;
    if (count >= keep && index < state.turns.length - 1 && turn.synced !== null && turn.status !== 'inProgress' && !turn.dropped) {
      resetTurn(turn);
      turn.synced = turn.status;
      turn.dropped = true;
    }
    count += messageCount(turn);
  }
  if (state.turns.length > HISTORY_TURNS_MAX) {
    state.turns.splice(0, state.turns.length - HISTORY_TURNS_MAX);
    state.older = null;
    state.cutOff = true;
  }
}

export function measure(state: ThreadState): void {
  let bytes = state.legacy ? textBytes(state.legacy.messages) : 0;
  for (const turn of state.turns) for (const run of turn.segments) bytes += textBytes(run.map((entry) => entry.message)) + askBytes(run);
  if (state.resetting && state.published) bytes += textBytes(state.published.messages);
  state.bytes = bytes;
}
