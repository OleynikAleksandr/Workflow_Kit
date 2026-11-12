import type {
  WorkflowPlan,
  WorkflowTask,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  cutBytes,
  KIT_COMMAND,
  type RecoveryInput,
  shortSha,
} from "./recovery-model.js";
import {
  type AgentRole,
  agentRole,
  executorStep,
  orchestratorStep,
  planningStep,
  roleRule,
  roleStateLines,
} from "./recovery-roles.js";

const LIST_LIMIT = 40;
const UPCOMING = 3;
const RECENT = 3;
const FULL_ROUNDS = 3;
const DECISIONS = 5;
const VERIFICATION_OUTPUT_BYTES = 1024;
const ROUND_LINE_BYTES = 160;

function bullets(items: readonly string[], empty = "none"): string {
  return items.length === 0
    ? `- ${empty}`
    : items.map((item) => `- ${item}`).join("\n");
}

function limited(paths: readonly string[]): string[] {
  const shown = paths.slice(0, LIST_LIMIT);
  return paths.length > LIST_LIMIT
    ? [...shown, `… ${paths.length - LIST_LIMIT} more`]
    : shown;
}

function oneLine(task: WorkflowTask): string {
  return `${task.id} [${task.kind}] ${task.title}`;
}

/** The current task, or the next ready one. */
export function focusTask(plan: WorkflowPlan): WorkflowTask | null {
  const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
  if (current) {
    return current;
  }
  const done = new Set(
    plan.tasks.filter((task) => task.status === "DONE").map((task) => task.id)
  );
  return (
    plan.tasks.find(
      (task) =>
        task.status === "TODO" && task.dependencies.every((id) => done.has(id))
    ) ?? null
  );
}

export function stateSection(input: RecoveryInput): string {
  const { plan } = input;
  const scope = plan.scope;
  const transaction = input.transaction
    ? `${input.transaction.id} ${input.transaction.phase} (${input.transaction.role}${input.transaction.taskId ? ` ${input.transaction.taskId}` : ""})`
    : "none";
  return [
    `project: ${plan.projectName} (${plan.projectId})`,
    scope
      ? `scope: ${scope.id} ${scope.status}, result ${scope.delivery}, revision ${plan.revision}`
      : `scope: NONE, revision ${plan.revision}`,
    `quality: ${input.quality.status}${input.quality.stacks.length > 0 ? ` (${input.quality.stacks.join(", ")})` : ""}`,
    `head: ${shortSha(input.head)}`,
    `transaction: ${transaction}`,
    `event: ${input.event}`,
    ...roleStateLines(input),
    ...(input.warnings ?? []).map((warning) => `warning: ${warning}`),
  ].join("\n");
}

function nextStep(input: RecoveryInput, role: AgentRole): string {
  const { plan } = input;
  const scope = plan.scope;
  if (!scope) {
    return planningStep(input);
  }
  if (input.transaction) {
    return `A commit transaction is unfinished: run \`${KIT_COMMAND} repair\` before anything else.`;
  }
  if (scope.status === "BLOCKED") {
    return `BLOCKED: ${scope.blockedReason ?? "no reason recorded"}. Resolve it with the user, then unblock.`;
  }
  if (role === "executor") {
    return executorStep(input);
  }
  if (scope.delivery === "READY_FOR_ACCEPTANCE") {
    return "Scope is READY_FOR_ACCEPTANCE: ask the user to accept the result or report defects.";
  }
  if (scope.delivery === "ACCEPTED") {
    return "Scope is ACCEPTED: the user decides when to close it.";
  }
  if (role === "orchestrator") {
    return orchestratorStep(input);
  }
  const task = focusTask(plan);
  if (!task) {
    return "No task is ready: check dependencies with the user.";
  }
  if (task.status === "IN_PROGRESS") {
    return `Continue ${task.id}: ${task.title}`;
  }
  if (task.kind === "delivery") {
    return `Next task ${task.id} is delivery: ask the user to confirm it, then \`${KIT_COMMAND} task:start ${task.id} --confirmed "<user confirmation>"\`.`;
  }
  return `Start ${task.id} via \`${KIT_COMMAND} task:start ${task.id}\`: ${task.title}`;
}

/** The next step for the session's role, followed by the role rule. */
export function nextSection(input: RecoveryInput): string {
  const role = agentRole(input);
  return `${nextStep(input, role)}\n${roleRule(role)}`;
}

export function objectiveSection(input: RecoveryInput): string {
  const scope = input.plan.scope;
  if (!scope) {
    return "none";
  }
  return [scope.objective, "", "Acceptance:", bullets(scope.acceptance)].join(
    "\n"
  );
}

function field(
  name: string,
  value: string,
  cap: number | null,
  taskId: string
): string {
  if (cap === null || Buffer.byteLength(value, "utf8") <= cap) {
    return `${name}: ${value}`;
  }
  const kept = cutBytes(value, cap);
  const removed =
    Buffer.byteLength(value, "utf8") - Buffer.byteLength(kept, "utf8");
  return `${name}: ${kept} [truncated: ${removed} bytes, run: ${KIT_COMMAND} show-task ${taskId}]`;
}

/** Full text of one task; `cap` limits each long field in UTF-8 bytes. */
export function describeTask(
  plan: WorkflowPlan,
  task: WorkflowTask,
  taskCommits: Record<string, string>,
  cap: number | null = null
): string {
  const lines = [
    `${task.id} [${task.kind}] ${task.status}, round ${task.roundId}, iteration ${task.iteration}`,
    `title: ${task.title}`,
    field("why", task.why, cap, task.id),
    field("files", task.files.join(", ") || "none", cap, task.id),
    `dependencies: ${task.dependencies.join(", ") || "none"}`,
    `checks: ${task.checks.join(", ") || "profile defaults"}`,
    field("acceptance", task.acceptance.join(" | ") || "none", cap, task.id),
    field(
      "context",
      task.context
        .map((ref) => (ref.heading ? `${ref.path}#${ref.heading}` : ref.path))
        .join(", ") || "none",
      cap,
      task.id
    ),
    `commit: ${task.commitMessage}`,
  ];
  if (task.docsWaiver) {
    lines.push(`docsWaiver: ${task.docsWaiver}`);
  }
  if (task.confirmation) {
    lines.push(`confirmation: ${task.confirmation}`);
  }
  if (task.fixes) {
    const original = plan.tasks.find((item) => item.id === task.fixes);
    lines.push(
      `fixes: ${task.fixes} ${shortSha(taskCommits[task.fixes])}${original ? ` — ${original.title}` : ""}`
    );
  }
  if (taskCommits[task.id]) {
    lines.push(`committed: ${taskCommits[task.id]}`);
  }
  return lines.join("\n");
}

/** The focus task in full; `cap` limits each long field in UTF-8 bytes. */
export function taskSection(
  input: RecoveryInput,
  cap: number | null = null
): string {
  const task = focusTask(input.plan);
  return task ? describeTask(input.plan, task, input.taskCommits, cap) : "none";
}

export function upcomingSection(input: RecoveryInput): string {
  const focus = focusTask(input.plan);
  const pending = input.plan.tasks.filter(
    (task) => task.status === "TODO" && task.id !== focus?.id
  );
  const shown = pending.slice(0, UPCOMING).map(oneLine);
  const rest = pending.length - shown.length;
  return [bullets(shown), `remaining after these: ${rest}`].join("\n");
}

export function recentSection(input: RecoveryInput): string {
  const done = input.plan.tasks
    .filter((task) => task.status === "DONE")
    .slice(-RECENT);
  return bullets(
    done.map(
      (task) =>
        `${task.id} ${shortSha(input.taskCommits[task.id])} ${task.title}`
    )
  );
}

export function roundsSection(input: RecoveryInput): string | null {
  const digested = input.plan.rounds.filter((round) => round.digest);
  if (digested.length === 0) {
    return null;
  }
  const full = digested.slice(-FULL_ROUNDS);
  const early = digested.slice(0, -FULL_ROUNDS);
  const lines = early.map(
    (round) =>
      `- ${round.id} ${round.title}: ${cutBytes(round.digest?.result ?? "", ROUND_LINE_BYTES)}`
  );
  for (const round of full) {
    const digest = round.digest;
    if (!digest) {
      continue;
    }
    lines.push(
      `### ${round.id} ${round.title} (${round.status})`,
      digest.result
    );
    for (const [label, items] of [
      ["decisions", digest.decisions],
      ["contracts", digest.contracts],
      ["references", digest.references],
    ] as const) {
      if (items.length > 0) {
        lines.push(`${label}:`, bullets(items));
      }
    }
  }
  return lines.join("\n");
}

export function decisionsSection(input: RecoveryInput): string | null {
  const decisions = input.plan.scope?.decisions ?? [];
  if (decisions.length === 0) {
    return null;
  }
  return bullets(
    decisions
      .slice(-DECISIONS)
      .map((decision) => `${decision.at}: ${decision.text}`)
  );
}

export function changesSection(input: RecoveryInput): string {
  const lines = [
    `outside the task: ${input.changes.length === 0 ? "none" : ""}`.trimEnd(),
  ];
  if (input.changes.length > 0) {
    lines.push(bullets(limited(input.changes)));
  }
  if (input.transaction) {
    lines.push(
      `pending transaction ${input.transaction.id}: ${input.transaction.phase}${input.transaction.error ? ` — ${cutBytes(input.transaction.error, 300)}` : ""}`
    );
  }
  return lines.join("\n");
}

export function verificationSection(input: RecoveryInput): string | null {
  const verification = input.verification;
  if (!verification) {
    return null;
  }
  const lines = [`commit: ${shortSha(verification.commit)}`];
  let budget = VERIFICATION_OUTPUT_BYTES;
  for (const report of verification.reports) {
    lines.push(`${report.stage}: ${report.ok ? "ok" : "failed"}`);
    for (const item of report.results.filter(
      (entry) => entry.status !== "passed" && entry.status !== "skipped"
    )) {
      const output = cutBytes(
        item.output.slice(-VERIFICATION_OUTPUT_BYTES),
        budget
      );
      budget -= Buffer.byteLength(output, "utf8");
      lines.push(`- ${item.id} ${item.status}${output ? `:\n${output}` : ""}`);
    }
  }
  return lines.join("\n");
}
