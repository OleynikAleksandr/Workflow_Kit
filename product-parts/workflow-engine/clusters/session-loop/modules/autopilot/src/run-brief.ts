// The brief of a run for the panel (section `autopiloting` of /api/state, T009): the phase, the
// wait, the stop reason, the revision for the control buttons and the publication after the
// close — never the quotes of the user's words.
import type { RunRecord } from './run-journal.ts';

export interface RunBrief {
  runId: string;
  /** The record revision: `expectedRevision` of pause/resume/stop (T009). */
  revision: number;
  /** The session that owns the run (`client:id`). */
  owner: string;
  mode: RunRecord['mode'];
  phase: RunRecord['phase'];
  /** The phase a waiting, paused or blocked run returns to. */
  pausedFrom: RunRecord['phase'] | null;
  reason: string | null;
  nextAction: string | null;
  source: RunRecord['request']['source'];
  scopeId: string | null;
  review: boolean;
  /**
   * M44: the run holds the grant Kit wrote for it (`authority`, mirrored when the grant is
   * written and revoked); a working run without it is shown «Автопилот не получил разрешения Kit».
   */
  authorized: boolean;
  /** What the run waits for (CI of a SHA, an answer), without the agent's words. */
  wait: { reason: 'ci' | 'question'; detail: string; sha: string | null; since: string } | null;
  /** T008: the target and the final SHA after the close; `published` once the remote has it. */
  publication: { upstream: string | null; finalSha: string | null; published: string | null; commits: number | null; already: boolean; detail: string | null } | null;
  /** M41: why the automatic acceptance gave way to the user's, while the run waits for it. */
  manualAcceptance: { reason: string; since: string } | null;
  /** M41: the early warning about checks the automatic acceptance will lack. */
  notice: string | null;
  updatedAt: string;
}

export function brief(run: RunRecord): RunBrief {
  const published = [...run.receipts].reverse().find((receipt) => receipt.type === 'publish') ?? null;
  const completion = run.completion ?? null;
  return {
    runId: run.runId,
    revision: run.revision,
    owner: run.owner.key,
    mode: run.mode,
    phase: run.phase,
    pausedFrom: run.pausedFrom,
    reason: run.reason,
    nextAction: run.nextAction,
    source: run.request.source,
    scopeId: run.scopeId,
    review: run.review,
    authorized: Boolean(run.authority && !run.authority.revocation),
    wait: run.wait ? { reason: run.wait.reason, detail: run.wait.detail, sha: run.wait.sha ?? null, since: run.wait.since } : null,
    publication: completion || published
      ? { upstream: completion?.publication?.upstream ?? run.authority?.publication?.upstream ?? null, finalSha: completion?.finalSha ?? null, published: published?.commit ?? null, commits: completion?.published?.commits ?? null, already: completion?.published?.already ?? false, detail: published?.detail ?? null }
      : null,
    manualAcceptance: run.phase === 'accepting' && run.manualAcceptance ? { reason: run.manualAcceptance.reason, since: run.manualAcceptance.since } : null,
    notice: run.notice?.text ?? null,
    updatedAt: run.updatedAt,
  };
}
