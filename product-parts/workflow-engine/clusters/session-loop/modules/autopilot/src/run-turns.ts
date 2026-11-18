// The turns of a started autopiloting run (spec M39 runtime 5, controls 1): the Stop of the run's
// owner is decided by the shared Kit logic (decide.ts, with the grant) and then by the run. There
// is no limit of 40 continues; three finished turns in a row without progress (plan revision,
// HEAD, assignments) block the run; a wait for CI or for an answer is shown as a wait and costs
// no attempt; a paused or blocked run keeps its barrier; a status question of the user is
// answered and the work goes on. The run, not the panel buttons, is the only sender of the
// continuations (the resume of a working session sends nothing).
import type { AutopilotDecision, AutopilotProjectStatus } from './decide-model.ts';
import type { AutopilotReason } from './autopilot-types.ts';
import { KIT_COMMAND } from './decide-orchestration.ts';
import type { RunJournal, RunRecord } from './run-journal.ts';
import { hostInputDigest } from './host-ticket.ts';

/** Finished turns in a row without progress that block the run. */
export const NO_PROGRESS_LIMIT = 3;

/** Phases of a started run whose owner's Stop the run decides. */
const STARTED: ReadonlySet<RunRecord['phase']> = new Set(['executing', 'delivering', 'verifying', 'accepting', 'closing', 'publishing', 'waiting', 'paused', 'blocked']);

export interface LiveRun {
  run: RunRecord;
  folder: string;
  /** Why no automatic step may start now (paused, blocked), or null. */
  barrier: AutopilotReason | null;
}

export type RunTurnDecision =
  | { action: 'continue'; taskId: string; text: string }
  | { action: 'stop'; reason: AutopilotReason; detail: string };

export const TURN_TEXTS = {
  // M40: «стоп» and «пауза» as the first word never reach this text — the service acted on them.
  /** M44: a run without a live Kit grant — the user's decisions stay manual, as Kit says. */
  noGrant: "The autopilot run has no live Kit grant: every user decision (a delivery, the acceptance, the close) stays manual; follow the next line of the Kit recovery packet and do not treat this as autopilot.",
  userMessageManual: 'The user wrote in this turn. If it was a question about the work, it is answered. Otherwise go on:',
  userMessage: `The user wrote in this turn. If it was a question about the work, it is answered; if the user asked in other words to pause or stop the autopilot, run \`wfk session run pause\` or \`wfk session run stop\` and end the turn. Otherwise go on:`,
  noProgress: (count: number) => `The last turn changed neither the plan nor HEAD (${count} of ${NO_PROGRESS_LIMIT}). Run \`${KIT_COMMAND} recover --format text\`, follow its next line and commit the task; if something blocks it, say what and run \`${KIT_COMMAND} task:block\`.`,
  blocked: `${NO_PROGRESS_LIMIT} ходов подряд без изменений плана и истории: запуск остановлен.`,
  blockedNext: 'Посмотрите ответы агента в чате, устраните препятствие и нажмите «Продолжить».',
  ciWait: (runId: string, digest: string) =>
    `If this delivery waits for CI of a pushed commit, write { "runId": "${runId}", "actionId": "ci:<sha>", "stage": "pushed", "targetSha": "<full sha>", "ciPolicyDigest": "${digest}", "waitReason": "<what runs>" } to .harness/inputs/progress.json, run \`wfk session progress --input .harness/inputs/progress.json\` and end the turn: Workflow Kit checks the required jobs on GitHub itself and tells you the result.`,
} as const;

export function createRunTurns(deps: { journal: RunJournal; projectPath(projectId: string): Promise<string | undefined>; log?: (line: string) => void }) {
  const log = deps.log ?? (() => undefined);

  return {
    /** The started run of the project whose owner is this session, or null (no run, other owner, not started). */
    async live(projectId: string, key: string): Promise<LiveRun | null> {
      const folder = await deps.projectPath(projectId);
      if (!folder) return null;
      const run = await deps.journal.active(folder).catch(() => null);
      if (!run || run.owner.key !== key || !STARTED.has(run.phase)) return null;
      const barrier: AutopilotReason | null = run.phase === 'paused' ? 'run-paused' : run.phase === 'blocked' ? 'run-blocked' : null;
      return { run, folder, barrier };
    },

    /** The run's word on the shared decision of a finished turn of its owner. */
    async turn(live: LiveRun, decision: AutopilotDecision, status: AutopilotProjectStatus, userMessage: boolean, granted = true): Promise<RunTurnDecision> {
      const { run, folder } = live;
      if (run.wait) {
        const reason = run.wait.reason === 'ci' ? 'waiting-for-ci' : 'waiting-for-question';
        return { action: 'stop', reason, detail: run.wait.detail };
      }
      if (decision.action === 'continue') {
        const phase = status.nextTask?.kind === 'delivery' ? 'delivering' : 'executing';
        if ((run.noProgress ?? 0) !== 0 || run.phase !== phase) await deps.journal.advance(folder, run.runId, (r) => ({ ...r, noProgress: 0, phase }));
        const ci = (status.authorization as { ci?: unknown } | null | undefined)?.ci;
        const wait = granted && phase === 'delivering' && ci ? ` ${TURN_TEXTS.ciWait(run.runId, hostInputDigest(ci))}` : '';
        const said = userMessage ? `${granted ? TURN_TEXTS.userMessage : TURN_TEXTS.userMessageManual} ` : '';
        return { action: 'continue', taskId: decision.taskId, text: `${said}${decision.text}${wait}${granted ? '' : ` ${TURN_TEXTS.noGrant}`}` };
      }
      if (decision.reason !== 'no-progress') return { action: 'stop', reason: decision.reason, detail: decision.detail };
      const count = (run.noProgress ?? 0) + 1;
      if (count < NO_PROGRESS_LIMIT) {
        await deps.journal.advance(folder, run.runId, (r) => ({ ...r, noProgress: count }));
        return { action: 'continue', taskId: status.nextTask?.id ?? '-', text: TURN_TEXTS.noProgress(count) };
      }
      await deps.journal.advance(folder, run.runId, (r) => ({ ...r, noProgress: count, phase: 'blocked', pausedFrom: r.phase, reason: 'agent-no-progress', nextAction: TURN_TEXTS.blockedNext }));
      log(`autopiloting: ${run.runId} blocked after ${count} turns without progress`);
      return { action: 'stop', reason: 'no-progress', detail: TURN_TEXTS.blocked };
    },
  };
}

export type RunTurns = ReturnType<typeof createRunTurns>;
