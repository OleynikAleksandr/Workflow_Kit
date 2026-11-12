import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import {
  ensure,
  WorkflowError,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import type {
  DocumentsMap,
  WorkflowRecoveryFacade,
} from "../../workflow-recovery/src/workflow-recovery-facade.js";
import type { ParsedArgs } from "./kit-cli-args.js";
import type { WorkflowKitFacade } from "./workflow-kit-facade.js";

/** Output budget of `context`: Claude Code cuts tool output near 30 000 chars. */
const CONTEXT_BUDGET = 28_000;

const KIT_FOLDER = ".harness/workflow";
const H2 = /^##\s+(.+?)\s*#*\s*$/u;
const FENCE = /^\s*(```|~~~)/u;
const LIST_MORE =
  "narrow with `scripts/workflow context --list <folder>` (a subfolder)";

/** One document (or `##` section) returned by `context`. */
export interface ContextDocument {
  bytes: number;
  heading?: string;
  path: string;
  text: string;
}

/** A document or section left out of this answer: ask for it again. */
export interface ContextLeftOut {
  bytes: number;
  heading?: string;
  path: string;
  /** Larger than the whole budget and without `##` sections to split by. */
  tooLarge?: true;
}

export interface ContextResult {
  documents: ContextDocument[];
  notIncluded: ContextLeftOut[];
}

export interface ContextList extends DocumentsMap {
  folder: string | null;
}

interface ContextCommandSpec {
  defaultFormat: "text";
  run: (context: {
    args: ParsedArgs;
    kit: WorkflowKitFacade;
    root: string;
  }) => unknown;
  text: (result: unknown) => string;
  usage: string;
}

function bytesOf(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function forbidden(request: string, reason: string): WorkflowError {
  return new WorkflowError(
    "CONTEXT_FORBIDDEN",
    `${request}: ${reason}.`,
    { path: request },
    "Ask only for text files of the project outside .harness/workflow/."
  );
}

/**
 * The canonical project-relative path of a request (relative to the
 * project root, or absolute inside it); outside the root, or inside the Kit
 * folder (also through a symbolic link), is CONTEXT_FORBIDDEN.
 */
function projectPath(root: string, request: string): string {
  const relative = (base: string, target: string): string =>
    path.relative(base, target).split(path.sep).join("/");
  const inside = (value: string): boolean =>
    value !== ".." && !value.startsWith("../") && !path.isAbsolute(value);
  const kitPath = (value: string): boolean => {
    const lower = value.toLowerCase();
    return lower === KIT_FOLDER || lower.startsWith(`${KIT_FOLDER}/`);
  };
  const absolute = path.resolve(root, request);
  const lexical = relative(path.resolve(root), absolute);
  let real: string | null = null;
  try {
    real = relative(realpathSync(root), realpathSync(absolute));
  } catch {
    // A missing path is reported by the caller.
  }
  // An absolute path through an alias of the root (macOS /var) is inside.
  const result = inside(lexical) ? lexical : real;
  if (result === null || !inside(result)) {
    throw forbidden(request, "the path is outside the project");
  }
  if (kitPath(result)) {
    throw forbidden(request, "the Kit folder .harness/workflow/ is closed");
  }
  if (real !== null && !inside(real)) {
    throw forbidden(request, "the path leads outside the project");
  }
  if (real !== null && kitPath(real)) {
    throw forbidden(request, "the path leads into .harness/workflow/");
  }
  return result === "" ? "." : result;
}

/** The text of a project file: CONTEXT_MISSING, or CONTEXT_FORBIDDEN for a folder or binary file. */
function readProjectText(root: string, request: string, file: string): string {
  const absolute = path.resolve(root, file);
  let isFile = false;
  try {
    isFile = statSync(absolute).isFile();
  } catch {
    throw new WorkflowError(
      "CONTEXT_MISSING",
      `${request}: the file does not exist.`,
      { path: file },
      "Run `scripts/workflow context --list` for the project documents."
    );
  }
  if (!isFile) {
    throw forbidden(
      request,
      "not a file (ask for files, list a folder with --list)"
    );
  }
  const data = readFileSync(absolute);
  if (data.includes(0)) {
    throw forbidden(request, "not a text file");
  }
  return data.toString("utf8");
}

/** Every request read and checked before anything is returned. */
function requested(
  recovery: WorkflowRecoveryFacade,
  root: string,
  requests: readonly string[]
): ContextDocument[] {
  return requests.map((request) => {
    const hash = request.indexOf("#");
    const target = hash === -1 ? request : request.slice(0, hash);
    const heading = hash === -1 ? "" : request.slice(hash + 1).trim();
    const file = projectPath(root, target);
    const text = readProjectText(root, request, file);
    const section = heading ? recovery.section(text, heading) : text;
    ensure(
      section !== null,
      "CONTEXT_MISSING",
      `${file} has no heading "${heading}".`,
      { heading, path: file },
      `Run \`scripts/workflow context --list ${path.posix.dirname(file)}\` for its headings.`
    );
    const body = section.trimEnd();
    return {
      bytes: bytesOf(body),
      path: file,
      text: body,
      ...(heading ? { heading } : {}),
    };
  });
}

/**
 * The `##` sections of a document (outside fenced code); the text before
 * the first one stays with the first section. Null without `##` headings.
 */
function sections(item: ContextDocument): ContextDocument[] | null {
  const lines = item.text.split("\n");
  const starts: { heading: string; index: number }[] = [];
  let fenced = false;
  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    const match = fenced ? null : H2.exec(line);
    if (match?.[1]) {
      starts.push({ heading: match[1], index });
    }
  }
  if (starts.length === 0) {
    return null;
  }
  return starts.map((start, position) => {
    const from = position === 0 ? 0 : start.index;
    const to = starts[position + 1]?.index ?? lines.length;
    const text = lines.slice(from, to).join("\n").trimEnd();
    return {
      bytes: bytesOf(text),
      heading: start.heading,
      path: item.path,
      text,
    };
  });
}

function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function block(item: ContextDocument): string {
  const heading = item.heading ? ` heading="${attribute(item.heading)}"` : "";
  return `<document path="${attribute(item.path)}"${heading} bytes="${item.bytes}">\n${item.text}\n</document>\n`;
}

function leftOut(item: ContextDocument, tooLarge = false): ContextLeftOut {
  return {
    bytes: item.bytes,
    path: item.path,
    ...(item.heading ? { heading: item.heading } : {}),
    ...(tooLarge ? { tooLarge: true as const } : {}),
  };
}

function leftOutLine(item: ContextLeftOut): string {
  const request = item.heading ? `${item.path}#${item.heading}` : item.path;
  return item.tooLarge
    ? `not included (larger than the ${CONTEXT_BUDGET}-byte budget, no ## sections): ${request} (${item.bytes} bytes)`
    : `not included (ask again): ${request} (${item.bytes} bytes)`;
}

/** The `--format text` answer: the marked documents, then the left-out lines. */
function contextText(value: unknown): string {
  const result = value as ContextResult;
  const parts = result.documents.map(block);
  const tail = result.notIncluded.map(leftOutLine);
  if (tail.length > 0) {
    parts.push(`${tail.join("\n")}\n`);
  }
  return parts.length > 0 ? parts.join("\n") : "no documents\n";
}

/**
 * Packs the documents in request order while the answer fits the budget.
 * A document larger than the budget alone is split by `##` sections. After
 * the first item that does not fit, every later one is left out, so the
 * next request continues in order.
 */
function pack(items: readonly ContextDocument[]): ContextResult {
  const result: ContextResult = { documents: [], notIncluded: [] };
  let used = 0;
  let full = false;
  const oversized = (item: ContextDocument): boolean =>
    bytesOf(block(item)) > CONTEXT_BUDGET;
  const take = (item: ContextDocument): boolean => {
    const size = bytesOf(block(item)) + (result.documents.length > 0 ? 1 : 0);
    if (full || used + size > CONTEXT_BUDGET) {
      full = true;
      return false;
    }
    result.documents.push(item);
    used += size;
    return true;
  };
  for (const item of items) {
    const parts = !full && oversized(item) ? sections(item) : null;
    if (parts) {
      for (const part of parts) {
        if (!take(part)) {
          result.notIncluded.push(leftOut(part, oversized(part)));
        }
      }
    } else if (!take(item)) {
      result.notIncluded.push(
        leftOut(item, oversized(item) && sections(item) === null)
      );
    }
  }
  // The left-out lines count too: move documents back until all fits.
  while (
    result.documents.length > 0 &&
    bytesOf(contextText(result)) > CONTEXT_BUDGET
  ) {
    const last = result.documents.pop() as ContextDocument;
    result.notIncluded.unshift(leftOut(last));
  }
  return result;
}

/** `context --list [<folder>]`: the documents map within the output budget. */
function listDocuments(
  recovery: WorkflowRecoveryFacade,
  root: string,
  request: string | undefined
): ContextList {
  let folder: string | null = null;
  if (request !== undefined) {
    const relative = projectPath(root, request);
    let isFolder = false;
    try {
      isFolder = statSync(path.resolve(root, relative)).isDirectory();
    } catch {
      throw new WorkflowError(
        "CONTEXT_MISSING",
        `${request}: the folder does not exist.`,
        { path: relative }
      );
    }
    if (!isFolder) {
      throw forbidden(request, "not a folder (ask for a file without --list)");
    }
    folder = relative === "." ? null : relative;
  }
  return {
    folder,
    ...recovery.documentsMap(root, {
      budget: CONTEXT_BUDGET,
      folder,
      more: LIST_MORE,
    }),
  };
}

function text(value: unknown): string {
  if ("documents" in (value as object)) {
    return contextText(value);
  }
  const list = value as ContextList;
  return list.entries.length > 0
    ? `${list.text}\n`
    : `no Markdown documents${list.folder ? ` under ${list.folder}` : ""}\n`;
}

/**
 * `context <path>[#Heading] …` and `context --list [<folder>]` (spec 3.1):
 * project documents as marked text within 28 000 bytes. A pure read: it
 * needs no scope and also runs in an executor worktree. Text is its
 * default format.
 */
export const CONTEXT_COMMANDS: Readonly<Record<string, ContextCommandSpec>> = {
  context: {
    defaultFormat: "text",
    run: ({ args, kit, root }): ContextResult | ContextList => {
      if (args.flags.get("list") === true) {
        ensure(
          args.positionals.length <= 1,
          "USAGE",
          "context --list takes at most one folder."
        );
        return listDocuments(kit.recovery, root, args.positionals[0]);
      }
      ensure(
        args.positionals.length > 0,
        "USAGE",
        "context needs at least one <path>[#Heading], or --list [<folder>]."
      );
      return pack(requested(kit.recovery, root, args.positionals));
    },
    text,
    usage: "context <path>[#Heading] … | context --list [<folder>]",
  },
};
