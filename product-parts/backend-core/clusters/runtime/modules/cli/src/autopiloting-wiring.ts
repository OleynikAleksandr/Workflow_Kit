// Wiring of M39 autopiloting: the settings in the configuration folder, the run journal of each
// project, the host tickets of the service and the source of a direct instruction (the words the
// user wrote to the session, kept by the agent channel). The manual start records the grant of
// its run before the first work message; Settings off pauses the active runs.
import type { AgentChannel } from '#agent-channel';
import { createDecisionJournal, createDecisions, createHostTickets, runMayDecide, createPreparation, createProposalGate, createRunCompletion, createRunControl, createRunJournal, createRunKit, createRunTurns, createRunWaits, createRunWords, createRuns, createSettingsStore, registerAutopilotingRoutes, registerRunControlRoutes, registerSessionRunRoutes, runHttp } from '#autopilot';
import type { Decisions, RunCompleter, ControlActions, PrepareActions, ReviewFact, RunControl, RunTurns, RunWaits, RunWords, Runs, SettingsStore } from '#autopilot';
import { createGitHubCi, createPublisher, runGit } from '#git-publish';
import type { GitHubCi, GitRunner, Publisher } from '#git-publish';
import type { KeyedMutex } from '#data-store';
import type { Router, StateRegistry } from '#http-server';
import type { KitRunner } from '#kit-runner';
import type { ProjectRegistry } from '#project-registry';

export interface AutopilotingWiring {
  settings: SettingsStore;
  runs: Runs;
  /**
   * M40: the user's decisions of a `decisions: host` project — host operations with the tickets
   * of the service, the decision journal of the project and the user's message of the turn.
   */
  decisions: Decisions;
  /** The `authority` option of the autopilot. */
  authority: {
    beforeStart(projectId: string, key: string): Promise<string | null>;
    beforeResume(projectId: string, key: string): Promise<string | null>;
    onPause(projectId: string, reason: 'user-pause' | 'interrupted'): Promise<void>;
  };
  /**
   * The `runs` option of the autopilot: the started run decides its owner's turns (T007); M40 —
   * `proposal` returns a proposal without the automation block to its author.
   */
  turns: RunTurns & { proposal(projectId: string, key: string): Promise<{ text: string } | null> };
  control: RunControl;
  /** M40: the user's «стоп» and «пауза» for the owner of a live run, read when the service gets the message. */
  words: RunWords;
  waits: RunWaits;
  /** One CI check of the waiting runs and, at the service start, the recovery of started runs. */
  /** T008: accept, close and publish of an authorized run (the service, no turn of the agent). */
  completion: RunCompleter;
  tick(): Promise<void>;
  recoverAll(): Promise<void>;
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
  actions: PrepareActions & ControlActions;
  /** The calling session of an agent's command (`wfk session progress|run`), like `wfk session plan`. */
  locate(input: Record<string, unknown>): Promise<{ projectId: string; key: string }>;
  activity(key: string): { state: string } | undefined;
  unreachable?(projectId: string, key: string): Promise<string | null>;
  send(projectId: string, key: string, text: string): void;
  review(projectId: string, key: string): ReviewFact | null;
  reviewOn(projectId: string, key: string): boolean;
  orchestration?(client: string): Promise<{ available: boolean; reason?: string }>;
}

export function wireAutopiloting(options: {
  router: Router;
  state: StateRegistry;
  mutex: KeyedMutex;
  projects: ProjectRegistry;
  kit: KitRunner;
  channel: Pick<AgentChannel, 'enqueue' | 'userSource' | 'userWords'>;
  configDir: string;
  platform?: NodeJS.Platform;
  /** Stores the review decision of a session (plan-review) and closes its open plan question. */
  decideReview: (projectId: string, key: string, on: boolean) => Promise<boolean | void>;
  /** The independent CI reader (default: `gh` of the machine). */
  ci?: GitHubCi;
  /** T008: the publisher the publish button uses too, and git of the service. */
  publisher?: Publisher;
  git?: GitRunner;
  log?: (line: string) => void;
}): AutopilotingWiring {
  const settings = createSettingsStore({ configDir: options.configDir, ...(options.platform ? { platform: options.platform } : {}) });
  const tickets = createHostTickets();
  const journal = createRunJournal(options.platform ? { platform: options.platform } : {});
  const runKit = createRunKit({ runner: options.kit, tickets });
  const projectPath = async (id: string): Promise<string | undefined> => (await options.projects.get(id))?.path;
  const decisions = createDecisions({
    runner: options.kit,
    tickets,
    journal: createDecisionJournal(options.platform ? { platform: options.platform } : {}),
    userSource: (key) => options.channel.userSource(key),
    // A run that was paused, stopped or revoked decides nothing more (asked before every ticket).
    runLive: runMayDecide(journal),
    ...(options.log ? { log: options.log } : {}),
  });
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
  const listProjects = async () => (await options.projects.list()).map((project) => ({ id: project.id, path: project.path }));
  const send = (projectId: string, key: string, text: string): void => links?.send(projectId, key, text);
  const gate = createProposalGate({ journal, kit: runKit, projectPath, ...(options.log ? { log: options.log } : {}) });
  const turns = { ...createRunTurns({ journal, projectPath, ...(options.log ? { log: options.log } : {}) }), proposal: gate.check };
  const control = createRunControl({
    journal, kit: runKit, projectPath, listProjects, send, mutex: options.mutex,
    actions: () => links?.actions ?? null,
    activity: (key) => links?.activity(key),
    unreachable: (projectId, key) => links?.unreachable?.(projectId, key) ?? Promise.resolve(null),
    ...(options.log ? { log: options.log } : {}),
  });
  // The context goes into the queue without a wake: it is delivered with the user's own message.
  const words = createRunWords({ control, tell: (projectId, key, text) => void options.channel.enqueue(key, text, 'panel', projectId), ...(options.log ? { log: options.log } : {}) });
  const waits = createRunWaits({ journal, kit: runKit, ci: options.ci ?? createGitHubCi(), projectPath, listProjects, send, mutex: options.mutex, ...(options.log ? { log: options.log } : {}) });
  const git = options.git ?? runGit;
  const completion = createRunCompletion({ journal, kit: runKit, publisher: options.publisher ?? createPublisher({ git }), git, projectPath, listProjects, mutex: options.mutex, ...(options.log ? { log: options.log } : {}) });
  registerRunControlRoutes({ router: options.router, control });
  registerSessionRunRoutes({ router: options.router, waits, control, locate: (input) => (links ? links.locate(input) : Promise.reject(new Error('service is starting'))) });
  return {
    settings,
    runs,
    decisions,
    authority: {
      beforeStart: async (projectId, key) => (await runs.beginExecution(projectId, key))?.runId ?? null,
      beforeResume: async (projectId, key) => (await runs.resume(projectId, key))?.runId ?? null,
      onPause: (projectId, reason) => control.onPause(projectId, reason),
    },
    turns,
    control,
    words,
    waits,
    completion,
    tick: async () => {
      await waits.pollAll();
      await completion.advanceAll();
    },
    recoverAll: async () => {
      await control.recoverAll();
      await completion.advanceAll();
    },
    authorize: (projectId, key, summary, quote) => runHttp(async () => ({ ...(await runs.authorizePreparation(projectId, key, summary, quote)) })),
    attach(next) {
      links = next;
    },
    reconcile: async (projectId) => {
      await preparation.reconcile(projectId);
      await completion.advance(projectId);
    },
    async reconcileAll() {
      for (const project of await options.projects.list()) await preparation.reconcile(project.id);
    },
  };
}
