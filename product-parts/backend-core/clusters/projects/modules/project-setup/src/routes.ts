// POST /api/setup/preview, POST /api/setup/apply, POST /api/setup/:op/cancel and the "setup"
// section of /api/state.
import { HttpError, jsonResult } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { ProjectError } from '#project-registry';
import { SetupError } from './preview.ts';
import type { PreviewInput, SetupProvider } from './preview.ts';
import type { ProjectSetup } from './setup.ts';

async function guarded<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SetupError) throw new HttpError(error.status, error.code, error.message, error.hint ? { hint: error.hint } : undefined);
    if (error instanceof ProjectError) throw new HttpError(400, error.code, error.message);
    throw error;
  }
}

function fields(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function registerSetupRoutes(options: { router: Router; state: StateRegistry; setup: ProjectSetup }): void {
  const { router, setup } = options;
  router.post('/api/setup/preview', ({ body }) => {
    const input = fields(body);
    let request: PreviewInput;
    if (input['mode'] === 'create' && typeof input['name'] === 'string') request = { mode: 'create', name: input['name'] };
    else if (input['mode'] === 'open' && typeof input['path'] === 'string') request = { mode: 'open', path: input['path'] };
    else throw new HttpError(400, 'bad-request', 'Ожидается { mode: "create", name } или { mode: "open", path }');
    return guarded(() => setup.preview(request));
  });
  router.post('/api/setup/apply', ({ body }) => {
    const input = fields(body);
    const choices = fields(input['choices']);
    return guarded(async () =>
      jsonResult(
        202,
        await setup.apply({
          token: String(input['token'] ?? ''),
          provider: input['provider'] as SetupProvider,
          choices: Object.fromEntries(Object.entries(choices).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
        }),
      ),
    );
  });
  router.post('/api/setup/:op/cancel', ({ params }) => guarded(async () => setup.cancel(params['op']!)));
  options.state.add('setup', () => setup.section());
}
