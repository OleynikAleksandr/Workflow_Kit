import { WorkflowError } from "../../workflow-platform/src/workflow-platform-facade.js";
import { parsePart } from "../../workflow-recovery/src/workflow-recovery-facade.js";
import { flag, type ParsedArgs, positional } from "./kit-cli-args.js";
import type { WorkflowKitFacade } from "./workflow-kit-facade.js";

interface HookIo {
  readStdin: () => string;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
}

/**
 * `hook session-start --client claude|codex [--part K/N]` prints the raw
 * SessionStart JSON; `git-hook <name> [args]` prints the hook message on
 * stderr. Returns the process exit code.
 */
export function runHook(
  args: ParsedArgs,
  io: HookIo,
  kit: WorkflowKitFacade,
  root: string
): number {
  if (args.command === "hook") {
    const client = flag(args, "client");
    if (
      positional(args, 0, "Hook name") !== "session-start" ||
      (client !== "claude" && client !== "codex")
    ) {
      throw new WorkflowError(
        "USAGE",
        "hook session-start --client claude|codex"
      );
    }
    const partValue = flag(args, "part");
    const part = partValue === undefined ? null : parsePart(partValue);
    if (partValue !== undefined && part === null) {
      // A wrong part adds no context and never blocks the session.
      io.stderr(
        "hook session-start: --part must be K/N with 1 <= K <= N <= 16\n"
      );
      io.stdout(
        `${JSON.stringify({ continue: true, hookSpecificOutput: { hookEventName: "SessionStart" } })}\n`
      );
      return 0;
    }
    io.stdout(kit.sessionStart(root, client, io.readStdin(), part));
    return 0;
  }
  const name = positional(args, 0, "Hook name");
  // Only pre-push has an input (the pushed refs); git closes that pipe.
  const result = kit.gitHook(
    root,
    name,
    args.positionals.slice(1),
    name === "pre-push" ? io.readStdin() : ""
  );
  if (result.message) {
    io.stderr(`${result.message}\n`);
  }
  return result.exitCode;
}
