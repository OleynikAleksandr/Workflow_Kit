// Wiring of sessions: the agent channel, the autopilot, the plan review toggles, session names and
// the cross review. Nothing here names a provider: what differs between them is read from the
// registry (hook dialect, wakeSession, sendMessage, sendDirect, promptTitle, capabilities).
import { createAgentChannel, registerChannelRoutes } from '#agent-channel';
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
import { createDirectMessage } from './direct-message.ts';
import { lateReviewDecider, toggleLock, wireCrossReview } from './review-wiring.ts';

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
    detached: {
      supports: (client) => Boolean(providers.get(client)?.sessionIdle && providers.get(client)?.sendMessage),
      idle: async (ref) => (await reach(ref).then(({ provider, project }) => provider.sessionIdle?.(project, ref.sessionId))) === true,
      lastAnswer: async (ref) => (await reach(ref).then(({ provider, project }) => provider.lastAnswer?.(project, ref.sessionId))) ?? null,
      send: async (ref, text, delivery) => (await reach(ref).then(({ provider, project }) => provider.sendMessage?.(project, ref.sessionId, text, delivery))) === true,
      archived: (ref) => ref.projectId !== null && titles.name(ref.projectId, ref.key).archivedAt !== null,
      names: (client) => {
        const provider = providers.get(client);
        return { label: provider ? providerLabel(provider) : client, title: provider?.title ?? client, lockSwitch: provider?.lockSwitch ?? null };
      },
    },
  });
  // Panel messages for an idle agent wait for its next hook; a session of a provider that can wake
  // it (wakeSession) is woken at once: the prompt hook of the woken turn hands over the queue. A
  // provider with sendMessage gets them from the channel itself (flush).
  const wakeIdle = async (key: string): Promise<void> => {
    const activity = channel.get(key);
    if (!activity || activity.state === 'working' || !activity.projectId) return;
    const provider = providers.get(activity.client);
    if (provider?.sendMessage) return channel.flush(key);
    if (!provider?.wakeSession || activity.state !== 'waiting') return;
    const project = await projects.get(activity.projectId);
    if (!project) return;
    const woken = await provider.wakeSession(project, activity.sessionId).catch(() => false);
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
      void titles.onStop(`${input.client}:${input.sessionId}`);
      return channel.stop(input, signal);
    },
    async prompt(input) {
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
  const direct = createDirectMessage({ activity: (key) => channel.get(key), provider: (id) => providers.get(id), project: (id) => projects.get(id), log: options.log });
  registerChannelRoutes({ router, state, channel: observedChannel, messages: wakingChannel, owns: ownsSession, dialects, direct });
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
    log: options.log,
  });
  // A detached session became idle: a name that waited for the end of the turn goes before the next message.
  channel.onIdle((key) => titles.onStop(key));
  const isClient = (id: string): boolean => providers.get(id) !== undefined;
  registerTitleRoutes({ router, state, titles, isClient });
  const crossReview = wireCrossReview({ router, state, channel, messages: wakingChannel, projects, providers, workflow, toggles: review, titles, resolveFolderProject, isClient, log: options.log });
  reviewDecider.attach(crossReview);
  return { channel, autopilot, review, titles, crossReview };
}
