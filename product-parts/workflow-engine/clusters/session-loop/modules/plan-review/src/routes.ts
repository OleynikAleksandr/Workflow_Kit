// POST /api/projects/:id/sessions/:sid/review { on }, …/plan-decision { choice } (spec M4 12.1)
// and the "review" section of /api/state.
import { HttpError, classifyAddress } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { ReviewToggleError } from './toggles.ts';
import type { ReviewToggles } from './toggles.ts';

/**
 * POST /api/sessions/plan { summary, cwd, projectDir, client?, sessionId? } (`wfk session plan`,
 * loopback only): opens the plan question of the calling session (spec M4 section 12.1). The
 * session is the one the request names (a client of the provider registry and its id), else the
 * only session of the project with a running turn (spec M8 section 5).
 */
export function registerPlanQuestionRoute(options: {
  router: Router;
  toggles: ReviewToggles;
  /** Project of a folder (the session's cwd or $CLAUDE_PROJECT_DIR). */
  resolveProject: (folder: string) => Promise<{ id: string } | null | undefined>;
  /**
   * Key of the session of a request in a project: the named one, or the running one; throws an
   * HttpError (400 bad-session, 409 session-ambiguous with the candidates) when there is none.
   */
  sessionKey: (input: Record<string, unknown>, projectId: string) => Promise<string>;
}): void {
  options.router.post('/api/sessions/plan', async ({ body, req }) => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback') throw new HttpError(403, 'loopback-only', 'Вопрос о плане принимается только с этого компьютера');
    const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const summary = typeof input['summary'] === 'string' ? input['summary'].trim() : '';
    if (summary === '') throw new HttpError(400, 'bad-request', 'Нужна одна строка: что собираемся сделать');
    for (const folder of [input['projectDir'], input['cwd']]) {
      if (typeof folder !== 'string' || folder === '') continue;
      const project = await options.resolveProject(folder);
      if (!project) continue;
      const key = await options.sessionKey(input, project.id);
      try {
        const question = await options.toggles.ask(project.id, key, 'agent', summary);
        return { projectId: project.id, key, question };
      } catch (error) {
        if (error instanceof ReviewToggleError) throw new HttpError(error.status, error.code, error.message);
        throw error;
      }
    }
    throw new HttpError(404, 'project-not-found', 'Папка не относится к проекту Workflow Kit');
  });
}

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
  options.router.post('/api/projects/:id/sessions/:sid/plan-decision', async ({ params, body }) => {
    const choice = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['choice'] : undefined;
    if (choice !== 'review' && choice !== 'plan' && choice !== 'talk') throw new HttpError(400, 'bad-request', 'Ожидается { choice: review | plan | talk }');
    try {
      return await options.toggles.answer(params['id']!, params['sid']!, choice);
    } catch (error) {
      if (error instanceof ReviewToggleError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  });
  options.state.add('review', () => options.toggles.section());
}
