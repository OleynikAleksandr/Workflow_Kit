import type {
  AssignmentSetupResult,
  WorktreeAssignment,
} from "../../workflow-assignment/src/workflow-assignment-facade.js";
import {
  type ExecutionModeOption,
  type ScopeProposal,
  workflowExecutionModeFacade,
} from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import type {
  CommitResult,
  RepairOutcome,
  RepairPlan,
} from "../../workflow-git/src/workflow-git-facade.js";
import type {
  IntegrationOutcome,
  IntegrationState,
} from "../../workflow-integration/src/workflow-integration-facade.js";
import type {
  ExecutionStrategy,
  RoundDigest,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import type {
  ProfileInput,
  QualityProposal,
} from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  type AssignmentCancelled,
  type AssignmentCleanupResult,
  type AssignmentCreated,
  type AssignmentNext,
  cancelAssignment,
  cleanupAssignments,
  createAssignment,
  nextAssignments,
} from "./kit-assignment.js";
import { readConfig } from "./kit-context.js";
import {
  type AssignmentAttached,
  type AssignmentState,
  assignmentStatus,
  attachAssignment,
  executorAssignment,
  setupAssignment,
} from "./kit-executor.js";
import { WorkflowKitBase } from "./kit-facade-base.js";
import { type HookResult, runGitHook } from "./kit-hooks.js";
import {
  continueIntegration,
  integrationStatus,
  startIntegration,
} from "./kit-integration.js";
import { type PauseState, setPause } from "./kit-pause.js";
import {
  applyQuality,
  detectQuality,
  type QualityApplied,
  qualityStatus,
  repair,
} from "./kit-quality.js";
import {
  acceptScope,
  type CarryoverInput,
  carryoverScope,
  chooseScope,
  closeScope,
  createScope,
  type ExtendInput,
  extendScope,
  type PlanChange,
  proposeScope,
  type ScopeChoiceResult,
  type ScopeInput,
  type ScopeProposalResult,
  setBlocked,
  type TaskPatch,
  updateTask,
} from "./kit-scope.js";
import { moveScopeOwner, type ScopeOwnerResult } from "./kit-scope-owner.js";
import {
  commitDocs,
  commitTask,
  startTask,
  type TaskCommit,
  type TaskStart,
} from "./kit-task.js";

export type {
  AssignmentSetupResult,
  WorktreeAssignment,
} from "../../workflow-assignment/src/workflow-assignment-facade.js";
export type {
  ExecutionModeOption,
  ScopeProposal,
} from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
export type {
  IntegrationOutcome,
  IntegrationState,
} from "../../workflow-integration/src/workflow-integration-facade.js";
export type {
  AssignmentCancelled,
  AssignmentCleanupResult,
  AssignmentCreated,
  AssignmentNext,
} from "./kit-assignment.js";
export type { AssignmentAttached, AssignmentState } from "./kit-executor.js";
export type { WorkflowKitOptions } from "./kit-facade-base.js";
export type { GitHookName, HookResult } from "./kit-hooks.js";
export { GIT_HOOKS } from "./kit-hooks.js";
export type { PauseState } from "./kit-pause.js";
export type { QualityApplied } from "./kit-quality.js";
export type {
  CarryoverInput,
  ExtendInput,
  PlanChange,
  ScopeChoiceResult,
  ScopeInput,
  ScopeProposalResult,
  TaskPatch,
} from "./kit-scope.js";
export type { ScopeOwnerResult } from "./kit-scope-owner.js";
export type { KitStatus, TaskBrief, ValidationReport } from "./kit-status.js";
export type { TaskCommit, TaskStart } from "./kit-task.js";

/**
 * `scope:proposal`: what the mode card needs from the stored proposal,
 * without the plan input. `scopeId`/`objective` come from the stored input
 * and are `null` after "refine"; `host` is `config.host` of the project.
 */
export interface ScopeProposalView {
  createdAt: string;
  generation: number;
  hasParallelWork: boolean;
  host: string | null;
  objective: string | null;
  options: ExecutionModeOption[];
  reason: string;
  recommended: ExecutionStrategy;
  refining: boolean;
  scopeId: string | null;
}

/**
 * Cluster facade of `core-runtime/clusters/project-workflow`: every process
 * operation of the Workflow Kit on one project root. Options, the bound
 * facades and the project operations come from `WorkflowKitBase`.
 */
export class WorkflowKitFacade extends WorkflowKitBase {
  /** `pause:set --on|--off --note`: the user's pause of the workflow. */
  setPause(root: string, paused: boolean, note: string): PauseState {
    return setPause(this.context(root), paused, note);
  }

  createScope(root: string, input: ScopeInput): PlanChange {
    return createScope(this.context(root), input);
  }

  /** `scope:propose`: validates the plan and stores the proposal of the mode card. */
  proposeScope(
    root: string,
    input: ScopeInput,
    recommended: ExecutionStrategy,
    reason: string
  ): ScopeProposalResult {
    return proposeScope(this.context(root), { input, reason, recommended });
  }

  /** `scope:choose`: the user's answer to the proposal of `generation`. */
  chooseScope(
    root: string,
    choice: {
      generation: number;
      note: string;
      option: ExecutionModeOption;
      session: string;
    }
  ): ScopeChoiceResult {
    return chooseScope(this.context(root), choice);
  }

  /** `scope:owner`: moves the owner session before the work starts. */
  moveOwner(
    root: string,
    request: { note: string; session: string }
  ): ScopeOwnerResult {
    return moveScopeOwner(this.context(root), request);
  }

  /** The stored scope proposal, or `null`. */
  readProposal(root: string): ScopeProposal | null {
    return workflowExecutionModeFacade.readProposal(root);
  }

  /** `assignment:next`: the tasks that can be handed out now and the active assignments. */
  nextAssignments(root: string): AssignmentNext {
    return nextAssignments(this.context(root));
  }

  /** `assignment:create --task`: a new assignment record and the executor brief. */
  createAssignment(root: string, taskId: string): AssignmentCreated {
    return createAssignment(this.context(root), taskId);
  }

  /** `scope:proposal`: the read-only card view of the stored proposal, or `null`. */
  proposalView(root: string): ScopeProposalView | null {
    const proposal = this.readProposal(root);
    if (!proposal) {
      return null;
    }
    const input = proposal.input as Partial<ScopeInput> | null;
    return {
      createdAt: proposal.createdAt,
      generation: proposal.generation,
      hasParallelWork: proposal.hasParallelWork,
      host: readConfig(this.context(root)).host ?? null,
      objective: typeof input?.objective === "string" ? input.objective : null,
      options: [...proposal.options],
      reason: proposal.reason,
      recommended: proposal.recommended,
      refining: proposal.refining,
      scopeId: typeof input?.id === "string" ? input.id : null,
    };
  }

  /** `assignment:attach <id>` in the executor worktree: executor plan and records. */
  attachAssignment(root: string, id: string): AssignmentAttached {
    return attachAssignment(this.context(root), id);
  }

  /** `assignment:status` in the executor worktree. */
  assignmentStatus(root: string): AssignmentState {
    return assignmentStatus(this.context(root));
  }

  /** `assignment:setup [--id]`: the stack install of an executor worktree (spec 5.4). */
  setupAssignment(root: string, id?: string): AssignmentSetupResult {
    return setupAssignment(this.context(root), id);
  }

  /** `assignment:cleanup [--id]` in main: worktree and branch removal after integration. */
  cleanupAssignments(root: string, id?: string): AssignmentCleanupResult {
    return cleanupAssignments(this.context(root), id);
  }

  /** `assignment:cancel --id [--force]` in main: drops a stuck assignment; the task stays TODO. */
  cancelAssignment(
    root: string,
    id: string,
    force = false
  ): AssignmentCancelled {
    return cancelAssignment(this.context(root), id, force);
  }

  /** `integration:start --id --source` in main: merge, plan candidate and integration commit. */
  startIntegration(
    root: string,
    assignmentId: string,
    source: string
  ): IntegrationOutcome {
    return startIntegration(this.context(root), assignmentId, source);
  }

  /** `integration:continue --id`: finishes an unfinished integration. */
  continueIntegration(root: string, assignmentId: string): IntegrationOutcome {
    return continueIntegration(this.context(root), assignmentId);
  }

  /** `integration:status`: IDLE or the phase of the integration journal. */
  integrationStatus(root: string): IntegrationState {
    return integrationStatus(this.context(root));
  }

  /** The executor record of the checkout; null outside an executor worktree. */
  executorAssignment(root: string): WorktreeAssignment | null {
    return executorAssignment(this.context(root));
  }

  extend(
    root: string,
    input: ExtendInput,
    expectedRevision?: number
  ): ReturnType<typeof extendScope> {
    return extendScope(this.context(root), input, expectedRevision);
  }

  updateTask(
    root: string,
    taskId: string,
    patch: TaskPatch,
    expectedRevision?: number
  ): PlanChange {
    return updateTask(this.context(root), taskId, patch, expectedRevision);
  }

  accept(root: string, note: string): PlanChange {
    return acceptScope(this.context(root), note);
  }

  close(root: string, scopeId: string, note: string): PlanChange {
    return closeScope(this.context(root), scopeId, note);
  }

  carryover(root: string, input: CarryoverInput): PlanChange {
    return carryoverScope(this.context(root), input);
  }

  block(root: string, reason: string): PlanChange {
    return setBlocked(this.context(root), reason);
  }

  unblock(root: string): PlanChange {
    return setBlocked(this.context(root), null);
  }

  startTask(
    root: string,
    taskId: string,
    confirmation: string | null = null
  ): TaskStart {
    return startTask(this.context(root), taskId, confirmation);
  }

  commitTask(
    root: string,
    taskId: string,
    options: { digest?: RoundDigest | null; files?: string[] } = {}
  ): TaskCommit {
    return commitTask(this.context(root), taskId, options);
  }

  commitDocs(root: string, files: string[], message?: string): CommitResult {
    return commitDocs(this.context(root), files, message);
  }

  qualityDetect(root: string, stacks?: string[]): QualityProposal {
    return detectQuality(this.context(root), stacks);
  }

  qualityApply(root: string, input: ProfileInput): QualityApplied {
    return applyQuality(this.context(root), input);
  }

  qualityStatus(root: string): ReturnType<typeof qualityStatus> {
    return qualityStatus(this.context(root));
  }

  /** `git-hook <name>`: handlers of the managed git hooks. */
  gitHook(root: string, name: string, args: string[] = []): HookResult {
    return runGitHook(this.context(root), name, args);
  }

  repair(
    root: string,
    options: { apply?: string; cancel?: string } = {}
  ): RepairOutcome | RepairPlan {
    return repair(this.context(root), options);
  }
}

export const workflowKitFacade = new WorkflowKitFacade();
