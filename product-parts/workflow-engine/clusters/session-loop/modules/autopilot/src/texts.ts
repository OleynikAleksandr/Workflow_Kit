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

/** "Начать выполнение плана": the Harness mode texts. */
export const START_MESSAGES: Readonly<Record<'sequential' | 'orchestrated', string>> = {
  orchestrated: `${PREFIX} the user started the plan. Execution mode: orchestrated. You are the orchestrator: do not implement the tasks yourself. Hand out the tasks with \`scripts/workflow assignment:next\` and \`scripts/workflow assignment:create\` to Claude subagents started with isolation worktree, check their results and integrate them.`,
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
};
