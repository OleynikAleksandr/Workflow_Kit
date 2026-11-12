import type { GitRunner } from "./git-runner.js";

export interface WorkingTreeChanges {
  all: string[];
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface CommitRecord {
  message: string;
  parents: string[];
  sha: string;
  subject: string;
  trailers: Record<string, string[]>;
}

const RECORD_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u0000";
const TRAILER_PATTERN = /^(Workflow-[A-Za-z-]+):\s*(.+)$/u;
const STATUS_PREFIX_LENGTH = 3;
const LEADING_NEWLINE_PATTERN = /^\n/u;

/** Parses `git status --porcelain=v1 -z` including rename/copy pairs. */
function parsePorcelain(output: string): WorkingTreeChanges {
  const entries = output.split(FIELD_SEPARATOR).filter(Boolean);
  const changes: WorkingTreeChanges = {
    all: [],
    staged: [],
    unstaged: [],
    untracked: [],
  };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? "";
    const indexState = entry[0] ?? " ";
    const treeState = entry[1] ?? " ";
    const file = entry.slice(STATUS_PREFIX_LENGTH);
    if (indexState === "R" || indexState === "C") {
      const source = entries[index + 1];
      index += 1;
      if (source) {
        changes.staged.push(source);
      }
    }
    if (indexState === "?") {
      changes.untracked.push(file);
      continue;
    }
    if (indexState !== " ") {
      changes.staged.push(file);
    }
    if (treeState !== " ") {
      changes.unstaged.push(file);
    }
  }
  const unique = (values: string[]) => [...new Set(values)].sort();
  return {
    all: unique([...changes.staged, ...changes.unstaged, ...changes.untracked]),
    staged: unique(changes.staged),
    unstaged: unique(changes.unstaged),
    untracked: unique(changes.untracked),
  };
}

function parseTrailers(message: string): Record<string, string[]> {
  const trailers: Record<string, string[]> = {};
  const paragraphs = message.trim().split("\n\n");
  const last = paragraphs.length > 1 ? (paragraphs.at(-1) ?? "") : "";
  for (const line of last.split("\n")) {
    const match = TRAILER_PATTERN.exec(line.trim());
    if (match?.[1] && match[2]) {
      trailers[match[1]] = [...(trailers[match[1]] ?? []), match[2].trim()];
    }
  }
  return trailers;
}

export function readChanges(git: GitRunner, root: string): WorkingTreeChanges {
  return parsePorcelain(
    git.run(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
      .stdout
  );
}

export interface HistoryOptions {
  /** Follows only first parents: the side history of a merge is skipped. */
  firstParent?: boolean;
}

/** Commits reachable from `tip` but not from `from` (all when from is null), oldest first. */
export function readHistory(
  git: GitRunner,
  root: string,
  from: string | null,
  tip = "HEAD",
  options: HistoryOptions = {}
): CommitRecord[] {
  const range = from ? `${from}..${tip}` : tip;
  const output = git.run(
    root,
    [
      "log",
      "--reverse",
      ...(options.firstParent ? ["--first-parent"] : []),
      `--format=%H%x00%P%x00%B${RECORD_SEPARATOR}`,
      range,
    ],
    { allowFailure: true }
  );
  if (output.status !== 0) {
    return [];
  }
  return output.stdout
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(LEADING_NEWLINE_PATTERN, ""))
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [sha = "", parents = "", message = ""] =
        record.split(FIELD_SEPARATOR);
      return {
        message: message.trim(),
        parents: parents.split(" ").filter(Boolean),
        sha,
        subject: message.split("\n")[0]?.trim() ?? "",
        trailers: parseTrailers(message),
      };
    });
}

export function readCommitPaths(
  git: GitRunner,
  root: string,
  sha: string
): string[] {
  return git
    .run(root, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      "--root",
      sha,
    ])
    .stdout.split(FIELD_SEPARATOR)
    .filter(Boolean)
    .sort();
}

/** Paths that differ between two commits, renames as delete plus add, sorted. */
export function readDiffPaths(
  git: GitRunner,
  root: string,
  from: string,
  to: string
): string[] {
  return git
    .run(root, [
      "diff-tree",
      "-r",
      "--name-only",
      "--no-renames",
      "-z",
      from,
      to,
    ])
    .stdout.split(FIELD_SEPARATOR)
    .filter(Boolean)
    .sort();
}
