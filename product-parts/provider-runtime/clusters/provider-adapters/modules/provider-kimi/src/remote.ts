// Remote Control of the Kit server of Kimi (spec M8, section 2.6): its address is the mobile
// link of the Kimi sessions. One application of the machine runs Remote Control at a time.
import { ProviderError } from '#provider-registry';
import { KIMI_CODES, KimiError, describeKimiError } from './client.ts';
import type { KimiClient } from './client.ts';
import { parseRemote } from './shapes.ts';
import type { KimiRemoteState } from './shapes.ts';

/** Actions of the provider that turn Remote Control of the Kit server on and off. */
export const REMOTE_ON_ACTION = 'kimi-remote';
export const REMOTE_OFF_ACTION = 'kimi-remote-off';
/** Note of code 40928 and of a conflict the server reports. */
export const REMOTE_BUSY_NOTE = 'Remote Control уже ведёт другое приложение Kimi';
/** How long an answer about Remote Control is reused. */
export const REMOTE_CACHE_MS = 5000;
const REMOTE_TIMEOUT_MS = 3000;

export interface KimiRemote {
  /** Address for links.mobile, or null; asks only a server that already runs. */
  mobile(): Promise<string | null>;
  /** True when Remote Control of the Kit server is on; asks only a server that already runs. */
  enabled(): Promise<boolean>;
  /** Turns Remote Control on or off; starts the server when it does not run. */
  set(enabled: boolean): Promise<void>;
  /** Note of the provider status, or null. */
  note(): string | null;
  /** Forgets the last answer and the note ("Перепроверить"). */
  reset(): void;
}

export interface KimiRemoteOptions {
  /** Client of the running server of Kit, or null. */
  current(): Promise<KimiClient | null>;
  /** Client of the server, started when needed. */
  requireServer(): Promise<KimiClient>;
  now(): number;
  version(): string | null;
}

export function createKimiRemote(options: KimiRemoteOptions): KimiRemote {
  let cached: { at: number; value: KimiRemoteState | null } | null = null;
  // Where the note came from: a refused POST stays until a success, a conflict of GET until it is gone.
  let busy: 'post' | 'get' | null = null;

  const read = async (): Promise<KimiRemoteState | null> => {
    const client = await options.current();
    if (!client) return null;
    if (cached && options.now() - cached.at < REMOTE_CACHE_MS) return cached.value;
    let value: KimiRemoteState | null = null;
    try {
      value = parseRemote(await client.get('/api/v1/remote-control', { timeoutMs: REMOTE_TIMEOUT_MS }));
      if (value.enabled) busy = null;
      else if (value.conflict) busy ??= 'get';
      else if (busy === 'get') busy = null;
    } catch {
      value = null; // An older Kimi without the route or a server that does not answer: no link.
    }
    cached = { at: options.now(), value };
    return value;
  };

  return {
    async mobile() {
      const state = await read();
      return state?.enabled ? state.url : null;
    },
    async enabled() {
      return (await read())?.enabled === true;
    },
    async set(enabled) {
      const client = await options.requireServer();
      cached = null;
      try {
        parseRemote(await client.post('/api/v1/remote-control', { enabled }));
        busy = null;
      } catch (error) {
        if (error instanceof KimiError && error.code === KIMI_CODES.remoteControlRuns) {
          busy = 'post';
          throw new ProviderError('kimi-remote-busy', REMOTE_BUSY_NOTE, { status: 409, hint: 'Выключите Remote Control в другом приложении Kimi и повторите.' });
        }
        throw new ProviderError('kimi-remote', `Kimi не ${enabled ? 'включил' : 'выключил'} Remote Control: ${describeKimiError(error, options.version())}`, { hint: 'Нажмите «Перепроверить» и повторите.' });
      }
    },
    note: () => (busy ? REMOTE_BUSY_NOTE : null),
    reset() {
      cached = null;
      busy = null;
    },
  };
}
