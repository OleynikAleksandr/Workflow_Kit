// POST /api/projects/:id/workflow/<action> and the "autopilot" section of /api/state.
import { HttpError } from '#http-server';
import type { KeyedMutex } from '#data-store';
import type { Router, StateRegistry } from '#http-server';
import type { KitChoiceOption } from '#plan-view';
import { WorkflowActionError } from './autopilot.ts';
import { decisionBy } from './decision-commands.ts';
import type { Autopilot } from './autopilot.ts';
import { pressSignature } from './kit-waits.ts';
import type { KitWaits } from './kit-waits.ts';

export interface AutopilotRoutesOptions {
  router: Router;
  state: StateRegistry;
  autopilot: Autopilot;
  /** Serializes actions on a project (D10). */
  mutex?: KeyedMutex;
  /** M48 T004: a press Kit refuses with LOCKED waits and is applied once Kit is free. */
  waits?: KitWaits;
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
  const once = <T>(projectId: string, action: () => Promise<T>): Promise<T> =>
    (options.mutex ? options.mutex.run(`project:${projectId}`, action) : action()).catch((error: unknown) => {
      if (error instanceof WorkflowActionError) {
        throw new HttpError(error.status, error.code, error.message, error.nextAction ? { nextAction: error.nextAction } : undefined);
      }
      throw error;
    });
  const run = <T>(projectId: string, action: () => Promise<T>): Promise<T> => once(projectId, action);
  // M48 T004: the user's decisions on the plan wait out a busy Kit (LOCKED) instead of failing.
  const press = (name: string, projectId: string, body: unknown, action: () => Promise<unknown>): Promise<unknown> =>
    options.waits ? options.waits.run(projectId, name, pressSignature(name, body), () => once(projectId, action)) : once(projectId, action);

  router.post('/api/projects/:id/workflow/choose', ({ params, body }) => {
    const input = fields(body);
    const option = input['option'];
    const session = text(input['session']);
    if (!session || !OPTIONS.includes(option as KitChoiceOption)) {
      throw new HttpError(400, 'bad-request', 'Нужны session, generation и option (sequential | orchestrated | refine)');
    }
    return press('choose', params['id']!, input, () =>
      // M40: `decision` and `requestId` name the request the card showed and the press.
      autopilot.choose(params['id']!, { session, generation: Number(input['generation']), option: option as KitChoiceOption, by: decisionBy(input), ...(text(input['expectedDigest']) ? { expectedDigest: text(input['expectedDigest'])! } : {}) }),
    );
  });
  router.post('/api/projects/:id/workflow/start', ({ params, body }) => press('start', params['id']!, body, () => autopilot.start(params['id']!, text(fields(body)['session']))));
  router.post('/api/projects/:id/workflow/pause', ({ params }) => run(params['id']!, async () => (await autopilot.pause(params['id']!), { paused: true })));
  router.post('/api/projects/:id/workflow/resume', ({ params, body }) => run(params['id']!, () => autopilot.resume(params['id']!, text(fields(body)['session']))));
  // M37 2.2: the session of the request is the last resort to find the owner to tell.
  router.post('/api/projects/:id/workflow/accept', ({ params, body }) => {
    const input = fields(body);
    return press('accept', params['id']!, input, async () => (await autopilot.accept(params['id']!, text(input['note']), text(input['session']), decisionBy(input)), { accepted: true }));
  });
  router.post('/api/projects/:id/workflow/close', ({ params, body }) => {
    const input = fields(body);
    return press('close', params['id']!, input, async () => (await autopilot.close(params['id']!, text(input['note']), text(input['session']), decisionBy(input)), { closed: true }));
  });
  router.post('/api/projects/:id/workflow/tidy', ({ params, body }) => run(params['id']!, () => autopilot.tidy(params['id']!, text(fields(body)['session']))));
  router.post('/api/projects/:id/workflow/fixes', ({ params, body }) => {
    const input = fields(body);
    return run(params['id']!, () => autopilot.fixes(params['id']!, text(input['text']) ?? '', text(input['session'])));
  });
  router.post('/api/projects/:id/workflow/confirm-delivery', ({ params, body }) => {
    const input = fields(body);
    return press('confirm-delivery', params['id']!, input, () => autopilot.confirmDelivery(params['id']!, text(input['text']) ?? '', text(input['session']), decisionBy(input)));
  });
  options.state.add('autopilot', () => autopilot.section());
}
