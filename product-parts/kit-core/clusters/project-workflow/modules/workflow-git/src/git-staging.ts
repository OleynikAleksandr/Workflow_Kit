import { existsSync } from "node:fs";
import path from "node:path";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { GitRunner } from "./git-runner.js";

// Staging of the selected paths for a commit transaction: which paths the
// candidate will not contain, and adding the rest to the index.

/** The given paths that git ignores; read through stdin, so any count fits. */
function ignoredPaths(
  git: GitRunner,
  root: string,
  files: string[]
): Set<string> {
  if (files.length === 0) {
    return new Set();
  }
  const output = git.run(root, ["check-ignore", "-z", "--stdin"], {
    allowFailure: true,
    input: `${files.join("\u0000")}\u0000`,
  });
  // Exit code 1 means that none of the paths is ignored.
  ensure(
    output.status === 0 || output.status === 1,
    "GIT_FAILED",
    `git check-ignore failed: ${output.stderr.trim() || output.stdout.trim()}`,
    { args: ["check-ignore", "-z", "--stdin"], status: output.status }
  );
  return new Set(output.stdout.split("\u0000").filter(Boolean));
}

/**
 * Paths of `files` the commit candidate will not contain: outside the index
 * and either missing on disk or ignored by git. A deletion already staged for
 * such a path (for example after `git rm -r --cached node_modules`) stays in
 * the index as is; content checks must not read the copies left on disk.
 */
export function absentPaths(
  git: GitRunner,
  root: string,
  files: string[]
): Set<string> {
  if (files.length === 0) {
    return new Set();
  }
  const tracked = new Set(
    git
      .run(root, ["ls-files", "-z", "--", ...files])
      .stdout.split("\u0000")
      .filter(Boolean)
  );
  const untracked = files.filter((file) => !tracked.has(file));
  const existing = new Set(
    untracked.filter((file) => existsSync(path.join(root, ...file.split("/"))))
  );
  const ignored = ignoredPaths(git, root, [...existing]);
  return new Set(
    untracked.filter((file) => !existing.has(file) || ignored.has(file))
  );
}

/**
 * Stages the selected paths except the absent ones (`absentPaths`): index
 * paths are added as they are on disk, other paths only when they exist and
 * git does not ignore them.
 */
export function stage(git: GitRunner, root: string, files: string[]): void {
  const absent = absentPaths(git, root, files);
  const stageable = files.filter((file) => !absent.has(file));
  if (stageable.length > 0) {
    git.run(root, ["add", "-A", "--", ...stageable]);
  }
}
