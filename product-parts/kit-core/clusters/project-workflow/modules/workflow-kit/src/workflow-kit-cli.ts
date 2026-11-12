import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RoundDigest } from "../../workflow-plan/src/workflow-plan-facade.js";
import { WorkflowError } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { ProfileInput } from "../../workflow-quality/src/workflow-quality-facade.js";
import type { RecoveryEvent } from "../../workflow-recovery/src/workflow-recovery-facade.js";
import {
  flag,
  listFlag,
  type ParsedArgs,
  parseArgs,
  positional,
  readJsonFile,
  requiredFlag,
} from "./kit-cli-args.js";
import {
  ASSIGNMENT_COMMANDS,
  ensureExecutorCommand,
} from "./kit-cli-assignment.js";
import { CONTEXT_COMMANDS } from "./kit-cli-context.js";
import { EXECUTION_COMMANDS } from "./kit-cli-execution.js";
import { runHook } from "./kit-cli-hook.js";
import { IDENTITY_COMMANDS } from "./kit-cli-identity.js";
import { INTEGRATION_COMMANDS } from "./kit-cli-integration.js";
import { PAUSE_COMMANDS } from "./kit-cli-pause.js";
import { SCHEMA_COMMANDS } from "./kit-cli-schema.js";
import { SCOPE_COMMANDS } from "./kit-cli-scope.js";
import { renderText } from "./kit-cli-text.js";
import { WorkflowKitFacade } from "./workflow-kit-facade.js";

export interface CliIo {
  cwd: string;
  env: NodeJS.ProcessEnv;
  readStdin: () => string;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
}

interface CommandContext {
  args: ParsedArgs;
  io: CliIo;
  kit: WorkflowKitFacade;
  root: string;
}

interface CommandSpec {
  /** The format without `--format`; json when absent. */
  defaultFormat?: "text";
  run: (context: CommandContext) => unknown;
  /** `--format text` output; `renderText` when absent. */
  text?: (result: unknown) => string;
  usage: string;
}

const EVENTS = new Set(["startup", "resume", "clear", "compact"]);

function resolvePath(io: CliIo, value: string | undefined): string {
  return path.resolve(io.cwd, value ?? ".");
}

/** The bundle to install (this file unless `--bundle`) and the running runtime. */
function ownBundle(
  args: ParsedArgs,
  io: CliIo
): {
  bundle: string;
  runtime: { executable: string; mode: "electron" | "node" };
} {
  return {
    bundle: readFileSync(
      resolvePath(io, flag(args, "bundle") ?? fileURLToPath(import.meta.url)),
      "utf8"
    ),
    runtime: {
      executable: process.execPath,
      mode: process.versions.electron ? "electron" : "node",
    },
  };
}

const COMMANDS: Readonly<Record<string, CommandSpec>> = {
  ...EXECUTION_COMMANDS,
  ...ASSIGNMENT_COMMANDS,
  ...INTEGRATION_COMMANDS,
  ...IDENTITY_COMMANDS,
  ...PAUSE_COMMANDS,
  ...SCHEMA_COMMANDS,
  ...CONTEXT_COMMANDS,
  ...SCOPE_COMMANDS,
  "autopilot:status": {
    run: ({ kit, root }) => kit.autopilotStatus(root),
    usage: "autopilot:status",
  },
  commit: {
    run: ({ args, io, kit, root }) => {
      const digest = flag(args, "digest");
      return kit.commitTask(root, requiredFlag(args, "task"), {
        digest: digest ? readJsonFile<RoundDigest>(io.cwd, digest) : null,
        files: listFlag(args, "files"),
      });
    },
    usage: "commit --task <ID> [--files <json|a,b>] [--digest <file.json>]",
  },
  "docs:commit": {
    run: ({ args, kit, root }) => {
      const files = listFlag(args, "files");
      if (!files) {
        throw new WorkflowError("USAGE", "--files is required.");
      }
      return kit.commitDocs(root, files, flag(args, "message"));
    },
    usage: 'docs:commit --files <json|a,b> [--message "docs: ..."]',
  },
  inspect: {
    run: ({ args, io, kit }) =>
      kit.inspect(resolvePath(io, args.positionals[0])),
    usage: "inspect [<path>]",
  },
  doctor: {
    run: ({ args, io, kit }) =>
      kit.doctor(resolvePath(io, args.positionals[0]), {
        fix: args.flags.get("fix") === true ? ownBundle(args, io) : null,
      }),
    usage: "doctor [<path>] [--fix] [--bundle <workflow.mjs>]",
  },
  install: {
    run: ({ args, io, kit }) =>
      kit.install(resolvePath(io, args.positionals[0]), {
        ...ownBundle(args, io),
        // The installer refuses any other value with USAGE.
        host: flag(args, "host") as "harness" | undefined,
        name: flag(args, "name"),
        update: args.flags.get("update") === true,
      }),
    usage:
      "install [<path>] [--name <project name>] [--update] [--host harness] [--bundle <workflow.mjs>]",
  },
  history: {
    run: ({ args, kit, root }) =>
      kit.history(root, {
        round: flag(args, "round"),
        task: flag(args, "task"),
      }),
    usage: "history [--task <ID>] [--round <R>]",
  },
  "migrate:harness-plan": {
    run: ({ args, io, kit }) =>
      kit.migrateHarnessPlan(resolvePath(io, args.positionals[0]), {
        message: flag(args, "message"),
        name: flag(args, "name"),
        objective: flag(args, "objective"),
        spec: flag(args, "spec") ?? null,
      }),
    usage:
      'migrate:harness-plan [<path>] [--message "chore: ..."] [--objective "..."] [--spec <doc.md>] [--name <project name>]',
  },
  "quality:apply": {
    run: ({ args, io, kit, root }) =>
      kit.qualityApply(
        root,
        readJsonFile<ProfileInput>(io.cwd, requiredFlag(args, "input"))
      ),
    usage: "quality:apply --input <profile.json>",
  },
  "quality:detect": {
    run: ({ args, kit, root }) =>
      kit.qualityDetect(root, listFlag(args, "stack")),
    usage: "quality:detect [--stack node,python]",
  },
  "quality:status": {
    run: ({ kit, root }) => kit.qualityStatus(root),
    usage: "quality:status",
  },
  recover: {
    run: ({ args, kit, root }) => {
      const event = flag(args, "event") ?? "startup";
      if (!EVENTS.has(event)) {
        throw new WorkflowError(
          "USAGE",
          "--event is startup, resume, clear or compact."
        );
      }
      return kit.recover(root, event as RecoveryEvent);
    },
    usage: "recover [--event startup|resume|clear|compact]",
  },
  repair: {
    run: ({ args, kit, root }) =>
      kit.repair(root, {
        apply: flag(args, "apply"),
        cancel: flag(args, "cancel"),
      }),
    usage: "repair [--apply <repairId> | --cancel <repairId>]",
  },
  "show-task": {
    run: ({ args, kit, root }) => ({
      text: kit.showTask(root, positional(args, 0, "Task id")),
    }),
    usage: "show-task <ID>",
  },
  status: {
    run: ({ kit, root }) => kit.status(root),
    usage: "status",
  },
  "task:start": {
    run: ({ args, kit, root }) =>
      kit.startTask(
        root,
        positional(args, 0, "Task id"),
        flag(args, "confirmed") ?? null
      ),
    usage: 'task:start <ID> [--confirmed "<user confirmation>"]',
  },
  validate: {
    run: ({ kit, root }) => kit.validate(root),
    usage: "validate",
  },
};

function helpText(): string {
  const lines = Object.entries(COMMANDS)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, spec]) => `  scripts/workflow ${spec.usage}`);
  return [
    "Workflow Kit — the project development process.",
    "",
    "Usage:",
    ...lines,
    "  scripts/workflow hook session-start --client claude|codex [--part K/N]",
    "  scripts/workflow git-hook <pre-commit|commit-msg|post-commit|pre-push> [args]",
    "",
    "Options: --format json|text (default json; text for context), --root <project>.",
    'Errors: {"ok":false,"code","message","nextAction"} and exit code 1.',
    "",
  ].join("\n");
}

function projectRoot(
  args: ParsedArgs,
  io: CliIo,
  kit: WorkflowKitFacade
): string {
  const explicit = flag(args, "root") ?? io.env.HARNESS_WORKFLOW_ROOT;
  if (explicit) {
    return explicit;
  }
  return kit.git.isRepository(io.cwd) ? kit.git.topLevel(io.cwd) : io.cwd;
}

function errorEnvelope(error: unknown): Record<string, unknown> {
  if (error instanceof WorkflowError) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      nextAction: error.nextAction ?? null,
      ok: false,
    };
  }
  return {
    code: "INTERNAL",
    message: (error as Error)?.message ?? String(error),
    nextAction: null,
    ok: false,
  };
}

function dispatch(
  args: ParsedArgs,
  io: CliIo,
  kit: WorkflowKitFacade,
  format: string
): number {
  const command = args.command ?? "help";
  const root = projectRoot(args, io, kit);
  if (command === "hook" || command === "git-hook") {
    return runHook(args, io, kit, root);
  }
  const spec = COMMANDS[command];
  if (!spec) {
    throw new WorkflowError(
      "UNKNOWN_COMMAND",
      `Unknown command: ${command}`,
      {},
      "Run `scripts/workflow help`."
    );
  }
  ensureExecutorCommand(kit, root, command);
  const result = spec.run({ args, io, kit, root });
  let text = `${JSON.stringify({ command, ok: true, result }, null, 2)}\n`;
  if (format === "text") {
    text = spec.text ? spec.text(result) : renderText(command, result);
  }
  io.stdout(text);
  return 0;
}

function writeFailure(io: CliIo, error: unknown, format: string): void {
  const envelope = errorEnvelope(error);
  if (format === "text") {
    io.stderr(
      `${envelope.code}: ${envelope.message}${envelope.nextAction ? `\nNext: ${envelope.nextAction}` : ""}\n`
    );
  } else {
    io.stdout(`${JSON.stringify(envelope, null, 2)}\n`);
  }
}

/** Runs one Kit command; returns the process exit code. */
export function runCli(
  argv: readonly string[],
  io: CliIo,
  kit?: WorkflowKitFacade
): number {
  const facade = kit ?? new WorkflowKitFacade({ env: io.env });
  let format = "json";
  try {
    const args = parseArgs(argv);
    format =
      flag(args, "format") ??
      COMMANDS[args.command ?? ""]?.defaultFormat ??
      "json";
    const wantsHelp =
      args.command === "help" || args.flags.get("help") === true;
    if (!args.command || wantsHelp) {
      io.stdout(helpText());
      return wantsHelp ? 0 : 1;
    }
    return dispatch(args, io, facade, format);
  } catch (error) {
    writeFailure(io, error, format);
    return 1;
  }
}

function readProcessStdin(): string {
  if (process.stdin.isTTY) {
    return "";
  }
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    readStdin: readProcessStdin,
    stderr: (text) => process.stderr.write(text),
    stdout: (text) => process.stdout.write(text),
  });
}
