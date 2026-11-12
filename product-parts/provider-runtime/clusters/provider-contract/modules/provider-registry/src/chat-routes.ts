// Route of a session's conversation (spec M18 section 2.1): GET …/sessions/:sid/messages reads the
// newest messages through the optional Provider.readMessages. It only reads: no operation, no mutex.
import { HttpError } from '#http-server';
import type { RouteContext, Router } from '#http-server';
import { CHAT_PAGE_LIMIT, chatPageOut } from './chat.ts';
import type { ChatMessage } from './chat.ts';
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
}

/** A ProviderError of reading the conversation becomes 502 with the provider's code and text. */
function readError(error: unknown): unknown {
  if (error instanceof ProviderError) {
    return new HttpError(502, error.code, error.message, { ...error.details, ...(error.hint === undefined ? {} : { hint: error.hint }) });
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
