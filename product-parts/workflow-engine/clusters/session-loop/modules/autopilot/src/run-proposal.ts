// The proposal check of a full run (spec M40, run end 2.2): before any review or choice the
// service reads `scope:proposal` and returns a proposal without the `automation` block to its
// author — one message with the exact requirement, as the answer of the owner's finished turn.
// The run counts such proposals: the second one stops it with the reason `automation-missing`,
// and the usual review and mode cards work as without autopilot. A Kit that does not report the
// block (before 2.4.4) is checked after the choice instead (run-prepare.ts).
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit } from './run-kit.ts';
import { RUN_STOP_NEXT, automationReturnText } from './run-texts.ts';
import type { RunStopReason } from './run-texts.ts';

/** Proposals without the block a run takes before it stops. */
export const AUTOMATION_ATTEMPTS = 2;

/** The phases of a full run before its plan is chosen. */
const BEFORE_CHOICE: ReadonlySet<RunRecord['phase']> = new Set(['preparing', 'reviewing']);

/** Stops a run of the service's own accord: final, with a reason the card names. */
export function stopRun(journal: RunJournal, folder: string, run: RunRecord, reason: RunStopReason, more: Partial<RunRecord> = {}): Promise<RunRecord> {
  return journal.update(folder, run.runId, (r) => ({ ...r, ...more, phase: 'stopped', pausedFrom: r.phase, reason, nextAction: RUN_STOP_NEXT[reason], pendingAction: null }));
}

/** Whether the open proposal is known to lack the `automation` block. */
export async function proposalLacksAutomation(kit: Pick<RunKit, 'proposal'>, folder: string): Promise<{ generation: number } | null> {
  const proposal = await kit.proposal(folder);
  return proposal && !proposal.refining && proposal.automation === false ? { generation: proposal.generation } : null;
}

export function createProposalGate(deps: { journal: RunJournal; kit: Pick<RunKit, 'proposal'>; projectPath(projectId: string): Promise<string | undefined>; now?: () => Date; log?: (line: string) => void }) {
  const now = deps.now ?? (() => new Date());
  return {
    /**
     * The finished turn of `key` with an open proposal: the text that returns a proposal without
     * the block to its author, or null (no full run of this owner, the block is there, the run
     * stopped on the second such proposal).
     */
    async check(projectId: string, key: string): Promise<{ text: string } | null> {
      const folder = await deps.projectPath(projectId);
      if (!folder) return null;
      const run = await deps.journal.active(folder).catch(() => null);
      if (!run || run.mode !== 'full' || run.owner.key !== key || !BEFORE_CHOICE.has(run.phase)) return null;
      const lacking = await proposalLacksAutomation(deps.kit, folder);
      if (!lacking) return null;
      const count = (run.automationMissing ?? 0) + 1;
      if (count >= AUTOMATION_ATTEMPTS) {
        await stopRun(deps.journal, folder, run, 'automation-missing', { automationMissing: count });
        deps.log?.(`autopiloting: ${run.runId} stopped: proposal ${lacking.generation} has no automation block again`);
        return null;
      }
      await deps.journal.update(folder, run.runId, (r) => ({
        ...r,
        phase: 'preparing',
        automationMissing: count,
        receipts: [...r.receipts, { actionId: `automation-missing:${lacking.generation}`, type: 'return', at: now().toISOString(), commit: null, detail: 'the proposal has no automation block' }],
      }));
      deps.log?.(`autopiloting: ${run.runId} returned proposal ${lacking.generation} to its author: no automation block`);
      return { text: automationReturnText(run.runId) };
    },
  };
}

export type ProposalGate = ReturnType<typeof createProposalGate>;
