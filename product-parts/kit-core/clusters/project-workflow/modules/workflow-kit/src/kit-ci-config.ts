// Check names of the project CI configuration (GitHub Actions workflows),
// for the `automation.ci.requiredChecks` of a scope. A small line reader of
// the `jobs:` section, not a YAML parser: job ids, literal job names and the
// matrix values of a `${{ matrix.<key> }}` job name.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const WORKFLOW_DIR = [".github", "workflows"];
const WORKFLOW_FILE = /\.ya?ml$/u;
const KEY_LINE = /^(\s*)(-\s+)?([A-Za-z0-9_.-]+):\s*(.*)$/u;
const MATRIX_NAME = /^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/u;
const EXPRESSION = /\$\{\{/u;

interface Line {
  indent: number;
  key: string;
  value: string;
}

function scalar(raw: string): string {
  const value = raw.replace(/\s+#.*$/u, "").trim();
  const quoted = /^(['"])(.*)\1$/u.exec(value);
  return quoted ? (quoted[2] ?? "") : value;
}

function listValues(raw: string): string[] {
  const value = scalar(raw);
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map(scalar)
      .filter((item) => item !== "");
  }
  return value === "" ? [] : [value];
}

function parse(text: string): Line[] {
  const lines: Line[] = [];
  for (const raw of text.replace(/\r\n/gu, "\n").split("\n")) {
    const match = KEY_LINE.exec(raw);
    if (!match || raw.trimStart().startsWith("#")) {
      continue;
    }
    const dash = match[2] ?? "";
    lines.push({
      // A list entry `- key:` is indented like its key.
      indent: (match[1] ?? "").length + dash.length,
      key: match[3] ?? "",
      value: match[4] ?? "",
    });
  }
  return lines;
}

/** The check names of one job: its id, its literal name or its matrix names. */
function jobNames(id: string, body: Line[], jobIndent: number): string[] {
  const names = [id];
  const levels = body.map((line) => line.indent).filter((n) => n > jobIndent);
  const fieldIndent = levels.length > 0 ? Math.min(...levels) : -1;
  const own = body.find(
    (line) => line.key === "name" && line.indent === fieldIndent
  );
  const name = own ? scalar(own.value) : null;
  if (name === null || name === "") {
    return names;
  }
  const matrix = MATRIX_NAME.exec(name);
  if (matrix) {
    const start = body.findIndex(
      (line) => line.key === "strategy" && line.indent === fieldIndent
    );
    const end = body.findIndex(
      (line, index) => index > start && line.indent <= fieldIndent
    );
    const strategy =
      start < 0 ? [] : body.slice(start + 1, end < 0 ? undefined : end);
    names.push(
      ...strategy
        .filter((line) => line.key === matrix[1])
        .flatMap((line) => listValues(line.value))
    );
    return names;
  }
  if (!EXPRESSION.test(name)) {
    names.push(name);
  }
  return names;
}

function workflowNames(text: string): string[] {
  const lines = parse(text);
  const start = lines.findIndex(
    (line) => line.key === "jobs" && line.indent === 0
  );
  if (start < 0) {
    return [];
  }
  const end = lines.findIndex(
    (line, index) => index > start && line.indent === 0
  );
  const jobs = lines.slice(start + 1, end < 0 ? undefined : end);
  const jobIndent = Math.min(...jobs.map((line) => line.indent));
  const names: string[] = [];
  jobs.forEach((line, index) => {
    if (line.indent !== jobIndent) {
      return;
    }
    const next = jobs.findIndex(
      (item, at) => at > index && item.indent <= jobIndent
    );
    names.push(
      ...jobNames(
        line.key,
        jobs.slice(index + 1, next < 0 ? undefined : next),
        jobIndent
      )
    );
  });
  return names;
}

/**
 * Every check name the project CI can report: job ids, literal job names
 * and matrix-expanded names. `null` when the project has no workflow file.
 */
export function ciCheckNames(root: string): string[] | null {
  const dir = path.join(root, ...WORKFLOW_DIR);
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => WORKFLOW_FILE.test(file));
  } catch {
    return null;
  }
  if (files.length === 0) {
    return null;
  }
  const names = files
    .sort()
    .flatMap((file) =>
      workflowNames(readFileSync(path.join(dir, file), "utf8"))
    );
  return [...new Set(names)];
}
