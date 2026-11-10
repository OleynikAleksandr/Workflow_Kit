// The plan start under way (spec M11): a press of «Начать выполнение плана» whose work Kit has
// not recorded yet. The plan card shows its step instead of the button until the plan phase
// leaves `ready`; the step and the problems are read anew from the channel every time.
import { UNDELIVERED_NOTE } from '#agent-channel';
import type { AgentChannel } from '#agent-channel';
import type { WorkflowState } from '#kit-runner';
import { startProblemText } from './texts.ts';

/** How long the start message may wait for delivery before the start counts as failed (M11 2.2). */
export const START_DELIVERY_MS = 60_000;
/** After this time since the press a delivered start without Kit progress is shown as slow. */
export const START_SLOW_MS = 180_000;

/** Why a press of «Начать выполнение плана» did not start the plan (spec M11 2.2). */
export type StartProblemCode = 'not-delivered' | 'turn-ended';

/** The start of a session as the panel sees it (spec M11 2.1). */
export interface PlanStart {
  /** Time of the press (ISO). */
  at: string;
  messageId: string;
  /** sending — the message waits for delivery; delivered — the agent got it. */
  step: 'sending' | 'delivered';
  /** Delivered and START_SLOW_MS passed since the press: a hint, not a problem. */
  slow: boolean;
  problem: { code: StartProblemCode; text: string } | null;
}

interface StartRecord {
  projectId: string;
  at: number;
  messageId: string;
  problem: StartProblemCode | null;
}

export interface PlanStarts {
  begin(key: string, projectId: string, messageId: string): void;
  /** The view, or null; a start whose plan left `ready` is forgotten. */
  view(key: string): PlanStart | null;
  /**
   * Repeats a failed start whose message still waits: the wait starts anew, nothing is queued.
   * False when there is no such message (a new one must be sent).
   */
  restart(key: string): boolean;
  /**
   * A Stop of the session with the plan in `phase`: true (problem turn-ended) when the turn begun
   * by the delivered start message ended and the plan is still `ready`.
   */
  turnEnded(key: string, phase: string | null): boolean;
  forgetProject(projectId: string): void;
}

export function createPlanStarts(deps: { channel: AgentChannel; workflow: WorkflowState; now: () => Date }): PlanStarts {
  const records = new Map<string, StartRecord>();
  const waiting = (key: string, record: StartRecord): boolean => deps.channel.waiting(key, record.messageId);

  return {
    begin(key, projectId, messageId) {
      records.set(key, { projectId, at: deps.now().getTime(), messageId, problem: null });
    },

    view(key) {
      const record = records.get(key);
      if (!record) return null;
      const workflow = deps.workflow.get(record.projectId);
      if (workflow && workflow.plan?.phase !== 'ready') {
        records.delete(key);
        return null;
      }
      // An answer that was not sent puts the message back: the step is never remembered.
      const delivered = !waiting(key, record);
      const elapsed = deps.now().getTime() - record.at;
      let problem: PlanStart['problem'] = null;
      if (record.problem === 'turn-ended') {
        problem = { code: 'turn-ended', text: startProblemText('turn-ended') };
      } else if (!delivered) {
        const note = deps.channel.get(key)?.note ?? null;
        const refused = note !== null && note.startsWith(UNDELIVERED_NOTE);
        const reason = refused ? note.slice(UNDELIVERED_NOTE.length).replace(/^:\s*/, '') : '';
        if (refused || elapsed >= START_DELIVERY_MS) problem = { code: 'not-delivered', text: startProblemText('not-delivered', reason || null) };
      }
      return {
        at: new Date(record.at).toISOString(),
        messageId: record.messageId,
        step: delivered ? 'delivered' : 'sending',
        slow: delivered && problem === null && elapsed >= START_SLOW_MS,
        problem,
      };
    },

    restart(key) {
      const record = records.get(key);
      if (!record || !waiting(key, record)) return false;
      record.at = deps.now().getTime();
      record.problem = null;
      return true;
    },

    turnEnded(key, phase) {
      const record = records.get(key);
      if (!record) return false;
      if (phase !== null && phase !== 'ready') {
        records.delete(key);
        return false;
      }
      if (phase === null || waiting(key, record)) return false;
      record.problem = 'turn-ended';
      return true;
    },

    forgetProject(projectId) {
      for (const [key, record] of records) if (record.projectId === projectId) records.delete(key);
    },
  };
}
