// Wiring of sessions: the agent channel, the autopilot, the plan review toggles, session names and
// the cross review. Nothing here names a provider: what differs between them is read from the
// registry (hook dialect, wakeSession, promptTitle, capabilities).
import { createAgentChannel, registerChannelRoutes } from '#agent-channel';
import type { AgentChannel } from '#agent-channel';
import { createAutopilot, registerAutopilotRoutes } from '#autopilot';
import type { Autopilot } from '#autopilot';
import type { CrossReview } from '#cross-review';
import type { KeyedMutex } from '#data-store';
import type { Router, StateRegistry } from '#http-server';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { createReviewToggles, registerReviewRoutes } from '#plan-review';
import type { ReviewToggles } from '#plan-review';
import type { ProjectRegistry } from '#project-registry';
import { SERVICE_MESSAGE_MARK } from '#project-setup';
import { providerCapability } from '#provider-registry';
import type { HookDialect, ProviderRegistry } from '#provider-registry';
import { createSessionTitles, registerTitleRoutes } from '#session-titles';
import type { SessionTitles, SessionTitlesOptions } from '#session-titles';
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
  const channel = createAgentChannel({
    resolveProject: resolveFolderProject,
    log: options.log,
  });
  // Panel messages for an idle agent wait for its next hook; a session of a provider that can wake
  // it (wakeSession) is woken at once: the prompt hook of the woken turn hands over the queue.
  const wakeIdle = async (key: string): Promise<void> => {
    const activity = channel.get(key);
    if (!activity || activity.state !== 'waiting' || !activity.projectId) return;
    const provider = providers.get(activity.client);
    if (!provider?.wakeSession) return;
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
    log: options.log,
  });
  channel.setDecider((context) => autopilot.decide(context));
  // The prompt hook tells the autopilot who started the turn: the user typing, or panel messages;
  // the Stop hook lets a waiting rename go.
  const observedChannel: AgentChannel = {
    ...channel,
    // At Stop the agent is out of its turn: a name that waited for it can go to the app.
    async stop(input, signal) {
      titles.onStop(`${input.client}:${input.sessionId}`);
      return channel.stop(input, signal);
    },
    async prompt(input) {
      const reply = await channel.prompt(input);
      const key = `${input.client}:${input.sessionId}`;
      // The panel's first message is a service greeting: no session topic is taken in that turn.
      titles.setServiceTurn(key, input.prompt?.includes(SERVICE_MESSAGE_MARK) === true);
      autopilot.onPrompt(key, reply.answer !== null);
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
  registerChannelRoutes({ router, state, channel: observedChannel, messages: wakingChannel, owns: ownsSession, dialects });
  registerAutopilotRoutes({ router, state, autopilot, mutex });

  const review = createReviewToggles({
    listProjects: async () => (await projects.list()).map((project) => ({ id: project.id, path: project.path })),
    pathChosen: (id) => Boolean(workflow.get(id)?.execution),
    locked: (id, key) => toggleLock(crossReview, workflow, id, key),
    onChange: (id, key, on) => crossReview.toggled(id, key, on),
  });
  registerReviewRoutes({ router, state, toggles: review });

  const titles = createSessionTitles({
    listProjects: async () => (await projects.list()).map((project) => ({ id: project.id, path: project.path })),
    resolveProject: resolveFolderProject,
    sessions: () => channel.list(),
    promptTitle: (client) => providers.get(client)?.promptTitle === true,
    listed: async (id) => {
      const project = await projects.get(id);
      const keys = new Set<string>();
      if (!project) return keys;
      for (const provider of providers.list()) {
        for (const info of await provider.listSessions(project).catch(() => [])) keys.add(`${info.provider}:${info.localId}`);
      }
      return keys;
    },
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
  const isClient = (id: string): boolean => providers.get(id) !== undefined;
  registerTitleRoutes({ router, state, titles, isClient });
  const crossReview = wireCrossReview({ router, state, channel, messages: wakingChannel, projects, providers, workflow, toggles: review, titles, resolveFolderProject, isClient, log: options.log });
  reviewDecider.attach(crossReview);
  return { channel, autopilot, review, titles, crossReview };
}
