import path from "node:path";
import { WorkflowError } from "./workflow-error.js";

export type WorkflowPlatform = "darwin" | "linux" | "win32";

const BACKSLASH_PATTERN = /\\/gu;
const DRIVE_LETTER_PATTERN = /^[A-Za-z]:/u;
const DUPLICATE_SLASH_PATTERN = /\/{2,}/gu;
const TRAILING_SLASH_PATTERN = /\/+$/u;
const LEADING_DOT_SLASH_PATTERN = /^(?:\.\/)+/u;

export class WorkflowPathError extends WorkflowError {
  constructor(message: string, offendingPath: string) {
    super("UNSAFE_PATH", message, { path: offendingPath });
  }
}

/** The Kit platform of a Node platform (default: this process); every other OS counts as linux. */
export function currentWorkflowPlatform(
  platform?: NodeJS.Platform
): WorkflowPlatform {
  const current = platform ?? process.platform;
  if (current === "win32" || current === "darwin") {
    return current;
  }
  return "linux";
}

function isCaseInsensitivePlatform(platform: WorkflowPlatform): boolean {
  return platform === "win32" || platform === "darwin";
}

/** Converts any OS-style path to forward slashes without resolving it. */
export function toPosixPath(value: string): string {
  return value.replace(BACKSLASH_PATTERN, "/");
}

/**
 * Normalizes a project-relative path into the canonical POSIX form stored in
 * plans, manifests and configuration. Rejects absolute paths, drive letters,
 * parent traversal and empty segments.
 */
export function normalizeRelativePath(value: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new WorkflowPathError(
      "Path must be a non-empty string.",
      String(value)
    );
  }
  const posix = toPosixPath(value.trim())
    .replace(DUPLICATE_SLASH_PATTERN, "/")
    .replace(LEADING_DOT_SLASH_PATTERN, "")
    .replace(TRAILING_SLASH_PATTERN, "");
  if (posix.startsWith("/") || DRIVE_LETTER_PATTERN.test(posix)) {
    throw new WorkflowPathError("Path must be relative to the project.", value);
  }
  const segments = posix.split("/");
  if (
    segments.some(
      (segment) => segment === ".." || segment === "" || segment === "."
    )
  ) {
    throw new WorkflowPathError("Path must stay inside the project.", value);
  }
  return posix;
}

/** Resolves a canonical relative path to an absolute OS path inside root. */
export function resolveInside(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WorkflowPathError("Path escapes the project root.", relativePath);
  }
  return resolved;
}

/** Converts an absolute path inside root into the canonical relative form. */
export function relativeFromRoot(root: string, absolutePath: string): string {
  const relative = path.relative(
    path.resolve(root),
    path.resolve(absolutePath)
  );
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new WorkflowPathError(
      "Path is not inside the project root.",
      absolutePath
    );
  }
  return normalizeRelativePath(relative);
}

export function samePath(
  left: string,
  right: string,
  platform: WorkflowPlatform
): boolean {
  const a = toPosixPath(left).replace(TRAILING_SLASH_PATTERN, "");
  const b = toPosixPath(right).replace(TRAILING_SLASH_PATTERN, "");
  return isCaseInsensitivePlatform(platform)
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

/** True when the relative path equals the prefix or lies below it. */
export function isWithin(relativePath: string, prefix: string): boolean {
  const value = normalizeRelativePath(relativePath);
  const base = normalizeRelativePath(prefix);
  return value === base || value.startsWith(`${base}/`);
}
