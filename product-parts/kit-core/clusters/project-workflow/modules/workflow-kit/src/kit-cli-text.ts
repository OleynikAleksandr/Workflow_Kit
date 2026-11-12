import type { InspectResult } from "../../workflow-installer/src/workflow-installer-facade.js";
import type { KitStatus, ValidationReport } from "./workflow-kit-facade.js";

/** One line: the execution mode, assignment counts by status, the integration. */
function executionLine(status: KitStatus): string {
  const { execution } = status;
  if (!execution) {
    return "execution: none";
  }
  if (execution.strategy !== "orchestrated") {
    return `execution: ${execution.strategy}`;
  }
  const counts = new Map<string, number>();
  for (const item of status.assignments) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  const assignments =
    counts.size === 0
      ? "none"
      : [...counts].map(([state, count]) => `${state} ${count}`).join(", ");
  const integration = status.integration
    ? `, integration ${status.integration.taskId ?? "unknown"} ${status.integration.phase ?? "unknown"}`
    : "";
  return `execution: orchestrated (max ${execution.maxWorkers} workers), assignments: ${assignments}${integration}`;
}

function statusText(status: KitStatus): string {
  const lines = [
    `project: ${status.project ? `${status.project.name} (${status.project.id})` : "not installed"}`,
    status.scope
      ? `scope: ${status.scope.id} ${status.scope.status}, result ${status.scope.delivery}, revision ${status.revision}`
      : `scope: NONE, revision ${status.revision}`,
  ];
  if (status.scope?.blockedReason) {
    lines.push(`blocked: ${status.scope.blockedReason}`);
  }
  lines.push(executionLine(status));
  if (status.executor) {
    lines.push(
      `executor: assignment ${status.executor.assignmentId}, task ${status.executor.taskId}`
    );
  }
  lines.push(
    `paused: ${status.paused}`,
    `progress: ${status.progress.done}/${status.progress.total}`,
    `current: ${status.currentTask ? `${status.currentTask.id} ${status.currentTask.title}` : "none"}`,
    `next: ${status.nextTask ? `${status.nextTask.id} [${status.nextTask.kind}] ${status.nextTask.title}` : "none"}`,
    `quality: ${status.quality.status}${status.quality.stacks.length > 0 ? ` (${status.quality.stacks.join(", ")})` : ""}, drift ${status.quality.drift.status}`,
    `head: ${status.head ? status.head.slice(0, 8) : "none"}`,
    `transaction: ${status.transaction ? `${status.transaction.id} ${status.transaction.phase}` : "none"}`,
    `changes: ${status.changes.length === 0 ? "none" : status.changes.join(", ")}`
  );
  return `${lines.join("\n")}\n`;
}

function validationText(report: ValidationReport): string {
  return report.ok
    ? "Plan and history are consistent.\n"
    : `${report.errors.map((error) => `${error.code}: ${error.message}`).join("\n")}\n`;
}

function inspectText(result: InspectResult): string {
  const { git } = result;
  const repository = git.repository
    ? `repository, head ${git.head ? git.head.slice(0, 8) : "none"}`
    : "not a repository";
  const lines = [
    `path: ${result.path}`,
    `state: ${result.state}`,
    `action: ${result.action}`,
    `kit version: ${result.version ?? "none"}`,
    `git: ${repository}`,
    `identity: ${git.identity ? `${git.identity.name} <${git.identity.email}>` : "not set"}`,
    `stacks: ${result.stacks.length > 0 ? result.stacks.join(", ") : "none"}`,
    `transaction: ${result.transactionPending ? "pending" : "none"}`,
  ];
  if (result.nestedIn) {
    lines.push(`nested in: ${result.nestedIn}`);
  }
  if (result.damaged.length > 0) {
    lines.push(`damaged: ${result.damaged.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Human-readable output of `--format text`. */
export function renderText(command: string, result: unknown): string {
  const value = result as Record<string, unknown>;
  switch (command) {
    case "status":
      return statusText(result as KitStatus);
    case "validate":
      return validationText(result as ValidationReport);
    case "inspect":
      return inspectText(result as InspectResult);
    case "recover":
    case "history":
    case "show-task":
      return String(value.text ?? "");
    default:
      return `${JSON.stringify(result, null, 2)}\n`;
  }
}
