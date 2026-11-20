// M44 3.3: the agent learns about changes no later than its next hook. A change of a run's state
// (grant written, blocked, paused, stopped, ended) and, M48, the user's change of the session's own
// autopilot card put one English ASCII line into the queue of the session concerned without waking
// it; the queue is delivered by the next UserPromptSubmit (with the user's message) or Stop hook.
// The same line twice in a row for a session is not queued again. A Settings change tells nobody:
// Settings are the defaults of new sessions only (M48).
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { SessionAutopiloting, SessionSettingsChange } from './session-settings.ts';
import { PREFIX } from './texts.ts';

/** The longest reason a notice keeps. */
const REASON_MAX = 160;
/** Phases of a started run that is going on. */
const RUNNING: ReadonlySet<RunRecord['phase']> = new Set(['executing', 'delivering', 'verifying', 'accepting', 'closing', 'publishing', 'waiting']);

export const NOTICE_TEXTS = {
  session: (settings: Pick<SessionAutopiloting, 'mode' | 'review'>) => `${PREFIX} the autopilot of this session changed: mode=${settings.mode}, review=${settings.review ? 'on' : 'off'}.`,
  run: (runId: string, state: string) => `${PREFIX} autopilot run ${runId}: ${state}.`,
} as const;

/** The ASCII part of a reason (a Kit code and its English text); a Russian hint is cut. */
export function asciiNoticeReason(reason: string | null): string {
  const text = (reason ?? '').replace(/\s+/gu, ' ').trim();
  const cut = text.search(/[^\x20-\x7e]/u);
  const ascii = (cut === -1 ? text : text.slice(0, cut)).replace(/[\s:;,(-]+$/u, '').trim();
  if (ascii === '') return 'see the Workflow Kit panel';
  return ascii.length > REASON_MAX ? `${ascii.slice(0, REASON_MAX - 3)}...` : ascii;
}

/**
 * The state of a run the agent is told about, or null for a state that is no news (the
 * preparation before the grant, a phase change of a granted run).
 */
export function runNoticeState(run: RunRecord): string | null {
  if (run.phase === 'completed') return run.completion?.local ? 'completed (the result stays local: the plan has no publication)' : 'completed (published)';
  if (run.phase === 'finished') return 'finished (the plan was closed)';
  if (run.phase === 'stopped') return `stopped (${asciiNoticeReason(run.reason)})`;
  if (run.phase === 'paused') return 'paused';
  if (run.phase === 'blocked') return `blocked (${asciiNoticeReason(run.reason)})`;
  if (RUNNING.has(run.phase) && run.authority && !run.authority.revocation) {
    return run.manualAcceptance ? "authorized; waiting for the user's acceptance" : 'authorized: the Kit grant is live';
  }
  return null;
}

export interface AgentNoticesDeps {
  journal: Pick<RunJournal, 'onChange'>;
  /** M48: the user's change of a session's autopilot card, told to that session alone. */
  sessions?: { onChange(listener: (change: SessionSettingsChange) => Promise<void> | void): () => void };
  /** Queues the text for the session without waking it. */
  enqueue(projectId: string, key: string, text: string): void;
  log?: (line: string) => void;
}

/** Wires the notices; returns the function that stops them (tests). */
export function createAgentNotices(deps: AgentNoticesDeps): { close(): void } {
  const log = deps.log ?? (() => undefined);
  const lastText = new Map<string, string>();
  const lastState = new Map<string, string>();
  const tell = (projectId: string, key: string, text: string): void => {
    if (lastText.get(key) === text) return;
    lastText.set(key, text);
    deps.enqueue(projectId, key, text);
    log(`autopiloting: notice for ${key}: ${text}`);
  };

  deps.journal.onChange((run) => {
    const state = runNoticeState(run);
    if (!state || lastState.get(run.runId) === state) return;
    lastState.set(run.runId, state);
    tell(run.projectId, run.owner.key, NOTICE_TEXTS.run(run.runId, state));
  });

  const off = deps.sessions?.onChange(({ projectId, key, before, after }) => {
    if (before.mode === after.mode && before.review === after.review) return;
    tell(projectId, key, NOTICE_TEXTS.session(after));
  });
  return { close: () => off?.() };
}
