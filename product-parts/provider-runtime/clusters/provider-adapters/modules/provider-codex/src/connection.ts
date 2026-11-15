// Connection coordinator of the Codex daemon (spec M32 sections 2.5 and 2.7; module.md of this
// module): one per runtime (CODEX_HOME). It classifies network failures, keeps the reconnect epoch
// and the observed server identity, and paces safe reads with one backoff and one recovery probe.
import { RpcError, TransportError } from './rpc.ts';

/** Delays before the next attempt after the 1st, 2nd, … failure; the last one repeats. */
export const RECOVERY_DELAYS_MS: readonly number[] = [250, 1000, 2000, 4000, 10_000];
/** ±10 % jitter of every delay. */
export const RECOVERY_JITTER = 0.1;
/** retryAfterMs never exceeds the largest delay with its jitter. */
export const RECOVERY_RETRY_MAX_MS = 11_000;
/** After this long without a connection the state is unavailable, not reconnecting. */
export const RECOVERY_UNAVAILABLE_MS = 30_000;
export const RECOVERY_REASON = 'Восстанавливаем подключение к Codex…';
export const UNAVAILABLE_REASON = 'Нет подключения к Codex. Проверьте демон в настройках провайдера';

/** errno of a socket that is gone, refused, reset or broken. */
const NETWORK_ERRNO = ['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'];

/** What a safe read answers while the daemon cannot be reached. */
export interface OfflineState {
  state: 'reconnecting' | 'unavailable';
  reason: string;
  /** Milliseconds until the next attempt, 0…RECOVERY_RETRY_MAX_MS. */
  retryAfterMs: number;
}

/** A safe read refused at once: the coordinator waits for the next attempt (cooldown). */
export class CodexOffline extends Error {
  readonly offline: OfflineState;
  constructor(offline: OfflineState) {
    super(offline.reason);
    this.name = 'CodexOffline';
    this.offline = offline;
  }
}

/**
 * A proven transport failure: a gone, refused, reset or broken socket, a connection closed with an
 * unfinished call, or a daemon that did not answer the handshake. Oversized or malformed messages,
 * protocol and RPC errors, refused handshakes and a close the client asked for are not.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof CodexOffline) return true;
  const code = error instanceof RpcError || error instanceof TransportError ? error.code : null;
  if (code === 'connection-lost') return true;
  if (error instanceof RpcError && code === 'closed') return !error.message.endsWith('closed by client');
  const errno = (error as NodeJS.ErrnoException | null)?.code;
  return typeof errno === 'string' && NETWORK_ERRNO.includes(errno);
}

export interface ConnectionCoordinator {
  /**
   * Admits one safe read before it connects. In cooldown it throws CodexOffline at once; while
   * another read makes the due attempt it waits for that probe until deadline. The returned
   * function ends the admission (the probe, when this read made it).
   */
  admit(deadline: number): Promise<() => void>;
  /** Records a failure of any connection; true when it was a network failure (epoch changed). */
  failed(error: unknown): boolean;
  /** Records the identity of a server that answered initialize. */
  observed(identity: string): void;
  /** A connection did its work: the backoff and the 30 s count start over. */
  succeeded(): void;
  /** The offline state while a failure is not followed by a success; null otherwise. */
  offline(): OfflineState | null;
  epoch(): number;
  identity(): string | null;
  /** Called on a new epoch or a new server identity: positive snapshots are no longer valid. */
  onReset(listener: () => void): void;
}

export function createConnectionCoordinator(clock: { now(): number; random(): number }): ConnectionCoordinator {
  let epoch = 0;
  let identity: string | null = null;
  let failure: { since: number; attempt: number; nextAt: number } | null = null;
  let probe: Promise<void> | null = null;
  const listeners: (() => void)[] = [];
  const reset = (): void => { for (const listener of listeners) listener(); };
  const offline = (): OfflineState | null => {
    if (!failure) return null;
    const now = clock.now();
    const unavailable = now - failure.since >= RECOVERY_UNAVAILABLE_MS;
    return {
      state: unavailable ? 'unavailable' : 'reconnecting',
      reason: unavailable ? UNAVAILABLE_REASON : RECOVERY_REASON,
      retryAfterMs: Math.round(Math.min(RECOVERY_RETRY_MAX_MS, Math.max(0, failure.nextAt - now))),
    };
  };
  const refuse = (): never => { throw new CodexOffline(offline() ?? { state: 'reconnecting', reason: RECOVERY_REASON, retryAfterMs: 0 }); };
  return {
    async admit(deadline) {
      if (!failure) return () => undefined;
      if (clock.now() < failure.nextAt) refuse();
      if (probe) {
        // Another read makes the due attempt: wait for it within this read's own deadline.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([probe, new Promise<void>((resolve) => { timer = setTimeout(resolve, Math.max(0, deadline - clock.now())); })]);
        clearTimeout(timer);
        if (failure) refuse();
        return () => undefined;
      }
      let done!: () => void;
      probe = new Promise<void>((resolve) => { done = resolve; });
      return () => {
        probe = null;
        done();
      };
    },
    failed(error) {
      if (!isNetworkFailure(error) || error instanceof CodexOffline) return false;
      const now = clock.now();
      const attempt = failure ? failure.attempt + 1 : 0;
      const delay = RECOVERY_DELAYS_MS[Math.min(attempt, RECOVERY_DELAYS_MS.length - 1)]!;
      const jitter = 1 + (clock.random() * 2 - 1) * RECOVERY_JITTER;
      failure = { since: failure?.since ?? now, attempt, nextAt: now + delay * jitter };
      epoch += 1;
      reset();
      return true;
    },
    observed(next) {
      const changed = identity !== null && identity !== next;
      identity = next;
      if (changed) reset();
    },
    succeeded() {
      failure = null;
    },
    offline,
    epoch: () => epoch,
    identity: () => identity,
    onReset(listener) {
      listeners.push(listener);
    },
  };
}
