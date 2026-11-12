import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { checkTaskInput } from "./plan-input-checks.js";
import {
  type DocumentRef,
  docsTaskId,
  functionalFiles,
  isDocumentationPath,
  type TaskKind,
  type WorkflowPlan,
  type WorkflowTask,
} from "./plan-model.js";

/** Task input accepted by scope:create and plan:extend. */
export interface TaskInput {
  acceptance: string[];
  checks?: string[];
  commitMessage: string;
  context?: DocumentRef[];
  dependencies?: string[];
  docsWaiver?: string | null;
  files?: string[];
  fixes?: string | null;
  id?: string;
  kind?: TaskKind;
  parallelSafe?: boolean;
  title: string;
  why?: string;
}

const QUALITY_TITLE = "Configure the project quality profile";
const DOCS_TITLE = "Reconcile project documentation and write the round digest";
const DEFAULT_DOCS_FILES = ["README.md", "docs/architecture/OVERVIEW.md"];
const AUTO_ID_PATTERN = /^T([0-9]+)$/u;

function nextAutoId(existing: Set<string>): string {
  let highest = 0;
  for (const id of existing) {
    const match = AUTO_ID_PATTERN.exec(id);
    highest = Math.max(highest, match ? Number(match[1]) : 0);
  }
  return `T${String(highest + 1).padStart(3, "0")}`;
}

/** Normalizes one input task; `field` is its input path, e.g. `tasks[0]`. */
export function normalizeTaskInput(
  input: TaskInput,
  roundId: string,
  existing: Set<string>,
  field: string
): WorkflowTask {
  checkTaskInput(input, field);
  const id = input.id ?? nextAutoId(existing);
  ensure(!existing.has(id), "PLAN_SCHEMA", `Duplicate task id: ${id}`, {
    field: `${field}.id`,
  });
  existing.add(id);
  return {
    acceptance: input.acceptance,
    checks: input.checks ?? [],
    commitMessage: input.commitMessage,
    confirmation: null,
    context: input.context ?? [],
    dependencies: input.dependencies ?? [],
    docsWaiver: input.docsWaiver ?? null,
    files: input.files ?? [],
    fixes: input.fixes ?? null,
    id,
    iteration: 1,
    kind: input.kind ?? "work",
    // Absent and false are stored alike: the field is kept only when set.
    ...(input.parallelSafe === undefined || input.parallelSafe === false
      ? {}
      : { parallelSafe: input.parallelSafe }),
    roundId,
    status: "TODO",
    title: input.title,
    why: input.why ?? input.title,
  };
}

function qualityTaskId(plan: WorkflowPlan): string {
  const used = new Set(plan.tasks.map((task) => task.id));
  let index = 1;
  let id = "QUALITY";
  while (used.has(id)) {
    index += 1;
    id = `QUALITY-${index}`;
  }
  return id;
}

export function buildQualityTask(
  plan: WorkflowPlan,
  roundId: string
): WorkflowTask {
  return {
    acceptance: [
      "Project stacks are detected or chosen from the architecture",
      "Quality checks are applied with `quality:apply` and the profile is CONFIGURED",
    ],
    checks: [],
    commitMessage: "chore: configure the project quality profile",
    confirmation: null,
    context: [],
    dependencies: [],
    docsWaiver: null,
    files: [],
    fixes: null,
    id: qualityTaskId(plan),
    iteration: 1,
    kind: "quality",
    roundId,
    status: "TODO",
    title: QUALITY_TITLE,
    why: "Functional code needs a configured quality profile before its first commit.",
  };
}

function buildDocsTask(roundId: string, files: string[]): WorkflowTask {
  return {
    acceptance: [
      "Project-wide documents describe the round result",
      "The round digest records result, decisions, contracts and references",
    ],
    checks: [],
    commitMessage: `docs: reconcile documentation for ${roundId}`,
    confirmation: null,
    context: [],
    dependencies: [],
    docsWaiver: null,
    files: [...new Set([...DEFAULT_DOCS_FILES, ...files])],
    fixes: null,
    id: docsTaskId(roundId),
    iteration: 1,
    kind: "docs",
    roundId,
    status: "TODO",
    title: DOCS_TITLE,
    why: "Keep the project context current for the next agent and close the round.",
  };
}

/**
 * Arranges one round: optional QUALITY before the first functional task,
 * ordinary work, DOCS depending on all round work, then delivery tasks
 * depending on DOCS.
 */
export function arrangeRound(
  plan: WorkflowPlan,
  roundId: string,
  tasks: WorkflowTask[],
  options: { docsFiles: string[]; qualityConfigured: boolean }
): WorkflowTask[] {
  const delivery = tasks.filter((task) => task.kind === "delivery");
  const work = tasks.filter((task) => task.kind !== "delivery");
  const firstFunctional = work.findIndex(
    (task) => task.kind === "work" && functionalFiles(task).length > 0
  );
  const hasQuality = plan.tasks.some(
    (task) => task.kind === "quality" && task.status !== "DONE"
  );
  if (!(options.qualityConfigured || hasQuality) && firstFunctional >= 0) {
    const quality = buildQualityTask(plan, roundId);
    work[firstFunctional] = {
      ...work[firstFunctional],
      dependencies: [
        ...new Set([
          quality.id,
          ...(work[firstFunctional]?.dependencies ?? []),
        ]),
      ],
    } as WorkflowTask;
    work.splice(firstFunctional, 0, quality);
  }
  const roundWork = [
    ...plan.tasks.filter(
      (task) =>
        task.roundId === roundId &&
        task.kind !== "docs" &&
        task.kind !== "delivery"
    ),
    ...work,
  ];
  const documentation = work.flatMap((task) =>
    task.files.filter(isDocumentationPath)
  );
  const docs = buildDocsTask(roundId, [...options.docsFiles, ...documentation]);
  docs.dependencies = roundWork.map((task) => task.id);
  const arrangedDelivery = delivery.map((task) => ({
    ...task,
    dependencies: [...new Set([...task.dependencies, docs.id])],
  }));
  return [...work, docs, ...arrangedDelivery];
}
