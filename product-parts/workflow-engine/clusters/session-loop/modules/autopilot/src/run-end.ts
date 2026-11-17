// The end of a run with its scope (spec M40, run end 2.4): a run that had a scope is finished
// when that scope is gone — the user accepted and closed it by hand, or another scope took its
// place. The phase is `finished` with the reason `closed-manually`: the autopilot card
// disappears and the run publishes nothing (the user stepped in; «Опубликовать на GitHub»
// stays). A run that closed its scope itself goes on to its publication, and a run without a
// scope yet (the preparation) is left alone: no scope before the choice is the usual state.
import { FINAL_PHASES } from './run-journal.ts';
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit } from './run-kit.ts';

export const RUN_END_REASON = 'closed-manually';

/** The run closed its scope itself (a receipt or the final SHA): its publication is still ahead. */
function closedByRun(run: RunRecord): boolean {
  return Boolean(run.completion?.finalSha) || run.receipts.some((receipt) => receipt.actionId === `close:${run.scopeId}`);
}

/** Whether the scope of the run is gone, from the Kit facts; false when Kit did not answer. */
async function scopeGone(kit: Pick<RunKit, 'status' | 'scope'>, folder: string, run: RunRecord): Promise<boolean> {
  const status = await kit.status(folder);
  if (!status || status.scope === undefined) return false;
  if (status.scope === 'NONE') return true;
  const scope = await kit.scope(folder);
  return scope !== null && scope.id !== run.scopeId;
}

/**
 * The run after the check: finished when its scope is gone, otherwise unchanged. `closing` is
 * left to the completion, which reads the history for the close commit of the run itself.
 */
export async function settleRunEnd(deps: { journal: RunJournal; kit: Pick<RunKit, 'status' | 'scope'>; log?: (line: string) => void }, folder: string, run: RunRecord): Promise<RunRecord> {
  if (FINAL_PHASES.has(run.phase) || run.scopeId === null || run.phase === 'closing' || closedByRun(run)) return run;
  if (!(await scopeGone(deps.kit, folder, run))) return run;
  deps.log?.(`autopiloting: ${run.runId} finished: scope ${run.scopeId} is gone (${RUN_END_REASON})`);
  return finishRun(deps.journal, folder, run);
}

/** Writes the end of the run: no pending action, no wait, nothing to do next. */
export function finishRun(journal: RunJournal, folder: string, run: RunRecord): Promise<RunRecord> {
  return journal.update(folder, run.runId, (r) =>
    FINAL_PHASES.has(r.phase) ? null : { ...r, phase: 'finished', pausedFrom: r.phase, reason: RUN_END_REASON, nextAction: null, pendingAction: null, wait: null },
  );
}
