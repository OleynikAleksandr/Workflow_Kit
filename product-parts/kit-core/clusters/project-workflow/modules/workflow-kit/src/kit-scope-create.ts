import {
  type ExecutionModeOption,
  workflowExecutionModeFacade,
} from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import type { CommitResult } from "../../workflow-git/src/workflow-git-facade.js";
import {
  type ExecutionStrategy,
  type WorkflowExecution,
  type WorkflowPlan,
  type WorkflowPlanFacade,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  changedDocuments,
  commitPlan,
  ensureNoTransaction,
  type KitContext,
  locked,
  readConfig,
  readPlan,
  requireHead,
} from "./kit-context.js";
import { ensureContextBudget } from "./kit-context-budget.js";

export type ScopeInput = Parameters<WorkflowPlanFacade["createScope"]>[1];

export interface PlanChange {
  commit: CommitResult | null;
  revision: number;
  scopeId: string | null;
}

/** The plan transition context: baseline HEAD, clock and quality state. */
export function transition(context: KitContext): {
  baselineCommit: string;
  now: string;
  qualityConfigured: boolean;
} {
  return {
    baselineCommit: requireHead(context),
    now: context.now(),
    qualityConfigured: readConfig(context).quality.status === "CONFIGURED",
  };
}

/**
 * CHECK_UNKNOWN before anything is written: `checks` of the input tasks are
 * quality check ids (`workflowQualityFacade.ensurePlannedChecks`), refusals
 * name the input field `tasks[<index>].checks`.
 */
export function ensureInputChecks(
  context: KitContext,
  tasks: readonly { checks?: readonly string[]; id?: string }[] | undefined
): void {
  workflowQualityFacade.ensurePlannedChecks(
    readConfig(context),
    (tasks ?? []).map((task, index) => ({
      checks: task.checks ?? [],
      field: `tasks[${index}].checks`,
      taskId: task.id ?? null,
    }))
  );
}

/** The answer of a plan change: commit, revision and scope id. */
export function change(
  plan: WorkflowPlan,
  commit: CommitResult | null
): PlanChange {
  return { commit, revision: plan.revision, scopeId: plan.scope?.id ?? null };
}

/** Creates and commits the scope; every creation path clears the proposal. */
function commitScope(context: KitContext, input: ScopeInput): PlanChange {
  ensureNoTransaction(context);
  const plan = workflowPlanFacade.createScope(
    readPlan(context),
    input,
    transition(context)
  );
  ensureInputChecks(context, input.tasks);
  ensureContextBudget(context, plan, plan.tasks);
  const documents = changedDocuments(context, [
    input.spec,
    ...(input.context ?? []).map((ref) => ref.path),
  ]);
  const commit = commitPlan(context, plan, {
    files: documents,
    message: `docs: plan scope ${input.id}`,
    role: "scope-plan",
    scopeId: input.id,
    taskId: null,
  });
  workflowExecutionModeFacade.clear(context.root);
  return change(plan, commit);
}

/**
 * `scope:create`: records the agreed scope and commits it with its
 * documents. A Harness-hosted project chooses the mode through
 * `scope:propose` instead (`EXECUTION_MODE_REQUIRED`).
 */
export function createScope(
  context: KitContext,
  input: ScopeInput
): PlanChange {
  return locked(context, () => {
    ensure(
      readConfig(context).host !== "harness",
      "EXECUTION_MODE_REQUIRED",
      "In a Harness project the user chooses the execution mode; propose the scope instead of creating it.",
      {},
      'Run `scripts/workflow scope:propose --input <file.json> --recommended sequential|orchestrated --reason "<why>"` and end the turn.'
    );
    return commitScope(context, input);
  });
}

/** The proposal answer of `scope:propose`. */
export interface ScopeProposalResult {
  autoChosen: boolean;
  generation: number;
  hasParallelWork: boolean;
  options: ExecutionModeOption[];
  reason: string;
  recommended: ExecutionStrategy;
  scope: PlanChange | null;
}

/** The answer of `scope:choose`. */
export interface ScopeChoiceResult {
  execution: WorkflowExecution | null;
  generation: number;
  option: ExecutionModeOption;
  refining: boolean;
  scope: PlanChange | null;
}

/** The scope input with the chosen strategy; `maxWorkers` comes from the input or the default. */
function withExecution(
  input: ScopeInput,
  strategy: ExecutionStrategy,
  ownerSession: string | null,
  note: string | null
): ScopeInput {
  const maxWorkers = input.execution?.maxWorkers;
  return {
    ...structuredClone(input),
    ...(note === null ? {} : { approval: `${input.approval} | ${note}` }),
    execution: {
      ...(maxWorkers === undefined ? {} : { maxWorkers }),
      ownerSession,
      strategy,
    },
  };
}

/**
 * `scope:propose`: validates the plan exactly like `scope:create` without
 * creating it and stores the proposal for the user's choice. After a
 * "refine" answer, a new proposal without parallel work creates the
 * sequential scope at once (`autoChosen`).
 */
export function proposeScope(
  context: KitContext,
  request: { input: ScopeInput; reason: string; recommended: ExecutionStrategy }
): ScopeProposalResult {
  return locked(context, () => {
    ensureNoTransaction(context);
    const candidate = workflowPlanFacade.createScope(
      readPlan(context),
      withExecution(request.input, request.recommended, null, null),
      transition(context)
    );
    ensureInputChecks(context, request.input.tasks);
    ensureContextBudget(context, candidate, candidate.tasks);
    const proposal = workflowExecutionModeFacade.nextProposal(context.root, {
      hasParallelWork: workflowPlanFacade.hasParallelWork(candidate),
      input: request.input,
      now: context.now(),
      reason: request.reason,
      recommended: request.recommended,
    });
    const answer = {
      generation: proposal.generation,
      hasParallelWork: proposal.hasParallelWork,
      options: proposal.options,
      reason: proposal.reason,
      recommended: proposal.recommended,
    };
    const previous = workflowExecutionModeFacade.readProposal(context.root);
    if (previous?.refining === true && !proposal.hasParallelWork) {
      const scope = commitScope(
        context,
        withExecution(
          request.input,
          "sequential",
          null,
          "Execution mode chosen automatically: sequential (no parallel work after the specification was refined)"
        )
      );
      return { ...answer, autoChosen: true, scope };
    }
    workflowExecutionModeFacade.writeProposal(context.root, proposal);
    return { ...answer, autoChosen: false, scope: null };
  });
}

/**
 * `scope:choose`: records the user's answer to the current proposal.
 * `sequential`/`orchestrated` create the scope from the stored plan,
 * `refine` drops the plan and keeps the cycle in refinement. A stale
 * choice fails with PROPOSAL_CHANGED before anything is written.
 */
export function chooseScope(
  context: KitContext,
  request: {
    generation: number;
    note: string;
    option: ExecutionModeOption;
    session: string;
  }
): ScopeChoiceResult {
  return locked(context, () => {
    ensureNoTransaction(context);
    const choice = { ...request, now: context.now() };
    const proposal = workflowExecutionModeFacade.verifyChoice(
      context.root,
      choice
    );
    if (request.option === "refine") {
      workflowExecutionModeFacade.refine(context.root, proposal, choice);
      return {
        execution: null,
        generation: proposal.generation,
        option: "refine",
        refining: true,
        scope: null,
      };
    }
    const scope = commitScope(
      context,
      withExecution(
        proposal.input as ScopeInput,
        request.option,
        request.session.trim(),
        `Execution mode chosen by the user: ${request.option}: ${request.note.trim()}`
      )
    );
    return {
      execution: workflowPlanFacade.execution(readPlan(context)),
      generation: proposal.generation,
      option: request.option,
      refining: false,
      scope,
    };
  });
}
