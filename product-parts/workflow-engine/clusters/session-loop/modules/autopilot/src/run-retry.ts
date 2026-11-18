// M44: the checks of «Повторить» (the panel asks Kit again for the grant of a run that has none):
// exactly the run and revision of the card, and the facts of the plan the grant is asked for.
import { WorkflowActionError } from './autopilot-types.ts';
import type { RunJournal, RunRecord, RunSource } from './run-journal.ts';
import type { RunKitStatus, RunScope } from './run-kit.ts';

const fail = (code: string, message: string, status = 409, nextAction: string | null = null): never => {
  throw new WorkflowActionError(code, message, status, nextAction);
};

/** The active run the card names, at the revision the card shows (404 run-not-found, 409 run-stale). */
export async function retryTarget(journal: Pick<RunJournal, 'active'>, folder: string, input: unknown): Promise<RunRecord> {
  const body = (input && typeof input === 'object' ? input : {}) as { runId?: unknown; expectedRevision?: unknown };
  const run = await journal.active(folder);
  if (!run || run.runId !== body.runId) return fail('run-not-found', 'Этого запуска автопилота больше нет', 404);
  if (body.expectedRevision !== run.revision) return fail('run-stale', 'Запуск изменился: обновите панель', 409);
  return run;
}

/** The plan of the run as Kit has it now; 409 scope-changed when it is not chosen or another one. */
export function grantFacts(run: RunRecord, status: RunKitStatus | null, scope: RunScope | null): { status: RunKitStatus; scope: RunScope } {
  if (run.scopeId === null) return fail('scope-changed', 'План запуска ещё не выбран', 409, 'Дождитесь выбора способа выполнения.');
  if (!status?.proposal || !scope?.automation || scope.id !== run.scopeId) {
    return fail('scope-changed', 'План изменился: прежний запуск автопилота нельзя продолжить', 409, 'Запустите план заново.');
  }
  return { status, scope };
}

/** The source of a repeated grant: the run's own (Kit takes `panel-resume` only for a granted run). */
export function retrySource(run: RunRecord): RunSource {
  return run.request.source === 'panel-resume' ? 'panel-start' : run.request.source;
}
