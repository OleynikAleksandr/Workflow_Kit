// The journal of autopiloting runs (spec M39 runtime section 1): one versioned JSON per run in
// the project, `.workflow-kit/local/autopiloting/<runId>.json` (git-ignored, written only by the
// service). Writes are atomic and serialized per project; a run survives a restart of the
// service, with the source of its authorization and the redeemed host tickets.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createKeyedMutex, readJsonFile, writeJsonAtomic } from '#data-store';
import type { AutopilotingMode } from './settings.ts';

export const RUNS_DIR = '.workflow-kit/local/autopiloting';

/** Where the user's instruction came from (spec M39 runtime 2). */
/** M48: `session-card` — the user switched the session's autopilot on its card. */
export type RunSource = 'panel-start' | 'user-command' | 'plan-decision' | 'panel-resume' | 'session-card';

export type RunPhase =
  | 'preparing'
  | 'reviewing'
  | 'choosing'
  | 'starting'
  | 'executing'
  | 'delivering'
  | 'verifying'
  | 'accepting'
  | 'closing'
  | 'publishing'
  | 'completed'
  | 'finished'
  | 'waiting'
  | 'paused'
  | 'blocked'
  | 'stopped';

/**
 * A run that no longer acts: completed (verified publication), stopped for good, or finished
 * because its scope is gone (M40: the user accepted and closed it by hand).
 */
export const FINAL_PHASES: ReadonlySet<RunPhase> = new Set(['completed', 'finished', 'stopped']);
/** M48: the phases of a run before its plan is started (the preparation of a full run). */
export const PRE_START: ReadonlySet<RunPhase> = new Set(['preparing', 'reviewing', 'choosing', 'starting']);

export interface RunRequest {
  source: RunSource;
  /** The exact words of the user's instruction (or the button the user pressed). */
  quote: string;
  /** When the user wrote or pressed it. */
  at: string;
  /** The provider's turn id of the prompt, when known. */
  turnId: string | null;
  /** One line: what the run is for. */
  goal: string;
}

export interface RunAuthority {
  /** The revision of the Kit grant (`scope.authorization.revision`). */
  grantRevision: number;
  deliveryTaskIds: string[];
  accept: boolean;
  close: boolean;
  publication: { branch: string; upstream: string } | null;
  acceptancePolicy: 'automatic' | 'manual';
  /** HEAD when the grant was written. */
  baseHead: string | null;
  revocation: { at: string; reason: 'settings-off' | 'user-stop'; resumable: boolean } | null;
}

export interface RunWait {
  reason: 'ci' | 'question';
  since: string;
  /** CI: the SHA, the action and the policy digest the agent reported (`wfk session progress`). */
  sha?: string;
  actionId?: string;
  stage?: string;
  detail: string;
}

export interface RunCompletion {
  ci: { remote: string; branch: string; requiredChecks: string[]; exactSha: boolean } | null;
  publication: { branch: string; upstream: string } | null;
  /** HEAD after the close commit of the run; null before the close. */
  finalSha: string | null;
  /** T009: the verified publication (commits pushed; `already` — the remote had the SHA). */
  published?: { sha: string; upstream: string; commits: number; already: boolean; at: string } | null;
  /** M48 T004: the plan publishes nothing (`automation.publication: null`); the run ended after the close. */
  local?: boolean;
}

export interface RunReceipt {
  /** Stable id of the action; a repeat finds it and adds nothing. */
  actionId: string;
  type: string;
  at: string;
  commit: string | null;
  detail: string;
}

export interface RunRecord {
  version: 1;
  runId: string;
  projectId: string;
  owner: { key: string; client: string; sessionId: string };
  mode: Exclude<AutopilotingMode, 'off'>;
  review: boolean;
  /** Grows with every change of the record. */
  revision: number;
  request: RunRequest;
  proposal: { scopeId: string; generation: number; digest: string } | null;
  scopeId: string | null;
  authority: RunAuthority | null;
  phase: RunPhase;
  /** The phase a waiting, paused or blocked run returns to. */
  pausedFrom: RunPhase | null;
  reason: string | null;
  nextAction: string | null;
  pendingAction: { actionId: string; type: string; stage: 'intent' | 'sent' } | null;
  receipts: RunReceipt[];
  /** Ids of the host tickets this run redeemed; restored after a restart. */
  tickets: string[];
  /** Finished turns in a row without progress (T007); absent in older files. */
  noProgress?: number;
  /** What the run waits for without spending attempts (T007): CI of a SHA, an agent's question. */
  wait?: RunWait | null;
  /** Failed attempts per action id and the time of the next one (T007, backoff 5/15/45 s). */
  retries?: Record<string, { count: number; nextAt: string; error: string }>;
  /**
   * T008: what the run finishes with, frozen at its acceptance — the CI policy and the target of
   * the grant (the grant disappears with the closed scope) and the final SHA of the close.
   */
  completion?: RunCompletion | null;
  /** M40: proposals without the `automation` block the run met (one is returned, the second stops it). */
  automationMissing?: number;
  /**
   * M41: the automatic acceptance could not prove the result at `head`; the run waits in
   * `accepting` for the user's acceptance and asks Kit again only after a new commit.
   */
  manualAcceptance?: { head: string; reason: string; since: string } | null;
  /** M41: the early warning that the automatic acceptance will lack some checks (written once). */
  notice?: { text: string; checks: string[]; at: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type NewRun = Omit<RunRecord, 'version' | 'runId' | 'revision' | 'receipts' | 'tickets' | 'createdAt' | 'updatedAt' | 'pendingAction'>;

const RUN_ID = /^run-[A-Za-z0-9_-]{6,64}$/;

export function newRunId(): string {
  return `run-${randomBytes(9).toString('base64url')}`;
}

function runFile(root: string, runId: string): string {
  if (!RUN_ID.test(runId)) throw new Error(`invalid run id: ${runId}`);
  return path.join(root, ...RUNS_DIR.split('/'), `${runId}.json`);
}

function valid(value: unknown): value is RunRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v['version'] === 1 && typeof v['runId'] === 'string' && RUN_ID.test(v['runId']) && typeof v['projectId'] === 'string' && typeof v['phase'] === 'string';
}

export interface RunJournal {
  create(root: string, run: NewRun): Promise<RunRecord>;
  read(root: string, runId: string): Promise<RunRecord | null>;
  /** Every readable run of the project, oldest first; broken files are skipped. */
  list(root: string): Promise<RunRecord[]>;
  /** The run of the project that still acts (not completed or stopped), or null. */
  active(root: string): Promise<RunRecord | null>;
  /** Changes a run under the project lock; `change` returns the new record or null to keep it. */
  update(root: string, runId: string, change: (run: RunRecord) => RunRecord | null): Promise<RunRecord>;
  /**
   * The change of an automatic step (M40): like `update`, but a barrier the user set meanwhile
   * stays. The result of the finished action is recorded (receipts, tickets, completion), while a
   * stopped run stays stopped and a paused run stays paused — it goes on from the new phase after
   * «Продолжить». A verified end of the run (a final phase) still ends a paused run.
   */
  advance(root: string, runId: string, change: (run: RunRecord) => RunRecord | null): Promise<RunRecord>;
  /** Serializes work on one project (the same lock the journal writes take). */
  locked<T>(root: string, action: () => Promise<T>): Promise<T>;
  /** T009: called after every write, whoever wrote (turns, control, waits, completion). */
  onChange(listener: (run: RunRecord) => void): void;
}

export function createRunJournal(options: { now?: () => Date; platform?: NodeJS.Platform } = {}): RunJournal {
  const now = options.now ?? (() => new Date());
  const mutex = createKeyedMutex();
  const writeOptions = { mode: 0o600, dirMode: 0o700, ...(options.platform ? { platform: options.platform } : {}) };
  // Locks are re-entrant within one call chain: an update inside `locked` must not wait for itself.
  const held = new AsyncLocalStorage<ReadonlySet<string>>();
  const listeners: Array<(run: RunRecord) => void> = [];
  const notify = (run: RunRecord): RunRecord => {
    for (const listener of listeners) {
      try {
        listener(run);
      } catch {
        // A listener never breaks a write.
      }
    }
    return run;
  };
  const withLock = async <T>(root: string, action: () => Promise<T>): Promise<T> => {
    const mine = held.getStore();
    if (mine?.has(root)) return action();
    return mutex.run(root, () => held.run(new Set([...(mine ?? []), root]), action));
  };

  async function read(root: string, runId: string): Promise<RunRecord | null> {
    const value = await readJsonFile(runFile(root, runId)).catch(() => undefined);
    return valid(value) ? value : null;
  }

  async function list(root: string): Promise<RunRecord[]> {
    let names: string[] = [];
    try {
      names = await readdir(path.join(root, ...RUNS_DIR.split('/')));
    } catch {
      return [];
    }
    const runs: RunRecord[] = [];
    for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
      const run = await read(root, name.slice(0, -5)).catch(() => null);
      if (run) runs.push(run);
    }
    return runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const update: RunJournal['update'] = (root, runId, change) =>
    withLock(root, async () => {
      const current = await read(root, runId);
      if (!current) throw new Error(`run not found: ${runId}`);
      const next = change(structuredClone(current));
      if (!next) return current;
      const record: RunRecord = { ...next, version: 1, runId, revision: current.revision + 1, updatedAt: now().toISOString() };
      await writeJsonAtomic(runFile(root, runId), record, writeOptions);
      return notify(record);
    });

  return {
    read,
    list,
    async active(root) {
      return (await list(root)).filter((run) => !FINAL_PHASES.has(run.phase)).at(-1) ?? null;
    },
    create(root, run) {
      return withLock(root, async () => {
        const at = now().toISOString();
        const record: RunRecord = { ...run, version: 1, runId: newRunId(), revision: 1, pendingAction: null, receipts: [], tickets: [], createdAt: at, updatedAt: at };
        await writeJsonAtomic(runFile(root, record.runId), record, writeOptions);
        return notify(record);
      });
    },
    update,
    advance(root, runId, change) {
      return update(root, runId, (current) => {
        const next = change(structuredClone(current));
        const stopped = FINAL_PHASES.has(current.phase);
        if (!next || next.phase === current.phase || !(stopped || current.phase === 'paused')) return next;
        if (!stopped && FINAL_PHASES.has(next.phase)) return next;
        const resumable = next.phase !== 'blocked' && next.phase !== 'paused' && !FINAL_PHASES.has(next.phase);
        return { ...next, phase: current.phase, pausedFrom: !stopped && resumable ? next.phase : current.pausedFrom, reason: current.reason, nextAction: current.nextAction };
      });
    },
    locked: withLock,
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
