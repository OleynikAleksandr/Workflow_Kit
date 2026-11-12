import type {
  FieldSpec,
  InputSchema,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { MIN_APPROVAL } from "./quality-apply.js";
import {
  CHECK_ID_PATTERN,
  CHECK_ROLES,
  CHECK_STAGES,
  MAX_TIMEOUT_MS,
} from "./quality-config.js";
import { STACK_ORDER } from "./quality-detect.js";

const PROFILE = "PROFILE_INVALID";
const CONFIG = "CONFIG_SCHEMA";

function field(
  name: string,
  type: string,
  required: boolean,
  code: string,
  description: string,
  extra: Partial<FieldSpec> = {}
): FieldSpec {
  return { code, description, name, required, type, ...extra };
}

const QUALITY_SCHEMA: InputSchema = {
  command: "quality:apply",
  description:
    "The quality profile chosen from `quality:detect`: `quality:apply --input <profile.json>`.",
  example: {
    approval: "User approved installing Biome as a dev dependency",
    checks: [
      {
        command: { args: ["biome", "check", "{files}"], executable: "npx" },
        id: "lint",
        required: true,
        role: "lint",
        stage: "commit",
        timeoutMs: 120_000,
      },
    ],
    docs: {
      contracts: [{ code: "src/{module}/**", docs: ["docs/{module}.md"] }],
    },
    install: [
      { args: ["install", "--save-dev", "@biomejs/biome"], executable: "npm" },
    ],
    packageManager: "npm",
    policy: { maxFileLines: 500, taskFileSoftLimit: null },
    stacks: ["node"],
  },
  fields: [
    field("stacks", "string[]", true, PROFILE, "Project ecosystems.", {
      minItems: 1,
    }),
    field("stacks[]", "string", false, "UNKNOWN_STACK", "A known stack id.", {
      enum: STACK_ORDER,
    }),
    field(
      "checks",
      "object[]",
      true,
      PROFILE,
      "Command checks; Kit builtin checks are kept automatically."
    ),
    field(
      "checks[].id",
      "string",
      true,
      CONFIG,
      "Unique check id; builtin ids (kit:*) are reserved (PROFILE_INVALID).",
      { pattern: CHECK_ID_PATTERN.source }
    ),
    field("checks[].role", "string", true, CONFIG, "What the check does.", {
      enum: CHECK_ROLES,
    }),
    field("checks[].stage", "string", true, CONFIG, "When the check runs.", {
      enum: CHECK_STAGES,
    }),
    field("checks[].command", "object", true, CONFIG, "The command to run."),
    field(
      "checks[].command.executable",
      "string",
      true,
      CONFIG,
      "Executable name or path."
    ),
    field(
      "checks[].command.args",
      "string[]",
      true,
      CONFIG,
      "Arguments; `{files}` expands to the candidate files."
    ),
    field(
      "checks[].command.cwd",
      "string",
      false,
      CONFIG,
      "Project-relative working directory."
    ),
    field(
      "checks[].required",
      "boolean",
      false,
      CONFIG,
      "A failed required check refuses the step; default false."
    ),
    field(
      "checks[].timeoutMs",
      "integer",
      false,
      CONFIG,
      "Timeout in milliseconds; default 120000.",
      { maximum: MAX_TIMEOUT_MS, minimum: 1 }
    ),
    field(
      "checks[].appliesTo",
      "string[]",
      false,
      CONFIG,
      "Globs of the files the check applies to."
    ),
    field(
      "checks[].evidence",
      "string",
      false,
      CONFIG,
      "Artifact and scenario; required for package and installed checks."
    ),
    field("docs", "object", false, CONFIG, "Documentation contracts."),
    field(
      "docs.contracts",
      "object[]",
      true,
      CONFIG,
      "Code globs mapped to their contract documents."
    ),
    field(
      "docs.contracts[].code",
      "string",
      true,
      CONFIG,
      "Code glob; `{name}` placeholders bind path segments."
    ),
    field(
      "docs.contracts[].docs",
      "string[]",
      true,
      CONFIG,
      "Documents that change with the code.",
      { minItems: 1 }
    ),
    field(
      "install",
      "object[]",
      false,
      PROFILE,
      "Tool install commands run before the profile is written."
    ),
    field(
      "install[].executable",
      "string",
      true,
      PROFILE,
      "Executable of the install command."
    ),
    field(
      "install[].args",
      "string[]",
      true,
      PROFILE,
      "Arguments of the install command."
    ),
    field(
      "install[].cwd",
      "string",
      false,
      PROFILE,
      "Project-relative working directory."
    ),
    field(
      "approval",
      "string",
      false,
      "INSTALL_APPROVAL",
      "The user's approval of the installs (trimmed length); required when install is not empty.",
      { minLength: MIN_APPROVAL }
    ),
    field(
      "packageManager",
      "string|null",
      false,
      CONFIG,
      "Package manager of the project."
    ),
    field("policy", "object", false, CONFIG, "Project policy."),
    field(
      "policy.maxFileLines",
      "integer|null",
      false,
      CONFIG,
      "Line limit of the kit:file-lines check."
    ),
    field(
      "policy.taskFileSoftLimit",
      "integer|null",
      false,
      CONFIG,
      "Soft limit of files per task."
    ),
  ],
  rules: [
    "Only package or installed checks run at the delivery stage, and they need evidence (CONFIG_SCHEMA).",
    "Check ids are unique and never reuse a Kit builtin id (PROFILE_INVALID).",
    "Install commands run in order after validation; the first failure stops them and the profile is not written (INSTALL_FAILED).",
  ],
};

/** A copy of the `quality:apply` input descriptor. */
export function qualityInputSchema(): InputSchema {
  return structuredClone(QUALITY_SCHEMA);
}
