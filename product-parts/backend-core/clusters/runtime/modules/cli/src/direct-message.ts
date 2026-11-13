// The direct path of a panel message (M18 section 2.5): the text goes to the agent at once as a
// user's message when the provider can take it (sendDirect) and the session is not in a turn.
// Nothing here names a provider; a false answer keeps the channel queue path.
import type { AgentChannel, SessionActivity } from '#agent-channel';
import type { Project } from '#project-registry';
import type { Provider } from '#provider-registry';

export interface DirectMessageOptions {
  /** Channel record of the session; undefined when the channel has not seen it since the start. */
  activity: (key: string) => SessionActivity | undefined;
  provider: (id: string) => Provider | undefined;
  project: (id: string) => Promise<Project | undefined>;
  log?: (line: string) => void;
  channel?: Pick<AgentChannel, 'directTurn'>;
}

/**
 * True when another process leads the session (spec M19 2.3): the provider marks the processes the
 * panel starts and the last hook of the session came without the mark. Such a session gets panel
 * messages only from the queue, with its next hook; nothing is typed into a panel copy or woken.
 */
export function ledOutside(provider: Pick<Provider, 'marksPanelProcess'> | undefined, activity: Pick<SessionActivity, 'external'> | undefined): boolean {
  return provider?.marksPanelProcess === true && activity?.external === true;
}

/** Route option `direct` of the channel routes: true means the provider took the text. */
export type DirectMessage = (projectId: string, key: string, text: string) => Promise<boolean>;

/**
 * Builds the direct path. It calls provider.sendDirect only when the provider has it and has no
 * sendMessage (that provider gets the message from the channel queue), the project is found and
 * the session is waiting or unknown to the channel. A working or holding session gets the text
 * from the queue: at the end of the turn or at once as the answer of the held Stop hook. A session
 * led outside the panel (ledOutside) gets it from the queue as well.
 */
export function createDirectMessage(options: DirectMessageOptions): DirectMessage {
  return async (projectId, key, text) => {
    const colon = key.indexOf(':');
    if (colon <= 0) return false;
    const provider = options.provider(key.slice(0, colon));
    if (!provider?.sendDirect || provider.sendMessage) return false;
    const activity = options.activity(key);
    if (activity && activity.state !== 'waiting') return false;
    if (ledOutside(provider, activity)) return false;
    const project = await options.project(projectId).catch(() => undefined);
    if (!project) return false;
    try {
      const send = async () => (await provider.sendDirect!(project, key.slice(colon + 1), text)) === true;
      return await (options.channel ? options.channel.directTurn(key, projectId, text, send) : send());
    } catch (error) {
      options.log?.(`channel: direct message to ${key} failed, queued instead: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
}
