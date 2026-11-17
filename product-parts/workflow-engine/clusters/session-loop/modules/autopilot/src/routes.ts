// POST /api/projects/:id/workflow/<action> and the "autopilot" section of /api/state.
import { HttpError } from '#http-server';
import type { KeyedMutex } from '#data-store';
import type { Router, StateRegistry } from '#http-server';
import type { KitChoiceOption } from '#plan-view';
import { WorkflowActionError } from './autopilot.ts';
import { decisionBy } from './decision-commands.ts';
import type { Autopilot } from './autopilot.ts';

export interface AutopilotRoutesOptions {
  router: Router;
  state: StateRegistry;
  autopilot: Autopilot;
  /** Serializes actions on a project (D10). */
  mutex?: KeyedMutex;
}

const OPTIONS: readonly KitChoiceOption[] = ['sequential', 'orchestrated', 'refine'];

function fields(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function registerAutopilotRoutes(options: AutopilotRoutesOptions): void {
  const { router, autopilot } = options;
  const run = <T>(projectId: string, action: () => Promise<T>): Promise<T> =>
    (options.mutex ? options.mutex.run(`project:${projectId}`, action) : action()).catch((error: unknown) => {
      if (error instanceof WorkflowActionError) {
        throw new HttpError(error.status, error.code, error.message, error.nextAction ? { nextAction: error.nextAction } : undefined);
      }
      throw error;
    });

  router.post('/api/projects/:id/workflow/choose', ({ params, body }) => {
    const input = fields(body);
    const option = input['option'];
    const session = text(input['session']);
    if (!session || !OPTIONS.includes(option as KitChoiceOption)) {
      throw new HttpError(400, 'bad-request', 'Нужны session, generation и option (sequential | orchestrated | refine)');
    }
    return run(params['id']!, () =>
      // M40: `decision` and `requestId` name the request the card showed and the press.
      autopilot.choose(params['id']!, { session, generation: Number(input['generation']), option: option as KitChoiceOption, by: decisionBy(input), ...(text(input['expectedDigest']) ? { expectedDigest: text(input['expectedDigest'])! } : {}) }),
    );
  });
  router.post('/api/projects/:id/workflow/start', ({ params, body }) => run(params['id']!, () => autopilot.start(params['id']!, text(fields(body)['session']))));
  router.post('/api/projects/:id/workflow/pause', ({ params }) => run(params['id']!, async () => (await autopilot.pause(params['id']!), { paused: true })));
  router.post('/api/projects/:id/workflow/resume', ({ params, body }) => run(params['id']!, () => autopilot.resume(params['id']!, text(fields(body)['session']))));
  // M37 2.2: the session of the request is the last resort to find the owner to tell.
  router.post('/api/projects/:id/workflow/accept', ({ params, body }) => {
    const input = fields(body);
    return run(params['id']!, async () => (await autopilot.accept(params['id']!, text(input['note']), text(input['session']), decisionBy(input)), { accepted: true }));
  });
  router.post('/api/projects/:id/workflow/close', ({ params, body }) => {
    const input = fields(body);
    return run(params['id']!, async () => (await autopilot.close(params['id']!, text(input['note']), text(input['session']), decisionBy(input)), { closed: true }));
  });
  router.post('/api/projects/:id/workflow/tidy', ({ params, body }) => run(params['id']!, () => autopilot.tidy(params['id']!, text(fields(body)['session']))));
  router.post('/api/projects/:id/workflow/fixes', ({ params, body }) => {
    const input = fields(body);
    return run(params['id']!, () => autopilot.fixes(params['id']!, text(input['text']) ?? '', text(input['session'])));
  });
  router.post('/api/projects/:id/workflow/confirm-delivery', ({ params, body }) => {
    const input = fields(body);
    return run(params['id']!, () => autopilot.confirmDelivery(params['id']!, text(input['text']) ?? '', text(input['session']), decisionBy(input)));
  });
  options.state.add('autopilot', () => autopilot.section());
}
