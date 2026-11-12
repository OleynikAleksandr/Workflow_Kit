import {
  type AssignmentStatus,
  workflowAssignmentFacade,
} from "../../workflow-assignment/src/workflow-assignment-facade.js";
import { workflowExecutionModeFacade } from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import {
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { workflowPlatformFacade } from "../../workflow-platform/src/workflow-platform-facade.js";
import { KIT_COMMAND, type RecoveryInput, shortSha } from "./recovery-model.js";

/** The agent role of a session, derived from Kit facts (spec section 9). */
export type AgentRole = "executor" | "orchestrator" | "planning" | "self";

/** One assignment record of the main checkout, as recovery shows it. */
export interface RoleAssignment {
  cleanupPending: boolean;
  id: string;
  scopeId: string;
  sourceCommit: string | null;
  status: AssignmentStatus;
  taskId: string;
  worktree: string | null;
}

/** Kit facts that decide the role and its next step. */
export interface RoleFacts {
  /** Main checkout of an orchestrated scope: active records and pending cleanups. */
  assignments: RoleAssignment[];
  /** The assignment of this executor worktree; null in main. */
  executor: {
    id: string;
    status: AssignmentStatus | null;
    taskId: string;
  } | null;
  /** `config.host` is `harness`: new scopes go through `scope:propose`. */
  harness: boolean;
  /** The integration journal of main (`integration:start`), if any. */
  integration: { assignmentId: string; phase: string } | null;
  /** The open scope proposal (no scope yet). */
  proposal: {
    generation: number;
    recommended: string;
    refining: boolean;
  } | null;
  /** A linked worktree of an orchestrated scope without `assignment:attach`. */
  unattachedWorktree: boolean;
}

const LIST_LIMIT = 10;
const INTEGRATION_JOURNAL = "integration.json";

const ROLE_RULES: Readonly<Record<AgentRole, string>> = {
  executor:
    "Role executor: work only in this worktree and only on paths equal to or nested in the task files. Never touch main, the plan or other tasks; no nested executors; no push.",
  orchestrator:
    'Role orchestrator: work and DOCS tasks go to executors (`assignment:create`, a Claude subagent with isolation: "worktree"), their SHAs to `integration:start`; never implement them in main. Run QUALITY and delivery yourself in main. On CONFLICT or CHECKS_FAILED fix within the task files, then `integration:continue --id <id>`.',
  planning:
    "Role planning: write the specification and a plan with parallelSafe labels; no functional changes before the scope exists. After proposing, end the turn until the user chooses.",
  self: "Role self: run the tasks in order in main (task:start, work, commit --task). Helper subagents work in main without their own worktree and never commit; no assignments.",
};

function emptyFacts(harness: boolean): RoleFacts {
  return {
    assignments: [],
    executor: null,
    harness,
    integration: null,
    proposal: null,
    unattachedWorktree: false,
  };
}

function orchestrated(plan: WorkflowPlan): boolean {
  return (
    plan.scope !== null &&
    workflowPlanFacade.execution(plan).strategy === "orchestrated"
  );
}

/**
 * Reads the integration journal written by `integration:start`; an
 * unreadable journal still counts as an integration in progress.
 */
function readIntegration(
  git: WorkflowGitFacade,
  root: string
): RoleFacts["integration"] {
  const text = workflowPlatformFacade.readTextIfExists(
    git.localPath(root, INTEGRATION_JOURNAL)
  );
  if (text === null) {
    return null;
  }
  try {
    const journal = JSON.parse(text) as Record<string, unknown>;
    const id = journal.assignmentId ?? journal.id;
    return {
      assignmentId: typeof id === "string" ? id : "<id>",
      phase: typeof journal.phase === "string" ? journal.phase : "UNKNOWN",
    };
  } catch {
    return { assignmentId: "<id>", phase: "UNKNOWN" };
  }
}

function mainAssignments(root: string, plan: WorkflowPlan): RoleAssignment[] {
  return workflowAssignmentFacade
    .list(root)
    .filter(
      (record) =>
        (record.scopeId === plan.scope?.id &&
          workflowAssignmentFacade.isActive(record)) ||
        record.cleanup?.status === "PENDING"
    )
    .map((record) => ({
      cleanupPending: record.cleanup?.status === "PENDING",
      id: record.id,
      scopeId: record.scopeId,
      sourceCommit: record.sourceCommit,
      status: record.status,
      taskId: record.taskId,
      worktree: record.worktree,
    }));
}

function isLinkedWorktree(git: WorkflowGitFacade, root: string): boolean {
  try {
    workflowAssignmentFacade.locateWorktree(git, root);
    return true;
  } catch {
    return false;
  }
}

/** Gathers the role facts of a checkout; problems become warnings. */
export function gatherRoleFacts(
  git: WorkflowGitFacade,
  root: string,
  plan: WorkflowPlan,
  harness: boolean,
  warnings: string[]
): RoleFacts {
  const facts = emptyFacts(harness);
  try {
    const record = workflowAssignmentFacade.worktreeRecord(root);
    if (record) {
      const main = workflowAssignmentFacade.read(record.mainRoot, record.id);
      facts.executor = {
        id: record.id,
        status: main?.status ?? null,
        taskId: record.taskId,
      };
      return facts;
    }
    if (plan.scope === null) {
      const proposal = workflowExecutionModeFacade.readProposal(root);
      facts.proposal = proposal && {
        generation: proposal.generation,
        recommended: proposal.recommended,
        refining: proposal.refining,
      };
      return facts;
    }
    if (orchestrated(plan)) {
      facts.unattachedWorktree = isLinkedWorktree(git, root);
      if (!facts.unattachedWorktree) {
        facts.assignments = mainAssignments(root, plan);
        facts.integration = readIntegration(git, root);
      }
    }
  } catch (error) {
    warnings.push(
      `Assignment state is unreadable (${(error as { code?: string }).code ?? "error"}); run \`${KIT_COMMAND} assignment:status\` or \`${KIT_COMMAND} doctor\`.`
    );
  }
  return facts;
}

/** The role of the session; without gathered facts the plan alone decides. */
export function agentRole(input: RecoveryInput): AgentRole {
  const facts = input.roles;
  if (facts?.executor || facts?.unattachedWorktree) {
    return "executor";
  }
  if (input.plan.scope === null) {
    return "planning";
  }
  return orchestrated(input.plan) ? "orchestrator" : "self";
}

export function roleRule(role: AgentRole): string {
  return ROLE_RULES[role];
}

/** At most LIST_LIMIT items, then a "… N more" item. */
function bounded(items: readonly string[]): string[] {
  const shown = items.slice(0, LIST_LIMIT);
  return items.length > LIST_LIMIT
    ? [...shown, `… ${items.length - LIST_LIMIT} more`]
    : shown;
}

function assignmentLine(record: RoleAssignment): string {
  const place = record.worktree ?? "not attached";
  const cleanup = record.cleanupPending ? ", cleanup PENDING" : "";
  return `${record.id} ${record.taskId} ${record.status} ${place}${cleanup}`;
}

/** `role:` and the assignment lines of the state section. */
export function roleStateLines(input: RecoveryInput): string[] {
  const role = agentRole(input);
  const facts = input.roles;
  if (role === "executor") {
    return facts?.executor
      ? [
          `role: executor (assignment ${facts.executor.id}, task ${facts.executor.taskId}, ${facts.executor.status ?? "no main record"})`,
        ]
      : ["role: executor (not attached)"];
  }
  if (role !== "orchestrator" || !facts) {
    return [`role: ${role}`];
  }
  const shown = bounded(facts.assignments.map(assignmentLine));
  return [
    "role: orchestrator",
    `assignments: ${shown.length === 0 ? "none" : ""}`.trimEnd(),
    ...shown.map((line) => `- ${line}`),
    `integration: ${facts.integration ? `${facts.integration.assignmentId} ${facts.integration.phase}` : "none"}`,
  ];
}

/** The planning step: propose the plan, or wait for the user's choice. */
export function planningStep(input: RecoveryInput): string {
  const proposal = input.roles?.proposal;
  if (proposal && !proposal.refining) {
    return `No active scope: the scope proposal (generation ${proposal.generation}, recommended ${proposal.recommended}) is waiting for the user's choice on the card. End the turn; do not create the scope yourself.`;
  }
  const propose = `\`${KIT_COMMAND} scope:propose --input <plan.json> --recommended sequential|orchestrated --reason "<why>"\`, then end the turn and wait for the user's choice on the card`;
  if (proposal?.refining) {
    return `No active scope: the user chose to refine the specification. Discuss it, update the spec and the plan, then propose again: ${propose}.`;
  }
  return input.roles?.harness
    ? `No active scope. Agree the task with the user, write the specification and a plan with parallelSafe labels, then ${propose}.`
    : `No active scope. Agree the task with the user, write the specification and the plan, then \`${KIT_COMMAND} scope:create --input <plan.json>\`.`;
}

function commitCommand(task: WorkflowTask): string {
  return task.kind === "docs"
    ? `\`${KIT_COMMAND} commit --task ${task.id} --digest <file.json>\``
    : `\`${KIT_COMMAND} commit --task ${task.id}\``;
}

/** The executor step: attach, set up, run the one task, report its SHA. */
export function executorStep(input: RecoveryInput): string {
  const executor = input.roles?.executor;
  if (!executor) {
    return `Executor worktree not attached: run \`${KIT_COMMAND} assignment:attach <id>\` with the assignment id from your brief first.`;
  }
  const task = input.plan.tasks.find((item) => item.id === executor.taskId);
  if (!task) {
    return `Task ${executor.taskId} is not in this worktree's plan: report it to the orchestrator.`;
  }
  if (task.status === "DONE") {
    const sha = input.taskCommits[task.id];
    return `Task ${task.id} is committed${sha ? ` (${sha})` : ""}: report the SHA to the orchestrator and end the turn.`;
  }
  if (task.status === "IN_PROGRESS") {
    return `Continue ${task.id}: ${task.title}. Commit with ${commitCommand(task)}, then report the SHA.`;
  }
  if (executor.status === "NEEDS_SETUP") {
    return `The worktree needs setup: run \`${KIT_COMMAND} assignment:setup\`, then \`${KIT_COMMAND} task:start ${task.id}\`.`;
  }
  return `Start ${task.id} via \`${KIT_COMMAND} task:start ${task.id}\`: ${task.title}. Then commit with ${commitCommand(task)} and report the SHA.`;
}

function integrationStep(
  integration: NonNullable<RoleFacts["integration"]>
): string {
  const id = integration.assignmentId;
  const resume = `\`${KIT_COMMAND} integration:continue --id ${id}\``;
  if (integration.phase === "CONFLICT") {
    return `Integration of ${id} stopped on CONFLICT: resolve the conflicts within the task files, then ${resume}.`;
  }
  if (integration.phase === "CHECKS_FAILED") {
    return `Integration of ${id} failed its checks: fix the cause within the task files, then ${resume}.`;
  }
  return `Integration of ${id} is ${integration.phase}: finish it with ${resume} before anything else (\`${KIT_COMMAND} integration:status\` shows it).`;
}

/** QUALITY or delivery task the orchestrator runs itself, when it is ready. */
function ownStep(plan: WorkflowPlan, facts: RoleFacts): string | null {
  const done = new Set(
    plan.tasks.filter((task) => task.status === "DONE").map((task) => task.id)
  );
  const own = plan.tasks.find(
    (task) =>
      task.status === "TODO" &&
      (task.kind === "quality" || task.kind === "delivery") &&
      task.dependencies.every((id) => done.has(id))
  );
  if (!own) {
    return null;
  }
  if (own.kind === "quality") {
    return `Run ${own.id} yourself in main via \`${KIT_COMMAND} task:start ${own.id}\`: ${own.title}`;
  }
  const pending = plan.tasks.some(
    (task) => task.kind !== "delivery" && task.status !== "DONE"
  );
  const active = facts.assignments.some((record) =>
    workflowAssignmentFacade.isActive(record)
  );
  return pending || active
    ? null
    : `Next task ${own.id} is delivery: ask the user to confirm it, then \`${KIT_COMMAND} task:start ${own.id} --confirmed "<user confirmation>"\`.`;
}

/**
 * The orchestrator step in main: an integration in progress, then results
 * to integrate, then its own tasks or tasks to hand out, otherwise waiting.
 */
export function orchestratorStep(input: RecoveryInput): string {
  const { plan } = input;
  const facts = input.roles ?? emptyFacts(false);
  if (facts.integration) {
    return integrationStep(facts.integration);
  }
  const lines: string[] = [];
  const results = facts.assignments.filter(
    (record) => record.status === "READY_FOR_INTEGRATION"
  );
  if (results.length > 0) {
    lines.push(
      "Integrate first, one at a time:",
      ...bounded(
        results.map(
          (record) =>
            `\`${KIT_COMMAND} integration:start --id ${record.id} --source ${shortSha(record.sourceCommit)}\` (task ${record.taskId})`
        )
      ).map((line) => `- ${line}`)
    );
  }
  const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
  const own = current
    ? `Continue ${current.id} in main: ${current.title}`
    : ownStep(plan, facts);
  if (own) {
    lines.push(own);
  }
  const ready = current
    ? []
    : workflowAssignmentFacade.schedule(plan, facts.assignments).ready;
  if (ready.length > 0) {
    lines.push(
      `Hand out ${ready.join(", ")}: for each, \`${KIT_COMMAND} assignment:create --task <ID>\`, then launch a Claude subagent (Agent tool with isolation: "worktree") with the returned brief and wait for its SHA (\`${KIT_COMMAND} assignment:next\` lists what can go now).`
    );
  }
  const running = facts.assignments.filter(
    (record) =>
      workflowAssignmentFacade.isActive(record) &&
      record.status !== "READY_FOR_INTEGRATION"
  );
  if (lines.length === 0 && running.length > 0) {
    lines.push(
      `Waiting for executors: ${bounded(running.map((record) => `${record.id} (${record.taskId}, ${record.status})`)).join(", ")}. Integrate each result when its SHA arrives.`
    );
  }
  const cleanups = facts.assignments.filter((record) => record.cleanupPending);
  if (cleanups.length > 0) {
    lines.push(
      `Finish cleanups: ${bounded(cleanups.map((record) => `\`${KIT_COMMAND} assignment:cleanup --id ${record.id}\``)).join(", ")}.`
    );
  }
  return lines.length > 0
    ? lines.join("\n")
    : "No task is ready: check dependencies with the user.";
}
