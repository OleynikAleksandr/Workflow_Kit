// Texts the service sends to agents (English, like the Harness texts) and the Kit notes that
// record the user's actions in the panel.
import type { KitChoiceOption } from '#plan-view';

/** Prefix of every message from the panel (the Kit section of AGENTS.md explains it). */
export const PREFIX = 'Workflow Kit:';

/** Kit --note of scope:choose: the user's action in words. */
export const CHOICE_NOTES: Readonly<Record<KitChoiceOption, string>> = {
  sequential: 'Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно',
  orchestrated: 'Выбор пользователя в панели Workflow Kit: оркестрация с исполнителями',
  refine: 'Выбор пользователя в панели Workflow Kit: сначала доработать спецификацию',
};

/** Right after the choice: the plan starts only with the panel button. */
export const CHOSEN_WAIT: Readonly<Record<'sequential' | 'orchestrated', string>> = {
  sequential: `${PREFIX} execution mode chosen: sequential. The user starts the plan with the "Начать выполнение плана" button in the panel; do not start tasks now, end your turn.`,
  orchestrated: `${PREFIX} execution mode chosen: orchestrated. The user starts the plan with the "Начать выполнение плана" button in the panel; do not start tasks now, end your turn.`,
};

/**
 * How a Codex orchestrator runs an executor: Kit prints the brief but makes no worktree (Claude's
 * Agent tool makes one with isolation), so the orchestrator makes it (M3 orchestration, 2-3).
 */
export const CODEX_EXECUTOR_HOWTO =
  'For each assignment: `git worktree add --detach .workflow-kit/local/worktrees/<assignment id> <baseCommit>` ' +
  '(baseCommit from the assignment:create output); start a subagent with spawn_agent, give it the brief and the line ' +
  '"Your worktree is <absolute path>; run every command with that workdir"; independent assignments may run in parallel ' +
  '(up to maxWorkers); wait for the SHA (wait_agent), then `scripts/workflow integration:start --id <assignment id> --source <sha>`; ' +
  'Kit removes the worktree after the integration.';

/** How a Claude orchestrator runs an executor. */
export const CLAUDE_EXECUTOR_HOWTO =
  'For each assignment start a subagent with the Agent tool and isolation: "worktree", give it the brief from assignment:create; ' +
  'independent assignments may run in parallel (up to maxWorkers); integrate the SHA it replies with ' +
  '`scripts/workflow integration:start --id <assignment id> --source <sha>`.';

/** The executor procedure of the app of a session key (claude:… or codex:…). */
export function executorHowto(key: string): string {
  return key.startsWith('codex:') ? CODEX_EXECUTOR_HOWTO : CLAUDE_EXECUTOR_HOWTO;
}

/** "Начать выполнение плана": the Harness mode texts. */
export const START_MESSAGES: Readonly<Record<'sequential' | 'orchestrated', string>> = {
  orchestrated: `${PREFIX} the user started the plan. Execution mode: orchestrated. You are the orchestrator: do not implement the work and DOCS tasks yourself (QUALITY and delivery tasks you run yourself in main). Hand out the tasks with \`scripts/workflow assignment:next\` and \`scripts/workflow assignment:create --task <ID>\` to subagents of your app, check their results and integrate them.`,
  sequential: `${PREFIX} the user started the plan. Execution mode: sequential. Execute the plan yourself task by task, starting now with the first task: run \`scripts/workflow task:start <ID>\`, implement it and commit with \`scripts/workflow commit --task <ID>\`.`,
};

export const REFINE_MESSAGE = `${PREFIX} I want to refine the specification first. Discuss it with me, then propose the scope again with \`scripts/workflow scope:propose\`.`;

export const RESUME_MESSAGE = `${PREFIX} the user resumed the plan (pause is off). Continue with the next task of the plan.`;

export function fixesMessage(text: string): string {
  return `${PREFIX} the user asks for fixes before accepting the result:\n\n${text}\n\nRecord the defects as a fixes round with \`scripts/workflow plan:extend\`, then carry it out.`;
}

export function deliveryMessage(taskId: string, words: string): string {
  return `${PREFIX} the user confirms the delivery task ${taskId}: "${words}". Run \`scripts/workflow task:start ${taskId} --confirmed "${words.replace(/"/g, "'")}"\` and carry it out.`;
}

/** Russian labels of stop reasons for the panel. */
export const STOP_LABELS: Readonly<Record<string, string>> = {
  blocked: 'План остановлен',
  'delivery-confirmation': 'Ждёт подтверждения выпуска',
  disabled: 'Автопилот выключен',
  limit: 'Достигнут предел в 40 продолжений подряд',
  'no-progress': 'Ход не изменил ни план, ни историю',
  'no-scope': 'Нет активного плана',
  paused: 'Пауза',
  'ready-for-acceptance': 'Ждёт приёмки',
  'transaction-pending': 'Незавершённая транзакция или проверка Kit',
  'turn-error': 'Ход прерван',
  'user-message': 'Вы написали в чат — автопилот уступил ход',
  'waiting-for-executors': 'Ждёт исполнителей',
  'waiting-for-mode-choice': 'Ждёт выбора пути',
  'waiting-for-plan-start': 'Ждёт «Начать выполнение плана»',
  'waiting-for-review': 'Ревью плана: ждёт ответа ревьюера',
  'waiting-for-main': 'Ревью плана: ждёт ответа основного агента',
};
