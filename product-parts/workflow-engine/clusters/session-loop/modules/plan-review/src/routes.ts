// POST /api/projects/:id/sessions/:sid/review { on } and the "review" section of /api/state.
import { HttpError } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { ReviewToggleError } from './toggles.ts';
import type { ReviewToggles } from './toggles.ts';

export function registerReviewRoutes(options: { router: Router; state: StateRegistry; toggles: ReviewToggles }): void {
  options.router.post('/api/projects/:id/sessions/:sid/review', async ({ params, body }) => {
    const on = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['on'] : undefined;
    if (typeof on !== 'boolean') throw new HttpError(400, 'bad-request', 'Ожидается { on: true | false }');
    try {
      return await options.toggles.set(params['id']!, params['sid']!, on);
    } catch (error) {
      if (error instanceof ReviewToggleError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  });
  options.state.add('review', () => options.toggles.section());
}
