// The owner of an unstarted plan is the session where the user pressed the button (spec M31 3.3):
// the start from another session moves the Kit owner there (`scope:owner`, Kit 2.2.5), and the
// sessions that held their Stop for the old owner are woken so the decider releases them.
import type { AgentChannel } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';

/** The `--note` of `scope:owner` for a start from another session (English, for the plan). */
export const OWNER_NOTE = 'The user started the plan from this session in the Workflow Kit panel';
export const KIT_OUTDATED_TEXT = 'Обновите Kit проекта до 2.2.5, чтобы начать план из этой сессии';
export const KIT_OUTDATED_NEXT = 'Нажмите «Обновить Kit» у проекта или начните план в сессии, где выбран способ.';

export interface OwnerDeps {
  runner: KitRunner;
  workflow: WorkflowState;
  channel: AgentChannel;
}

export type OwnerMove =
  | { ok: true; moved: boolean; previousKeys: string[] }
  | { ok: false; code: string; message: string; nextAction: string | null };

const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);

/** Wakes the other sessions of the project that hold their Stop for one of the reasons. */
export function wakeHolders(channel: Pick<AgentChannel, 'list' | 'wake'>, projectId: string, except: string, reasons: readonly string[]): string[] {
  const keys = channel
    .list()
    .filter((a) => a.projectId === projectId && a.key !== except && a.state === 'holding' && a.holdReason !== null && reasons.includes(a.holdReason))
    .map((a) => a.key);
  for (const key of keys) channel.wake(key);
  return keys;
}

/**
 * Makes `key` the owner of the project's plan before its start. The same owner changes nothing.
 * A Kit without `scope:owner` refuses with `kit-outdated` when another session owns the plan;
 * a plan without an owner starts as before.
 */
export async function moveOwner(deps: OwnerDeps, root: string, projectId: string, key: string): Promise<OwnerMove> {
  const execution = deps.workflow.status(projectId)?.execution ?? (await deps.workflow.refresh(projectId))?.execution ?? null;
  const current = execution?.ownerSession ?? null;
  if (current === idOf(key)) return { ok: true, moved: false, previousKeys: [] };
  const outcome = await deps.runner.run(root, ['scope:owner', '--session', idOf(key), '--note', OWNER_NOTE]);
  if (!outcome.ok) {
    if (outcome.code !== 'UNKNOWN_COMMAND') return { ok: false, code: outcome.code, message: outcome.message, nextAction: outcome.nextAction };
    if (current === null) return { ok: true, moved: false, previousKeys: [] };
    return { ok: false, code: 'kit-outdated', message: KIT_OUTDATED_TEXT, nextAction: KIT_OUTDATED_NEXT };
  }
  await deps.workflow.refresh(projectId);
  const previousKeys = current === null ? [] : deps.channel.list().filter((a) => a.sessionId === current && a.key !== key).map((a) => a.key);
  wakeHolders(deps.channel, projectId, key, ['waiting-for-plan-start']);
  return { ok: true, moved: true, previousKeys };
}
