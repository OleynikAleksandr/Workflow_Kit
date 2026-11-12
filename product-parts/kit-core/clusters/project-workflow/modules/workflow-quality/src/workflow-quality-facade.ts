import path from "node:path";
import { workflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import type { InputSchema } from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  configuredProfile,
  type DriftReport,
  type InstallResult,
  type ProfileInput,
  profileDrift,
  runInstalls,
} from "./quality-apply.js";
import {
  missingContracts,
  type OversizedDocument,
  oversizedDocuments,
} from "./quality-builtins.js";
import {
  type CheckDefinition,
  type CheckInput,
  CONFIG_PATH,
  defaultConfig,
  normalizeCheck,
  validateCheck,
  validateConfig,
  type WorkflowConfig,
} from "./quality-config.js";
import {
  detectStacks,
  STACK_ORDER,
  type StackDetection,
  type StackId,
} from "./quality-detect.js";
import { qualityInputSchema } from "./quality-input-schema.js";
import { proposeQuality, type QualityProposal } from "./quality-proposal.js";
import {
  ensurePlannedChecks,
  type PlannedChecks,
  runStage,
  type StageReport,
  type StageRequest,
  selectChecks,
  unknownPlannedChecks,
} from "./quality-runner.js";

export type {
  DriftReport,
  InstallResult,
  ProfileInput,
} from "./quality-apply.js";
export type { OversizedDocument } from "./quality-builtins.js";
export type {
  CheckDefinition,
  CheckInput,
  CheckRole,
  CheckStage,
  CommandSpec,
  DocsContract,
  WorkflowConfig,
} from "./quality-config.js";
export type { StackDetection, StackId } from "./quality-detect.js";
export type { ProposalEntry, QualityProposal } from "./quality-proposal.js";
export type {
  CheckResult,
  CheckStatus,
  StageReport,
  StageRequest,
} from "./quality-runner.js";

/** Public facade of the workflow-quality module: configuration, detection and checks. */
export class WorkflowQualityFacade {
  readonly configPath = CONFIG_PATH;

  defaultConfig(): WorkflowConfig {
    return defaultConfig();
  }

  validateConfig(config: WorkflowConfig): WorkflowConfig {
    return validateConfig(config);
  }

  normalizeCheck(input: CheckInput): CheckDefinition {
    const check = normalizeCheck(input);
    validateCheck(check);
    return check;
  }

  configFile(root: string): string {
    return path.join(root, ...CONFIG_PATH.split("/"));
  }

  /** Reads the project configuration; a missing file means the default DISCOVERY profile. */
  readConfig(root: string): WorkflowConfig {
    const text = workflowPlatformFacade.readTextIfExists(this.configFile(root));
    if (text === null) {
      return defaultConfig();
    }
    let parsed: WorkflowConfig;
    try {
      parsed = JSON.parse(text) as WorkflowConfig;
    } catch (cause) {
      throw new WorkflowError(
        "CONFIG_JSON",
        `${CONFIG_PATH} is not valid JSON: ${(cause as Error).message}`
      );
    }
    return validateConfig(parsed);
  }

  renderConfig(config: WorkflowConfig): string {
    return `${JSON.stringify(validateConfig(config), null, 2)}\n`;
  }

  /** Ecosystems recognised by detection and the catalog, in priority order. */
  stacks(): readonly StackId[] {
    return STACK_ORDER;
  }

  detect(root: string): StackDetection[] {
    return detectStacks(root);
  }

  /**
   * Proposes a quality profile from detection and the catalog. `stacks`
   * overrides detection; `which` defaults to a PATH lookup.
   */
  propose(
    root: string,
    options: { stacks?: string[]; which?: (name: string) => boolean } = {}
  ): QualityProposal {
    const unknown = (options.stacks ?? []).filter(
      (id) => !STACK_ORDER.includes(id as StackId)
    );
    ensure(
      unknown.length === 0,
      "UNKNOWN_STACK",
      `Unknown stack: ${unknown.join(", ")}. Known: ${STACK_ORDER.join(", ")}.`
    );
    return proposeQuality(root, {
      stacks: options.stacks as StackId[] | undefined,
      which:
        options.which ??
        ((name) => workflowPlatformFacade.findExecutable(name) !== null),
    });
  }

  /**
   * Planned `tasks[].checks` ids the profile cannot run: with a CONFIGURED
   * profile every id not in it, before QUALITY ids that are not of the check
   * id form or name an unknown `kit:` builtin.
   */
  unknownPlannedChecks(
    config: WorkflowConfig,
    ids: readonly string[]
  ): string[] {
    return unknownPlannedChecks(config, ids);
  }

  /** CHECK_UNKNOWN for the first planned task with an unknown check id. */
  ensurePlannedChecks(
    config: WorkflowConfig,
    tasks: readonly PlannedChecks[]
  ): void {
    ensurePlannedChecks(config, tasks);
  }

  /** Checks a stage would run, without running them. */
  selectChecks(request: StageRequest): CheckDefinition[] {
    return selectChecks(request);
  }

  runStage(request: StageRequest): StageReport {
    return runStage(request);
  }

  /** Code files of the candidate whose contract documents are missing. */
  missingContracts(config: WorkflowConfig, files: string[]): string[] {
    return missingContracts(config, files);
  }

  /**
   * Markdown files of `files` (the plan excluded) larger than the
   * `budget.documentBytes` of `config`: the size rule of `kit:doc-size`.
   */
  oversizedDocuments(
    root: string,
    files: string[],
    config: WorkflowConfig
  ): OversizedDocument[] {
    return oversizedDocuments(root, files, config.budget.documentBytes);
  }

  /**
   * Stores stage reports of a commit transaction. The git module renames the
   * pending record to `<sha>.json` and `last.json` once the commit exists.
   */
  recordEvidence(
    root: string,
    transactionId: string,
    reports: StageReport[]
  ): string {
    const file = workflowGitFacade.localPath(
      root,
      "verification",
      `pending-${transactionId}.json`
    );
    workflowPlatformFacade.writeFileAtomic(
      file,
      `${JSON.stringify({ reports, transaction: transactionId }, null, 2)}\n`
    );
    return file;
  }

  /** Reads stored evidence by commit SHA, or the latest one. */
  readEvidence(
    root: string,
    reference = "last"
  ): { commit?: string; reports: StageReport[]; transaction: string } | null {
    const text = workflowPlatformFacade.readTextIfExists(
      workflowGitFacade.localPath(root, "verification", `${reference}.json`)
    );
    return text === null ? null : JSON.parse(text);
  }

  /** Input descriptor of `quality:apply` (a copy; same shape as the plan descriptors). */
  inputSchema(): InputSchema {
    return qualityInputSchema();
  }

  /** The configuration `apply` would write, without installing anything. */
  previewProfile(root: string, input: ProfileInput): WorkflowConfig {
    return configuredProfile(this.readConfig(root), input);
  }

  /**
   * `quality:apply`: validates the profile, runs approved install commands
   * and writes the CONFIGURED configuration. The `quality` commit is made
   * by the Workflow Kit facade.
   */
  applyProfile(
    root: string,
    input: ProfileInput,
    env: NodeJS.ProcessEnv = process.env
  ): { config: WorkflowConfig; installs: InstallResult[] } {
    const config = this.previewProfile(root, input);
    const installs = runInstalls(root, input, env);
    this.writeConfig(root, config);
    return { config, installs };
  }

  drift(
    root: string,
    config: WorkflowConfig = this.readConfig(root)
  ): DriftReport {
    return profileDrift(root, config);
  }

  writeConfig(root: string, config: WorkflowConfig): void {
    workflowPlatformFacade.writeFileAtomic(
      this.configFile(root),
      this.renderConfig(config)
    );
  }
}

export const workflowQualityFacade = new WorkflowQualityFacade();
