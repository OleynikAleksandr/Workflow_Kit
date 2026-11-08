// The "reviews" section of /api/state (summaries) and GET /api/projects/:id/reviews/:key (the
// whole review of a main or reviewer session), POST …/reviews/:key/cancel («Прервать ревью»).
import { HttpError } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import type { CrossReview } from './review.ts';

export function registerCrossReviewRoutes(options: { router: Router; state: StateRegistry; review: CrossReview }): void {
  options.router.get('/api/projects/:id/reviews/:key', async ({ params }) => {
    const review = options.review.get(params['id']!, params['key']!);
    if (!review) throw new HttpError(404, 'review-not-found', 'Ревью этой сессии нет');
    return review;
  });
  options.router.post('/api/projects/:id/reviews/:key/cancel', async ({ params }) => {
    const review = await options.review.cancel(params['id']!, params['key']!, 'остановлено пользователем в панели');
    if (!review) throw new HttpError(409, 'review-not-active', 'Ревью этой сессии не идёт');
    return { status: review.status };
  });
  options.state.add('reviews', () => options.review.section());
}
