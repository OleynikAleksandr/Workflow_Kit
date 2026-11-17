import { acceptHost, closeHost, type HostedRun } from "./kit-cli-autopilot.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  flag,
  integerFlag,
  listFlag,
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
  /** The host-only form (`--autopilot-run`), or null for the manual one. */
  host?: (context: ScopeCommandContext) => HostedRun | null;
  run: (context: ScopeCommandContext) => unknown;
  usage: string;
}

/**
 * The scope and plan commands: `scope:create`, `plan:extend`,
 * `task:update`, `task:block`, `task:unblock`, `task:defer-delivery`,
 * `accept`, `close`, `commits:adopt` and `carryover` (text output by
 * `renderText`).
 */
export const SCOPE_COMMANDS: Readonly<Record<string, ScopeCommandSpec>> = {
  accept: {
    host: acceptHost,
    run: ({ args, kit, root }) => kit.accept(root, requiredFlag(args, "note")),
    usage:
      'accept --note "<the user\'s words>" | accept --autopilot-run <id> --input <evidence.json> --expected-revision N (host only)',
  },
  "commits:adopt": {
    run: ({ args, kit, root }) => {
      const commits = listFlag(args, "commits");
      ensure(
        commits !== undefined && commits.length > 0,
        "USAGE",
        "commits:adopt needs --commits <sha,sha>: the exact list of the EXTERNAL_COMMITS refusal."
      );
      return kit.adoptCommits(root, commits, requiredFlag(args, "note"));
    },
    usage:
      'commits:adopt --commits <json|sha,sha> --note "<the user\'s words>"',
  },
  carryover: {
    run: ({ args, io, kit, root }) =>
      kit.carryover(
        root,
        readJsonFile<CarryoverInput>(root, io.cwd, requiredFlag(args, "input"))
      ),
    usage: "carryover --input <file.json>",
  },
  close: {
    host: closeHost,
    run: ({ args, kit, root }) =>
      kit.close(root, requiredFlag(args, "scope"), requiredFlag(args, "note")),
    usage:
      'close --scope <id> --note "<direct user command>" | close --scope <id> --autopilot-run <id> --expected-revision N (host only)',
  },
  "plan:extend": {
    run: ({ args, io, kit, root }) =>
      kit.extend(
        root,
        readJsonFile<ExtendInput>(root, io.cwd, requiredFlag(args, "input")),
        integerFlag(args, "expected-revision")
      ),
    usage: "plan:extend --input <file.json> [--expected-revision N]",
  },
  "scope:create": {
    run: ({ args, io, kit, root }) =>
      kit.createScope(
        root,
        readJsonFile<ScopeInput>(root, io.cwd, requiredFlag(args, "input"))
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
  "task:defer-delivery": {
    run: ({ args, kit, root }) => {
      const expectedRevision = integerFlag(args, "expected-revision");
      ensure(
        expectedRevision !== undefined,
        "USAGE",
        "task:defer-delivery needs --expected-revision N (from `scripts/workflow status`)."
      );
      return kit.deferDelivery(root, {
        expectedRevision,
        outcome: flag(args, "outcome") ?? null,
        reason: requiredFlag(args, "reason"),
        taskId: positional(args, 0, "Task id"),
      });
    },
    usage:
      'task:defer-delivery <ID> --reason "<failure and where it is seen>" [--outcome "<result of the external step>"] --expected-revision N',
  },
  "task:update": {
    run: ({ args, io, kit, root }) =>
      kit.updateTask(
        root,
        positional(args, 0, "Task id"),
        readJsonFile<TaskPatch>(root, io.cwd, requiredFlag(args, "input")),
        integerFlag(args, "expected-revision")
      ),
    usage: "task:update <ID> --input <patch.json> [--expected-revision N]",
  },
};
