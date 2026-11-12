import type { BriefDocument } from "../../workflow-assignment/src/workflow-assignment-facade.js";
import type {
  DocumentRef,
  WorkflowPlan,
  WorkflowTask,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowRecoveryFacade } from "../../workflow-recovery/src/workflow-recovery-facade.js";
import { type KitContext, readConfig } from "./kit-context.js";

/**
 * The documents a task brings into its executor brief: its `context`
 * (a whole-document reference wins over a heading reference of the same
 * path), or the scope specification when the task has no context.
 */
function briefRefs(plan: WorkflowPlan, task: WorkflowTask): DocumentRef[] {
  if (task.context.length === 0) {
    const spec = plan.scope?.spec;
    return spec ? [{ path: spec, required: true }] : [];
  }
  const whole = new Set(
    task.context.filter((ref) => !ref.heading).map((ref) => ref.path)
  );
  const seen = new Set<string>();
  return task.context.filter((ref) => {
    const key = `${ref.path}\n${ref.heading ?? ""}`;
    if (seen.has(key) || (ref.heading && whole.has(ref.path))) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Reads the brief documents of a task from `root` (the main checkout): the
 * whole file, or only the section of a heading reference. A missing file or
 * heading fails with CONTEXT_MISSING.
 */
function briefDocuments(
  root: string,
  plan: WorkflowPlan,
  task: WorkflowTask
): BriefDocument[] {
  return briefRefs(plan, task).map((ref) => {
    const text = workflowPlatformFacade.readTextIfExists(
      workflowPlatformFacade.resolveInside(root, ref.path)
    );
    const section =
      text !== null && ref.heading
        ? workflowRecoveryFacade.section(text, ref.heading)
        : text;
    ensure(
      section !== null,
      "CONTEXT_MISSING",
      text === null
        ? `The context document ${ref.path} of ${task.id} does not exist.`
        : `The context document ${ref.path} of ${task.id} has no heading "${ref.heading}".`,
      {
        path: ref.path,
        taskId: task.id,
        ...(ref.heading ? { heading: ref.heading } : {}),
      },
      "Fix the task context: an existing file and, for a section, an existing heading."
    );
    const body = section.trimEnd();
    return {
      bytes: Buffer.byteLength(body, "utf8"),
      path: ref.path,
      text: body,
      ...(ref.heading ? { heading: ref.heading } : {}),
    };
  });
}

/**
 * The brief documents of a task, read from the project root, after the
 * checks: they exist (CONTEXT_MISSING) and their text fits
 * `budget.briefBytes` (CONTEXT_TOO_LARGE).
 */
export function checkedBriefDocuments(
  context: KitContext,
  plan: WorkflowPlan,
  task: WorkflowTask,
  budget: number = readConfig(context).budget.briefBytes
): BriefDocument[] {
  const documents = briefDocuments(context.root, plan, task);
  const bytes = documents.reduce((sum, item) => sum + item.bytes, 0);
  ensure(
    bytes <= budget,
    "CONTEXT_TOO_LARGE",
    `The context documents of ${task.id} take ${bytes} bytes; the brief budget is ${budget}.`,
    { budget, bytes, taskId: task.id },
    "Narrow the task context to sections (heading)."
  );
  return documents;
}

/** The plan-time check of `checkedBriefDocuments` for every given task. */
export function ensureContextBudget(
  context: KitContext,
  plan: WorkflowPlan,
  tasks: readonly WorkflowTask[]
): void {
  const budget = readConfig(context).budget.briefBytes;
  for (const task of tasks) {
    checkedBriefDocuments(context, plan, task, budget);
  }
}

/** Tasks of `next` that are new or whose context differs from `previous`. */
export function changedContextTasks(
  previous: WorkflowPlan,
  next: WorkflowPlan
): WorkflowTask[] {
  const before = new Map(previous.tasks.map((task) => [task.id, task]));
  return next.tasks.filter((task) => {
    const old = before.get(task.id);
    return !old || JSON.stringify(old.context) !== JSON.stringify(task.context);
  });
}
