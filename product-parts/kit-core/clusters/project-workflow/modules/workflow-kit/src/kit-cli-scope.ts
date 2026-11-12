import {
  integerFlag,
  type ParsedArgs,
  positional,
  readJsonFile,
  requiredFlag,
} from "./kit-cli-args.js";
import type {
  CarryoverInput,
  ExtendInput,
  ScopeInput,
  TaskPatch,
  WorkflowKitFacade,
} from "./workflow-kit-facade.js";

interface ScopeCommandContext {
  args: ParsedArgs;
  io: { cwd: string };
  kit: WorkflowKitFacade;
  root: string;
}

interface ScopeCommandSpec {
  run: (context: ScopeCommandContext) => unknown;
  usage: string;
}

/**
 * The scope and plan commands: `scope:create`, `plan:extend`,
 * `task:update`, `task:block`, `task:unblock`, `accept`, `close` and
 * `carryover` (text output by `renderText`).
 */
export const SCOPE_COMMANDS: Readonly<Record<string, ScopeCommandSpec>> = {
  accept: {
    run: ({ args, kit, root }) => kit.accept(root, requiredFlag(args, "note")),
    usage: 'accept --note "<the user\'s words>"',
  },
  carryover: {
    run: ({ args, io, kit, root }) =>
      kit.carryover(
        root,
        readJsonFile<CarryoverInput>(io.cwd, requiredFlag(args, "input"))
      ),
    usage: "carryover --input <file.json>",
  },
  close: {
    run: ({ args, kit, root }) =>
      kit.close(root, requiredFlag(args, "scope"), requiredFlag(args, "note")),
    usage: 'close --scope <id> --note "<direct user command>"',
  },
  "plan:extend": {
    run: ({ args, io, kit, root }) =>
      kit.extend(
        root,
        readJsonFile<ExtendInput>(io.cwd, requiredFlag(args, "input")),
        integerFlag(args, "expected-revision")
      ),
    usage: "plan:extend --input <file.json> [--expected-revision N]",
  },
  "scope:create": {
    run: ({ args, io, kit, root }) =>
      kit.createScope(
        root,
        readJsonFile<ScopeInput>(io.cwd, requiredFlag(args, "input"))
      ),
    usage: "scope:create --input <file.json>",
  },
  "task:block": {
    run: ({ args, kit, root }) => kit.block(root, requiredFlag(args, "reason")),
    usage: 'task:block --reason "<text>"',
  },
  "task:unblock": {
    run: ({ kit, root }) => kit.unblock(root),
    usage: "task:unblock",
  },
  "task:update": {
    run: ({ args, io, kit, root }) =>
      kit.updateTask(
        root,
        positional(args, 0, "Task id"),
        readJsonFile<TaskPatch>(io.cwd, requiredFlag(args, "input")),
        integerFlag(args, "expected-revision")
      ),
    usage: "task:update <ID> --input <patch.json> [--expected-revision N]",
  },
};
