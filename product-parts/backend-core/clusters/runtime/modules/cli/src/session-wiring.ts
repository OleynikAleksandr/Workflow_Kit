// Wiring of sessions: the agent channel, the autopilot, the plan review toggles, session names and
// the cross review. Nothing here names a provider: what differs between them is read from the
// registry (hook dialect, wakeSession, sendMessage, sendDirect, promptTitle, capabilities).
import { createAgentChannel, registerChannelRoutes, nativeControlHookReply } from '#agent-channel';
import { autopilotLine } from './autopilot-line.ts';
import type { AgentChannel, SessionActivity, SessionRef } from '#agent-channel';
import { createAutopilot, createDecisionCommands, registerAutopilotRoutes, registerDecisionRoutes } from '#autopilot';
import type { Autopilot } from '#autopilot';
import type { CrossReview } from '#cross-review';
import type { KeyedMutex } from '#data-store';
import type { Router, StateRegistry } from '#http-server';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { createReviewToggles, registerReviewRoutes } from '#plan-review';
import type { ReviewToggles } from '#plan-review';
import type { Project, ProjectRegistry } from '#project-registry';
import { SERVICE_MESSAGE_MARK } from '#project-setup';
import { providerCapability, providerLabel } from '#provider-registry';
import type { HookDialect, Provider, ProviderRegistry, QuestionHookReply, QuestionHookRequest, SessionInfo } from '#provider-registry';
import { createSessionTitles, registerTitleRoutes } from '#session-titles';
import type { SessionTitles, SessionTitlesOptions } from '#session-titles';
import { createTurnInterruption, deliverAfterInterruption } from './turn-interruption.ts';
import { createDirectMessage, ledOutside } from './direct-message.ts';
import { lateReviewDecider, toggleLock, wireCrossReview } from './review-wiring.ts';
import type { Publisher } from '#git-publish';
import { wireAutopiloting } from './autopiloting-wiring.ts';
import type { AutopilotingWiring } from './autopiloting-wiring.ts';
import { locateSession, ownerUnreachable, proposalDigest, reviewFact } from './autopiloting-links.ts';

/** How often a turn ended without a Stop hook is looked for (M28). */
export const TURN_RECONCILE_MS = 2000;
export const TURN_SETTLE_MS = 1500;
/** How often the runs that wait for CI read GitHub (M39 T007). */
export const AUTOPILOT_TICK_MS = 15_000;
/**
 * Claude sends no Stop hook after an interruption (M28 3.2): a working turn whose provider turn state
 * says idle later than the turn started (and not just now, when a Stop hook may be in flight) is
 * ended, and a waiting queue is woken at once. A Stop barrier (an unconfirmed Stop) stays: it holds
 * automatic continuation, never the end of the turn (M28 T010).
 */
export async function reconcileTurns(deps: { channel: AgentChannel; providers: Pick<ProviderRegistry, 'get'>; projects: Pick<ProjectRegistry, 'get'>; wake: (key: string) => void; log?: (line: string) => void; now?: () => number }): Promise<void> {
  const { channel } = deps; const now = deps.now ?? Date.now;
  for (const activity of channel.list()) {
    if (activity.state !== 'working' || !activity.projectId || !activity.turnStartedAt) continue;
    const provider = deps.providers.get(activity.client);
    if (!provider?.turnState) continue;
    const project = await deps.projects.get(activity.projectId).catch(() => undefined);
    if (!project) continue;
    const turn = await provider.turnState(project, activity.sessionId).catch(() => null);
    const interruption = channel.interruption(activity.key);
    if (!turn || turn.state !== 'idle' || !(turn.at > Date.parse(activity.turnStartedAt)) || now() - turn.at < TURN_SETTLE_MS) continue;
    // A barrier (an unconfirmed Stop, M28 T010) no longer keeps the turn working; only a Stop in flight does.
    if (!interruption?.turnRef || interruption.pending) continue;
    const held = interruption.barrier;
    if (!channel.confirmInterrupted(activity.key, interruption.turnRef, null)) continue;
    deps.log?.(`channel: ${activity.key} ended by ${turn.source} without a Stop hook${held ? ' (Stop barrier kept)' : ''}`);
    if (!held) channel.resumeDelivery(activity.key);
    deliverAfterInterruption(channel, activity.key, deps.wake);
  }
}
export interface SessionWiringOptions {
  router: Router;
  state: StateRegistry;
  mutex: KeyedMutex;
  projects: ProjectRegistry;
  providers: ProviderRegistry;
  workflow: WorkflowState;
  kit: KitRunner;
  /** The configuration folder of the service (M39: `autopiloting.json`). */
  configDir: string;
  /** T008: the publisher of the publish button, shared with the autopiloting runs. */
  publisher?: Publisher;
  platform?: NodeJS.Platform;
  /** The deepest registered project that contains a folder. */
  resolveFolderProject: (folder: string) => Promise<{ id: string } | undefined>;
  /** Tells the provider that a session was archived or returned in the panel. */
  sessionArchived: NonNullable<SessionTitlesOptions['archived']>;
  log?: (line: string) => void;
}

export interface SessionWiring {
  channel: AgentChannel;
  autopilot: Autopilot;
  review: ReviewToggles;
  titles: SessionTitles;
  crossReview: CrossReview;
  autopiloting: AutopilotingWiring;
}

/**
 * M29 3.1: the panel runs the session and can wake it while idle, so its Stop hook is never held.
 * A provider with sendMessage keeps its own detached path.
 */
export function releasable(provider: Pick<Provider, 'marksPanelProcess' | 'wakeSession' | 'sendMessage'> | undefined, activity: Pick<SessionActivity, 'external'> | undefined): boolean {
  return provider?.marksPanelProcess === true && typeof provider.wakeSession === 'function' && !provider.sendMessage && activity?.external === false;
}

export function wireSessions(options: SessionWiringOptions): SessionWiring {
  const { router, state, mutex, projects, providers, workflow, kit, resolveFolderProject } = options;
  const clientOf = (key: string): string => key.slice(0, key.indexOf(':'));
  // A provider whose Stop hook cannot be held (sessionIdle and sendMessage) gets the next message
  // as a prompt once the session is idle; a session archived in the panel gets none.
  const reach = async (ref: SessionRef): Promise<{ provider: Provider; project: Project }> => {
    const provider = providers.get(ref.client);
    const project = ref.projectId ? await projects.get(ref.projectId) : undefined;
    if (!provider || !project) throw new Error('проект сессии неизвестен');
    return { provider, project };
  };
  const channel = createAgentChannel({
    resolveProject: resolveFolderProject,
    log: options.log,
    // M29 3.1: a session the panel runs and can wake is never held by its Stop hook.
    release: {
      supports: (ref) => releasable(providers.get(ref.client), channel.get(ref.key)),
      wake: (ref) => void wakeReleased(ref.key).catch((error: unknown) => options.log?.(`channel: wake of ${ref.key} failed: ${error instanceof Error ? error.message : String(error)}`)),
    },
    // A session archived or removed from the list in the panel leaves the Kit process (spec M22 2.8).
    excluded: (ref) => titles.excluded(ref.projectId, ref.key),
    detached: {
      supports: (client) => Boolean(providers.get(client)?.sessionIdle && providers.get(client)?.sendMessage),
      idle: async (ref) => (await reach(ref).then(({ provider, project }) => provider.sessionIdle?.(project, ref.sessionId))) === true,
      lastAnswer: async (ref) => (await reach(ref).then(({ provider, project }) => provider.lastAnswer?.(project, ref.sessionId))) ?? null,
      send: async (ref, text, delivery) => (await reach(ref).then(({ provider, project }) => provider.sendMessage?.(project, ref.sessionId, text, delivery))) === true,
      names: (client) => {
        const provider = providers.get(client);
        return { label: provider ? providerLabel(provider) : client, title: provider?.title ?? client, lockSwitch: provider?.lockSwitch ?? null };
      },
    },
  });
  // Panel messages for an idle agent wait for its next hook; a session of a provider that can wake
  // it (wakeSession) is woken at once: the prompt hook of the woken turn hands over the queue. A
  // provider with sendMessage gets them from the channel itself (flush). A session led outside the
  // panel (ledOutside, M19) is not woken: its own process takes the queue with the next hook.
  const wakeIdle = async (key: string): Promise<void> => {
    const activity = channel.get(key);
    if (!activity || activity.state === 'working' || !activity.projectId || channel.interruption(key)?.barrier) return;
    const provider = providers.get(activity.client);
    if (provider?.sendMessage) return channel.flush(key);
    if (!provider?.wakeSession || activity.state !== 'waiting' || ledOutside(provider, activity)) return;
    const project = await projects.get(activity.projectId);
    if (!project || channel.interruption(key)?.barrier) return;
    const woken = await channel.automaticWake(key, () => provider.wakeSession!(project, activity.sessionId).catch(() => false));
    if (woken) options.log?.(`channel: woke ${key} for queued panel messages`);
  };
  // A released hold (M29) shows as holding, but nothing keeps the hook: the session is idle.
  const wakeReleased = async (key: string): Promise<void> => {
    const activity = channel.get(key);
    if (!activity || activity.state === 'working' || !activity.projectId || channel.interruption(key)?.barrier) return;
    const provider = providers.get(activity.client);
    if (!releasable(provider, activity)) return;
    const project = await projects.get(activity.projectId);
    if (!project || channel.interruption(key)?.barrier) return;
    const woken = await channel.automaticWake(key, () => provider!.wakeSession!(project, activity.sessionId).catch(() => false));
    options.log?.(`channel: ${woken ? 'woke' : 'could not wake'} ${key} after a released hold`);
  };
  const wakingChannel: AgentChannel = {
    ...channel,
    enqueue(key, text, source, projectId) {
      const message = channel.enqueue(key, text, source, projectId);
      void wakeIdle(key);
      return message;
    },
  };
  const reviewDecider = lateReviewDecider();
  // M39: an instruction keeps a review decision the session already has; it closes its plan question.
  const autopiloting = wireAutopiloting({ router, state, mutex, projects, kit, channel, configDir: options.configDir, platform: options.platform, log: options.log, ...(options.publisher ? { publisher: options.publisher } : {}), decideReview: async (id, key, on) => {
    await review.dismiss(id, key);
    if (!review.decided(id, key)) await review.set(id, key, on);
    return review.get(id, key);
  } });
  const autopilot = createAutopilot({
    authority: autopiloting.authority,
    runs: autopiloting.turns,
    decisions: autopiloting.decisions,
    runner: kit,
    workflow,
    channel: wakingChannel,
    review: reviewDecider,
    projectPath: async (id) => (await projects.get(id))?.path,
    orchestration: (client) => providerCapability(providers.get(client), 'orchestration'),
    // Called only after start, when ownsSession below is defined.
    owns: (projectId, key) => ownsSession(projectId, key),
    log: options.log,
  });
  channel.setDecider((context) => autopilot.decide(context));
  // The prompt hook tells the autopilot who started the turn: the user typing, or panel messages;
  // the Stop hook lets a waiting rename go.
  async function userWord(key: string, folder: string | null | undefined, text: string): Promise<void> {
    try {
      const projectId = channel.get(key)?.projectId ?? (folder ? (await resolveFolderProject(folder))?.id : undefined);
      if (projectId) await autopiloting.words.received(projectId, key, text);
    } catch (error) {
      options.log?.(`autopiloting: the user's word of ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const observedChannel: AgentChannel = {
    ...channel,
    // At Stop the agent is out of its turn: a name that waited for it can go to the app.
    async stop(input, signal) {
      if (await providers.get(input.client)?.nativeControlHook?.({ ...input, event: 'stop' })) return nativeControlHookReply('stop');
      void titles.onStop(`${input.client}:${input.sessionId}`);
      const reply = await channel.stop(input, signal);
      // A block answer continues the turn without a prompt hook: the provider marks it working again.
      if (reply.answer?.['decision'] === 'block') await providers.get(input.client)?.nativeControlHook?.({ ...input, event: 'continue' }).catch(() => false);
      return reply;
    },
    async prompt(input) {
      if (await providers.get(input.client)?.nativeControlHook?.({ ...input, event: 'prompt' })) return nativeControlHookReply('prompt');
      const key = `${input.client}:${input.sessionId}`;
      // M40: a text typed in the provider's app reaches the service here: «стоп» and «пауза» of
      // the owner of a live run act before the agent reads the prompt.
      if (input.prompt) await userWord(key, input.cwd, input.prompt);
      const reply = await channel.prompt(input);
      // The panel's first message is a service greeting: no session topic is taken in that turn.
      titles.setServiceTurn(key, input.prompt?.includes(SERVICE_MESSAGE_MARK) === true);
      // A prompt the service itself sent (reply.own) is the service's turn as well.
      autopilot.onPrompt(key, reply.own === true || reply.answer !== null);
      titles.onTurn(key);
      // A provider with promptTitle takes the session name from the prompt hook answer
      // (hookSpecificOutput.sessionTitle); for the others appTitle gives null.
      const appTitle = await titles.appTitle(key, input.sessionTitle).catch(() => null);
      if (!appTitle) return reply;
      const answer = reply.answer ?? {};
      const specific = (answer['hookSpecificOutput'] ?? {}) as Record<string, unknown>;
      return { ...reply, answer: { ...answer, hookSpecificOutput: { ...specific, hookEventName: 'UserPromptSubmit', sessionTitle: appTitle } } };
    },
  };
  // A session the channel has not seen since the start belongs to the project when its provider lists it.
  const ownsSession = async (projectId: string, key: string): Promise<boolean> => {
    const project = await projects.get(projectId);
    const lists = project ? await Promise.all(providers.list().map((p) => p.listSessions(project).catch(() => []))) : [];
    return lists.flat().some((info) => `${info.provider}:${info.localId}` === key);
  };
  // A hook is taken only from a registered provider; its dialect decides how it is read and answered.
  const dialects = (id: string): HookDialect | undefined => providers.get(id) && (providers.get(id)?.hookDialect ?? 'claude');
  // A panel message goes to a waiting agent at once as a user's message when its provider can do
  // it (sendDirect); otherwise, and for the autopilot and the cross review, through the queue.
  const direct = createDirectMessage({ channel, activity: (key) => channel.get(key), provider: (id) => providers.get(id), project: (id) => projects.get(id), log: options.log });
  registerAutopilotRoutes({ router, state, autopilot, mutex });
  // M40: `wfk decision <kind>` and the buttons of the decision cards (a `decisions: host` project).
  registerDecisionRoutes({
    router,
    mutex,
    commands: createDecisionCommands({
      autopilot,
      decisions: autopiloting.decisions,
      workflow,
      projectPath: async (id) => (await projects.get(id))?.path,
      tell: (id, key, text) => void wakingChannel.enqueue(key, text, 'panel', id),
    }),
    locate: (input) => locateSession(input, { resolveFolderProject, isClient, running: (id) => titles.running(id) }),
  });

  const review = createReviewToggles({
    listProjects: async () => (await projects.list()).map((project) => ({ id: project.id, path: project.path })),
    pathChosen: (id) => Boolean(workflow.get(id)?.execution),
    locked: (id, key) => toggleLock(crossReview, workflow, id, key),
    onChange: (id, key, on) => crossReview.toggled(id, key, on),
    scopeOf: (id) => workflow.get(id)?.scope?.id ?? null,
  });
  registerReviewRoutes({ router, state, toggles: review });
  // M48 T002: awaited, so the full-run instruction is queued before the answer message and the wake.
  review.onAnswer(async (id, key, choice, question) => {
    if (question.kind === 'agent') await autopiloting.answered(id, key, choice, question.summary).catch((error: unknown) => options.log?.(`autopiloting: ${key}: ${error instanceof Error ? error.message : String(error)}`));
  });

  // Keys of the sessions the providers list for a project, filtered by their state.
  const listedKeys = async (id: string, keep: (info: SessionInfo) => boolean): Promise<Set<string>> => {
    const project = await projects.get(id);
    const keys = new Set<string>();
    if (!project) return keys;
    for (const provider of providers.list()) {
      for (const info of await provider.listSessions(project).catch(() => [])) if (keep(info)) keys.add(`${info.provider}:${info.localId}`);
    }
    return keys;
  };

  const titles = createSessionTitles({
    listProjects: async () => (await projects.list()).map((project) => ({ id: project.id, path: project.path })),
    resolveProject: resolveFolderProject,
    sessions: () => channel.list(),
    promptTitle: (client) => providers.get(client)?.promptTitle === true,
    listed: (id) => listedKeys(id, () => true),
    listedRunning: (id) => listedKeys(id, (info) => info.state === 'running'),
    scope: (id) => {
      const view = workflow.get(id);
      return view?.scope ? { objective: view.scope.objective, ownerSession: view.execution?.ownerSession ?? null } : null;
    },
    rename: async (id, key, name) => {
      const project = await projects.get(id);
      const provider = providers.get(clientOf(key));
      if (!project || !provider?.renameSession) return { synced: false, note: 'Имя хранится только в Workflow Kit' };
      return provider.renameSession(project, key.slice(key.indexOf(':') + 1), name);
    },
    archived: options.sessionArchived,
    onExcluded: (projectId, key) => leaveProcess(projectId, key),
    log: options.log,
  });
  // A detached session became idle: a name that waited for the end of the turn goes before the next message.
  channel.onIdle((key) => titles.onStop(key));
  const isClient = (id: string): boolean => providers.get(id) !== undefined;
  registerTitleRoutes({ router, state, titles, isClient });
  const crossReview = wireCrossReview({
    router, state, channel, messages: wakingChannel, projects, providers, workflow, toggles: review, titles, resolveFolderProject, isClient, prepare: autopiloting.prepare, log: options.log,
    digest: (id) => proposalDigest(kit, projects, id),
    onReviewFinished: (finished) => void autopiloting.reconcile(finished.projectId),
  });
  reviewDecider.attach(crossReview);
  // M39 T006: a full run goes from its proposal to the started plan; every finished turn asks again.
  autopiloting.attach({
    actions: autopilot,
    review: (id, key) => reviewFact(crossReview.get(id, key), key),
    reviewOn: (id, key) => review.get(id, key),
    orchestration: (client) => providerCapability(providers.get(client), 'orchestration'),
    locate: (input) => locateSession(input, { resolveFolderProject, isClient, running: (id) => titles.running(id) }),
    activity: (key) => channel.get(key),
    unreachable: async (id, key) => ownerUnreachable(providers.get(clientOf(key)), titles.excluded(id, key)),
    send: (id, key, text) => void wakingChannel.enqueue(key, text, 'panel', id),
    question: (id, key) => review.question(id, key),
    wake: (key) => channel.wake(key),
  });
  channel.onStop((event) => void (event.projectId && autopiloting.reconcile(event.projectId)));
  // The session leaves at once: out of the channel (a held Stop is released) and out of a running
  // review, as main or as reviewer; nothing waits for its next hook.
  function leaveProcess(projectId: string, key: string): void {
    channel.forget(key);
    const running = crossReview.get(projectId, key);
    if (!running) return;
    crossReview.cancel(projectId, running.mainKey, 'сессия ревью убрана в архив').catch((error: unknown) => {
      options.log?.(`review: ${running.mainKey} could not be cancelled: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  // Claude sends no Stop hook after an interruption (M28 3.2): a turn the provider saw end later than
  // it started is ended here, and what waited for it goes at once.
  const reconcile = (): Promise<void> => reconcileTurns({ channel, providers, projects, wake: (key) => { void wakeIdle(key); }, log: options.log });
  let reconciling = false;
  const reconciler = setInterval(() => {
    if (reconciling) return;
    reconciling = true;
    reconcile().catch(() => undefined).finally(() => { reconciling = false; });
  }, TURN_RECONCILE_MS);
  reconciler.unref?.();
  // M39 T007: runs that wait for CI are checked on GitHub (a pending CI is a wait, never a result).
  const runTicker = setInterval(() => void autopiloting.tick().catch(() => undefined), AUTOPILOT_TICK_MS);
  runTicker.unref?.();
  const interruptions = createTurnInterruption({ channel, providers, projects, autopilot, reviews: crossReview, wake: (key) => { void wakeIdle(key); } });
  // The question hook (spec M33 section 2.3): the provider of the client holds it for the project of
  // its folder; an unknown project or a provider without questionHook releases the native dialog.
  const question = async (request: QuestionHookRequest, signal: AbortSignal): Promise<QuestionHookReply> => {
    const provider = providers.get(request.client);
    const folder = request.projectDir ?? request.cwd;
    const ref = provider?.questionHook && folder ? await resolveFolderProject(folder) : undefined;
    const project = ref ? await projects.get(ref.id) : undefined;
    if (!provider?.questionHook || !project) return { release: true };
    // M39 T007: the run of the asking owner waits (no attempt spent); an expired hook needs data.
    const asking = `${request.client}:${request.sessionId}`;
    await autopiloting.waits.questionStarted(project.id, asking).catch(() => undefined);
    const reply = await provider.questionHook(project, request, signal);
    if ('decision' in reply || 'release' in reply) void autopiloting.waits.questionEnded(project.id, asking, 'decision' in reply ? 'answered' : 'expired').catch(() => undefined);
    return reply;
  };
  registerChannelRoutes({
    router, state, channel: observedChannel, messages: wakingChannel, owns: ownsSession, dialects, direct, interrupt: interruptions.interrupt, interruptions: interruptions.section, question,
    onUserMessage: async (projectId, key, text) => void (await autopiloting.words.received(projectId, key, text)),
    // M44 3.2: the autopilot line of a new session, by the project of its folder; M48 — the session
    // begins here with the defaults of Settings (a resume keeps its own values).
    sessionStart: async (input) => {
      const folder = input.projectDir ?? input.cwd;
      const ref = folder ? await resolveFolderProject(folder) : undefined;
      return autopilotLine(await autopiloting.agentState(ref?.id ?? null, `${input.client}:${input.sessionId}`));
    },
  });
  return { channel, autopilot, review, titles, crossReview, autopiloting };
}
