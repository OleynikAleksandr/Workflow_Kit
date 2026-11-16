// Texts of autopiloting runs (spec M39): the policy of a start for the panel (Russian, exact
// labels of the agreed specification) and the preparation instruction for the agent (English).
import type { RunRecord } from './run-journal.ts';
import type { AutopilotingMode } from './settings.ts';

export const POLICY_TEXTS = {
  off: 'Подготовка и выполнение с ручными действиями пользователя.',
  'after-start': 'Вы запускаете готовый план, Kit доводит работу до публикации.',
  full: 'Вы согласовываете задачу, Kit готовит план, запускает выполнение и доводит работу до публикации.',
  legacy: 'Для этого плана: ручное подтверждение выпуска, приёмки, закрытия и публикации — нет описания автоматизации.',
  manual: (criteria: readonly number[]): string =>
    `Остановится на приёмке: требуется ручная проверка критери${criteria.length === 1 ? 'я' : 'ев'} ${criteria.join(', ')}. После вашей приёмки Kit закроет план и опубликует результат.`,
} as const;

/** What the agent does after `wfk session plan --authorized` (it continues the same turn). */
export function preparationText(policy: AutopilotingMode | 'kit-update-required', review: boolean, runId: string | null): string {
  const propose = 'write the specification and the plan, then run `scripts/workflow scope:propose --input <file.json> --recommended <mode> --reason "<why>"`';
  const reviewed = review ? 'The plan gets a cross review before it starts.' : 'The plan starts without a cross review (Settings).';
  if (policy === 'full') {
    return `Full autopilot: run ${runId} is registered by the user's direct instruction. Continue this turn without the plan question: ${propose}. ${reviewed} Do not choose the mode or start the plan yourself; Workflow Kit does it after the review.`;
  }
  if (policy === 'kit-update-required') {
    return `The user's instruction allows the preparation, but the project's Kit cannot autopilot (update Kit). Continue this turn: ${propose}, then end the turn; the user chooses the mode and starts the plan in the panel.`;
  }
  return `The user's instruction allows the preparation. Continue this turn without the plan question: ${propose}, then end the turn; the user chooses the mode and starts the plan in the panel. ${reviewed}`;
}

/** The note of the Kit grant: where the user's advance instruction came from (English, as Kit notes). */
export function grantNote(run: Pick<RunRecord, 'runId' | 'mode' | 'request'>): string {
  if (run.request.source === 'user-command') {
    return `Full autopilot run ${run.runId}: the user's direct instruction «${run.request.quote.slice(0, 200)}» (${run.request.at}) to prepare and carry out the plan`;
  }
  if (run.request.source === 'plan-decision') {
    return `Full autopilot run ${run.runId}: the user's answer «${run.request.quote}» on the plan question (${run.request.at})`;
  }
  return `The user pressed «Начать выполнение плана» with the autopiloting mode «${run.mode === 'full' ? 'Полный автопилот' : 'После ручного запуска Плана'}» (run ${run.runId})`;
}
