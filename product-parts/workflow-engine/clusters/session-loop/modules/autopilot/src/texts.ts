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
const CODEX_EXECUTOR_HOWTO =
  'For each assignment: `git worktree add --detach .workflow-kit/local/worktrees/<assignment id> <baseCommit>` ' +
  '(baseCommit from the assignment:create output); start a subagent with spawn_agent, give it the brief and the line ' +
  '"Your worktree is <absolute path>; run every command with that workdir"; independent assignments may run in parallel ' +
  '(up to maxWorkers); wait for the SHA (wait_agent), then `scripts/workflow integration:start --id <assignment id> --source <sha>`; ' +
  'Kit removes the worktree after the integration.';

/** How a Claude orchestrator runs an executor. */
const CLAUDE_EXECUTOR_HOWTO =
  'For each assignment start a subagent with the Agent tool and isolation: "worktree", give it the brief from assignment:create; ' +
  'independent assignments may run in parallel (up to maxWorkers); integrate the SHA it replies with ' +
  '`scripts/workflow integration:start --id <assignment id> --source <sha>`.';

/**
 * How a Kimi Code orchestrator runs an executor (spec M10 section 2.2): like Codex the orchestrator
 * makes the worktree; the Agent tool has no isolation, so the subagent works in it through the cwd
 * of Bash and absolute paths. In the foreground: the SHA is needed in this turn.
 */
const KIMI_EXECUTOR_HOWTO =
  'For each assignment: `git worktree add --detach .workflow-kit/local/worktrees/<assignment id> <baseCommit>` ' +
  '(baseCommit from the assignment:create output); start a subagent with the Agent tool in the foreground (no run_in_background), ' +
  'give it the brief and the line "Your worktree is <absolute path>; pass it as cwd to every Bash call and use absolute paths ' +
  'inside it for Read, Edit and Write"; independent assignments go as several Agent calls in one message (up to maxWorkers); ' +
  'do not use AgentSwarm; then `scripts/workflow integration:start --id <assignment id> --source <sha>` with the SHA the subagent ' +
  'replies with; Kit removes the worktree after the integration.';

/**
 * The executor procedure of every provider whose sessions may orchestrate, by provider id — the
 * only place that knows them. `repeat`: the autopilot adds the procedure to every continue of an
 * orchestrated scope (the app does not keep it in mind between turns).
 */
export const EXECUTOR_HOWTO: Readonly<Record<string, { text: string; repeat: boolean }>> = Object.freeze({
  claude: { text: CLAUDE_EXECUTOR_HOWTO, repeat: false },
  codex: { text: CODEX_EXECUTOR_HOWTO, repeat: true },
  // Kimi reads AGENTS.md only when its session starts: the procedure goes with every continue.
  kimi: { text: KIMI_EXECUTOR_HOWTO, repeat: true },
});

/** The executor procedure of the app of a session key ('<provider>:<id>'); '' when it has none. */
export function executorHowto(key: string): string {
  return EXECUTOR_HOWTO[key.slice(0, Math.max(0, key.indexOf(':')))]?.text ?? '';
}

/**
 * Added to the sequential texts of a session whose provider has no orchestration (spec M8
 * section 5; since M10 every provider of Kit has it): the agent must not start it by itself either.
 */
export function sequentialOnlyNote(client: string): string {
  return (
    ` Sessions of this app (${client}) run a scope only sequentially: orchestration is not started from here. ` +
    'Never run `scripts/workflow assignment:*` or `integration:*` and do not hand plan tasks to subagents in worktrees.'
  );
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
  'waiting-for-plan-decision': 'Ждёт решения о спецификации и плане',
  'waiting-for-review': 'Ревью плана: ждёт ответа ревьюера',
  'waiting-for-main': 'Ревью плана: ждёт ответа основного агента',
};
