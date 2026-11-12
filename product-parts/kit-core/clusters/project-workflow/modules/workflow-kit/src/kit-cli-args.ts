import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ensure,
  WorkflowError,
} from "../../workflow-platform/src/workflow-platform-facade.js";

export interface ParsedArgs {
  command: string | null;
  flags: Map<string, string | true>;
  positionals: string[];
}

const BOOLEAN_FLAGS = new Set([
  "help",
  "fix",
  "force",
  "dry-run",
  "global",
  "list",
  "off",
  "on",
  "update",
]);

/** Splits `command positional… --flag value --flag=value --bool`. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "-h") {
      flags.set("help", true);
    } else if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const equals = body.indexOf("=");
      if (equals !== -1) {
        flags.set(body.slice(0, equals), body.slice(equals + 1));
      } else if (BOOLEAN_FLAGS.has(body)) {
        flags.set(body, true);
      } else {
        const value = argv[index + 1];
        ensure(
          value !== undefined && !value.startsWith("--"),
          "USAGE",
          `--${body} needs a value.`
        );
        flags.set(body, value);
        index += 1;
      }
    } else {
      positionals.push(arg);
    }
  }
  const [command = null, ...rest] = positionals;
  return { command, flags, positionals: rest };
}

export function flag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function requiredFlag(args: ParsedArgs, name: string): string {
  const value = flag(args, name);
  ensure(
    value !== undefined && value.trim() !== "",
    "USAGE",
    `--${name} is required.`
  );
  return value;
}

export function positional(
  args: ParsedArgs,
  index: number,
  label: string
): string {
  const value = args.positionals[index];
  ensure(value !== undefined && value !== "", "USAGE", `${label} is required.`);
  return value;
}

export function integerFlag(
  args: ParsedArgs,
  name: string
): number | undefined {
  const value = flag(args, name);
  if (value === undefined) {
    return;
  }
  const parsed = Number(value);
  ensure(
    Number.isSafeInteger(parsed),
    "USAGE",
    `--${name} must be an integer.`
  );
  return parsed;
}

/** Reads a JSON input file relative to the working directory. */
export function readJsonFile<T>(cwd: string, file: string): T {
  let text: string;
  try {
    text = readFileSync(path.resolve(cwd, file), "utf8");
  } catch (cause) {
    throw new WorkflowError(
      "INPUT_UNREADABLE",
      `Cannot read ${file}: ${(cause as Error).message}`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new WorkflowError(
      "INPUT_JSON",
      `${file} is not valid JSON: ${(cause as Error).message}`
    );
  }
}

/** `--files` as a JSON array or a comma-separated list. */
export function listFlag(args: ParsedArgs, name: string): string[] | undefined {
  const value = flag(args, name);
  if (value === undefined) {
    return;
  }
  if (value.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      ensure(
        Array.isArray(parsed) &&
          parsed.every((item) => typeof item === "string"),
        "USAGE",
        `--${name} must list strings.`
      );
      return parsed as string[];
    } catch (cause) {
      if (cause instanceof WorkflowError) {
        throw cause;
      }
      throw new WorkflowError("USAGE", `--${name} is not a valid JSON list.`);
    }
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
