// M44 3.2: the one line about the autopilot a new agent session gets at its start (wfk hook
// session-start): the Settings mode and review and the state of the project's run, where the
// grant of the run in the Kit plan (autopilot:status) is the source of truth. ASCII only: the
// line goes through every hook dialect and every console code page unchanged.

/** The facts of the line: Settings and the active run of the project, if any. */
export interface AutopilotAgentState {
  mode: 'off' | 'after-start' | 'full';
  review: boolean;
  run: { runId: string; phase: string; reason: string | null; authorized: boolean } | null;
}

/** The line when the service did not answer in the hook's budget. */
export const AUTOPILOT_UNKNOWN_LINE = 'Workflow Kit autopilot: unknown (service not reachable).';
/** The longest reason the line keeps. */
const REASON_MAX = 160;
/** Phases of a run that ended: the project has no run for the agent. */
const FINAL = new Set(['completed', 'stopped']);
/** Phases before the plan was started: no grant is expected yet. */
const PREPARING = new Set(['preparing', 'reviewing', 'choosing', 'starting']);

/**
 * The ASCII part of a reason: a Kit code and its English text stay, a text in Russian (a hint
 * of the service) is cut at its first non-ASCII character; nothing left — the panel is named.
 */
export function asciiReason(reason: string | null): string {
  const text = (reason ?? '').replace(/\s+/gu, ' ').trim();
  const cut = text.search(/[^\x20-\x7e]/u);
  const ascii = (cut === -1 ? text : text.slice(0, cut)).replace(/[\s:;,(-]+$/u, '').trim();
  if (ascii === '') return 'see the Workflow Kit panel';
  return ascii.length > REASON_MAX ? `${ascii.slice(0, REASON_MAX - 3)}...` : ascii;
}

/** `none`, `<id> authorized (phase …)`, `<id> NOT authorized (…)`, `<id> paused` or `<id> blocked (…)`. */
export function runState(run: AutopilotAgentState['run']): string {
  if (!run || FINAL.has(run.phase)) return 'none';
  if (run.phase === 'paused') return `${run.runId} paused`;
  if (run.phase === 'blocked') return `${run.runId} blocked (${asciiReason(run.reason)})`;
  if (run.authorized) return `${run.runId} authorized (phase ${run.phase})`;
  if (PREPARING.has(run.phase)) return `${run.runId} NOT authorized yet (phase ${run.phase}${run.reason ? `: ${asciiReason(run.reason)}` : ''})`;
  return `${run.runId} NOT authorized (${run.reason ? asciiReason(run.reason) : `phase ${run.phase} without a Kit grant`})`;
}

/**
 * The line: `Workflow Kit autopilot: mode=full, review=off; run=<state>.` and, without a live
 * grant, the reminder that the Kit recovery packet's manual barriers apply.
 */
export function autopilotLine(state: AutopilotAgentState): string {
  const run = runState(state.run);
  const granted = Boolean(state.run && state.run.authorized && !FINAL.has(state.run.phase) && state.run.phase !== 'paused' && state.run.phase !== 'blocked');
  const manual = state.mode !== 'off' && !granted ? ' Without a live Kit grant every user decision stays manual: follow the next line of the Kit recovery packet.' : '';
  return `Workflow Kit autopilot: mode=${state.mode}, review=${state.review ? 'on' : 'off'}; run=${run}.${manual}`;
}
