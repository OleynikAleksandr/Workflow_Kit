import {
  type WorkflowGitFacade,
  workflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  type DoctorOptions,
  type DoctorReport,
  type InspectResult,
  type InstallOptions,
  type InstallOutcome,
  type MigrateOptions,
  type MigrateOutcome,
  WorkflowInstallerFacade,
} from "../../workflow-installer/src/workflow-installer-facade.js";
import {
  type HistoryEntry,
  type HookClient,
  type PartRequest,
  type RecoveryEvent,
  type RecoveryPacket,
  WorkflowRecoveryFacade,
} from "../../workflow-recovery/src/workflow-recovery-facade.js";
import {
  type AuthorizeInput,
  type RevokeInput,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  type AcceptanceInput,
  acceptRun,
  authorizeRun,
  closeRun,
  type GrantResult,
  revokeRun,
} from "./kit-autopilot.js";
import {
  autopilotStatus,
  type KitAutopilotStatus,
} from "./kit-autopilot-status.js";
import { type KitContext, locked } from "./kit-context.js";
import {
  applyDecision,
  type DecisionMeta,
  type DecisionOutcome,
  requestOf,
} from "./kit-decision-apply.js";
import {
  type DecisionChoice,
  type DecisionRequest,
  decisionsMode,
  ensureNoExternalCommits,
  requireDecision,
} from "./kit-decisions.js";
import { adoptCommits } from "./kit-external.js";
import {
  type DeferRequest,
  deferDelivery,
  type DeliveryDeferral,
} from "./kit-delivery-defer.js";
import type { PlanChange } from "./kit-scope-create.js";
import { coveringRun } from "./kit-task.js";
import {
  type KitStatus,
  readStatus,
  type ValidationReport,
  validateProject,
} from "./kit-status.js";

export interface WorkflowKitOptions {
  env?: NodeJS.ProcessEnv;
  git?: WorkflowGitFacade;
  now?: () => string;
}

/**
 * The project part of `WorkflowKitFacade`: its options, the git, installer
 * and recovery facades bound to the same git, and the operations that
 * delegate to them or read the project state (`kit-status.ts`).
 */
export class WorkflowKitBase {
  readonly env: NodeJS.ProcessEnv;
  readonly git: WorkflowGitFacade;
  readonly installer: WorkflowInstallerFacade;
  readonly recovery: WorkflowRecoveryFacade;
  private readonly now: () => string;

  constructor(options: WorkflowKitOptions = {}) {
    this.env = options.env ?? process.env;
    this.git = options.git ?? workflowGitFacade;
    this.now = options.now ?? (() => new Date().toISOString());
    this.recovery = new WorkflowRecoveryFacade(this.git);
    this.installer = new WorkflowInstallerFacade(this.git);
  }

  protected context(root: string): KitContext {
    return { env: this.env, git: this.git, now: this.now, root };
  }

  /** `inspect <path>`: folder state and the action to offer. */
  inspect(folder: string): InspectResult {
    return this.installer.inspect(folder);
  }

  /** `doctor [--fix]`: project health; fixes only fixable findings. */
  doctor(folder: string, options: DoctorOptions = {}): DoctorReport {
    return this.installer.doctor(folder, { env: this.env, ...options });
  }

  /** `migrate:harness-plan`: a legacy Harness plan becomes a Kit plan. */
  migrateHarnessPlan(
    folder: string,
    options: Omit<MigrateOptions, "now">
  ): MigrateOutcome {
    return this.installer.migrateHarnessPlan(folder, {
      ...options,
      now: this.now(),
    });
  }

  /** `install <path> [--update]`. */
  install(folder: string, options: InstallOptions): InstallOutcome {
    return this.installer.install(folder, options);
  }

  status(root: string): KitStatus {
    return readStatus(this.context(root));
  }

  /** `host` when only the app records user decisions (spec M40). */
  decisionsMode(root: string): "agent" | "host" {
    return decisionsMode(this.context(root));
  }

  /** Registers the decision request and refuses with USER_DECISION_REQUIRED. */
  requireDecision(root: string, choice: DecisionChoice): never {
    return requireDecision(this.context(root), choice);
  }

  decisionRequest(root: string, id: string): DecisionRequest {
    return requestOf(this.context(root), id);
  }

  /** `commits:adopt` of the `agent` mode: the exact list with the user's words. */
  adoptCommits(
    root: string,
    commits: readonly string[],
    note: string
  ): PlanChange {
    return adoptCommits(this.context(root), commits, note);
  }

  /** EXTERNAL_COMMITS when commits were made past the Kit (spec M40, 3.2). */
  externalGuard(root: string): void {
    const context = this.context(root);
    locked(context, () => {
      const plan = workflowPlanFacade.read(root);
      if (plan) {
        ensureNoExternalCommits(context, plan);
      }
    });
  }

  /** Applies a registered decision (host only in the CLI, spec M40). */
  applyDecision(root: string, id: string, meta: DecisionMeta): DecisionOutcome {
    return applyDecision(this.context(root), id, meta);
  }

  /** The owner session of the scope grant, or null (host ticket binding). */
  grantOwner(root: string): string | null {
    return (
      workflowPlanFacade.read(root)?.scope?.authorization?.ownerSession ?? null
    );
  }

  /** True when `task:start <taskId>` is a TODO delivery no live grant covers. */
  needsDeliveryDecision(root: string, taskId: string): boolean {
    const plan = workflowPlanFacade.read(root);
    const task = plan?.tasks.find((item) => item.id === taskId);
    return (
      plan !== null &&
      task?.kind === "delivery" &&
      task.status === "TODO" &&
      coveringRun(plan, task) === null
    );
  }

  validate(root: string): ValidationReport {
    return validateProject(this.context(root));
  }

  autopilotStatus(root: string): KitAutopilotStatus {
    return autopilotStatus(this.context(root));
  }

  /** `autopilot:authorize` (host only in the CLI, spec M39). */
  authorize(
    root: string,
    input: AuthorizeInput,
    expectedRevision: number
  ): GrantResult {
    return authorizeRun(this.context(root), input, expectedRevision);
  }

  /** `autopilot:revoke` (host only in the CLI, spec M39). */
  revoke(
    root: string,
    input: RevokeInput,
    expectedRevision: number
  ): GrantResult {
    return revokeRun(this.context(root), input, expectedRevision);
  }

  /** `accept --autopilot-run` (host only in the CLI, spec M39). */
  acceptRun(
    root: string,
    runId: string,
    input: AcceptanceInput,
    expectedRevision: number
  ): PlanChange {
    return acceptRun(this.context(root), runId, input, expectedRevision);
  }

  /** `task:defer-delivery` (spec M39): the current delivery back to TODO. */
  deferDelivery(root: string, request: DeferRequest): DeliveryDeferral {
    return deferDelivery(this.context(root), request);
  }

  /** `close --autopilot-run` (host only in the CLI, spec M39). */
  closeRun(
    root: string,
    scopeId: string,
    runId: string,
    expectedRevision: number
  ): PlanChange {
    return closeRun(this.context(root), scopeId, runId, expectedRevision);
  }

  recover(root: string, event: RecoveryEvent = "startup"): RecoveryPacket {
    return this.recovery.packet(root, event);
  }

  showTask(root: string, taskId: string): string {
    return this.recovery.showTask(root, taskId);
  }

  history(
    root: string,
    filter: { round?: string; task?: string } = {}
  ): { entries: HistoryEntry[]; text: string } {
    return this.recovery.history(root, filter);
  }

  sessionStart(
    root: string,
    client: HookClient,
    stdin: string,
    part: PartRequest | null = null
  ): string {
    return this.recovery.sessionStart(root, {
      client,
      env: this.env,
      part,
      stdin,
    });
  }
}
