// Wiring of M39 autopiloting: the settings in the configuration folder, the run journal of each
// project, the host tickets of the service and the source of a direct instruction (the words the
// user wrote to the session, kept by the agent channel). The manual start records the grant of
// its run before the first work message; Settings off pauses the active runs.
import type { AgentChannel } from '#agent-channel';
import { WorkflowActionError, createHostTickets, createPreparation, createRunJournal, createRunKit, createRuns, createSettingsStore, registerAutopilotingRoutes } from '#autopilot';
import type { PrepareActions, ReviewFact, Runs, SettingsStore } from '#autopilot';
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
  /** Late links of the full-run preparation (T006): the autopilot actions and the review facts. */
  attach(links: PreparationLinks): void;
  /** One preparation step of the project's full run (a finished turn or review, the service start). */
  reconcile(projectId: string): Promise<void>;
  /** The preparation step of every project (after the reviews and runs are loaded). */
  reconcileAll(): Promise<void>;
}

export interface PreparationLinks {
  actions: PrepareActions;
  review(projectId: string, key: string): ReviewFact | null;
  reviewOn(projectId: string, key: string): boolean;
  orchestration?(client: string): Promise<{ available: boolean; reason?: string }>;
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
  decideReview: (projectId: string, key: string, on: boolean) => Promise<boolean | void>;
  log?: (line: string) => void;
}): AutopilotingWiring {
  const settings = createSettingsStore({ configDir: options.configDir, ...(options.platform ? { platform: options.platform } : {}) });
  const tickets = createHostTickets();
  const journal = createRunJournal(options.platform ? { platform: options.platform } : {});
  const runKit = createRunKit({ runner: options.kit, tickets });
  const projectPath = async (id: string): Promise<string | undefined> => (await options.projects.get(id))?.path;
  let links: PreparationLinks | null = null;
  const preparation = createPreparation({
    journal,
    kit: runKit,
    projectPath,
    review: (projectId, key) => links?.review(projectId, key) ?? null,
    reviewOn: (projectId, key) => links?.reviewOn(projectId, key) ?? false,
    orchestration: (client) => links?.orchestration?.(client) ?? Promise.resolve({ available: true }),
    actions: () => links?.actions ?? null,
    mutex: options.mutex,
    ...(options.log ? { log: options.log } : {}),
  });
  const runs = createRuns({
    settings,
    journal,
    kit: runKit,
    tickets,
    words: (key) => options.channel.userWords(key),
    projectPath,
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
    attach(next) {
      links = next;
    },
    reconcile: async (projectId) => void (await preparation.reconcile(projectId)),
    async reconcileAll() {
      for (const project of await options.projects.list()) await preparation.reconcile(project.id);
    },
  };
}
