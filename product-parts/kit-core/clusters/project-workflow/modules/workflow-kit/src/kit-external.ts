// Commits made past the Kit (M40): a commit after the scope baseline without
// the `Workflow-Transaction` trailer (for example `git commit --no-verify`).
// They block the scope until the user adopts their exact list.
import {
  type UserDecision,
  type WorkflowPlan,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  ensureNoTransaction,
  type KitContext,
  locked,
  readPlan,
  savePlan,
} from "./kit-context.js";
import { change, type PlanChange } from "./kit-scope-create.js";

/**
 * Full SHAs of the commits in `baseline..HEAD` that carry no
 * `Workflow-Transaction` trailer and are not adopted, oldest first. Kit
 * commits of every role, integration commits and the executor commits they
 * bring in have the trailer. Empty without a scope.
 */
export function externalCommits(
  context: KitContext,
  plan: WorkflowPlan | null
): string[] {
  const scope = plan?.scope;
  if (!(scope && context.git.head(context.root))) {
    return [];
  }
  const adopted = new Set(scope.adoptedCommits ?? []);
  return context.git
    .history(context.root, scope.baselineCommit)
    .filter(
      (commit) =>
        !(commit.trailers["Workflow-Transaction"]?.[0] || adopted.has(commit.sha))
    )
    .map((commit) => commit.sha);
}

/** The refusal text and details shared by the guard and `commits:adopt`. */
export function externalMessage(commits: string[]): string {
  return `Commits made past the Workflow Kit since the scope baseline: ${commits.map((sha) => sha.slice(0, 12)).join(", ")}.`;
}

/**
 * `commits:adopt`: records the exact list of external commits in the plan
 * (`scope.adoptedCommits` and a decision). `commits` must be the current
 * list, in order; another list is EXTERNAL_COMMITS with the current one.
 * The next Kit commit records the plan change.
 */
export function adoptCommits(
  context: KitContext,
  commits: readonly string[],
  note: string,
  decision: UserDecision | null = null
): PlanChange {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    const external = externalCommits(context, current);
    ensure(
      external.length > 0,
      "NO_EXTERNAL_COMMITS",
      "There are no commits made past the Workflow Kit to adopt."
    );
    ensure(
      typeof note === "string" && note.trim().length >= 3,
      "ADOPT_NOTE",
      "Record the user's words in --note."
    );
    ensure(
      external.length === commits.length &&
        external.every((sha, index) => sha === commits[index]),
      "EXTERNAL_COMMITS",
      `${externalMessage(external)} The list to adopt differs from it.`,
      { commits: external },
      "Adopt the exact current list: `scripts/workflow commits:adopt --commits <sha,sha> --note \"<the user's words>\"`."
    );
    const plan = workflowPlanFacade.adopt(
      current,
      external,
      decision ?? {
        at: context.now(),
        kind: "adopt-commits",
        text: `adopt-commits (${external.map((sha) => sha.slice(0, 12)).join(", ")}): ${note.trim()}`,
      }
    );
    savePlan(context, plan);
    return change(plan, null);
  });
}
