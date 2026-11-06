import { HttpError, jsonResult } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { PROJECT_ERROR_STATUS, ProjectError } from './errors.ts';
import { listFolders } from './folders.ts';
import type { HomeScope } from './home-paths.ts';
import type { ProjectRegistry } from './registry.ts';

/** Runs a route action and turns registry errors into HTTP errors with the same code. */
async function guarded<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ProjectError) {
      throw new HttpError(PROJECT_ERROR_STATUS[error.code], error.code, error.message, error.details);
    }
    throw error;
  }
}

function field(body: unknown, name: string): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'invalid-body', 'Ожидается JSON-объект');
  }
  return (body as Record<string, unknown>)[name];
}

/**
 * Registers the project routes and the "projects" state section:
 * GET /api/folders?path=&hidden=1, GET /api/projects, POST /api/projects {name},
 * POST /api/projects/open {path}, POST /api/projects/:id/archive|restore,
 * POST /api/settings/projects-root {path}, DELETE /api/projects/:id (list only, the folder stays).
 */
export function registerProjectRoutes(router: Router, state: StateRegistry, registry: ProjectRegistry, scope: HomeScope): void {
  router.get('/api/folders', (ctx) =>
    guarded(() => listFolders(ctx.query.get('path') ?? undefined, scope, { showHidden: ctx.query.get('hidden') === '1' })),
  );
  router.get('/api/projects', () => guarded(async () => ({ projects: await registry.list() })));
  router.post('/api/projects', (ctx) =>
    guarded(async () => jsonResult(201, { project: await registry.create(field(ctx.body, 'name')) })),
  );
  router.post('/api/projects/open', (ctx) =>
    guarded(async () => {
      const result = await registry.open(field(ctx.body, 'path'));
      return jsonResult(result.existing ? 200 : 201, result);
    }),
  );
  router.post('/api/projects/:id/archive', (ctx) => guarded(async () => ({ project: await registry.archive(ctx.params['id'] ?? '') })));
  router.post('/api/projects/:id/restore', (ctx) => guarded(async () => ({ project: await registry.restore(ctx.params['id'] ?? '') })));
  router.post('/api/settings/projects-root', (ctx) => guarded(async () => ({ root: await registry.setRoot(field(ctx.body, 'path')) })));
  router.delete('/api/projects/:id', (ctx) =>
    guarded(async () => ({ removed: await registry.remove(ctx.params['id'] ?? ''), folderKept: true })),
  );
  state.add('projects', () => registry.section());
}
