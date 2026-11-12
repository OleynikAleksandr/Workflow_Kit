import type {
  CommitResult,
  RepairOutcome,
  RepairPlan,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  type InstallResult,
  type ProfileInput,
  type QualityProposal,
  type WorkflowConfig,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  commitPlan,
  ensureNoTransaction,
  type KitContext,
  locked,
  readPlan,
} from "./kit-context.js";

export interface QualityApplied {
  commit: CommitResult;
  config: WorkflowConfig;
  installs: InstallResult[];
}

/** `quality:detect`: a proposal that changes nothing. */
export function detectQuality(
  context: KitContext,
  stacks?: string[]
): QualityProposal {
  return workflowQualityFacade.propose(context.root, {
    stacks,
    which: (name) =>
      context.git.platform.findExecutable(name, context.env) !== null,
  });
}

/**
 * `quality:apply`: installs approved tools, writes the CONFIGURED profile and
 * commits it with the files the installation changed. A QUALITY task in
 * progress is completed by this commit.
 */
export function applyQuality(
  context: KitContext,
  input: ProfileInput
): QualityApplied {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    const task = current.tasks.find(
      (item) => item.id === current.currentTaskId && item.kind === "quality"
    );
    const before = new Set(context.git.changes(context.root).all);
    const applied = workflowQualityFacade.applyProfile(
      context.root,
      input,
      context.env
    );
    const configPath = workflowQualityFacade.configPath;
    let files: string[];
    if (task) {
      const selection = context.git.selectTaskFiles(context.root, {
        iteration: task.iteration,
        scopeId: current.scope?.id ?? "NONE",
        taskId: task.id,
      });
      files = [...selection.selected, configPath];
    } else {
      files = [
        ...context.git
          .changes(context.root)
          .all.filter(
            (file) => !(before.has(file) || context.git.isKitManagedPath(file))
          ),
        configPath,
      ];
    }
    let plan = current;
    if (task) {
      plan = structuredClone(current);
      const own = workflowPlanFacade.task(plan, task.id);
      own.files = [...new Set([...own.files, ...files])];
      plan = workflowPlanFacade.completeTask(plan, task.id);
    }
    const commit = commitPlan(context, plan, {
      files,
      iteration: task?.iteration,
      message:
        task?.commitMessage ?? "chore: apply the project quality profile",
      role: "quality",
      scopeId: current.scope?.id ?? null,
      taskId: task?.id ?? null,
    });
    return { commit, config: applied.config, installs: applied.installs };
  });
}

/** `quality:status`: the profile, its checks by stage and drift. */
export function qualityStatus(context: KitContext): {
  checks: Record<string, string[]>;
  drift: ReturnType<typeof workflowQualityFacade.drift>;
  stacks: string[];
  status: string;
} {
  const config = workflowQualityFacade.readConfig(context.root);
  const checks: Record<string, string[]> = {};
  for (const check of config.quality.checks) {
    checks[check.stage] = [...(checks[check.stage] ?? []), check.id];
  }
  return {
    checks,
    drift: workflowQualityFacade.drift(context.root, config),
    stacks: config.quality.stacks,
    status: config.quality.status,
  };
}

/** `repair`: dry run, `--apply <id>` or `--cancel <id>`. */
export function repair(
  context: KitContext,
  options: { apply?: string; cancel?: string } = {}
): RepairOutcome | RepairPlan {
  return locked(context, () => {
    if (options.apply) {
      return context.git.applyRepair(context.root, PLAN_PATH, options.apply);
    }
    if (options.cancel) {
      return context.git.cancelRepair(context.root, PLAN_PATH, options.cancel);
    }
    return context.git.planRepair(context.root, PLAN_PATH);
  });
}
