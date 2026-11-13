import type { AgentChannel } from '#agent-channel';
import type { WorkflowState } from '#kit-runner';

/** Pause only the plan whose actual owner was interrupted; no plan is a normal case. */
export async function pauseInterruptedOwner(options: {
  workflow: WorkflowState;
  projectId: string;
  key: string;
  pause: () => Promise<void>;
}): Promise<void> {
  const view = (await options.workflow.refresh(options.projectId)) ?? options.workflow.get(options.projectId);
  const status = options.workflow.status(options.projectId);
  if (!view?.scope && !status?.scope) return;
  const owner = view?.plan?.ownerSession ?? status?.execution?.ownerSession;
  if (owner && owner === options.key.slice(options.key.indexOf(':') + 1) && !status?.paused) await options.pause();
}

export const blockedByInterruption = (channel: AgentChannel, key: string): boolean => channel.interruption?.(key)?.barrier === true;
