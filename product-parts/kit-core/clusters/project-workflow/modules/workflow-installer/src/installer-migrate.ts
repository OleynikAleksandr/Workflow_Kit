import { existsSync } from "node:fs";
import path from "node:path";
import type {
  CommitResult,
  WorkflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { readManifest } from "./installer-inspect.js";
import { projectSlug } from "./installer-install.js";
import {
  type LegacyPlan,
  type LegacyTask,
  parseLegacyPlan,
} from "./installer-legacy-plan.js";

export interface MigrateOptions {
  acceptance?: string[];
  /** Message of the migration commit; a pending legacy task expecting it is done by it. */
  message?: string;
  name?: string;
  now: string;
  objective?: string;
  spec?: string | null;
}

export interface MigrateOutcome {
  commit: CommitResult;
  /** Legacy rows that became something else (acceptance, DOCS). */
  converted: string[];
  legacyDone: number;
  migrated: string[];
  scopeId: string | null;
}

const LEGACY_ROUND = "R0-legacy";
const DEFAULT_MESSAGE = "chore: migrate the plan into the workflow kit";
const RESULT_LIMIT = 590;

function task(
  legacy: LegacyTask,
  kind: WorkflowTask["kind"],
  dependencies: string[]
): WorkflowTask {
  return {
    acceptance: [legacy.title],
    checks: [],
    commitMessage: legacy.expectedCommit ?? `chore: ${legacy.id}`,
    confirmation: null,
    context: [],
    dependencies,
    docsWaiver: null,
    files: [],
    fixes: null,
    id: legacy.id,
    iteration: 1,
    kind,
    roundId: "R1",
    status: "TODO",
    title: legacy.title,
    why: `Migrated from ${legacy.phase || "the legacy plan"}${legacy.scope ? `; legacy scope: ${legacy.scope}` : ""}.`,
  };
}

function docsTask(
  source: LegacyTask | undefined,
  dependencies: string[]
): WorkflowTask {
  return {
    acceptance: [
      "Project-wide documents describe the round result",
      "The round digest records result, decisions, contracts and references",
    ],
    checks: [],
    commitMessage:
      source?.expectedCommit ?? "docs: reconcile documentation for R1",
    confirmation: null,
    context: [],
    dependencies,
    docsWaiver: null,
    files: [],
    fixes: null,
    id: "DOCS-R1",
    iteration: 1,
    kind: "docs",
    roundId: "R1",
    status: "TODO",
    title:
      source?.title ??
      "Reconcile project documentation and write the round digest",
    why: "Keep the project context current for the next agent and close the round.",
  };
}

function legacyResult(legacy: LegacyPlan, done: LegacyTask[]): string {
  const first = done[0]?.id ?? "none";
  const last = done.at(-1)?.id ?? "none";
  const text = `Legacy plan ${legacy.planId}: ${done.length} tasks were done before the move to the Workflow Kit (${first} … ${last}). Their rows stay in the plan of the parent commit of the migration.`;
  return text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT)}…` : text;
}

/** Builds the Workflow Kit plan for the remaining work of a legacy plan. */
function buildMigratedPlan(
  legacy: LegacyPlan,
  base: { baselineCommit: string; projectId: string; projectName: string },
  options: MigrateOptions,
  existing: (relative: string) => boolean
): {
  converted: string[];
  legacyDone: number;
  migrated: string[];
  plan: WorkflowPlan;
} {
  const message = options.message ?? DEFAULT_MESSAGE;
  const finished = (item: LegacyTask) =>
    item.status === "DONE" || item.expectedCommit === message;
  const done = legacy.tasks.filter(finished);
  const pending = legacy.tasks.filter((item) => !finished(item));
  const acceptanceRows = pending.filter(
    (item) => item.completion === "user-acceptance"
  );
  const docsRows = pending.filter((item) => item.kind === "docs");
  const regular = pending.filter(
    (item) =>
      item.completion !== "user-acceptance" &&
      item.kind !== "docs" &&
      item.kind !== "delivery"
  );
  const deliveries = pending.filter(
    (item) => item.kind === "delivery" && item.completion !== "user-acceptance"
  );
  const plan = workflowPlanFacade.createEmpty(base.projectId, base.projectName);
  const converted = [
    ...acceptanceRows.map(
      (item) => `${item.id} → the user's acceptance through \`accept\``
    ),
    ...docsRows.map((item) => `${item.id} → DOCS-R1`),
  ];
  if (
    legacy.scopeStatus !== "ACTIVE" ||
    regular.length + deliveries.length + docsRows.length === 0
  ) {
    return { converted, legacyDone: done.length, migrated: [], plan };
  }
  const work = regular.map((item) =>
    task(item, item.kind === "quality" ? "quality" : "work", [])
  );
  const docs = docsTask(
    docsRows[0],
    work.map((item) => item.id)
  );
  plan.scope = {
    acceptance: options.acceptance ?? ["The user accepts the delivered result"],
    acceptanceNote: null,
    approval: {
      at: options.now,
      text: `Migrated from the legacy plan ${legacy.planId} by migrate:harness-plan.`,
    },
    baselineCommit: base.baselineCommit,
    blockedReason: null,
    context: legacy.context
      .filter(existing)
      .map((item) => ({ path: item, required: false })),
    decisions: converted.map((text) => ({
      at: options.now,
      text: `Migration: ${text}.`,
    })),
    delivery: "IN_PROGRESS",
    id: legacy.planId,
    objective:
      options.objective ?? `Finish the remaining work of ${legacy.planId}.`,
    spec: options.spec ?? null,
    status: "ACTIVE",
  };
  plan.rounds = [
    {
      digest: {
        contracts: [],
        decisions: [],
        references: [`git show ${base.baselineCommit}:${PLAN_PATH}`],
        result: legacyResult(legacy, done),
      },
      id: LEGACY_ROUND,
      kind: "legacy",
      status: "CLOSED",
      title: `Legacy plan ${legacy.planId}`,
    },
    {
      digest: null,
      id: "R1",
      kind: "implementation",
      status: "OPEN",
      title: "Remaining work",
    },
  ];
  plan.tasks = [
    ...work,
    docs,
    ...deliveries.map((item) => task(item, "delivery", [docs.id])),
  ];
  return {
    converted,
    legacyDone: done.length,
    migrated: plan.tasks.map((item) => item.id),
    plan: workflowPlanFacade.validate(plan),
  };
}

/** `migrate:harness-plan`: replaces a legacy plan with a Kit plan in one kit-update commit. */
export function migrateHarnessPlan(
  git: WorkflowGitFacade,
  folder: string,
  options: MigrateOptions
): MigrateOutcome {
  const root = path.resolve(folder);
  ensure(
    readManifest(root),
    "NOT_INSTALLED",
    "Install the Workflow Kit before migrating the plan.",
    {},
    "Run `scripts/workflow install`."
  );
  const text = workflowPlatformFacade.readTextIfExists(
    path.join(root, ...PLAN_PATH.split("/"))
  );
  ensure(text, "NOT_LEGACY_PLAN", `${PLAN_PATH} does not exist.`);
  const legacy = parseLegacyPlan(text);
  const baselineCommit = git.head(root);
  ensure(baselineCommit, "NO_COMMITS", "The repository has no commits yet.");
  const name = options.name?.trim() || path.basename(root);
  const result = buildMigratedPlan(
    legacy,
    { baselineCommit, projectId: projectSlug(name), projectName: name },
    options,
    (relative) => existsSync(path.join(root, ...relative.split("/")))
  );
  ensure(
    git.transactions.journal(root) === null,
    "TRANSACTION_PENDING",
    "A Kit commit transaction is unfinished."
  );
  const commit = git.transactions.commit(root, {
    files: [],
    message: options.message ?? DEFAULT_MESSAGE,
    planPath: PLAN_PATH,
    planText: workflowPlanFacade.render(result.plan),
    role: "kit-update",
    scopeId: result.plan.scope?.id ?? null,
    taskId: null,
  });
  return {
    commit,
    converted: result.converted,
    legacyDone: result.legacyDone,
    migrated: result.migrated,
    scopeId: result.plan.scope?.id ?? null,
  };
}
