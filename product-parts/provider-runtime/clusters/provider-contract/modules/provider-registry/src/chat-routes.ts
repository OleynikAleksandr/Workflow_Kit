// Route of a session's conversation (spec M18 section 2.1): GET …/sessions/:sid/messages reads the
// newest messages through the optional Provider.readMessages. It only reads: no operation, no mutex.
import { HttpError } from '#http-server';
import type { RouteContext, Router } from '#http-server';
import { CHAT_PAGE_LIMIT, CHAT_SYNC_RETRY_MAX_MS, chatPageOut, chatSyncOut } from './chat.ts';
import type { ChatMessage, ChatSync } from './chat.ts';
import { ProviderError } from './contract.ts';
import type { Project, Provider } from './contract.ts';

/** Helpers of routes.ts the chat route reuses. */
export interface ChatRouteParts {
  router: Router;
  providerOf(ctx: RouteContext): Provider;
  projectOf(ctx: RouteContext): Promise<Project>;
  sessionIdOf(ctx: RouteContext): string;
  toHttpError(error: unknown): unknown;
}

/** Answer of GET /api/projects/:id/providers/:p/sessions/:sid/messages. */
export interface ChatMessagesAnswer {
  supported: boolean;
  messages: ChatMessage[];
  truncated: boolean;
  sync?: ChatSync;
}

/** Temporary failures of reading (spec M32 section 2.7): 503, the panel keeps its feed and retries. */
export const CHAT_TRANSIENT_CODES: readonly string[] = ['codex-reconnecting', 'codex-unavailable'];

/**
 * A ProviderError of reading the conversation becomes 502 with the provider's code and text, or
 * 503 for a code in CHAT_TRANSIENT_CODES. details.sync and details.retryAfterMs, when present,
 * are normalized like the sync of a page (an invalid sync or retryAfterMs is dropped).
 */
function readError(error: unknown): unknown {
  if (error instanceof ProviderError) {
    const { sync: rawSync, retryAfterMs: rawRetry, ...rest } = error.details ?? {};
    const sync = chatSyncOut(rawSync);
    const retry = typeof rawRetry === 'number' && Number.isFinite(rawRetry) && rawRetry >= 0 ? Math.min(Math.round(rawRetry), CHAT_SYNC_RETRY_MAX_MS) : undefined;
    const details = { ...rest, ...(sync ? { sync } : {}), ...(retry === undefined ? {} : { retryAfterMs: retry }), ...(error.hint === undefined ? {} : { hint: error.hint }) };
    return new HttpError(CHAT_TRANSIENT_CODES.includes(error.code) ? 503 : 502, error.code, error.message, details);
  }
  return error;
}

/** Registers GET /api/projects/:id/providers/:p/sessions/:sid/messages. */
export function registerChatRoutes(parts: ChatRouteParts): void {
  const { router, providerOf, projectOf, sessionIdOf, toHttpError } = parts;

  router.get('/api/projects/:id/providers/:p/sessions/:sid/messages', async (ctx): Promise<ChatMessagesAnswer> => {
    const sid = sessionIdOf(ctx);
    const provider = providerOf(ctx);
    const project = await projectOf(ctx);
    const read = provider.readMessages?.bind(provider);
    if (!read) return { supported: false, messages: [], truncated: false };
    const sessions = await provider.listSessions(project).catch((error: unknown) => Promise.reject(toHttpError(error)));
    const session = sessions.find((s) => s.localId === sid) ?? sessions.find((s) => s.remoteId === sid);
    if (!session) throw new HttpError(404, 'unknown-session', 'Сессия не найдена');
    try {
      return { supported: true, ...chatPageOut(await read(project, session.localId, { limit: CHAT_PAGE_LIMIT })) };
    } catch (error) {
      throw readError(error);
    }
  });
}
