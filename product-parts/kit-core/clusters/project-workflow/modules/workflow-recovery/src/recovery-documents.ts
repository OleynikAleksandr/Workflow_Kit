import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import { workflowPlatformFacade } from "../../workflow-platform/src/workflow-platform-facade.js";
import { byteLength, KIT_COMMAND } from "./recovery-model.js";

/** Default byte budget of the documents map (spec 3.2). */
const DOCUMENTS_MAP_BYTES = 4000;

const MARKDOWN = /\.(md|markdown)$/iu;
const H2 = /^##\s+(.+?)\s*#*\s*$/u;
const FENCE = /^\s*(```|~~~)/u;
const EXCLUDED_SEGMENTS = new Set([".git", "node_modules"]);
const EXCLUDED_PREFIXES = [".harness/workflow/", ".harness/plans/archive/"];

/** One Markdown file of the project: path, size and second-level headings. */
export interface DocumentEntry {
  bytes: number;
  headings: string[];
  path: string;
}

export interface DocumentsMap {
  /** Every listed document in map order, including those past the budget. */
  entries: DocumentEntry[];
  /** Entries shown in `text`; the rest are counted by the tail line. */
  shown: number;
  /** The map text within the budget (tail line included). */
  text: string;
}

export interface DocumentsMapOptions {
  budget?: number;
  /** Only documents under this project-relative folder (`context --list`). */
  folder?: string | null;
  /** The tail-line hint for the rest; default `` `scripts/workflow context --list` ``. */
  more?: string;
  /** The scope specification: documents of its folder come first. */
  specPath?: string | null;
}

function excluded(file: string): boolean {
  return (
    file.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment)) ||
    EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))
  );
}

/** Second-level headings outside fenced code blocks. */
function headings(text: string): string[] {
  const found: string[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    const match = fenced ? null : H2.exec(line);
    if (match?.[1]) {
      found.push(match[1]);
    }
  }
  return found;
}

/** Tracked and untracked-not-ignored Markdown paths, sorted. */
function markdownPaths(git: WorkflowGitFacade, root: string): string[] {
  const output = git.git.run(
    root,
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.md",
      "*.markdown",
    ],
    { allowFailure: true }
  );
  if (output.status !== 0) {
    return [];
  }
  const paths = new Set(
    output.stdout
      .split("\0")
      .filter((file) => MARKDOWN.test(file) && !excluded(file))
  );
  return [...paths].sort((left, right) => (left < right ? -1 : 1));
}

/** Documents of the specification folder first, then the rest; both sorted. */
function ordered(paths: string[], specPath: string | null): string[] {
  const slash = specPath ? specPath.lastIndexOf("/") : -1;
  if (!specPath || slash === -1) {
    return paths;
  }
  const folder = specPath.slice(0, slash + 1);
  return [
    ...paths.filter((file) => file.startsWith(folder)),
    ...paths.filter((file) => !file.startsWith(folder)),
  ];
}

function readMarkdown(root: string, file: string): string | null {
  try {
    return workflowPlatformFacade.readTextIfExists(
      workflowPlatformFacade.resolveInside(root, file)
    );
  } catch {
    return null;
  }
}

function entryLine(entry: DocumentEntry): string {
  const base = `${entry.path} (${entry.bytes} bytes)`;
  return entry.headings.length > 0
    ? `${base}: ${entry.headings.join("; ")}`
    : base;
}

const DEFAULT_MORE = `\`${KIT_COMMAND} context --list\``;

function tailLine(count: number, more: string): string {
  return `… ${count} more documents: ${more}`;
}

/**
 * Renders entries in order while the text (tail line included) fits the
 * budget; the remaining entries are counted by the tail line.
 */
function renderDocumentsMap(
  entries: DocumentEntry[],
  budget: number,
  more: string
): DocumentsMap {
  const lines: string[] = [];
  let used = 0;
  for (const [index, entry] of entries.entries()) {
    const line = entryLine(entry);
    const rest = entries.length - index - 1;
    const next = used + byteLength(line) + (lines.length > 0 ? 1 : 0);
    const reserve = rest > 0 ? byteLength(tailLine(rest, more)) + 1 : 0;
    if (next + reserve > budget) {
      break;
    }
    lines.push(line);
    used = next;
  }
  const hidden = entries.length - lines.length;
  return {
    entries,
    shown: lines.length,
    text: [...lines, ...(hidden > 0 ? [tailLine(hidden, more)] : [])].join(
      "\n"
    ),
  };
}

/**
 * The documents map of a project: Markdown files known to git (tracked or
 * untracked and not ignored) without `node_modules`, `.git`,
 * `.harness/workflow/**` and `.harness/plans/archive/**` (only those under
 * `folder` when given); one line per file with its size and `##` headings.
 */
export function documentsMap(
  git: WorkflowGitFacade,
  root: string,
  options: DocumentsMapOptions = {}
): DocumentsMap {
  const entries: DocumentEntry[] = [];
  const folder = options.folder ? `${options.folder}/` : "";
  for (const file of ordered(
    markdownPaths(git, root).filter((item) => item.startsWith(folder)),
    options.specPath ?? null
  )) {
    const text = readMarkdown(root, file);
    if (text !== null) {
      entries.push({
        bytes: byteLength(text),
        headings: headings(text),
        path: file,
      });
    }
  }
  return renderDocumentsMap(
    entries,
    options.budget ?? DOCUMENTS_MAP_BYTES,
    options.more ?? DEFAULT_MORE
  );
}
