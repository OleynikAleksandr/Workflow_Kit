// POST /api/projects/:id/sessions/:sid/title { name } and …/archive { archived } (panel), POST /api/sessions/title
// { title, folder } (`wfk session title`, loopback only) and the "titles" section.
import { HttpError, classifyAddress } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { TitleError } from './titles.ts';
import type { SessionTitles } from './titles.ts';

async function guard<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof TitleError) throw new HttpError(error.status, error.code, error.message);
    throw error;
  }
}

export function registerTitleRoutes(options: { router: Router; state: StateRegistry; titles: SessionTitles }): void {
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
  router.post('/api/sessions/title', ({ body, req }) => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback') {
      throw new HttpError(403, 'loopback-only', 'Тема сессии принимается только с этого компьютера');
    }
    const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const folders = [input['projectDir'], input['cwd']].filter((f): f is string => typeof f === 'string' && f !== '');
    if (folders.length === 0) throw new HttpError(400, 'bad-request', 'Нет папки сессии');
    return guard(async () => {
      let last: unknown;
      for (const folder of folders) {
        try {
          return await titles.setTopic(folder, String(input['title'] ?? ''));
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
