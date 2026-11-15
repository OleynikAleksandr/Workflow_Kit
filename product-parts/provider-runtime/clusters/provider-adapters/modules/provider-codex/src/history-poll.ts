// Budget of one Codex history poll (spec M32 section 2.2; chat.md of this module): pages, bytes
// and time of the poll and its daemon connection, reopened after a page refused for its size.
import { RpcError } from './rpc.ts';
import type { InitializeResult, RpcSession } from './rpc.ts';
import { MAX_MESSAGE_BYTES } from './ws.ts';

/** Per poll: list pages (turns and items), payload bytes received and milliseconds, connect included. */
export const HISTORY_POLL_PAGES = 8;
export const HISTORY_POLL_BYTES = 32 * 1024 * 1024;
export const HISTORY_POLL_MS = 5000;
/** First page size; a refused page is asked again with 25, 12, 6, 3 and 1. */
export const HISTORY_PAGE_SIZE = 50;
/** An older status is read again before the poll answers, with this much time kept for it. */
export const HISTORY_STATUS_AGE_MS = 2000;
export const HISTORY_STATUS_RESERVE_MS = 1000;
/** An open gap at the end of a turn is looked at again after this long (or on a new status or server). */
export const HISTORY_GAP_RECHECK_MS = 30_000;
/** The cache: threads, UTF-8 bytes of the kept texts, turns of one thread. */
export const HISTORY_CACHE_THREADS = 64;
export const HISTORY_CACHE_BYTES = 32 * 1024 * 1024;
export const HISTORY_TURNS_MAX = 512;
export const HISTORY_GAP_REASON = 'Часть диалога Codex недоступна: слишком большой элемент. Полный текст доступен в чате провайдера';
export const HISTORY_UNSUPPORTED_REASON = 'Codex не отдаёт историю этого чата порциями; диалог доступен в чате провайдера';

const MIN_RPC_MS = 50;
const OVERSIZE = ['frame-too-large', 'message-too-large'];

/** The part of HistoryDeps a poll connects with. */
export interface LinkDeps {
  withDaemon<T>(fn: (session: RpcSession, init: InitializeResult) => Promise<T>, timeoutMs?: number): Promise<T>;
  serverPid?(): number | null;
}

export class Oversize extends Error {}
export class OutOfBudget extends Error {}
export class Unsupported extends Error {}

export const shrink = (size: number): number => Math.max(1, Math.floor(size / 2));
export const notSupported = (error: unknown): boolean => error instanceof RpcError && error.code === -32601;
export const badAnchor = (error: unknown): boolean => error instanceof RpcError && (error.code === -32602 || error.code === -32600);

/** One daemon connection kept open until release (withDaemon closes it then). */
export interface Link { session: RpcSession; identity: string | null; release(): void }

export function openLink(deps: LinkDeps, timeoutMs: number): Promise<Link> {
  return new Promise((resolve, reject) => {
    let release!: () => void;
    const hold = new Promise<void>((done) => { release = done; });
    let opened = false;
    deps.withDaemon(async (session, init) => {
      opened = true;
      const agent = typeof init.userAgent === 'string' && init.userAgent ? init.userAgent : null;
      resolve({ session, identity: agent ? `${agent}\n${deps.serverPid?.() ?? '?'}` : null, release });
      await hold;
    }, timeoutMs).catch((error: unknown) => { if (!opened) reject(error); });
  });
}

/** The budget of one poll and its current connection; a refused page reconnects. */
export class Poll {
  pages = 0;
  identity: string | null = null;
  private spent = 0;
  private link: Link | null = null;
  readonly deadline: number;
  private readonly deps: LinkDeps;
  readonly now: () => number;
  constructor(deps: LinkDeps, now: () => number) {
    this.deps = deps;
    this.now = now;
    this.deadline = now() + HISTORY_POLL_MS;
  }
  remaining(): number { return this.deadline - this.now(); }
  bytes(): number { return this.spent + (this.link?.session.receivedBytes ?? 0); }
  /** Room for one more request, keeping pages and milliseconds for the final status read. */
  room(pages: number, ms: number): boolean {
    return this.pages + pages < HISTORY_POLL_PAGES && this.bytes() + MAX_MESSAGE_BYTES <= HISTORY_POLL_BYTES && this.remaining() > ms + MIN_RPC_MS;
  }
  async call(method: string, params: unknown, page: boolean, keepPages = 0, keepMs = 0): Promise<unknown> {
    if (page ? !this.room(keepPages, keepMs) : this.remaining() <= MIN_RPC_MS || this.bytes() + MAX_MESSAGE_BYTES > HISTORY_POLL_BYTES) throw new OutOfBudget();
    if (page) this.pages += 1;
    if (!this.link) {
      this.link = await openLink(this.deps, this.remaining());
      this.identity = this.link.identity;
      this.link.session.limitReceived(HISTORY_POLL_BYTES - this.spent);
    }
    try {
      return await this.link.session.request(method, params, Math.max(1, this.remaining()));
    } catch (error) {
      if (error instanceof RpcError && OVERSIZE.includes(String(error.code))) {
        this.drop();
        throw new Oversize(String(error.code));
      }
      if (error instanceof RpcError && (error.code === 'budget-exhausted' || error.code === 'timeout')) {
        this.drop();
        throw new OutOfBudget(String(error.code));
      }
      throw error;
    }
  }
  drop(): void {
    if (!this.link) return;
    this.spent += this.link.session.receivedBytes;
    this.link.release();
    this.link = null;
  }
}
