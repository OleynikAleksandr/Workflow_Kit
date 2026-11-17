// Why «Обновить Kit» waits (spec M41 2.3): a Kit commit in the middle of a plan changes the process
// and makes the CI evidence of the acceptance unusable, and a commit after the close stops the
// publication of the verified SHA (`head-changed`). The facts are read fresh on every call: the
// open scope from Kit's own `status`, the run that still acts from the run journal.
import type { KitOutcome } from '#kit-runner';

export type KitDeferralCode = 'scope-open' | 'run-active';

export interface KitDeferral {
  code: KitDeferralCode;
  scopeId: string | null;
  runId: string | null;
}

export interface DeferralSources {
  /** Kit's `status` of the project folder; a failure (no Kit yet) defers nothing. */
  status(root: string): Promise<KitOutcome<{ scope: { id: string } | null }>>;
  /** The autopiloting run of the project that is not completed, finished or stopped. */
  activeRun?(root: string): Promise<{ runId: string; scopeId: string | null } | null>;
}

/** The refusal text of the update (409 and the error of a background update). */
export function deferralText(deferral: KitDeferral): string {
  return deferral.code === 'scope-open'
    ? `Обновление Kit — после закрытия плана «${deferral.scopeId ?? ''}»: коммит Kit посреди плана меняет процесс и делает CI-доказательство приёмки непригодным`
    : `Обновление Kit — после публикации запуска ${deferral.runId ?? ''}: новый коммит остановил бы публикацию проверенного SHA (head-changed)`;
}

/** The deferral of one project folder: an open scope first, then a run that still acts. */
export function kitDeferral(sources: DeferralSources): (root: string) => Promise<KitDeferral | null> {
  return async (root) => {
    const status = await sources.status(root).catch(() => null);
    const scopeId = status?.ok ? (status.result.scope?.id ?? null) : null;
    if (scopeId) return { code: 'scope-open', scopeId, runId: null };
    const run = sources.activeRun ? await sources.activeRun(root) : null;
    return run ? { code: 'run-active', scopeId: run.scopeId, runId: run.runId } : null;
  };
}
