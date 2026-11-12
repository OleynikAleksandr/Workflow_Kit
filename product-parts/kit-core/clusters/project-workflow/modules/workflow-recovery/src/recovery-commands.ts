import type {
  CommitRecord,
  WorkflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import type { WorkflowPlan } from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { RecoveryEvent } from "./recovery-model.js";
import { describeTask } from "./recovery-sections.js";

export const HOST_RECOVERY_VARIABLE = "HARNESS_WORKFLOW_RECOVERY";

const EVENTS = new Set<RecoveryEvent>([
  "startup",
  "resume",
  "clear",
  "compact",
]);

export type HookClient = "claude" | "codex";

/** Reads the SessionStart event (`source`) from the hook input; defaults to startup. */
export function hookEvent(stdin: string): RecoveryEvent {
  try {
    const parsed: unknown = JSON.parse(stdin || "{}");
    const source =
      parsed && typeof parsed === "object"
        ? (parsed as { source?: unknown }).source
        : undefined;
    return typeof source === "string" && EVENTS.has(source as RecoveryEvent)
      ? (source as RecoveryEvent)
      : "startup";
  } catch {
    return "startup";
  }
}

/**
 * SessionStart hook response. Inside Harness (`HARNESS_WORKFLOW_RECOVERY=host`)
 * the host already delivered the packet, so no context is repeated; a null
 * context (a packet part that does not exist) adds no context either.
 */
export function sessionStartResponse(
  context: () => string | null,
  env: NodeJS.ProcessEnv
): string {
  const output: { additionalContext?: string; hookEventName: string } = {
    hookEventName: "SessionStart",
  };
  if (env[HOST_RECOVERY_VARIABLE] !== "host") {
    const text = context();
    if (text !== null) {
      output.additionalContext = text;
    }
  }
  return `${JSON.stringify({ continue: true, hookSpecificOutput: output })}\n`;
}

export function showTaskText(
  plan: WorkflowPlan,
  taskId: string,
  commits: Record<string, string>
): string {
  const task = plan.tasks.find((item) => item.id === taskId);
  ensure(task, "UNKNOWN_TASK", `Task not found: ${taskId}`);
  return `${describeTask(plan, task, commits)}\n`;
}

export interface HistoryEntry {
  role: string;
  sha: string;
  subject: string;
  taskId: string | null;
}

/** Workflow commits since the scope baseline, filtered by task or round. */
export function workflowHistory(
  git: WorkflowGitFacade,
  root: string,
  plan: WorkflowPlan,
  filter: { round?: string; task?: string }
): HistoryEntry[] {
  const roundTasks = filter.round
    ? new Set(
        plan.tasks
          .filter((task) => task.roundId === filter.round)
          .map((task) => task.id)
      )
    : null;
  const commits: CommitRecord[] = git.head(root)
    ? git.history(root, plan.scope?.baselineCommit ?? null)
    : [];
  return commits
    .map((commit) => ({
      role: commit.trailers["Workflow-Role"]?.[0] ?? "external",
      sha: commit.sha,
      subject: commit.subject,
      taskId: commit.trailers["Workflow-Task"]?.[0] ?? null,
    }))
    .map((entry) => ({
      ...entry,
      taskId: entry.taskId === "-" ? null : entry.taskId,
    }))
    .filter((entry) => !filter.task || entry.taskId === filter.task)
    .filter(
      (entry) =>
        !roundTasks || (entry.taskId !== null && roundTasks.has(entry.taskId))
    );
}

export function historyText(entries: HistoryEntry[]): string {
  if (entries.length === 0) {
    return "No workflow commits match.\n";
  }
  return `${entries.map((entry) => `${entry.sha.slice(0, 8)} ${entry.role} ${entry.taskId ?? "-"} ${entry.subject}`).join("\n")}\n`;
}
