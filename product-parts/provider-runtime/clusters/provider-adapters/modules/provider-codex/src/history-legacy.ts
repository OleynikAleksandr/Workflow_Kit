// Legacy Codex history (spec M32 section 2.1, T001 results): no thread/items/list, so full turns
// of thread/turns/list are read again on every poll, a too large turn by its summary or as a gap.
import type { ChatGap, ChatMessage } from '#provider-registry';
import { listedTurns } from './history-items.ts';
import type { ListedTurn } from './history-items.ts';
import { HISTORY_PAGE_SIZE, HISTORY_STATUS_RESERVE_MS, OutOfBudget, Oversize, Unsupported, shrink } from './history-poll.ts';
import type { Poll } from './history-poll.ts';
import { gapOut, itemEntry, pushEntry, window } from './history-state.ts';
import type { Asked, Entry, Gap, Snapshot } from './history-state.ts';

/** Legacy history (no thread/items/list): full turns, newest first, read again on every poll. */
export async function readLegacy(poll: Poll, threadId: string, limit: number): Promise<Snapshot> {
  const turns: { id: string; entries: Entry[]; gap: Gap | null }[] = [];
  let cursor: string | null = null;
  let size = HISTORY_PAGE_SIZE;
  let count = 0;
  let complete = false;
  const add = (turn: ListedTurn, gap: Gap | null): void => {
    const entries = turn.items.map((item, index) => {
      const id = typeof item['id'] === 'string' && item['id'] ? item['id'] : `${turn.id}:${index}`;
      return itemEntry(item, id, undefined, turn.startedAt);
    });
    count += entries.filter((entry) => entry.message).length;
    turns.push({ id: turn.id, entries, gap });
  };
  const list = async (view: string, limitOf: number) => {
    const listed = listedTurns(await poll.call('thread/turns/list', { threadId, cursor, limit: limitOf, sortDirection: 'desc', itemsView: view }, true, 1, HISTORY_STATUS_RESERVE_MS));
    if (!listed) throw new Unsupported('thread/turns/list');
    return listed;
  };
  try {
    while (count < limit) {
      let listed;
      try {
        listed = await list('full', size);
      } catch (error) {
        if (!(error instanceof Oversize)) throw error;
        if (size > 1) { size = shrink(size); continue; }
        // One turn is too large: its summary with a gap between its messages, else the whole turn.
        let one;
        try { one = await list('summary', 1); } catch (inner) { if (!(inner instanceof Oversize)) throw inner; one = null; }
        const summary = one?.turns[0];
        if (one && summary) {
          const first = summary.items[0];
          const last = summary.items.length > 1 ? summary.items.at(-1) : undefined;
          add(summary, { after: typeof first?.['id'] === 'string' ? first['id'] : null, before: typeof last?.['id'] === 'string' ? last['id'] : null, identity: null, status: summary.status, checkedAt: 0 });
        } else {
          one = await list('notLoaded', 1);
          const bare = one.turns[0];
          if (bare) turns.push({ id: bare.id, entries: [], gap: { after: null, before: null, identity: null, status: bare.status, checkedAt: 0 } });
        }
        cursor = one.nextCursor;
        if (!cursor || one.turns.length === 0) { complete = true; break; }
        continue;
      }
      for (const turn of listed.turns) add(turn, null);
      cursor = listed.nextCursor;
      if (!cursor || listed.turns.length === 0) { complete = true; break; }
    }
  } catch (error) {
    if (!(error instanceof OutOfBudget)) throw error;
  }
  const messages: ChatMessage[] = [];
  const gaps: { gap: ChatGap; at: number }[] = [];
  const asked: Asked[] = [];
  for (const turn of turns.reverse()) {
    if (turn.gap && turn.gap.after !== null && turn.entries.length > 1) {
      pushEntry(messages, asked, turn.entries[0]!);
      gaps.push({ gap: gapOut(turn.id, turn.gap), at: messages.length });
      for (const entry of turn.entries.slice(1)) pushEntry(messages, asked, entry);
      continue;
    }
    for (const entry of turn.entries) pushEntry(messages, asked, entry);
    if (turn.gap) gaps.push({ gap: gapOut(turn.id, turn.gap), at: messages.length });
  }
  return window(messages, gaps, limit, !complete, !complete && count < limit, asked);
}
