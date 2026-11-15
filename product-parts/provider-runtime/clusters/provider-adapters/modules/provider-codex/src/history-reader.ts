// Paginated reading of a Codex thread history (spec M32 sections 2.2-2.4; chat.md of this module).
// Every poll reads thread/read metadata and the newest turns without items first (the Stop
// snapshot), then thread/items/list per turn from a confirmed item anchor within a budget of pages,
// bytes and time. An item too large for the transport becomes a bounded gap: the turn is read from
// both sides, so the messages around it stay visible, and the gap is not read again on every poll.
import { ProviderError } from '#provider-registry';
import type { ChatPage, ChatSync } from '#provider-registry';
import type { InitializeResult, RpcSession } from './rpc.ts';
import { isObject, listedItems, listedTurns } from './history-items.ts';
import type { ListedTurn } from './history-items.ts';
import { readLegacy } from './history-legacy.ts';
import { CodexOffline, RECOVERY_REASON, isNetworkFailure } from './connection.ts';
import type { OfflineState } from './connection.ts';
import { HISTORY_CACHE_BYTES, HISTORY_CACHE_THREADS, HISTORY_GAP_REASON, HISTORY_GAP_RECHECK_MS, HISTORY_PAGE_SIZE, HISTORY_STATUS_AGE_MS, HISTORY_STATUS_RESERVE_MS, HISTORY_UNSUPPORTED_REASON, OutOfBudget, Oversize, Poll, Unsupported, badAnchor, notSupported, shrink } from './history-poll.ts';
import { append, assemble, cycle, entryOf, lastId, measure, merge, messageCount, newTurn, openAtEnd, prune, resetTurn, window } from './history-state.ts';
import type { Gap, Snapshot, ThreadState, TurnState } from './history-state.ts';

export { HISTORY_CACHE_BYTES, HISTORY_CACHE_THREADS, HISTORY_GAP_REASON, HISTORY_GAP_RECHECK_MS, HISTORY_PAGE_SIZE, HISTORY_POLL_BYTES, HISTORY_POLL_MS, HISTORY_POLL_PAGES, HISTORY_STATUS_AGE_MS, HISTORY_STATUS_RESERVE_MS, HISTORY_TURNS_MAX, HISTORY_UNSUPPORTED_REASON } from './history-poll.ts';

/** What the reader needs from the provider. */
export interface HistoryDeps {
  withDaemon<T>(fn: (session: RpcSession, init: InitializeResult) => Promise<T>, timeoutMs?: number): Promise<T>;
  /** The Stop snapshot input: thread/read metadata with the newest turns; null after a failed read. */
  onThreadRead?(threadId: string, answer: unknown): void;
  /** The daemon pid last observed (part of the server identity of gaps); null when unknown. */
  serverPid?(): number | null;
  /** The server identity of the connection coordinator (M32 T003); replaces userAgent + pid. */
  serverIdentity?(): string | null;
  /** The coordinator's offline state after a network failure (reconnecting, unavailable). */
  offline?(): OfflineState | null;
  /** Monotonic clock of the poll deadline and gap checks (tests inject it). */
  now?(): number;
  /** UTF-8 bytes of texts all cached threads keep (default HISTORY_CACHE_BYTES; tests lower it). */
  cacheBytes?: number;
}

export interface HistoryReader {
  /** The newest limit messages of threadId; key separates CODEX_HOME, project and thread. */
  read(key: string, threadId: string, limit: number): Promise<ChatPage>;
  /** Cached threads and UTF-8 bytes of their texts. */
  usage(): { threads: number; bytes: number };
}

/** A poll ended by a network failure: answered from the last snapshot or with 503 (M32 2.7). */
class NetworkDown extends Error {
  readonly failure: unknown;
  constructor(failure: unknown) {
    super(failure instanceof Error ? failure.message : String(failure));
    this.failure = failure;
  }
}

function outOf(shot: Snapshot, sync: ChatSync, limit: number): ChatPage {
  const messages = shot.messages.length > limit ? shot.messages.slice(shot.messages.length - limit) : shot.messages;
  if (shot.gaps.length > 0) {
    sync.gaps = shot.gaps;
    sync.gapCount = shot.gaps.length;
    sync.reason ??= HISTORY_GAP_REASON;
  }
  return { messages, truncated: shot.truncated || shot.messages.length > limit, sync };
}

export function createHistoryReader(deps: HistoryDeps): HistoryReader {
  const now = deps.now ?? (() => performance.now());
  const cache = new Map<string, ThreadState>();

  async function items(poll: Poll, state: ThreadState, turn: TurnState, anchor: string | null, direction: 'asc' | 'desc', limit: number) {
    const answer = await poll.call('thread/items/list', { threadId: state.threadId, turnId: turn.id, cursor: anchor ? { type: 'item', itemId: anchor } : null, limit, sortDirection: direction }, true, 1, HISTORY_STATUS_RESERVE_MS);
    const listed = listedItems(answer);
    if (!listed) throw new Unsupported('thread/items/list');
    return listed;
  }

  /** A gap never read to its end is due; a checked one when the server, the status or (open) time moved on. */
  const gapDue = (poll: Poll, gap: Gap, turn: TurnState, open: boolean): boolean => {
    if (gap.checkedAt === -Infinity) return true;
    if (poll.identity === null) return false; // An unknown server proves nothing: keep the bounds.
    if (gap.identity !== poll.identity || gap.status !== turn.status) return true;
    return open && poll.now() - gap.checkedAt >= HISTORY_GAP_RECHECK_MS;
  };

  /** A refused page asks again with half the items; a page that came grows the size back. */
  async function sized(poll: Poll, state: ThreadState, turn: TurnState, anchor: string | null, direction: 'asc' | 'desc') {
    for (;;) {
      try {
        const page = await items(poll, state, turn, anchor, direction, turn.size);
        turn.size = Math.min(HISTORY_PAGE_SIZE, turn.size * 2);
        return page;
      } catch (error) {
        if (!(error instanceof Oversize)) throw error;
        if (turn.size === 1) return null;
        turn.size = shrink(turn.size);
      }
    }
  }

  /**
   * Reads gap index from its later side down (desc from beforeItemId, or from the end of the turn
   * for an open gap): every page joins the run after the gap at once, so progress survives the poll.
   * Reaching afterItemId closes the gap; a refused single item leaves it bounded and checked.
   */
  async function descend(poll: Poll, state: ThreadState, turn: TurnState, index: number): Promise<void> {
    for (;;) {
      const gap = turn.gaps[index]!;
      const page = await sized(poll, state, turn, gap.before, 'desc');
      if (!page) {
        gap.identity = poll.identity;
        gap.status = turn.status;
        gap.checkedAt = poll.now();
        return;
      }
      const run = turn.segments[index + 1]!;
      for (const item of page.items) {
        if (item.id === gap.after) {
          turn.segments[index]!.push(...turn.segments.splice(index + 1, 1)[0]!);
          turn.gaps.splice(index, 1);
          return;
        }
        if (turn.ids.has(item.id)) throw cycle(turn);
        run.unshift(entryOf(turn, item));
        turn.ids.add(item.id);
        gap.before = item.id;
      }
      if (!page.nextCursor || page.items.length === 0) {
        if (gap.after !== null) { resetTurn(turn); return; } // The item before the gap is gone.
        turn.segments[index]!.push(...turn.segments.splice(index + 1, 1)[0]!);
        turn.gaps.splice(index, 1);
        return;
      }
    }
  }

  /** New items after the frontier (the newest known item), up to the end of the turn. */
  async function forward(poll: Poll, state: ThreadState, turn: TurnState): Promise<void> {
    for (;;) {
      const anchor = lastId(turn);
      const page = await sized(poll, state, turn, anchor, 'asc');
      if (!page) {
        // The next item is too large: a gap after it, read from the end of the turn now or next poll.
        turn.gaps.push({ after: anchor, before: null, identity: poll.identity, status: turn.status, checkedAt: -Infinity });
        turn.segments.push([]);
        turn.synced = turn.status;
        await descend(poll, state, turn, turn.gaps.length - 1);
        return;
      }
      if (page.items.some((item) => turn.ids.has(item.id))) throw cycle(turn);
      append(turn, turn.segments.length - 1, page.items);
      if (!page.nextCursor || page.items.length === 0) { turn.synced = turn.status; return; }
    }
  }

  async function syncTurn(poll: Poll, state: ThreadState, turn: TurnState): Promise<void> {
    try {
      for (let index = turn.gaps.length - 1; index >= 0; index -= 1) {
        const open = index === turn.gaps.length - 1 && openAtEnd(turn);
        if (gapDue(poll, turn.gaps[index]!, turn, open)) await descend(poll, state, turn, index);
      }
      if (openAtEnd(turn)) { turn.synced = turn.status; return; }
      await forward(poll, state, turn);
    } catch (error) {
      if (notSupported(error)) return; // Not saved yet (paginated thread): the next poll asks again.
      if (badAnchor(error)) { resetTurn(turn); return; }
      throw error;
    }
  }

  /** The next turn to read: changed or newest turns first, then older ones up to limit messages. */
  function nextTurn(state: ThreadState, limit: number, visited: Set<string>, poll: Poll): TurnState | 'older' | null {
    let count = 0;
    for (let index = state.turns.length - 1; index >= 0; index -= 1) {
      const turn = state.turns[index]!;
      if (!turn.dropped && !visited.has(turn.id)) {
        const changed = index === state.turns.length - 1 || turn.status === 'inProgress' || (turn.synced !== null && turn.synced !== turn.status)
          || turn.gaps.some((gap, at) => gapDue(poll, gap, turn, at === turn.gaps.length - 1 && openAtEnd(turn)));
        if (turn.synced === null ? count < limit : changed) return turn;
      }
      count += messageCount(turn);
    }
    return count < limit && state.older !== null ? 'older' : null;
  }

  async function olderTurns(poll: Poll, state: ThreadState): Promise<void> {
    const answer = await poll.call('thread/turns/list', { threadId: state.threadId, cursor: state.older, limit: HISTORY_PAGE_SIZE, sortDirection: 'desc', itemsView: 'notLoaded' }, true, 1, HISTORY_STATUS_RESERVE_MS);
    const listed = listedTurns(answer);
    if (!listed) throw new Unsupported('thread/turns/list');
    const known = new Set(state.turns.map((turn) => turn.id));
    const fresh = listed.turns.filter((turn) => !known.has(turn.id));
    if (listed.turns.length === 0) { state.older = null; return; }
    if (fresh.length === 0) throw new ProviderError('chat-unavailable', 'Codex не отдал переписку: курсор старых ходов не продвинулся', { status: 502 });
    state.turns.unshift(...fresh.reverse().map(newTurn));
    state.older = listed.nextCursor;
  }

  /** Metadata and the newest turns without items; observed for the Stop snapshot. */
  async function status(poll: Poll, threadId: string): Promise<{ mode: string; turns: ListedTurn[]; nextCursor: string | null; at: number }> {
    const answer = await poll.call('thread/read', { threadId }, false);
    const thread = isObject(answer) ? answer['thread'] : null;
    if (!isObject(thread) || thread['id'] !== threadId) throw new Unsupported('thread/read');
    const mode = thread['historyMode'] ?? 'legacy';
    if (mode !== 'legacy' && mode !== 'paginated') throw new Unsupported('historyMode');
    let listed: { turns: ListedTurn[]; nextCursor: string | null } | null;
    try {
      listed = listedTurns(await poll.call('thread/turns/list', { threadId, limit: HISTORY_PAGE_SIZE, sortDirection: 'desc', itemsView: 'notLoaded' }, true));
    } catch (error) {
      if (!notSupported(error)) throw error;
      if (mode !== 'paginated') throw new Unsupported('thread/turns/list');
      listed = { turns: [], nextCursor: null }; // A paginated thread before its first saved turn.
    }
    if (!listed) throw new Unsupported('thread/turns/list');
    const turns = listed.turns.slice().reverse();
    const at = poll.now();
    deps.onThreadRead?.(threadId, { thread: { ...thread, turns: turns.map((turn) => ({ id: turn.id, status: turn.status, items: [] })) } });
    return { mode, turns, nextCursor: listed.nextCursor, at };
  }

  function evict(current: ThreadState): void {
    let total = 0;
    for (const state of cache.values()) total += state.bytes;
    for (const [key, state] of cache) {
      if (cache.size <= HISTORY_CACHE_THREADS && total <= (deps.cacheBytes ?? HISTORY_CACHE_BYTES)) break;
      if (state === current || state.inflight) continue;
      cache.delete(key);
      total -= state.bytes;
    }
  }

  function failure(error: unknown): Error {
    if (error instanceof ProviderError) return error;
    if (isNetworkFailure(error)) return new NetworkDown(error);
    if (error instanceof Unsupported) {
      return new ProviderError('codex-history-unsupported', `Codex не отдал переписку: ${HISTORY_UNSUPPORTED_REASON}`, { status: 502, details: { sync: { state: 'unavailable', reason: HISTORY_UNSUPPORTED_REASON } } });
    }
    const why = error instanceof OutOfBudget ? 'нет ответа вовремя' : error instanceof Oversize ? 'слишком большой ответ' : error instanceof Error ? error.message : String(error);
    return new ProviderError('chat-unavailable', `Codex не отдал переписку: ${why}`, { status: 502 });
  }

  async function poll(state: ThreadState, limit: number): Promise<void> {
    const run = new Poll(deps, now);
    try {
      let head;
      try {
        head = await status(run, state.threadId);
      } catch (error) {
        deps.onThreadRead?.(state.threadId, null);
        throw failure(error);
      }
      if (state.mode !== head.mode) {
        state.mode = head.mode;
        state.turns = [];
        state.older = null;
        state.legacy = null;
      }
      try {
        if (head.mode === 'legacy') {
          state.legacy = await readLegacy(run, state.threadId, limit);
        } else {
          merge(state, head.turns, head.nextCursor);
          const visited = new Set<string>();
          for (;;) {
            const next = nextTurn(state, limit, visited, run);
            if (next === null) break;
            if (next === 'older') await olderTurns(run, state);
            else {
              visited.add(next.id);
              await syncTurn(run, state, next);
            }
          }
        }
      } catch (error) {
        if (!(error instanceof OutOfBudget)) throw failure(error);
      } finally {
        prune(state, limit);
        measure(state);
      }
      // A long items read: the status again, so Stop does not rely on an old snapshot.
      if (run.now() - head.at > HISTORY_STATUS_AGE_MS && run.room(0, 0)) {
        try {
          await status(run, state.threadId);
        } catch (error) {
          if (!(error instanceof OutOfBudget)) deps.onThreadRead?.(state.threadId, null);
        }
      }
    } finally {
      await run.drop();
    }
  }

  /** After a network failure: the full last snapshot with the offline state, else 503. */
  function offlinePage(state: ThreadState, limit: number, down: NetworkDown): ChatPage {
    const offline = deps.offline?.() ?? (down.failure instanceof CodexOffline ? down.failure.offline : { state: 'reconnecting', reason: RECOVERY_REASON, retryAfterMs: 0 });
    const sync: ChatSync = { state: offline.state, reason: offline.reason, retryAfterMs: offline.retryAfterMs };
    if (state.published) return outOf(state.published, sync, limit);
    throw new ProviderError(offline.state === 'reconnecting' ? 'codex-reconnecting' : 'codex-unavailable', offline.reason, { status: 503, details: { sync, retryAfterMs: offline.retryAfterMs } });
  }

  function pageOf(state: ThreadState, limit: number): ChatPage {
    const snapshot = state.mode === 'legacy' ? state.legacy ?? window([], [], limit, false, true) : assemble(state, limit);
    const out = (shot: Snapshot, sync: ChatSync): ChatPage => outOf(shot, sync, limit);
    if (!snapshot.pending) {
      state.published = snapshot;
      state.resetting = false;
      return out(snapshot, { state: snapshot.gaps.length > 0 ? 'partial' : 'ready' });
    }
    if ((state.resetting || state.mode === 'legacy') && state.published) return out(state.published, { state: 'loading' });
    return out(snapshot, { state: 'loading' });
  }

  return {
    async read(key, threadId, limit) {
      const want = Math.max(0, Math.floor(limit));
      let state = cache.get(key);
      if (state) cache.delete(key);
      state ??= { threadId, mode: null, turns: [], older: null, cutOff: false, legacy: null, published: null, resetting: false, bytes: 0, inflight: null };
      cache.set(key, state);
      const current = state;
      current.inflight ??= poll(current, want).finally(() => {
        current.inflight = null;
        evict(current);
      });
      try {
        await current.inflight;
      } catch (error) {
        if (error instanceof NetworkDown) return offlinePage(current, want, error);
        throw error;
      }
      return pageOf(current, want);
    },
    usage() {
      let bytes = 0;
      for (const state of cache.values()) bytes += state.bytes;
      return { threads: cache.size, bytes };
    },
  };
}
