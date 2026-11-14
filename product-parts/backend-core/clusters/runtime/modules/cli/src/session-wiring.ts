// Wiring of sessions: the agent channel, the autopilot, the plan review toggles, session names and
// the cross review. Nothing here names a provider: what differs between them is read from the
// registry (hook dialect, wakeSession, sendMessage, sendDirect, promptTitle, capabilities).
import { createAgentChannel, registerChannelRoutes, nativeControlHookReply } from '#agent-channel';
import type { AgentChannel, SessionRef } from '#agent-channel';
import { createAutopilot, registerAutopilotRoutes } from '#autopilot';
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
import type { HookDialect, Provider, ProviderRegistry, SessionInfo } from '#provider-registry';
import { createSessionTitles, registerTitleRoutes } from '#session-titles';
import type { SessionTitles, SessionTitlesOptions } from '#session-titles';
import { createTurnInterruption } from './turn-interruption.ts';
import { createDirectMessage, ledOutside } from './direct-message.ts';
import { lateReviewDecider, toggleLock, wireCrossReview } from './review-wiring.ts';

/** How often a turn ended without a Stop hook is looked for (M28). */
export const TURN_RECONCILE_MS = 2000;
export const TURN_SETTLE_MS = 1500;
/**
 * Claude sends no Stop hook after an interruption (M28 3.2): a working turn whose provider turn state
 * says idle later than the turn started (and not just now, when a Stop hook may be in flight) is
 * ended without a barrier, and a waiting queue is woken at once.
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
    if (!interruption?.turnRef || interruption.barrier || interruption.pending) continue;
    if (!channel.confirmInterrupted(activity.key, interruption.turnRef, null)) continue;
    channel.resumeDelivery(activity.key);
    deps.log?.(`channel: ${activity.key} ended by ${turn.source} without a Stop hook`);
    if (channel.queued(activity.key).length > 0) deps.wake(activity.key);
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
  const wakingChannel: AgentChannel = {
    ...channel,
    enqueue(key, text, source, projectId) {
      const message = channel.enqueue(key, text, source, projectId);
      void wakeIdle(key);
      return message;
    },
  };
  const reviewDecider = lateReviewDecider();
  const autopilot = createAutopilot({
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
      const reply = await channel.prompt(input);
      const key = `${input.client}:${input.sessionId}`;
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

  const review = createReviewToggles({
    listProjects: async () => (await projects.list()).map((project) => ({ id: project.id, path: project.path })),
    pathChosen: (id) => Boolean(workflow.get(id)?.execution),
    locked: (id, key) => toggleLock(crossReview, workflow, id, key),
    onChange: (id, key, on) => crossReview.toggled(id, key, on),
  });
  registerReviewRoutes({ router, state, toggles: review });

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
  const crossReview = wireCrossReview({ router, state, channel, messages: wakingChannel, projects, providers, workflow, toggles: review, titles, resolveFolderProject, isClient, log: options.log });
  reviewDecider.attach(crossReview);
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
  const interruptions = createTurnInterruption({ channel, providers, projects, autopilot, reviews: crossReview });
  registerChannelRoutes({ router, state, channel: observedChannel, messages: wakingChannel, owns: ownsSession, dialects, direct, interrupt: interruptions.interrupt, interruptions: interruptions.section });
  return { channel, autopilot, review, titles, crossReview };
}
