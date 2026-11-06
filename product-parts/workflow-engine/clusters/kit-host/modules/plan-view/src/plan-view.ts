// Read models of the plan card and the execution-mode choice card, built from Kit `status` and
// `scope:proposal`. Ported rules of Harness buildPlanView: the parallel/sequential label exists
// only in orchestrated mode; a task is current when it is Kit's current task or, in orchestrated
// mode, when it has an assignment that is not integrated yet. The panel only renders the models.
import type { KitChoiceOption, KitProposal, KitStatus, KitStrategy, KitTask, KitTaskStatus } from './kit-types.ts';

/** Phase of the plan card. */
export type PlanPhase = 'ready' | 'running' | 'paused' | 'blocked' | 'acceptance' | 'accepted';
/** Actions the plan card offers in a phase (wired by session-loop and the panel). */
export type PlanAction = 'start' | 'pause' | 'resume' | 'accept' | 'request-fixes' | 'close';

export const PHASE_LABELS: Readonly<Record<PlanPhase, string>> = {
  ready: 'План готов',
  running: 'План выполняется',
  paused: 'Пауза',
  blocked: 'План остановлен',
  acceptance: 'План выполнен — проверьте результат',
  accepted: 'План принят',
};

const PHASE_ACTIONS: Readonly<Record<PlanPhase, readonly PlanAction[]>> = {
  ready: ['start'],
  running: ['pause'],
  paused: ['resume'],
  blocked: [],
  acceptance: ['accept', 'request-fixes'],
  accepted: ['close'],
};

/** Short state of a task row: not started, being worked on, in main. */
export type TaskState = 'todo' | 'run' | 'done';

export const TASK_STATE_LABELS: Readonly<Record<TaskState, string>> = {
  todo: 'Не начата',
  run: 'Выполняется',
  done: 'В main',
};

export const MODE_LABELS: Readonly<Record<KitStrategy, string>> = {
  sequential: 'Последовательно',
  orchestrated: 'Параллельно',
};

/** One task row of the plan card, in plan order. */
export interface PlanTaskView {
  id: string;
  title: string;
  kind: string;
  status: KitTaskStatus;
  state: TaskState;
  stateLabel: string;
  /** Kit's current task, or an orchestrated task an executor works on. */
  current: boolean;
  /** 'parallel' / 'sequential' in orchestrated mode; null in sequential mode. */
  label: 'parallel' | 'sequential' | null;
  labelText: string | null;
  /** Worktree of the executor working on the task (orchestrated), or null. */
  executorWorktree: string | null;
}

/** The plan card model. */
export interface PlanView {
  scopeId: string;
  objective: string;
  mode: KitStrategy;
  ownerSession: string | null;
  phase: PlanPhase;
  phaseLabel: string;
  blockedReason: string | null;
  progress: { done: number; total: number };
  /** "в main N из M". */
  progressLabel: string;
  revision: number;
  tasks: PlanTaskView[];
  actions: PlanAction[];
}

function taskState(status: KitTaskStatus, current: boolean): TaskState {
  if (status === 'DONE') return 'done';
  if (status === 'IN_PROGRESS' || current) return 'run';
  return 'todo';
}

function phaseOf(status: KitStatus): PlanPhase {
  const scope = status.scope!;
  if (scope.delivery === 'ACCEPTED') return 'accepted';
  if (scope.delivery === 'READY_FOR_ACCEPTANCE') return 'acceptance';
  if (scope.status === 'BLOCKED') return 'blocked';
  if (status.paused) return 'paused';
  const untouched = status.tasks.every((task) => task.status === 'TODO');
  return untouched && !status.currentTask && (status.assignments ?? []).length === 0 ? 'ready' : 'running';
}

function rowLabel(mode: KitStrategy, task: KitTask): PlanTaskView['label'] {
  if (mode !== 'orchestrated') return null;
  return task.parallelSafe ? 'parallel' : 'sequential';
}

/**
 * Builds the plan card from a Kit status. Null when Kit is not installed or no scope is active
 * (the card exists from the chosen plan until the scope is closed).
 */
export function buildPlanView(status: KitStatus | null): PlanView | null {
  if (!status || !status.installed || !status.scope) return null;
  const mode: KitStrategy = status.execution?.strategy === 'orchestrated' ? 'orchestrated' : 'sequential';
  const working = new Map<string, string | null>();
  if (mode === 'orchestrated') {
    for (const assignment of status.assignments ?? []) {
      if (assignment.status !== 'INTEGRATED') working.set(assignment.taskId, assignment.worktree ?? null);
    }
  }
  const tasks = status.tasks.map((task): PlanTaskView => {
    const current = task.id === status.currentTask?.id || working.has(task.id);
    const state = taskState(task.status, current);
    const label = rowLabel(mode, task);
    return {
      id: task.id,
      title: task.title,
      kind: task.kind,
      status: task.status,
      state,
      stateLabel: TASK_STATE_LABELS[state],
      current,
      label,
      labelText: label === null ? null : label === 'parallel' ? MODE_LABELS.orchestrated : MODE_LABELS.sequential,
      executorWorktree: working.get(task.id) ?? null,
    };
  });
  const phase = phaseOf(status);
  const { done, total } = status.progress;
  return {
    scopeId: status.scope.id,
    objective: status.scope.objective,
    mode,
    ownerSession: status.execution?.ownerSession ?? null,
    phase,
    phaseLabel: PHASE_LABELS[phase],
    blockedReason: status.scope.status === 'BLOCKED' ? status.scope.blockedReason : null,
    progress: { done, total },
    progressLabel: `в main ${done} из ${total}`,
    revision: status.revision,
    tasks,
    actions: [...PHASE_ACTIONS[phase]],
  };
}

/** One option of the choice card. */
export interface ChoiceOptionView {
  option: KitChoiceOption;
  title: string;
  description: string;
  recommended: boolean;
  /** Orchestration needs executor subagents in their own worktrees: Claude sessions only. */
  claudeOnly: boolean;
}

/** The execution-mode choice card. */
export interface ChoiceCard {
  generation: number;
  scopeId: string | null;
  objective: string | null;
  reason: string;
  recommended: KitStrategy;
  hasParallelWork: boolean;
  refining: boolean;
  /** Recommended first, then the other modes, "refine" last. */
  options: ChoiceOptionView[];
}

const OPTION_TEXT: Readonly<Record<KitChoiceOption, { title: string; description: string }>> = {
  orchestrated: {
    title: 'Оркестрация с исполнителями',
    description:
      'Сессия становится оркестратором, задачи выполняют исполнители в своих рабочих копиях, возможна параллельность.',
  },
  sequential: {
    title: 'Выполнить самому, последовательно',
    description: 'Эта сессия выполняет задачи по порядку. Меньше координации; для небольших и связанных задач.',
  },
  refine: {
    title: 'Сначала доработать спецификацию',
    description: 'Вернуться к обсуждению до плана.',
  },
};

function optionRank(option: KitChoiceOption, recommended: KitStrategy): number {
  if (option === recommended) return 0;
  return option === 'refine' ? 2 : 1;
}

/** Builds the choice card from `scope:proposal`; null when no proposal is open. */
export function buildChoiceCard(proposal: KitProposal | null): ChoiceCard | null {
  if (!proposal) return null;
  const options = [...new Set(proposal.options)]
    .filter((option): option is KitChoiceOption => option in OPTION_TEXT)
    .sort((a, b) => optionRank(a, proposal.recommended) - optionRank(b, proposal.recommended))
    .map((option): ChoiceOptionView => ({
      option,
      ...OPTION_TEXT[option],
      recommended: option === proposal.recommended,
      claudeOnly: option === 'orchestrated',
    }));
  return {
    generation: proposal.generation,
    scopeId: proposal.scopeId,
    objective: proposal.objective,
    reason: proposal.reason,
    recommended: proposal.recommended,
    hasParallelWork: proposal.hasParallelWork,
    refining: proposal.refining,
    options,
  };
}

/**
 * The options a session of a provider may choose: Codex sessions do not get orchestration (as in
 * Harness). When the recommended option is removed, nothing is marked recommended.
 */
export function choiceOptionsFor(card: ChoiceCard, provider: 'claude' | 'codex'): ChoiceOptionView[] {
  return provider === 'claude' ? card.options : card.options.filter((option) => !option.claudeOnly);
}
