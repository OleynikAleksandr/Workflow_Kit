import { WorkflowError } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { GitRunner } from "./git-runner.js";

export interface GitIdentity {
  email: string;
  name: string;
}

export type IdentityScope = "global" | "local";

export interface ResolvedIdentity extends GitIdentity {
  source: IdentityScope;
}

const PLACEHOLDER_NAMES = new Set(["your name", "ваше имя"]);
const PLACEHOLDER_EMAILS = new Set(["you@example.com"]);
const PLACEHOLDER_DOMAINS = new Set(["example", "invalid", "localhost"]);

/** The fix every identity refusal names: set a real global identity once. */
export const IDENTITY_FIX_COMMANDS =
  'Run once: `git config --global user.name "Your Real Name"` and `git config --global user.email "you@your-domain"`; then `scripts/workflow doctor --fix` applies it to the project.';

type IdentityField = "email" | "name";

/** Why an identity cannot sign Kit commits; null when it can. */
interface IdentityProblem {
  code: "GIT_IDENTITY_INVALID" | "GIT_IDENTITY_PLACEHOLDER";
  field: IdentityField;
  message: string;
}

/** Straight, typographic and backtick quotes of any kind. */
const QUOTES =
  /["'`\u2018\u2019\u201A\u201C\u201D\u201E\u00AB\u00BB\u2039\u203A]/u;
const ANGLE_BRACKETS = /[<>]/u;
/** `local@domain.tld`: exactly one `@`, no whitespace, a dot in the domain. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function isPlaceholderDomain(domain: string): boolean {
  return (
    domain === "" ||
    PLACEHOLDER_DOMAINS.has(domain) ||
    domain.startsWith("example.") ||
    domain.endsWith(".invalid")
  );
}

/** True for empty, sample or reserved identities that must never sign commits. */
export function isPlaceholderIdentity(identity: GitIdentity): boolean {
  const name = identity.name.trim().toLowerCase();
  const email = identity.email.trim().toLowerCase();
  if (name === "" || email === "" || PLACEHOLDER_NAMES.has(name)) {
    return true;
  }
  if (PLACEHOLDER_EMAILS.has(email)) {
    return true;
  }
  const at = email.lastIndexOf("@");
  return at < 0 || isPlaceholderDomain(email.slice(at + 1));
}

/**
 * The single identity validator (setting and reading alike): the name is
 * not empty and has no quotes or angle brackets; the email looks like
 * `local@domain.tld` without whitespace, quotes or angle brackets; then
 * placeholders are refused.
 */
function identityProblem(identity: GitIdentity): IdentityProblem | null {
  const name = identity.name.trim();
  const email = identity.email.trim();
  if (name === "" || QUOTES.test(name) || ANGLE_BRACKETS.test(name)) {
    return {
      code: "GIT_IDENTITY_INVALID",
      field: "name",
      message:
        "The git name must not be empty and must not contain quotes or angle brackets.",
    };
  }
  if (
    QUOTES.test(email) ||
    ANGLE_BRACKETS.test(email) ||
    !EMAIL_SHAPE.test(email)
  ) {
    return {
      code: "GIT_IDENTITY_INVALID",
      field: "email",
      message:
        "The git email must look like name@domain.tld, without spaces, quotes or angle brackets.",
    };
  }
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    return {
      code: "GIT_IDENTITY_PLACEHOLDER",
      field: "name",
      message: `"${name}" is a placeholder git name; use your real name.`,
    };
  }
  if (isPlaceholderIdentity({ email, name })) {
    return {
      code: "GIT_IDENTITY_PLACEHOLDER",
      field: "email",
      message: `${email} is a placeholder git email; use your real address.`,
    };
  }
  return null;
}

/** True when the identity passes `identityProblem` and may sign Kit commits. */
export function isUsableIdentity(identity: GitIdentity): boolean {
  return identityProblem(identity) === null;
}

/** The trimmed identity; throws GIT_IDENTITY_INVALID or GIT_IDENTITY_PLACEHOLDER. */
function validateIdentity(identity: GitIdentity): GitIdentity {
  const problem = identityProblem(identity);
  if (problem) {
    throw new WorkflowError(problem.code, problem.message, {
      field: problem.field,
    });
  }
  return { email: identity.email.trim(), name: identity.name.trim() };
}

/**
 * GIT_IDENTITY_REQUIRED: the message names the problem once; the terminal
 * fix is only the next action.
 */
export function identityRequiredError(
  configured: boolean,
  suffix = ""
): WorkflowError {
  return new WorkflowError(
    "GIT_IDENTITY_REQUIRED",
    `The Workflow Kit needs a real git name and email for its commits; ${configured ? "the configured one is a placeholder or invalid" : "none is set"}.${suffix}`,
    { placeholder: configured },
    IDENTITY_FIX_COMMANDS
  );
}

/** Identity stored in one config file only (`--local` or `--global`); null when incomplete. */
export function readScopedIdentity(
  git: GitRunner,
  root: string,
  scope: IdentityScope
): GitIdentity | null {
  const value = (key: string) =>
    git
      .run(root, ["config", `--${scope}`, "--get", key], { allowFailure: true })
      .stdout.trim();
  const name = value("user.name");
  const email = value("user.email");
  return name && email ? { email, name } : null;
}

/** The repository-local identity, else the global one; unusable ones are skipped. */
export function resolveIdentity(
  git: GitRunner,
  root: string
): ResolvedIdentity | null {
  for (const source of ["local", "global"] as const) {
    const identity = readScopedIdentity(git, root, source);
    if (identity && isUsableIdentity(identity)) {
      return { ...identity, source };
    }
  }
  return null;
}

/** Writes a validated identity into the repository-local config. */
export function writeLocalIdentity(
  git: GitRunner,
  root: string,
  identity: GitIdentity
): void {
  const valid = validateIdentity(identity);
  git.run(root, ["config", "--local", "user.name", valid.name]);
  git.run(root, ["config", "--local", "user.email", valid.email]);
}

/** Validates the identity and writes it into the global git config. */
export function writeGlobalIdentity(
  git: GitRunner,
  cwd: string,
  identity: GitIdentity
): GitIdentity {
  const valid = validateIdentity(identity);
  git.run(cwd, ["config", "--global", "user.name", valid.name]);
  git.run(cwd, ["config", "--global", "user.email", valid.email]);
  return valid;
}

/**
 * The repository-local identity every Kit commit is signed with; fails with
 * GIT_IDENTITY_REQUIRED when it is missing, a placeholder or invalid.
 */
export function requireCommitIdentity(
  git: GitRunner,
  root: string
): GitIdentity {
  const identity = readScopedIdentity(git, root, "local");
  if (identity && isUsableIdentity(identity)) {
    return identity;
  }
  throw identityRequiredError(identity !== null);
}

/** `-c` arguments that pass an identity to one git command explicitly. */
/**
 * Author and committer variables for a Kit commit. Git exports
 * `GIT_AUTHOR_*` to hooks and they win over `-c user.*`, so a Kit commit made
 * from inside another commit's hook would otherwise inherit that author.
 */
export function identityEnv(identity: GitIdentity): NodeJS.ProcessEnv {
  return {
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_AUTHOR_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
  };
}

export function identityArgs(identity: GitIdentity): string[] {
  return [
    "-c",
    `user.name=${identity.name}`,
    "-c",
    `user.email=${identity.email}`,
  ];
}
