import {
  type WorkflowGitFacade,
  workflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  type DoctorOptions,
  type DoctorReport,
  runDoctor,
} from "./installer-doctor.js";
import { type InspectResult, inspectFolder } from "./installer-inspect.js";
import {
  type InstallOptions,
  type InstallOutcome,
  installKit,
} from "./installer-install.js";
import {
  type MigrateOptions,
  type MigrateOutcome,
  migrateHarnessPlan,
} from "./installer-migrate.js";
import {
  buildManifest,
  buildPayload,
  KIT_VERSION,
  type KitManifest,
  MANIFEST_PATH,
  type PayloadEntry,
  type PayloadOptions,
  renderManifest,
} from "./installer-payload.js";
import { agentRules } from "./installer-texts.js";

export type {
  DoctorCheck,
  DoctorOptions,
  DoctorReport,
  DoctorStatus,
} from "./installer-doctor.js";
export type {
  FolderAction,
  FolderState,
  InspectResult,
} from "./installer-inspect.js";
export type { InstallOptions, InstallOutcome } from "./installer-install.js";
export type { MigrateOptions, MigrateOutcome } from "./installer-migrate.js";
export type {
  EntryKind,
  KitManifest,
  ManifestFile,
  PayloadEntry,
  PayloadOptions,
} from "./installer-payload.js";

/**
 * Public facade of the workflow-installer module: the installation payload,
 * folder inspection, install and update, the project doctor and the
 * migration of legacy Harness plans.
 */
export class WorkflowInstallerFacade {
  readonly version = KIT_VERSION;
  readonly manifestPath = MANIFEST_PATH;
  readonly git: WorkflowGitFacade;

  constructor(git: WorkflowGitFacade = workflowGitFacade) {
    this.git = git;
  }

  /** `inspect <path>`: classifies a folder without changing it. */
  inspect(folder: string): InspectResult {
    return inspectFolder(this.git, folder);
  }

  /** `install <path> [--update]`: installs or updates the Kit and commits it. */
  install(folder: string, options: InstallOptions): InstallOutcome {
    return installKit(this.git, folder, options);
  }

  /** `doctor [--fix]`: health checks; `fix` repairs fixable findings only. */
  doctor(folder: string, options: DoctorOptions = {}): DoctorReport {
    return runDoctor(this.git, folder, options);
  }

  /** `migrate:harness-plan`: a legacy Harness plan becomes a Kit plan. */
  migrateHarnessPlan(folder: string, options: MigrateOptions): MigrateOutcome {
    return migrateHarnessPlan(this.git, folder, options);
  }

  /** Every file the Kit writes into a project, with its writing rule. */
  payload(options: PayloadOptions): PayloadEntry[] {
    return buildPayload(options);
  }

  manifest(entries: PayloadEntry[]): KitManifest {
    return buildManifest(entries);
  }

  renderManifest(manifest: KitManifest): string {
    return renderManifest(manifest);
  }

  /** The English agent rules of the managed AGENTS.md section. */
  agentRules(): string {
    return agentRules();
  }
}

export const workflowInstallerFacade = new WorkflowInstallerFacade();
