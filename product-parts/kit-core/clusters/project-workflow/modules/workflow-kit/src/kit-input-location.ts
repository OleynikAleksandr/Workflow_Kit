// Where `--input` and `--digest` files may live (M40, spec 3.4): a file
// inside the project must be under `.harness/inputs/` (git-ignored), so it
// never lands in a commit. A file outside the project is allowed.
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  currentWorkflowPlatform,
  ensure,
} from "../../workflow-platform/src/workflow-platform-facade.js";

export interface InputLocationOptions {
  /** The OS whose path rules apply (default: this process). */
  platform?: NodeJS.Platform;
  /** The real path of an existing path; throws for a missing one. */
  realpath?: (file: string) => string;
}

const INPUTS = [".harness", "inputs"] as const;

/**
 * The real path of `file`: links and Windows 8.3 short names resolved. A
 * missing tail keeps its own spelling under the real path of the nearest
 * existing folder.
 */
function realOf(
  file: string,
  paths: path.PlatformPath,
  realpath: (file: string) => string
): string {
  const tail: string[] = [];
  let current = file;
  for (;;) {
    try {
      return paths.join(realpath(current), ...tail);
    } catch {
      const parent = paths.dirname(current);
      if (parent === current) {
        return file;
      }
      tail.unshift(paths.basename(current));
      current = parent;
    }
  }
}

/**
 * The project-relative segments of `file`, or null when it is outside
 * `root`. win32 and darwin ignore the case; win32 takes both separators.
 */
export function insideProject(
  root: string,
  file: string,
  options: InputLocationOptions = {}
): string[] | null {
  const platform = currentWorkflowPlatform(options.platform);
  const paths = platform === "win32" ? path.win32 : path.posix;
  const realpath = options.realpath ?? realpathSync.native;
  const fold = (value: string) =>
    platform === "linux" ? value : value.toLowerCase();
  const relative = paths.relative(
    fold(realOf(paths.resolve(root), paths, realpath)),
    fold(realOf(paths.resolve(file), paths, realpath))
  );
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${paths.sep}`) ||
    paths.isAbsolute(relative)
  ) {
    return null;
  }
  return relative.split(paths.sep);
}

/**
 * INPUT_LOCATION before the file is read: `file` (relative to `cwd`) is in
 * the project but not under `.harness/inputs/`.
 */
export function ensureInputLocation(
  root: string,
  cwd: string,
  file: string,
  options: InputLocationOptions = {}
): void {
  const platform = currentWorkflowPlatform(options.platform);
  const paths = platform === "win32" ? path.win32 : path.posix;
  const segments = insideProject(root, paths.resolve(cwd, file), options);
  ensure(
    segments === null ||
      (segments.length > INPUTS.length &&
        INPUTS.every((name, index) => segments[index] === name)),
    "INPUT_LOCATION",
    `Input files of the project live in .harness/inputs/ (git-ignored): ${file} is elsewhere in the project and would land in a commit.`,
    { path: file },
    "Move the file to `.harness/inputs/` and pass that path."
  );
}
