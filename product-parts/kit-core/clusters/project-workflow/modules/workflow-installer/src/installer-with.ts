import path from "node:path";
import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";

// `install --update --with` (Kit 2.2.7, spec M38 section 2.1): the files of
// the app's managed structure (Workflow Kit `wfk`) that the app wrote just
// before the update go into the same kit-update commit.

/** Manifest of the app's managed structure: the only source of `--with` paths. */
export const APP_STRUCTURE_MANIFEST = ".workflow-kit/manifest.json";

/** What an install commits and with which message. */
export type InstallCommitMode = "install" | "update" | "structure";

const notManaged = (item: string): WorkflowError =>
  new WorkflowError(
    "WITH_NOT_MANAGED",
    `--with takes only the files of ${APP_STRUCTURE_MANIFEST}: ${item}`,
    { path: item }
  );

/** The paths the structure manifest lists, or null when it is missing or unreadable. */
function structurePaths(root: string): Set<string> | null {
  const text = workflowPlatformFacade.readTextIfExists(
    path.join(root, ...APP_STRUCTURE_MANIFEST.split("/"))
  );
  if (text === null) {
    return null;
  }
  try {
    const fragments = (JSON.parse(text) as { fragments?: unknown }).fragments;
    if (!fragments || typeof fragments !== "object") {
      return null;
    }
    const paths = new Set([APP_STRUCTURE_MANIFEST]);
    for (const fragment of Object.values(fragments)) {
      const item = (fragment as { path?: unknown } | null)?.path;
      if (typeof item === "string") {
        paths.add(workflowPlatformFacade.normalizeRelative(item));
      }
    }
    return paths;
  } catch {
    return null;
  }
}

/**
 * Checks the `--with` paths before anything is written: only with `update`,
 * and only the structure manifest and the files it lists. Returns them
 * normalized, without repeats.
 */
export function checkWith(
  root: string,
  update: boolean,
  paths: readonly string[] | undefined
): string[] {
  if (paths === undefined) {
    return [];
  }
  ensure(update, "USAGE", "--with needs --update.");
  const normalized = [
    ...new Set(
      paths.map((item) => {
        try {
          return workflowPlatformFacade.normalizeRelative(item);
        } catch {
          throw notManaged(item);
        }
      })
    ),
  ];
  if (normalized.length === 0) {
    return [];
  }
  const allowed = structurePaths(root);
  ensure(
    allowed !== null,
    "WITH_NOT_MANAGED",
    `--with takes only the files of ${APP_STRUCTURE_MANIFEST}, which is missing or unreadable.`,
    { path: APP_STRUCTURE_MANIFEST }
  );
  for (const item of normalized) {
    if (!allowed.has(item)) {
      throw notManaged(item);
    }
  }
  return normalized;
}

/**
 * The files of the install commit and its mode: a `with` path with nothing to
 * commit drops out, a file of both lists is listed once, and an update that
 * changed only `with` paths is a structure update.
 */
export function installCommitFiles(
  changed: ReadonlySet<string>,
  written: readonly string[],
  structure: readonly string[],
  update: boolean
): { files: string[]; mode: InstallCommitMode; with: string[] } {
  const withFiles = structure.filter((item) => changed.has(item)).sort();
  const kitChanged = written.some((item) => changed.has(item));
  const mode: InstallCommitMode = !update
    ? "install"
    : kitChanged || withFiles.length === 0
      ? "update"
      : "structure";
  return {
    files: [...new Set([...written, ...withFiles])],
    mode,
    with: withFiles,
  };
}
