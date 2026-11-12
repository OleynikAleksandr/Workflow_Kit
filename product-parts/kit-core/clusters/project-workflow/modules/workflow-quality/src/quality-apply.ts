import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type CheckDefinition,
  type CheckInput,
  type CommandSpec,
  type DocsContract,
  normalizeCheck,
  validateCheck,
  validateConfig,
  type WorkflowConfig,
} from "./quality-config.js";
import { detectStacks, STACK_ORDER, type StackId } from "./quality-detect.js";

/** Input of `quality:apply`: the profile chosen from a proposal. */
export interface ProfileInput {
  approval?: string;
  checks: CheckInput[];
  docs?: { contracts: DocsContract[] };
  install?: CommandSpec[];
  packageManager?: string | null;
  policy?: Partial<WorkflowConfig["policy"]>;
  stacks: string[];
}

export interface InstallResult {
  command: string;
  durationMs: number;
  output: string;
}

export interface DriftReport {
  /** Detected ecosystems that the profile does not cover. */
  added: StackId[];
  /** Profile stacks without manifests in the project. */
  missing: string[];
  status: "discovery" | "drift" | "ok";
}

const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
export const MIN_APPROVAL = 10;
const OUTPUT_TAIL = 4000;

function approvalGiven(input: ProfileInput): boolean {
  return (
    typeof input.approval === "string" &&
    input.approval.trim().length >= MIN_APPROVAL
  );
}

/** Install commands are checked before anything runs; they need the approval. */
function checkInstalls(input: ProfileInput): void {
  const commands: unknown = input.install ?? [];
  ensure(
    Array.isArray(commands),
    "PROFILE_INVALID",
    "install must be a list of commands.",
    { field: "install" }
  );
  for (const [index, command] of commands.entries()) {
    const entry = `install[${index}]`;
    ensure(
      command &&
        typeof command.executable === "string" &&
        command.executable.trim() !== "",
      "PROFILE_INVALID",
      "Each install command needs executable and args.",
      { field: `${entry}.executable` }
    );
    ensure(
      Array.isArray(command.args) &&
        command.args.every((arg: unknown) => typeof arg === "string"),
      "PROFILE_INVALID",
      "Each install command needs executable and args.",
      { field: `${entry}.args` }
    );
  }
  ensure(
    commands.length === 0 || approvalGiven(input),
    "INSTALL_APPROVAL",
    `Installing tools changes the project; record the user's approval in \`approval\` (at least ${MIN_APPROVAL} characters).`,
    { field: "approval" }
  );
}

/** Builds the CONFIGURED configuration; builtin checks of `current` are kept. */
export function configuredProfile(
  current: WorkflowConfig,
  input: ProfileInput
): WorkflowConfig {
  ensure(
    input && Array.isArray(input.stacks) && input.stacks.length > 0,
    "PROFILE_INVALID",
    "The profile names at least one stack.",
    { field: "stacks" }
  );
  const unknown = input.stacks.filter(
    (id) => !STACK_ORDER.includes(id as StackId)
  );
  ensure(
    unknown.length === 0,
    "UNKNOWN_STACK",
    `Unknown stack: ${unknown.join(", ")}`,
    { field: `stacks[${input.stacks.indexOf(unknown[0] as string)}]` }
  );
  ensure(
    Array.isArray(input.checks),
    "PROFILE_INVALID",
    "The profile needs a checks list.",
    { field: "checks" }
  );
  const builtins = current.quality.checks.filter((check) => check.builtin);
  const builtinIds = new Set(builtins.map((check) => check.id));
  const checks: CheckDefinition[] = input.checks.map((check, index) => {
    const entry = `checks[${index}]`;
    ensure(
      check && typeof check === "object",
      "PROFILE_INVALID",
      "Each check must be an object.",
      { field: entry }
    );
    ensure(
      !builtinIds.has(check.id),
      "PROFILE_INVALID",
      `Check id ${check.id} is reserved for a Kit builtin.`,
      { field: `${entry}.id` }
    );
    const normalized = normalizeCheck(check);
    validateCheck(normalized, entry);
    return normalized;
  });
  checkInstalls(input);
  return validateConfig({
    ...current,
    docs: input.docs ?? current.docs,
    policy: { ...current.policy, ...(input.policy ?? {}) },
    quality: {
      checks: [...checks, ...builtins],
      packageManager: input.packageManager ?? null,
      stacks: [...new Set(input.stacks)],
      status: "CONFIGURED",
    },
  });
}

/**
 * Runs approved install commands in the project root. The first failure
 * stops the sequence; nothing is rolled back because installs change files
 * the user can inspect.
 */
export function runInstalls(
  root: string,
  input: ProfileInput,
  env: NodeJS.ProcessEnv
): InstallResult[] {
  const commands = input.install ?? [];
  if (commands.length === 0) {
    return [];
  }
  ensure(
    approvalGiven(input),
    "INSTALL_APPROVAL",
    "Installing tools changes the project; record the user's approval in `approval` (at least 10 characters).",
    { field: "approval" }
  );
  const results: InstallResult[] = [];
  for (const command of commands) {
    ensure(
      command &&
        typeof command.executable === "string" &&
        Array.isArray(command.args),
      "PROFILE_INVALID",
      "Each install command needs executable and args."
    );
    const started = Date.now();
    const outcome = workflowPlatformFacade.run({
      args: command.args,
      cwd: command.cwd
        ? workflowPlatformFacade.resolveInside(root, command.cwd)
        : root,
      env,
      executable: command.executable,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
    const text = [command.executable, ...command.args].join(" ");
    const output = `${outcome.stdout}${outcome.stderr}`.slice(-OUTPUT_TAIL);
    if (outcome.status !== 0) {
      throw new WorkflowError(
        "INSTALL_FAILED",
        `Install command failed: ${text}`,
        { completed: results, output: outcome.errorMessage ?? output },
        "Fix the install problem and repeat quality:apply; the profile was not changed."
      );
    }
    results.push({ command: text, durationMs: Date.now() - started, output });
  }
  return results;
}

/**
 * Executables that work only with a manifest of their stack (package
 * scripts and binaries, modules, projects). Toolchain commands such as
 * `node --test` or `python -m pytest` run without one.
 */
const MANIFEST_TOOLS: Readonly<Record<StackId, readonly string[]>> = {
  dotnet: ["dotnet"],
  go: ["go", "govulncheck"],
  jvm: ["gradle", "gradlew", "mvn", "mvnw"],
  node: ["bun", "bunx", "npm", "npx", "pnpm", "yarn"],
  python: ["poetry", "uv"],
  rust: ["cargo", "cargo-audit"],
  swift: ["swift"],
};
const EXECUTABLE_SUFFIX = /\.(?:bat|cmd|exe)$/iu;
const PATH_SEPARATOR = /[\\/]/u;

function executableName(executable: string): string {
  const base = executable.split(PATH_SEPARATOR).at(-1) ?? executable;
  return base.toLowerCase().replace(EXECUTABLE_SUFFIX, "");
}

/**
 * True when a check command of the profile needs the stack's manifest. An
 * unknown stack id (hand-edited configuration) always needs one.
 */
function needsManifest(config: WorkflowConfig, stack: string): boolean {
  const tools: readonly string[] | undefined = MANIFEST_TOOLS[stack as StackId];
  if (!tools) {
    return true;
  }
  return config.quality.checks.some(
    (check) =>
      check.command !== undefined &&
      tools.includes(executableName(check.command.executable))
  );
}

/**
 * Compares the profile stacks with the stacks detected in the project. A
 * profile stack without manifests is `missing` only when one of the profile
 * checks runs a tool that needs the manifest.
 */
export function profileDrift(
  root: string,
  config: WorkflowConfig
): DriftReport {
  if (config.quality.status === "DISCOVERY") {
    return { added: [], missing: [], status: "discovery" };
  }
  const detected = detectStacks(root).map((item) => item.id);
  const added = detected.filter((id) => !config.quality.stacks.includes(id));
  const missing = config.quality.stacks.filter(
    (id) => !detected.includes(id as StackId) && needsManifest(config, id)
  );
  return {
    added,
    missing,
    status: added.length === 0 && missing.length === 0 ? "ok" : "drift",
  };
}
