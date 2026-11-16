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
import type {
  AuthorizeInput,
  RevokeInput,
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
import type { KitContext } from "./kit-context.js";
import type { PlanChange } from "./kit-scope-create.js";
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
