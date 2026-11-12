import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
  type WorkflowPlan,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { workflowPlatformFacade } from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import { documentsMap } from "./recovery-documents.js";
import type {
  RecoveryEvent,
  RecoveryInput,
  TransactionSummary,
} from "./recovery-model.js";
import { gatherRoleFacts } from "./recovery-roles.js";
import { focusTask } from "./recovery-sections.js";

export interface GatherNotes {
  /** Problems met while gathering; the packet still builds. */
  warnings: string[];
}

function readDocument(root: string, file: string): string | null {
  try {
    return workflowPlatformFacade.readTextIfExists(
      workflowPlatformFacade.resolveInside(root, file)
    );
  } catch {
    return null;
  }
}

function taskCommits(
  git: WorkflowGitFacade,
  root: string,
  plan: WorkflowPlan,
  notes: GatherNotes
): Record<string, string> {
  try {
    const commits: Record<string, string> = {};
    for (const [taskId, reference] of git.resolveReferences(
      root,
      plan,
      PLAN_PATH
    )) {
      if (reference.status === "committed") {
        commits[taskId] = reference.sha;
      }
    }
    return commits;
  } catch (error) {
    notes.warnings.push(
      `Commit references are inconsistent (${(error as { code?: string }).code ?? "error"}); run \`scripts/workflow doctor\`.`
    );
    return {};
  }
}

function transaction(
  git: WorkflowGitFacade,
  root: string
): TransactionSummary | null {
  const journal = git.transactions.journal(root);
  return journal
    ? {
        error: journal.error,
        id: journal.id,
        phase: journal.phase,
        role: journal.role,
        taskId: journal.taskId,
      }
    : null;
}

/** Changed paths outside the focus task, without Kit-managed state. */
function outsideChanges(
  git: WorkflowGitFacade,
  root: string,
  plan: WorkflowPlan
): string[] {
  const task = focusTask(plan);
  const own = new Set(task?.status === "IN_PROGRESS" ? task.files : []);
  return git
    .changes(root)
    .all.filter((file) => !(own.has(file) || git.isKitManagedPath(file)));
}

/** Reads plan, configuration, git state and evidence of a project. */
export function gatherRecovery(
  git: WorkflowGitFacade,
  root: string,
  event: RecoveryEvent,
  notes: GatherNotes
): RecoveryInput {
  const plan =
    workflowPlanFacade.read(root) ??
    workflowPlanFacade.createEmpty("unknown", "Project");
  const config = workflowQualityFacade.readConfig(root);
  const repository = git.isRepository(root);
  if (!repository) {
    notes.warnings.push("The project is not a git repository.");
  }
  const evidence = workflowQualityFacade.readEvidence(root);
  return {
    budgetBytes: config.budget.recoveryBytes,
    changes: repository ? outsideChanges(git, root, plan) : [],
    documents: repository
      ? documentsMap(git, root, { specPath: plan.scope?.spec ?? null })
      : null,
    event,
    head: repository ? git.head(root) : null,
    plan,
    quality: { stacks: config.quality.stacks, status: config.quality.status },
    readDocument: (file) => readDocument(root, file),
    roles: gatherRoleFacts(
      git,
      root,
      plan,
      config.host === "harness",
      notes.warnings
    ),
    taskCommits: repository ? taskCommits(git, root, plan, notes) : {},
    transaction: repository ? transaction(git, root) : null,
    verification: evidence
      ? { commit: evidence.commit ?? null, reports: evidence.reports }
      : null,
  };
}
