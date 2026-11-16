// Wiring of M39 autopiloting: the settings in the configuration folder, the run journal of each
// project, the host tickets of the service and the source of a direct instruction (the words the
// user wrote to the session, kept by the agent channel). The manual start records the grant of
// its run before the first work message; Settings off pauses the active runs.
import type { AgentChannel } from '#agent-channel';
import { WorkflowActionError, createHostTickets, createRunJournal, createRunKit, createRuns, createSettingsStore, registerAutopilotingRoutes } from '#autopilot';
import type { Runs, SettingsStore } from '#autopilot';
import type { KeyedMutex } from '#data-store';
import { HttpError } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import type { KitRunner } from '#kit-runner';
import type { ProjectRegistry } from '#project-registry';

export interface AutopilotingWiring {
  settings: SettingsStore;
  runs: Runs;
  /** The `authority` option of the autopilot. */
  authority: { beforeStart(projectId: string, key: string): Promise<string | null>; beforeResume(projectId: string, key: string): Promise<string | null> };
  /** The `authorize` option of the plan question route (`wfk session plan --authorized`). */
  authorize(projectId: string, key: string, summary: string, quote: string): Promise<Record<string, unknown>>;
}

/** A refusal of the runs as the HTTP answer the panel and `wfk` read. */
async function http<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof WorkflowActionError) throw new HttpError(error.status, error.code, error.message, error.nextAction ? { nextAction: error.nextAction } : undefined);
    throw error;
  }
}

export function wireAutopiloting(options: {
  router: Router;
  state: StateRegistry;
  mutex: KeyedMutex;
  projects: ProjectRegistry;
  kit: KitRunner;
  channel: Pick<AgentChannel, 'userWords'>;
  configDir: string;
  platform?: NodeJS.Platform;
  /** Stores the review decision of a session (plan-review) and closes its open plan question. */
  decideReview: (projectId: string, key: string, on: boolean) => Promise<void>;
  log?: (line: string) => void;
}): AutopilotingWiring {
  const settings = createSettingsStore({ configDir: options.configDir, ...(options.platform ? { platform: options.platform } : {}) });
  const tickets = createHostTickets();
  const runs = createRuns({
    settings,
    journal: createRunJournal(options.platform ? { platform: options.platform } : {}),
    kit: createRunKit({ runner: options.kit, tickets }),
    tickets,
    words: (key) => options.channel.userWords(key),
    projectPath: async (id) => (await options.projects.get(id))?.path,
    listProjects: async () => (await options.projects.list()).map((project) => ({ id: project.id, path: project.path })),
    decideReview: options.decideReview,
    mutex: options.mutex,
    ...(options.log ? { log: options.log } : {}),
  });
  settings.onChange((change) => runs.settingsChanged(change));
  registerAutopilotingRoutes({ router: options.router, state: options.state, settings, runs });
  return {
    settings,
    runs,
    authority: {
      beforeStart: async (projectId, key) => (await runs.beginExecution(projectId, key))?.runId ?? null,
      beforeResume: async (projectId, key) => (await runs.resume(projectId, key))?.runId ?? null,
    },
    authorize: (projectId, key, summary, quote) => http(async () => ({ ...(await runs.authorizePreparation(projectId, key, summary, quote)) })),
  };
}
