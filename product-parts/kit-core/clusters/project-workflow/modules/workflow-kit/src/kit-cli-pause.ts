import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { type ParsedArgs, requiredFlag } from "./kit-cli-args.js";
import type { PauseState, WorkflowKitFacade } from "./workflow-kit-facade.js";

interface PauseCommandContext {
  args: ParsedArgs;
  kit: WorkflowKitFacade;
  root: string;
}

interface PauseCommandSpec {
  run: (context: PauseCommandContext) => unknown;
  text: (result: unknown) => string;
  usage: string;
}

function pauseText(value: unknown): string {
  const result = value as PauseState;
  return result.paused
    ? `pause: on (${result.at}) — ${result.note}\ntask:start in main and assignment:create are refused until the user continues.\n`
    : `pause: off (${result.at}) — ${result.note}\n`;
}

/**
 * `pause:set --on|--off --note`: the user's pause of the workflow (main
 * checkout only; an executor worktree gets ASSIGNMENT_READ_ONLY).
 */
export const PAUSE_COMMANDS: Readonly<Record<string, PauseCommandSpec>> = {
  "pause:set": {
    run: ({ args, kit, root }): PauseState => {
      const on = args.flags.get("on") === true;
      const off = args.flags.get("off") === true;
      ensure(
        on !== off,
        "USAGE",
        "pause:set needs exactly one of --on or --off."
      );
      return kit.setPause(root, on, requiredFlag(args, "note"));
    },
    text: pauseText,
    usage: 'pause:set --on|--off --note "<the user\'s words>"',
  },
};
