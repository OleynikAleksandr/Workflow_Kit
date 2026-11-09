// POST /api/projects/:id/sessions/:sid/title { name }, …/archive { archived } and …/forget (panel), POST /api/sessions/title
// { title, cwd, projectDir, client?, sessionId? } (`wfk session title`, loopback only) and the "titles" section.
// A TitleError keeps its details: session-ambiguous carries the candidates.
import { HttpError, classifyAddress } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { TitleError } from './titles.ts';
import type { SessionTitles } from './titles.ts';

async function guard<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof TitleError) throw new HttpError(error.status, error.code, error.message, error.details);
    throw error;
  }
}

/**
 * The session a `wfk session` request names: { client, id } when both are given and the client
 * is a registered provider (`isClient`; without it any id-shaped client), null when the request
 * names none (the service then looks for the running session), HttpError 400 otherwise.
 */
export function namedSession(input: Record<string, unknown>, isClient?: (client: string) => boolean): { client: string; id: string } | null {
  const client = input['client'];
  const id = input['sessionId'];
  const given = (value: unknown): boolean => value !== undefined && value !== null && value !== '';
  if (!given(client) && !given(id)) return null;
  if (typeof client !== 'string' || typeof id !== 'string' || !given(client) || !given(id)) {
    throw new HttpError(400, 'bad-session', 'Сессия задаётся парой: клиент и id сессии (--client <id> --session <id>)');
  }
  if (isClient ? !isClient(client) : !/^[a-z][a-z0-9-]{0,31}$/.test(client)) {
    throw new HttpError(400, 'bad-session', `Неизвестный клиент «${client}»: в Workflow Kit нет такого провайдера`);
  }
  return { client, id };
}

export interface TitleRoutesOptions {
  router: Router;
  state: StateRegistry;
  titles: SessionTitles;
  /** True for the id of a registered provider (default: any id-shaped client). */
  isClient?: (client: string) => boolean;
}

export function registerTitleRoutes(options: TitleRoutesOptions): void {
  const { router, titles } = options;
  router.post('/api/projects/:id/sessions/:sid/title', ({ params, body }) => {
    const name = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['name'] : undefined;
    if (typeof name !== 'string') throw new HttpError(400, 'bad-request', 'Ожидается { name }');
    return guard(() => titles.setManual(params['id']!, params['sid']!, name));
  });
  router.post('/api/projects/:id/sessions/:sid/archive', ({ params, body }) => {
    const archived = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['archived'] : undefined;
    if (typeof archived !== 'boolean') throw new HttpError(400, 'bad-request', 'Ожидается { archived: true | false }');
    return guard(() => titles.setArchived(params['id']!, params['sid']!, archived));
  });
  router.post('/api/projects/:id/sessions/:sid/forget', ({ params }) => guard(() => titles.setForgotten(params['id']!, params['sid']!)));
  router.post('/api/sessions/title', ({ body, req }) => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback') {
      throw new HttpError(403, 'loopback-only', 'Тема сессии принимается только с этого компьютера');
    }
    const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const folders = [input['projectDir'], input['cwd']].filter((f): f is string => typeof f === 'string' && f !== '');
    if (folders.length === 0) throw new HttpError(400, 'bad-request', 'Нет папки сессии');
    const session = namedSession(input, options.isClient);
    return guard(async () => {
      let last: unknown;
      for (const folder of folders) {
        try {
          return await titles.setTopic(folder, String(input['title'] ?? ''), session);
        } catch (error) {
          last = error;
          if (!(error instanceof TitleError && error.code === 'project-not-found')) throw error;
        }
      }
      throw last;
    });
  });
  options.state.add('titles', () => titles.section());
}
