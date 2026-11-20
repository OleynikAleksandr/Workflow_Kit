// Wiring of M39 autopiloting: the settings in the configuration folder, the run journal of each
// project, the host tickets of the service and the source of a direct instruction (the words the
// user wrote to the session, kept by the agent channel). The manual start records the grant of
// its run before the first work message. M48: each session keeps its own mode and review, taken
// from Settings when it begins; the session card's off pauses that session's run.
import type { AgentChannel } from '#agent-channel';
import type { AutopilotAgentState } from './autopilot-line.ts';
import { createAgentNotices, createDecisionJournal, createDecisions, createHostTickets, runMayDecide, createPreparation, createProposalGate, createRunCompletion, createRunControl, createRunJournal, createRunKit, createRunTurns, createRunWaits, createRunWords, createRuns, createSessionSettings, createSessionSwitch, createSettingsStore, registerAutopilotingRoutes, registerRunControlRoutes, registerSessionRunRoutes, runHttp, validSessionKey } from '#autopilot';
import type { Decisions, RunCompleter, ControlActions, PrepareActions, ReviewFact, RunControl, RunTurns, RunWaits, RunWords, Runs, SessionSettingsStore, SessionSwitch, SettingsStore } from '#autopilot';
import { createGitHubCi, createPublisher, runGit } from '#git-publish';
import type { GitHubCi, GitRunner, Publisher } from '#git-publish';
import type { KeyedMutex } from '#data-store';
import { SERVICE_MESSAGE_MARK } from '#project-setup';
import type { Router, StateRegistry } from '#http-server';
import type { KitRunner } from '#kit-runner';
import type { ProjectRegistry } from '#project-registry';

export interface AutopilotingWiring {
  settings: SettingsStore;
  /** M48: the mode and review of each session (Settings are the defaults a session takes when it begins). */
  sessions: SessionSettingsStore;
  /** M48 T002: the switch of a session card at any stage of its task (stage, effect). */
  switcher: SessionSwitch;
  /**
   * M48 T002: the user answered the agent's plan question. In the full mode of the session the run
   * is registered and the agent gets the full-run instruction (queued before the answer message);
   * otherwise a specification and a plan mark the session «writing the plan».
   */
  answered(projectId: string, key: string, choice: 'review' | 'plan' | 'talk', summary: string): Promise<void>;
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
  /** The `prepare` option of the plan question route (`wfk session plan`); null opens the question. */
  prepare(projectId: string, key: string, summary: string): Promise<Record<string, unknown> | null>;
  /** Late links of the full-run preparation (T006): the autopilot actions and the review facts. */
  attach(links: PreparationLinks): void;
  /** One preparation step of the project's full run (a finished turn or review, the service start). */
  reconcile(projectId: string): Promise<void>;
  /** The preparation step of every project (after the reviews and runs are loaded). */
  reconcileAll(): Promise<void>;
  /**
   * M44: the mode and review and the project's active run with its live Kit grant, for the
   * SessionStart line; M48 — the session's own values (taken from Settings when it begins).
   */
  agentState(projectId: string | null, key?: string | null): Promise<AutopilotAgentState>;
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
  /** M48 T002: the open plan question of a session (plan-review). */
  question?(projectId: string, key: string): { kind: 'agent' | 'proposal' } | null;
  /** M48 T002: wakes a session (a held Stop goes on; the cross review starts at its Stop). */
  wake?(key: string): void;
}

export function wireAutopiloting(options: {
  router: Router;
  state: StateRegistry;
  mutex: KeyedMutex;
  projects: ProjectRegistry;
  kit: KitRunner;
  channel: Pick<AgentChannel, 'enqueue' | 'userSource' | 'list'>;
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
  const sessions = createSessionSettings({ settings, journal, projectPath, ...(options.platform ? { platform: options.platform } : {}), ...(options.log ? { log: options.log } : {}) });
  // The panel's first message of a project is a service greeting, not an instruction of the user.
  const userSource = (key: string) => {
    const source = options.channel.userSource(key);
    return source && !source.text.includes(SERVICE_MESSAGE_MARK) ? source : null;
  };
  const decisions = createDecisions({
    runner: options.kit,
    tickets,
    journal: createDecisionJournal(options.platform ? { platform: options.platform } : {}),
    userSource: (key) => options.channel.userSource(key),
    // A run that was paused, stopped or revoked decides nothing more (asked before every ticket).
    runLive: runMayDecide(journal),
    // The message that registered a full run is that run's source alone (M40 T007).
    sourceTaken: async (root, messageId) => (await journal.list(root)).some((run) => run.request.source === 'user-command' && run.request.turnId === messageId),
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
    // M44: a started plan without the grant of the run gets the grant written again.
    authorize: (projectId, key) => runs.beginExecution(projectId, key),
    mutex: options.mutex,
    ...(options.log ? { log: options.log } : {}),
  });
  const runs = createRuns({
    settings,
    journal,
    kit: runKit,
    tickets,
    userSource,
    projectPath,
    listProjects: async () => (await options.projects.list()).map((project) => ({ id: project.id, path: project.path })),
    decideReview: options.decideReview,
    sessions,
    mutex: options.mutex,
    ...(options.log ? { log: options.log } : {}),
  });
  // M48: Settings pause nothing; the session card's off pauses the run of that session.
  sessions.onChange((change) => runs.sessionChanged(change));
  // M44 3.3: run changes and (M48) the session card's changes reach the agent with its next hook (queued, no wake).
  createAgentNotices({
    journal,
    sessions,
    enqueue: (projectId, key, text) => void options.channel.enqueue(key, text, 'panel', projectId),
    ...(options.log ? { log: options.log } : {}),
  });
  const listProjects = async () => (await options.projects.list()).map((project) => ({ id: project.id, path: project.path }));
  const send = (projectId: string, key: string, text: string): void => links?.send(projectId, key, text);
  const gate = createProposalGate({ journal, kit: runKit, projectPath, ...(options.log ? { log: options.log } : {}) });
  // M48 T002: the switch on a session card acts at the stage of its task (after the pause of off above).
  const switcher = createSessionSwitch({
    journal, kit: runKit, runs, sessions, gate, projectPath, send, mutex: options.mutex,
    question: (projectId, key) => links?.question?.(projectId, key) ?? null,
    decideReview: options.decideReview,
    wake: (key) => links?.wake?.(key),
    reconcile: async (projectId) => void (await preparation.reconcile(projectId)),
    ...(options.log ? { log: options.log } : {}),
  });
  sessions.onChange((change) => switcher.changed(change));
  registerAutopilotingRoutes({ router: options.router, state: options.state, settings, runs, sessions, switcher });
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
    sessions,
    switcher,
    answered: (projectId, key, choice, summary) => switcher.answered(projectId, key, choice, summary),
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
      // M44: a refused start or grant is tried again without waiting for the next turn.
      for (const project of await options.projects.list()) {
        await preparation.reconcile(project.id);
        await switcher.settle(project.id).catch(() => undefined);
      }
      await waits.pollAll();
      await completion.advanceAll();
    },
    recoverAll: async () => {
      await sessions.load(await listProjects()).catch(() => undefined);
      await control.recoverAll();
      await completion.advanceAll();
    },
    prepare: (projectId, key, summary) =>
      runHttp(async () => {
        const prepared = await runs.authorizePreparation(projectId, key, summary);
        return prepared ? { ...prepared } : null;
      }),
    attach(next) {
      links = next;
    },
    reconcile: async (projectId) => {
      await preparation.reconcile(projectId);
      await switcher.settle(projectId).catch(() => undefined);
      await completion.advance(projectId);
    },
    async reconcileAll() {
      for (const project of await options.projects.list()) await preparation.reconcile(project.id);
    },
    async agentState(projectId, key) {
      // M48: a session begins here (its first SessionStart) with the defaults of Settings; a resume keeps its record.
      const own = projectId && key && validSessionKey(key) ? await sessions.ensure(projectId, key).catch(() => null) : null;
      const current = own ?? (await settings.read()).settings;
      const folder = projectId ? await projectPath(projectId) : undefined;
      const run = folder ? await journal.active(folder).catch(() => null) : null;
      if (!folder || !run) return { mode: current.mode, review: current.review, run: null };
      const grant = (await runKit.status(folder).catch(() => null))?.authorization;
      const authorized = Boolean(grant && grant.runId === run.runId && !grant.revoked);
      return { mode: current.mode, review: current.review, run: { runId: run.runId, phase: run.phase, reason: run.reason, authorized } };
    },
  };
}
