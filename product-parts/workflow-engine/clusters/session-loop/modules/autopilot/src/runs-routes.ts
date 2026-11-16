// GET/POST /api/settings/autopiloting and the "autopiloting" section of /api/state (spec M39
// runtime section 1). The section holds the settings and a brief of each project's last run,
// never the quotes of the user's words.
import { HttpError, classifyAddress } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import type { Runs } from './runs.ts';
import { WorkflowActionError } from './autopilot-types.ts';
import type { RunControl } from './run-control.ts';
import type { RunWaits } from './run-waits.ts';
import { SettingsError } from './settings.ts';
import type { SettingsStore } from './settings.ts';

export function registerAutopilotingRoutes(options: { router: Router; state: StateRegistry; settings: SettingsStore; runs: Runs }): void {
  const { router, settings, runs } = options;
  router.get('/api/settings/autopiloting', async () => {
    const view = await settings.read();
    return { ...view.settings, error: view.error };
  });
  router.post('/api/settings/autopiloting', async ({ body }) => {
    try {
      return await settings.write(body);
    } catch (error) {
      if (error instanceof SettingsError) throw new HttpError(error.status, error.code, error.message, error.current ? { current: error.current } : undefined);
      throw error;
    }
  });
  options.state.add('autopiloting', async () => {
    const view = await settings.read();
    return { settings: view.settings, error: view.error, ...(await runs.section()) };
  });
}

/** A refusal of the runs as the HTTP answer the panel and `wfk` read. */
export async function runHttp<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof WorkflowActionError) {
      throw new HttpError(error.status, error.code, error.message, { ...(error.nextAction ? { nextAction: error.nextAction } : {}), ...(error.details ?? {}) });
    }
    throw error;
  }
}

/**
 * POST /api/projects/:id/autopiloting/pause|resume|stop { runId, expectedRevision } (spec M39
 * runtime 1, T007): only that run of that project; a changed run — 409 run-stale with `current`.
 */
export function registerRunControlRoutes(options: { router: Router; control: RunControl }): void {
  for (const action of ['pause', 'resume', 'stop'] as const) {
    options.router.post(`/api/projects/:id/autopiloting/${action}`, ({ params, body }) => runHttp<unknown>(() => options.control[action](params['id']!, body)));
  }
}

/**
 * The agent's commands of a run (loopback only): POST /api/sessions/progress { …, runId, actionId,
 * stage, targetSha, ciPolicyDigest, waitReason } and POST /api/sessions/run { …, action: pause |
 * stop }. `locate` finds the project and the calling session like `wfk session plan`.
 */
export function registerSessionRunRoutes(options: {
  router: Router;
  locate(input: Record<string, unknown>): Promise<{ projectId: string; key: string }>;
  waits: RunWaits;
  control: RunControl;
}): void {
  const loopback = (req: { socket: { remoteAddress?: string } }): void => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback') throw new HttpError(403, 'loopback-only', 'Команда принимается только с этого компьютера');
  };
  const fields = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});
  options.router.post('/api/sessions/progress', async ({ body, req }) => {
    loopback(req);
    const input = fields(body);
    const { projectId, key } = await options.locate(input);
    return runHttp(() => options.waits.progress(projectId, key, input['progress'] ?? input));
  });
  options.router.post('/api/sessions/run', async ({ body, req }) => {
    loopback(req);
    const input = fields(body);
    if (input['action'] !== 'pause' && input['action'] !== 'stop') throw new HttpError(400, 'bad-request', 'Ожидается action: pause | stop');
    const { projectId, key } = await options.locate(input);
    const run = await runHttp(() => options.control.byOwner(projectId, key, input['action'] as 'pause' | 'stop'));
    return { runId: run.runId, phase: run.phase };
  });
}
