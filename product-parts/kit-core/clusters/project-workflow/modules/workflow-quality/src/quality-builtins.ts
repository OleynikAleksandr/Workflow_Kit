import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  isDocumentationPath,
  isMarkdownPath,
  PLAN_PATH,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import type { BuiltinCheck, WorkflowConfig } from "./quality-config.js";
import { fillPlaceholders, matchGlob } from "./quality-globs.js";

export interface BuiltinContext {
  config: WorkflowConfig;
  /** Task waiver for the documentation contracts, when the plan has one. */
  docsWaiver: string | null;
  /** Canonical paths of the candidate (selected or changed files). */
  files: string[];
  /**
   * Candidate paths the commit removes (not in its tree). Content checks skip
   * them: a copy left on disk, such as an ignored `node_modules`, is not
   * committed. `kit:docs-contracts` still counts them as changes.
   */
  removed: ReadonlySet<string>;
  root: string;
}

export interface BuiltinOutcome {
  output: string;
  passed: boolean;
}

const MARKDOWN_LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu;
const FENCE = /^\s*(```|~~~)/u;
const EXTERNAL_LINK = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu;
const NUL = "\u0000";
const CONFLICT_OPEN = "<<<<<<< ";
const CONFLICT_CLOSE = ">>>>>>> ";
const CONFLICT_SEPARATOR = "=======";

function absolute(root: string, file: string): string {
  return path.join(root, ...file.split("/"));
}

function existingFile(root: string, file: string): boolean {
  const target = absolute(root, file);
  return existsSync(target) && statSync(target).isFile();
}

function markdownFiles(root: string, files: string[]): string[] {
  return files.filter(
    (file) =>
      isMarkdownPath(file) && file !== PLAN_PATH && existingFile(root, file)
  );
}

/** Candidate files the commit keeps: the input of the content checks. */
function committedFiles(context: BuiltinContext): string[] {
  return context.files.filter((file) => !context.removed.has(file));
}

function changedMarkdown(context: BuiltinContext): string[] {
  return markdownFiles(context.root, committedFiles(context));
}

function fileLines(context: BuiltinContext): BuiltinOutcome {
  const limit = context.config.policy.maxFileLines;
  if (limit === null) {
    return { output: "policy.maxFileLines is not set.", passed: true };
  }
  const over: string[] = [];
  for (const file of committedFiles(context)) {
    if (
      isDocumentationPath(file) ||
      file.startsWith(".harness/") ||
      !existingFile(context.root, file)
    ) {
      continue;
    }
    const text = readFileSync(absolute(context.root, file), "utf8");
    if (text.includes(NUL)) {
      continue;
    }
    const lines = text.endsWith("\n")
      ? text.split("\n").length - 1
      : text.split("\n").length;
    if (lines > limit) {
      over.push(`${file}: ${lines} lines (limit ${limit})`);
    }
  }
  return over.length === 0
    ? { output: `File line limit ${limit}: OK.`, passed: true }
    : { output: over.join("\n"), passed: false };
}

export interface OversizedDocument {
  bytes: number;
  path: string;
}

/**
 * Existing Markdown files of `files` (the plan excluded) larger than `limit`
 * bytes, in the given order.
 */
export function oversizedDocuments(
  root: string,
  files: string[],
  limit: number
): OversizedDocument[] {
  return markdownFiles(root, files).flatMap((file) => {
    const bytes = statSync(absolute(root, file)).size;
    return bytes > limit ? [{ bytes, path: file }] : [];
  });
}

function docSize(context: BuiltinContext): BuiltinOutcome {
  const limit = context.config.budget.documentBytes;
  const over = oversizedDocuments(
    context.root,
    committedFiles(context),
    limit
  ).map(
    (item) =>
      `${item.path}: ${item.bytes} bytes (limit ${limit}); split the document.`
  );
  return over.length === 0
    ? { output: `Document size limit ${limit}: OK.`, passed: true }
    : { output: over.join("\n"), passed: false };
}

function linkTargets(text: string): string[] {
  const targets: string[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      continue;
    }
    for (const match of line.matchAll(MARKDOWN_LINK)) {
      if (match[1]) {
        targets.push(match[1]);
      }
    }
  }
  return targets;
}

function brokenLinks(root: string, file: string): string[] {
  const directory = path.dirname(absolute(root, file));
  const broken: string[] = [];
  for (const target of linkTargets(
    readFileSync(absolute(root, file), "utf8")
  )) {
    if (EXTERNAL_LINK.test(target)) {
      continue;
    }
    const clean = target.split("#")[0]?.split("?")[0] ?? "";
    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch {
      // Keep the raw target when it is not valid percent-encoding.
    }
    if (decoded === "") {
      continue;
    }
    const resolved = decoded.startsWith("/")
      ? path.join(root, decoded)
      : path.resolve(directory, decoded);
    const inside = !path.relative(root, resolved).startsWith("..");
    if (!(inside && existsSync(resolved))) {
      broken.push(`${file}: ${target}`);
    }
  }
  return broken;
}

function mdLinks(context: BuiltinContext): BuiltinOutcome {
  const broken = changedMarkdown(context).flatMap((file) =>
    brokenLinks(context.root, file)
  );
  return broken.length === 0
    ? { output: "Markdown links: OK.", passed: true }
    : { output: `Broken relative links:\n${broken.join("\n")}`, passed: false };
}

/** Line numbers of git conflict markers in one text. */
function conflictLines(text: string): number[] {
  const opening: number[] = [];
  const separators: number[] = [];
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith(CONFLICT_OPEN) || line.startsWith(CONFLICT_CLOSE)) {
      opening.push(index + 1);
    } else if (line === CONFLICT_SEPARATOR) {
      separators.push(index + 1);
    }
  }
  // A bare separator line is also a Markdown heading underline.
  return opening.length === 0
    ? []
    : [...opening, ...separators].sort((a, b) => a - b);
}

function conflictMarkers(context: BuiltinContext): BuiltinOutcome {
  const found: string[] = [];
  for (const file of committedFiles(context)) {
    if (!existingFile(context.root, file)) {
      continue;
    }
    const text = readFileSync(absolute(context.root, file), "utf8");
    if (text.includes(NUL)) {
      continue;
    }
    const lines = conflictLines(text);
    if (lines.length > 0) {
      found.push(
        `${file}: ${lines.length === 1 ? "line" : "lines"} ${lines.join(", ")}`
      );
    }
  }
  return found.length === 0
    ? { output: "Conflict markers: none.", passed: true }
    : {
        output: `Unresolved conflict markers; resolve the conflict before committing:\n${found.join("\n")}`,
        passed: false,
      };
}

/** Lists code files whose contract documents are absent from the candidate. */
export function missingContracts(
  config: WorkflowConfig,
  files: string[]
): string[] {
  const candidate = new Set(files);
  const missing: string[] = [];
  for (const file of files) {
    for (const contract of config.docs.contracts) {
      const captures = matchGlob(contract.code, file);
      if (!captures) {
        continue;
      }
      const documents = contract.docs.map((doc) =>
        fillPlaceholders(doc, captures)
      );
      if (!documents.some((doc) => candidate.has(doc))) {
        missing.push(`${file} -> ${documents.join(" | ")}`);
      }
    }
  }
  return [...new Set(missing)];
}

function docsContracts(context: BuiltinContext): BuiltinOutcome {
  const missing = missingContracts(context.config, context.files);
  if (missing.length === 0) {
    return { output: "Documentation contracts: OK.", passed: true };
  }
  if (context.docsWaiver) {
    return {
      output: `Documentation contracts waived: ${context.docsWaiver}\n${missing.join("\n")}`,
      passed: true,
    };
  }
  return {
    output: `Code changed without its contract document. Update the document in the same commit or record a docsWaiver.\n${missing.join("\n")}`,
    passed: false,
  };
}

export const BUILTIN_CHECKS: Readonly<
  Record<BuiltinCheck, (context: BuiltinContext) => BuiltinOutcome>
> = {
  "kit:conflict-markers": conflictMarkers,
  "kit:doc-size": docSize,
  "kit:docs-contracts": docsContracts,
  "kit:file-lines": fileLines,
  "kit:md-links": mdLinks,
};

/** Builtins that run for service commits: documentation and conflict guards. */
export const DOCUMENTATION_BUILTINS: ReadonlySet<BuiltinCheck> = new Set([
  "kit:doc-size",
  "kit:md-links",
  "kit:docs-contracts",
  "kit:conflict-markers",
]);
