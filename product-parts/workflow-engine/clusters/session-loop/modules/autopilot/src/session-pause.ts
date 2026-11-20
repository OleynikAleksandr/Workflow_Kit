// M48 T001: the session card's off pauses the run that session owns. A live grant is revoked with
// the resumable reason Kit knows as settings-off («Продолжить» writes a new revision in the old
// boundaries); the run records the pause. Settings themselves pause nothing.
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit } from './run-kit.ts';

export const SESSION_OFF_NOTE = 'Session card: autopiloting off';

/** Pauses `run` (owned by the session whose card went off); returns the record written. */
export async function pauseForSessionOff(
  deps: { journal: Pick<RunJournal, 'advance'>; kit: Pick<RunKit, 'host'>; log: (line: string) => void; now?: () => Date },
  folder: string,
  run: RunRecord,
): Promise<RunRecord> {
  let revocation: NonNullable<RunRecord['authority']>['revocation'] = null;
  if (run.authority && !run.authority.revocation) {
    const step = await deps.kit.host(folder, {
      operation: 'autopilot:revoke',
      runId: run.runId,
      scopeId: run.scopeId ?? 'NONE',
      ownerSession: run.owner.sessionId,
      input: { note: SESSION_OFF_NOTE, reason: 'settings-off', runId: run.runId },
      file: false,
      args: (_file, revision) => ['autopilot:revoke', '--run', run.runId, '--reason', 'settings-off', '--note', SESSION_OFF_NOTE, '--expected-revision', String(revision)],
    });
    if (!step.ok) deps.log(`autopiloting: revoke of ${run.runId} failed: ${step.code} ${step.message}`);
    revocation = { at: (deps.now ?? (() => new Date()))().toISOString(), reason: 'settings-off', resumable: true };
    await deps.journal.advance(folder, run.runId, (r) => ({ ...r, tickets: step.redeemed ? [...r.tickets, step.ticketId] : r.tickets }));
  }
  return deps.journal.advance(folder, run.runId, (r) => ({
    ...r,
    phase: 'paused',
    pausedFrom: r.phase,
    reason: 'settings-off',
    nextAction: 'Нажмите «Продолжить», чтобы продолжить запуск в прежних границах.',
    authority: r.authority ? { ...r.authority, revocation: r.authority.revocation ?? revocation } : null,
  }));
}
