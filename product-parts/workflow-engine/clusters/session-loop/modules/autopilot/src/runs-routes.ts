// GET/POST /api/settings/autopiloting and the "autopiloting" section of /api/state (spec M39
// runtime section 1). The section holds the settings and a brief of each project's last run,
// never the quotes of the user's words. M48: GET/POST of a session's own autopiloting and the
// `sessions` part of the section (the known session records by project).
import { HttpError, classifyAddress } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import type { Runs } from './runs.ts';
import { WorkflowActionError } from './autopilot-types.ts';
import type { RunControl } from './run-control.ts';
import type { RunWaits } from './run-waits.ts';
import { SettingsError } from './settings.ts';
import type { SettingsStore } from './settings.ts';
import type { SessionSettingsStore } from './session-settings.ts';

export function registerAutopilotingRoutes(options: { router: Router; state: StateRegistry; settings: SettingsStore; runs: Runs; sessions?: SessionSettingsStore }): void {
  const { router, settings, runs } = options;
  const settingsHttp = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (error instanceof SettingsError) throw new HttpError(error.status, error.code, error.message, error.current ? { current: error.current } : undefined);
      throw error;
    }
  };
  router.get('/api/settings/autopiloting', async () => {
    const view = await settings.read();
    return { ...view.settings, error: view.error };
  });
  router.post('/api/settings/autopiloting', ({ body }) => settingsHttp(() => settings.write(body)));
  // M48 T001: the autopiloting of one session; the first read takes the defaults of Settings.
  const sessions = options.sessions;
  if (sessions) {
    router.get('/api/projects/:id/sessions/:sid/autopiloting', ({ params }) => settingsHttp(async () => ({ settings: await sessions.ensure(params['id']!, params['sid']!) })));
    router.post('/api/projects/:id/sessions/:sid/autopiloting', ({ params, body }) => settingsHttp(async () => ({ settings: await sessions.write(params['id']!, params['sid']!, body) })));
  }
  // M44: «Повторить» of a run without the Kit grant { runId, expectedRevision }.
  router.post('/api/projects/:id/autopiloting/retry', ({ params, body }) => runHttp(() => runs.retryGrant(params['id']!, body)));
  // T009: the effective policy of a start before the user presses it (legacy, manual acceptance, …).
  // M48: `?session=<key>` — the policy of that session's mode (the plan's owner), else of Settings.
  router.get('/api/projects/:id/autopiloting/policy', ({ params, query }) => runHttp(() => runs.policy(params['id']!, query.get('session') ?? undefined)));
  options.state.add('autopiloting', async () => {
    const view = await settings.read();
    return { settings: view.settings, error: view.error, ...(await runs.section()), sessions: sessions?.section() ?? {} };
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
