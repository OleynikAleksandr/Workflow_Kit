// The push barriers of the pre-push hook (M40, spec 3.1). Git writes one
// line per pushed ref to the hook's stdin:
// `<local ref> <local sha> <remote ref> <remote sha>`. The target (remote)
// ref decides: `git push origin HEAD:main` and a push of another local
// branch into `main` are pushes of `main`. One refused ref refuses the whole
// push.
import type { WorkflowPlan } from "../../workflow-plan/src/workflow-plan-facade.js";
import type { KitContext } from "./kit-context.js";

export interface PushRef {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

export interface PushRefusal {
  code: "CI_PUSH_NOT_ALLOWED" | "PUBLISH_SCOPE_OPEN";
  message: string;
}

const HEADS = "refs/heads/";
const ZERO_SHA = /^0+$/u;
const FIELDS = 4;

/** The ref lines of the hook's stdin; `\r\n` and blank lines are tolerated. */
export function parsePushRefs(stdin: string): PushRef[] {
  const refs: PushRef[] = [];
  for (const line of stdin.split("\n")) {
    const fields = line.replace(/\r$/u, "").trim().split(/\s+/u);
    if (fields.length !== FIELDS) {
      continue;
    }
    const [localRef = "", localSha = "", remoteRef = "", remoteSha = ""] = fields;
    refs.push({ localRef, localSha, remoteRef, remoteSha });
  }
  return refs;
}

/** The branch the scopes of the project live on: the checked-out one. */
function currentBranch(context: KitContext): string | null {
  const output = context.git.git.run(
    context.root,
    ["symbolic-ref", "-q", "--short", "HEAD"],
    { allowFailure: true }
  );
  const name = output.status === 0 ? output.stdout.trim() : "";
  return name === "" ? null : name;
}

/** Why the CI branch may not be pushed now, or null when it may. */
function ciRefusal(plan: WorkflowPlan, branch: string): string | null {
  const scope = plan.scope;
  const allDone = plan.tasks.every((task) => task.status === "DONE");
  if (scope?.automation) {
    const declared = scope.automation.ci?.task;
    if (declared === undefined) {
      return allDone
        ? null
        : `the plan names no delivery task that pushes ${branch} (automation.ci.task), so it is pushed only after every task is DONE`;
    }
    const status = plan.tasks.find((task) => task.id === declared)?.status;
    return status === "IN_PROGRESS" || status === "DONE"
      ? null
      : `delivery task ${declared}, which pushes ${branch}, is not started`;
  }
  const delivering = plan.tasks.some(
    (task) => task.kind === "delivery" && task.status === "IN_PROGRESS"
  );
  return delivering || allDone
    ? null
    : `${branch} is pushed by a delivery task in progress or after every task is DONE`;
}

/**
 * The first refusal among `refs` while a scope is open, or null. The
 * publication branch (`automation.publication.branch`, else the checked-out
 * branch) is PUBLISH_SCOPE_OPEN; the CI branch (`automation.ci.branch`,
 * for a plan without automation `ci/<scope>`) is CI_PUSH_NOT_ALLOWED
 * outside its delivery. A deletion (zero local SHA), tags and other
 * branches pass.
 */
export function pushRefusal(
  context: KitContext,
  plan: WorkflowPlan | null,
  refs: readonly PushRef[]
): PushRefusal | null {
  const scope = plan?.scope;
  if (!(plan && scope) || refs.length === 0) {
    return null;
  }
  const publication =
    scope.automation?.publication?.branch ?? currentBranch(context);
  const ci = scope.automation
    ? (scope.automation.ci?.branch ?? null)
    : `ci/${scope.id}`;
  for (const ref of refs) {
    if (ZERO_SHA.test(ref.localSha) || !ref.remoteRef.startsWith(HEADS)) {
      continue;
    }
    const branch = ref.remoteRef.slice(HEADS.length);
    if (branch === publication) {
      return {
        code: "PUBLISH_SCOPE_OPEN",
        message: `Branch ${branch} is published only after scope ${scope.id} is accepted and closed; nothing was pushed.`,
      };
    }
    const reason = branch === ci ? ciRefusal(plan, branch) : null;
    if (reason) {
      return {
        code: "CI_PUSH_NOT_ALLOWED",
        message: `Push of ${branch} is not allowed now: ${reason}; nothing was pushed.`,
      };
    }
  }
  return null;
}
