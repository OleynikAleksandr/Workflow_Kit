import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { type ParsedArgs, readJsonFile, requiredFlag } from "./kit-cli-args.js";
import type {
  ExecutionModeOption,
  ScopeChoiceResult,
  ScopeInput,
  ScopeProposalResult,
  ScopeProposalView,
  WorkflowKitFacade,
} from "./workflow-kit-facade.js";

interface ExecutionCommandContext {
  args: ParsedArgs;
  io: { cwd: string };
  kit: WorkflowKitFacade;
  root: string;
}

interface ExecutionCommandSpec {
  run: (context: ExecutionCommandContext) => unknown;
  text: (result: unknown) => string;
  usage: string;
}

const STRATEGIES = new Set(["orchestrated", "sequential"]);
const OPTIONS = new Set(["orchestrated", "refine", "sequential"]);
const GENERATION_PATTERN = /^[1-9]\d*$/u;

function choice<T extends string>(
  args: ParsedArgs,
  name: string,
  allowed: Set<string>
): T {
  const value = requiredFlag(args, name);
  ensure(
    allowed.has(value),
    "USAGE",
    `--${name} is ${[...allowed].join(", ")}.`
  );
  return value as T;
}

function generation(args: ParsedArgs): number {
  const value = requiredFlag(args, "generation");
  ensure(
    GENERATION_PATTERN.test(value),
    "USAGE",
    "--generation must be a positive integer."
  );
  return Number(value);
}

function proposalText(value: unknown): string {
  const result = value as ScopeProposalResult;
  const lines = [
    `proposal: generation ${result.generation}, recommended ${result.recommended}, parallel work ${result.hasParallelWork ? "yes" : "no"}`,
    `reason: ${result.reason}`,
    `options: ${result.options.join(", ")}`,
  ];
  lines.push(
    result.autoChosen && result.scope
      ? `scope: ${result.scope.scopeId} created as sequential automatically (no parallel work after refining); tell the user and start the first task.`
      : "next: the user chooses the execution mode; end the turn."
  );
  return `${lines.join("\n")}\n`;
}

function choiceText(value: unknown): string {
  const result = value as ScopeChoiceResult;
  if (result.option === "refine") {
    return `choice: refine (generation ${result.generation}); refine the specification with the user, then run scope:propose again.\n`;
  }
  return `choice: ${result.option} (generation ${result.generation}); scope ${result.scope?.scopeId ?? "NONE"} created at revision ${result.scope?.revision ?? 0}.\n`;
}

function proposalViewText(value: unknown): string {
  const view = value as ScopeProposalView | null;
  if (!view) {
    return "proposal: none\n";
  }
  const state = view.refining ? "refining" : "open";
  return `${[
    `proposal: generation ${view.generation} (${state}), recommended ${view.recommended}, parallel work ${view.hasParallelWork ? "yes" : "no"}`,
    `scope: ${view.scopeId ?? "NONE"}${view.objective ? ` — ${view.objective}` : ""}`,
    `reason: ${view.reason}`,
    `options: ${view.options.join(", ")}`,
  ].join("\n")}\n`;
}

/**
 * `scope:propose`, `scope:choose` and the read-only `scope:proposal`: the
 * execution mode choice (spec 4.1).
 */
export const EXECUTION_COMMANDS: Readonly<
  Record<string, ExecutionCommandSpec>
> = {
  "scope:choose": {
    run: ({ args, kit, root }) =>
      kit.chooseScope(root, {
        generation: generation(args),
        note: requiredFlag(args, "note"),
        option: choice<ExecutionModeOption>(args, "option", OPTIONS),
        session: requiredFlag(args, "session"),
      }),
    text: choiceText,
    usage:
      'scope:choose --generation <N> --option sequential|orchestrated|refine --session <id> --note "<the user\'s choice>"',
  },
  "scope:proposal": {
    run: ({ kit, root }) => kit.proposalView(root),
    text: proposalViewText,
    usage: "scope:proposal",
  },
  "scope:propose": {
    run: ({ args, io, kit, root }) =>
      kit.proposeScope(
        root,
        readJsonFile<ScopeInput>(io.cwd, requiredFlag(args, "input")),
        choice<"orchestrated" | "sequential">(args, "recommended", STRATEGIES),
        requiredFlag(args, "reason")
      ),
    text: proposalText,
    usage:
      'scope:propose --input <file.json> --recommended sequential|orchestrated --reason "<why>"',
  },
};
