import type { AutopilotGrant } from "./plan-authorization.js";
import type { ScopeAutomation } from "./plan-automation.js";
import type { AcceptanceEvidence } from "./plan-autopilot-completion.js";
import type { TaskDeferral } from "./plan-delivery-defer.js";

export const PLAN_SCHEMA = "harness-workflow-plan/1";
export const PLAN_PATH = ".harness/plans/todo-plan.md";

export type ScopeStatus = "ACTIVE" | "BLOCKED";
export type DeliveryStatus =
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "READY_FOR_ACCEPTANCE";
export type TaskStatus = "DONE" | "IN_PROGRESS" | "TODO";
export type TaskKind = "delivery" | "docs" | "quality" | "work";
export type RoundKind = "fixes" | "implementation" | "legacy";
export type RoundStatus = "CLOSED" | "OPEN";
export type ExecutionStrategy = "orchestrated" | "sequential";

export interface DocumentRef {
  heading?: string;
  path: string;
  required: boolean;
}

/** Who decided (M40): the user by a button or a message, or the grant of a run. */
export interface DecisionSource {
  /** sha256 of the scope grant that covered a `grant` decision. */
  authorization?: string | null;
  kind: "button" | "grant" | "message";
  messageId?: string | null;
  runId?: string | null;
  session?: string | null;
}

export interface UserDecision {
  at: string;
  /** Id of the decision request the host applied (M40); absent on text notes. */
  decisionId?: string;
  /** Kind of the applied decision (`accept`, `confirm-delivery`, ...). */
  kind?: string;
  source?: DecisionSource;
  text: string;
}

export interface RoundDigest {
  contracts: string[];
  decisions: string[];
  references: string[];
  result: string;
}

export interface WorkflowRound {
  digest: RoundDigest | null;
  id: string;
  kind: RoundKind;
  status: RoundStatus;
  title: string;
}

/** How an orchestrated task reached DONE: its integration into main (spec 7). */
export interface TaskIntegration {
  /** Id of the integration operation; the `Workflow-Transaction` of its commit. */
  operationId: string;
  /** The executor source commit, the second parent of the integration commit. */
  sourceCommit: string;
}

export interface WorkflowTask {
  acceptance: string[];
  checks: string[];
  commitMessage: string;
  confirmation: string | null;
  context: DocumentRef[];
  /** Deferred attempts of a delivery task (M39 `task:defer-delivery`). */
  deferrals?: TaskDeferral[];
  dependencies: string[];
  docsWaiver: string | null;
  files: string[];
  fixes: string | null;
  id: string;
  /** Present only on a task completed by an integration commit. */
  integration?: TaskIntegration;
  iteration: number;
  kind: TaskKind;
  /** Absent means false; only `work` tasks may set it. */
  parallelSafe?: boolean;
  roundId: string;
  status: TaskStatus;
  title: string;
  why: string;
}

/** Execution block of a scope; an absent block means `sequential`. */
export interface WorkflowExecution {
  maxWorkers: number;
  ownerSession: string | null;
  strategy: ExecutionStrategy;
}

/** The reviewed proposal a chosen scope was created from (`scope:choose`). */
export interface ScopeProposalRef {
  digest: string;
  generation: number;
}

export interface WorkflowScope {
  /**
   * Commits made past the Kit that the user adopted (M40, `commits:adopt`):
   * full SHAs in history order; absent when there are none.
   */
  adoptedCommits?: string[];
  acceptance: string[];
  /** Present when an autopilot run accepted the result (M39). */
  acceptanceEvidence?: AcceptanceEvidence;
  acceptanceNote: UserDecision | null;
  approval: UserDecision;
  /** The autopilot grant of the current run (M39); absent without one. */
  authorization?: AutopilotGrant;
  /** M39 automation block; absent on legacy plans. */
  automation?: ScopeAutomation;
  baselineCommit: string;
  blockedReason: string | null;
  context: DocumentRef[];
  decisions: UserDecision[];
  delivery: DeliveryStatus;
  execution?: WorkflowExecution;
  id: string;
  objective: string;
  /** Present when the scope was created by choosing a stored proposal. */
  proposal?: ScopeProposalRef;
  spec: string | null;
  status: ScopeStatus;
}

export interface ClosedScopeRef {
  /** The applied close decision of the user (M40, host decisions). */
  decision?: UserDecision;
  /** The autopilot run that closed the scope (M39). */
  autopilotRun?: string;
  closedAt: string;
  /** HEAD when an autopilot run closed the scope. */
  finalCommit?: string;
  scopeId: string;
}

export interface WorkflowPlan {
  currentTaskId: string | null;
  lastClosed: ClosedScopeRef | null;
  projectId: string;
  projectName: string;
  revision: number;
  rounds: WorkflowRound[];
  schema: typeof PLAN_SCHEMA;
  scope: WorkflowScope | null;
  tasks: WorkflowTask[];
}

export const DIGEST_RESULT_MAX_BYTES = 600;
export const DIGEST_ITEM_MAX_BYTES = 300;
export const DIGEST_MAX_ITEMS = 8;
const DOCS_TASK_PREFIX = "DOCS-";

const MARKDOWN_PATTERN = /\.(?:md|markdown)$/iu;
const PRODUCT_TREE_PREFIX = ".harness/product-tree/";

export function isMarkdownPath(file: string): boolean {
  return MARKDOWN_PATTERN.test(file);
}

/** Documentation: Markdown files and the product tree (`.harness/product-tree/**`). */
export function isDocumentationPath(file: string): boolean {
  return isMarkdownPath(file) || file.startsWith(PRODUCT_TREE_PREFIX);
}

export function functionalFiles(task: Pick<WorkflowTask, "files">): string[] {
  return task.files.filter((file) => !isDocumentationPath(file));
}

export function docsTaskId(roundId: string): string {
  return `${DOCS_TASK_PREFIX}${roundId}`;
}

export function emptyPlan(
  projectId: string,
  projectName: string
): WorkflowPlan {
  return {
    currentTaskId: null,
    lastClosed: null,
    projectId,
    projectName,
    revision: 1,
    rounds: [],
    schema: PLAN_SCHEMA,
    scope: null,
    tasks: [],
  };
}
