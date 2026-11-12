import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  flag,
  type ParsedArgs,
  positional,
  requiredFlag,
} from "./kit-cli-args.js";
import type {
  AssignmentAttached,
  AssignmentCancelled,
  AssignmentCleanupResult,
  AssignmentCreated,
  AssignmentNext,
  AssignmentSetupResult,
  AssignmentState,
  WorkflowKitFacade,
} from "./workflow-kit-facade.js";

interface AssignmentCommandContext {
  args: ParsedArgs;
  kit: WorkflowKitFacade;
  root: string;
}

interface AssignmentCommandSpec {
  run: (context: AssignmentCommandContext) => unknown;
  text: (result: unknown) => string;
  usage: string;
}

function nextText(value: unknown): string {
  const result = value as AssignmentNext;
  if (result.idle !== null) {
    const why =
      result.idle === "NOT_ORCHESTRATED"
        ? "the scope is not orchestrated"
        : "the scope is not active";
    return `assignments: none (${result.idle}): ${why}.\n`;
  }
  const lines = [
    `assignments: scope ${result.scopeId ?? "NONE"}, ${result.active.length} of ${result.maxWorkers} workers active`,
  ];
  for (const record of result.active) {
    lines.push(`active: ${record.taskId} ${record.id} ${record.status}`);
  }
  for (const task of result.ready) {
    lines.push(
      `ready: ${task.id} — ${task.title} (${task.parallelSafe ? "parallel" : "sequential"})`
    );
  }
  for (const item of result.blocked) {
    lines.push(
      `blocked: ${item.taskId} ${item.code} (waits for ${item.blockedBy.join(", ") || "none"})`
    );
  }
  const first = result.ready[0];
  lines.push(
    first
      ? `next: scripts/workflow assignment:create --task ${first.id}`
      : "next: nothing to assign now; wait for the active assignments."
  );
  return `${lines.join("\n")}\n`;
}

function createText(value: unknown): string {
  const result = value as AssignmentCreated;
  const record = result.assignment;
  return [
    `assignment: ${record.id} for ${record.taskId}, base ${record.baseCommit.slice(0, 12)}, ${result.created ? "created" : "already assigned"}`,
    "next: start a Claude subagent with isolation worktree and give it this brief:",
    "",
    result.brief,
  ].join("\n");
}

function attachText(value: unknown): string {
  const result = value as AssignmentAttached;
  const record = result.assignment;
  return [
    `assignment: ${record.id} ${result.attached ? "attached" : "already attached"}, task ${record.taskId}, ${record.status}`,
    `worktree: ${record.worktree ?? "none"} (${record.branch ?? "detached"})`,
    `main: ${result.worktree.mainRoot}`,
    ...(result.planCommit
      ? [`plan commit: ${result.planCommit.slice(0, 12)}`]
      : []),
    record.status === "NEEDS_SETUP"
      ? "next: scripts/workflow assignment:setup (the worktree lacks the dependencies its checks need)"
      : `next: scripts/workflow task:start ${record.taskId}`,
    "",
  ].join("\n");
}

function setupText(value: unknown): string {
  const result = value as AssignmentSetupResult;
  const record = result.assignment;
  const setup = record.setup;
  return [
    `assignment: ${record.id} ${record.status}, ${
      result.ran && setup
        ? `set up with ${setup.command} (lock ${setup.lockHash.slice(0, 12)})`
        : "no dependencies to install"
    }`,
    ...(record.status === "READY"
      ? [`next: scripts/workflow task:start ${record.taskId}`]
      : []),
    "",
  ].join("\n");
}

function cleanupText(value: unknown): string {
  const result = value as AssignmentCleanupResult;
  if (result.assignments.length === 0) {
    return "cleanup: nothing to clean up.\n";
  }
  const lines = result.assignments.map((record) => {
    const cleanup = record.cleanup;
    return cleanup?.status === "PENDING"
      ? `cleanup: ${record.id} PENDING — ${cleanup.reason}`
      : `cleanup: ${record.id} DONE`;
  });
  if (
    result.assignments.some((record) => record.cleanup?.status === "PENDING")
  ) {
    lines.push(
      "next: resolve the reason (for example commit or remove the changes in the worktree), then scripts/workflow assignment:cleanup"
    );
  }
  return `${lines.join("\n")}\n`;
}

function cancelText(value: unknown): string {
  const result = value as AssignmentCancelled;
  const record = result.assignment;
  const task = result.task;
  return [
    `assignment: ${record.id} cancelled, task ${record.taskId} ${task?.status ?? "not in the plan"}`,
    `worktree: ${result.worktree === null ? "none" : `removed ${result.worktree}`}`,
    result.branch === null || result.branchTip === null
      ? "branch: none"
      : `branch: deleted ${result.branch} at ${result.branchTip.slice(0, 12)} (restore: git branch ${result.branch} ${result.branchTip})`,
    task?.status === "TODO"
      ? `next: scripts/workflow assignment:create --task ${task.id}`
      : "next: scripts/workflow assignment:next",
    "",
  ].join("\n");
}

function statusText(value: unknown): string {
  const result = value as AssignmentState;
  const task = result.task;
  return [
    `assignment: ${result.worktree.id} (${result.assignment?.status ?? "record missing in main"})`,
    `scope: ${result.scopeId ?? "NONE"}, base ${result.worktree.baseCommit.slice(0, 12)}, head ${result.head?.slice(0, 12) ?? "none"}`,
    task
      ? `task: ${task.id} ${task.status} — ${task.title}`
      : `task: ${result.worktree.taskId} missing`,
    ...(result.assignment?.sourceCommit
      ? [`source: ${result.assignment.sourceCommit}`]
      : []),
    "",
  ].join("\n");
}

/** The only commands of an attached executor worktree (spec 5.3). */
const EXECUTOR_COMMANDS = new Set([
  "assignment:attach",
  "assignment:setup",
  "assignment:status",
  "commit",
  "context",
  "recover",
  "repair",
  "schema",
  "show-task",
  "status",
  "task:block",
  "task:start",
  "validate",
]);

/** `ASSIGNMENT_READ_ONLY` for any other command in an executor worktree. */
export function ensureExecutorCommand(
  kit: WorkflowKitFacade,
  root: string,
  command: string
): void {
  if (EXECUTOR_COMMANDS.has(command)) {
    return;
  }
  const executor = kit.executorAssignment(root);
  ensure(
    executor === null,
    "ASSIGNMENT_READ_ONLY",
    `${command} is not available in the executor worktree of ${executor?.id}.`,
    { allowed: [...EXECUTOR_COMMANDS] },
    "Run only your task: task:start, commit --task, status, recover, show-task, schema, context, repair, task:block, assignment:status, assignment:setup."
  );
}

/**
 * Orchestrated assignments (spec 5.1, 5.4, 7): `assignment:next|create|cleanup|cancel`
 * in main, `attach|status` in the executor worktree, `setup` in both.
 */
export const ASSIGNMENT_COMMANDS: Readonly<
  Record<string, AssignmentCommandSpec>
> = {
  "assignment:attach": {
    run: ({ args, kit, root }) =>
      kit.attachAssignment(root, positional(args, 0, "Assignment id")),
    text: attachText,
    usage: "assignment:attach <id>",
  },
  "assignment:cancel": {
    run: ({ args, kit, root }) =>
      kit.cancelAssignment(
        root,
        requiredFlag(args, "id"),
        args.flags.get("force") === true
      ),
    text: cancelText,
    usage: "assignment:cancel --id <id> [--force]",
  },
  "assignment:cleanup": {
    run: ({ args, kit, root }) =>
      kit.cleanupAssignments(root, flag(args, "id")),
    text: cleanupText,
    usage: "assignment:cleanup [--id <id>]",
  },
  "assignment:create": {
    run: ({ args, kit, root }) =>
      kit.createAssignment(root, requiredFlag(args, "task")),
    text: createText,
    usage: "assignment:create --task <ID>",
  },
  "assignment:setup": {
    run: ({ args, kit, root }) => kit.setupAssignment(root, flag(args, "id")),
    text: setupText,
    usage: "assignment:setup [--id <id>]",
  },
  "assignment:status": {
    run: ({ kit, root }) => kit.assignmentStatus(root),
    text: statusText,
    usage: "assignment:status",
  },
  "assignment:next": {
    run: ({ kit, root }) => kit.nextAssignments(root),
    text: nextText,
    usage: "assignment:next",
  },
};
