# Workflow Kit Module

## Responsibility

The cluster facade of `core-runtime/clusters/project-workflow`: every
process operation of the Workflow Kit on one project root. It composes the
facades of the plan, git, quality and recovery modules and keeps the rule
"each status changes through a Kit command; each finished task is one Kit
commit".

It also handles the managed git hooks and owns the command-line dispatcher
`src/workflow-kit-cli.ts`, the entry of the standalone bundle.

## Public Facade

`WorkflowKitFacade` (class, singleton `workflowKitFacade`) extends
`WorkflowKitBase` (`kit-facade-base.ts`: the options, the bound facades and
the installer, status and recovery operations). The constructor
takes `{git?, env?, now?}`; tests pass a git facade with a clean git
environment and a deterministic clock. `recovery` exposes the recovery
facade bound to the same git facade.

## Operations

The operations of the facade are listed in [operations.md](operations.md).

## Git Hooks (`kit-hooks.ts`)

`gitHook(root, name, args)` returns `{exitCode, code, message}`; the hook
scripts print the message and exit with the code. `GIT_HOOKS` lists the
managed hooks.
- `pre-commit`:
  - requires a prepared Kit transaction whose candidate tree equals the
    index; otherwise `MANAGED_COMMIT_REQUIRED` (a direct `git commit`);
  - in an executor worktree, checks every staged path (`git diff --cached
    --name-only HEAD`) and the candidate plan with the contract guard
    (`ASSIGNMENT_CONTRACT`, `ASSIGNMENT_SCOPE`), so a transaction that
    bypasses `commit --task` is refused as well;
  - a merge in progress (`MERGE_HEAD`) must be the `sourceCommit` of the
    journal, and an integration journal needs it
    (`MANAGED_COMMIT_REQUIRED`), so only the integration commits a merge;
  - runs the `commit` stage on the selected files: role `implementation`
    and the integration of a `work` task run the required and assigned
    checks, every other commit (service, DOCS, QUALITY) only the
    documentation builtins and `kit:conflict-markers`, which every commit
    runs (staged conflict markers fail it); the task's `docsWaiver` comes
    from the candidate plan; `removed` = `absentPaths` of the selected
    files (`git rm -r --cached node_modules`) is skipped by content builtins
    and `{files}`;
  - stores the report as pending evidence of the transaction;
  - `CHECK_MODIFIED_CANDIDATE` when a check changed the index tree or a
    selected file; `CHECK_FAILED` with the failed checks and their output
    tail otherwise. The transaction then rolls back the plan and index and
    keeps the edits (`COMMIT_FAILED`, retryable).
- `commit-msg` — the message must carry the `Workflow-Transaction` trailer
  of the pending journal (`MANAGED_COMMIT_REQUIRED`).
- `post-commit` — nothing to do; the transaction confirms the commit.
- `pre-push`:
  - `ASSIGNMENT_READ_ONLY` in an executor worktree: executors never push;
  - `TRANSACTION_PENDING` while a journal exists, `INTEGRATION_ACTIVE`
    while an integration journal exists;
  - `DOCS_PENDING` while the DOCS task of the last round with a finished
    task is not done;
  - runs the required `push` checks (`CHECK_FAILED`).
- Any other name fails with `UNKNOWN_HOOK`; unexpected errors are reported
  with their code instead of a stack trace.

## Command Line (`workflow-kit-cli.ts`, `kit-cli-*.ts`)

The full reference (usage, behaviour, text output and refusals of every
command) is
[WorkflowKitCommands.md](../../../../../../docs/architecture/workflow-kit/WorkflowKitCommands.md);
it changes in the same commit as the commands. Summary:
- `runCli(argv, io, kit?)` returns the exit code; the file runs it itself
  when it is the program entry. The project root is `--root`, else
  `HARNESS_WORKFLOW_ROOT`, else the git top level, else the working
  directory.
- `COMMANDS` of `workflow-kit-cli.ts` spreads the command groups of
  `kit-cli-execution.ts` (`scope:propose`, `scope:choose`,
  `scope:proposal`, `scope:owner`), `kit-cli-assignment.ts` (`assignment:*` and the
  executor whitelist), `kit-cli-integration.ts` (`integration:*`),
  `kit-cli-identity.ts` (`identity:set`), `kit-cli-pause.ts` (`pause:set`),
  `kit-cli-schema.ts` (`schema`), `kit-cli-context.ts` (`context`) and
  `kit-cli-scope.ts` (`scope:create`, `plan:extend`, `task:update`,
  `task:block`, `task:unblock`, `task:defer-delivery` (M39, see
  [operations.md](operations.md)), `accept`, `close`, `carryover`; `accept` and
  `close` take the host-only `--autopilot-run` form), `kit-cli-autopilot.ts`
  (`autopilot:authorize`, `autopilot:revoke`, host only, see
  [autopilot.md](autopilot.md)); boolean
  flags include `--force`, and `--digest` is boolean only for
  `scope:proposal` (`commit --digest <file>` keeps its value); the other commands are defined in
  `workflow-kit-cli.ts`, the default texts in `kit-cli-text.ts`. `help`
  lists every usage line.
- `schema [<command>]` (`kit-cli-schema.ts`) prints the JSON input
  descriptor of `scope:create`, `scope:propose`, `plan:extend`,
  `task:update`, `carryover`, `digest` or `quality:apply` with its example
  (text: the compact field lines, rules and the one-line example of
  `workflowRecoveryFacade.schemaText`), or without a command the list with
  one-line descriptions; another command is `USAGE` with
  `details.commands`. It needs no scope and runs in an executor worktree.
- `context <path>[#Heading] …` (`kit-cli-context.ts`, text by default)
  prints `<document path heading? bytes>` blocks in argument order within
  28 000 bytes; after the first misfit the rest is listed as `not included
  (ask again): <path>[#H] (N bytes)`. A document over the budget alone gives
  its `##` sections (without sections: `tooLarge`). `#Heading` matches by text or slug (`section`). Every
  argument is checked first: outside the root (symbolic links resolved),
  `.harness/workflow/**`, a folder or a file with a NUL byte is
  `CONTEXT_FORBIDDEN`; a missing file or heading `CONTEXT_MISSING`. JSON:
  `{documents: [{path, heading?, bytes, text}], notIncluded: [{path,
  heading?, bytes, tooLarge?}]}`. `--list [<folder>]`: `{folder, entries,
  shown, text}`, the map within 28 000 bytes. No scope; executor allowed.
- Output: `{ok: true, command, result}` as JSON or `--format text` (a
  spec's `defaultFormat` sets the default).
  Errors: `{ok: false, code, message, nextAction, details}` on stdout with
  exit code 1 (`--format text`: `CODE: message` on stderr); `USAGE`,
  `UNKNOWN_COMMAND`, `INPUT_UNREADABLE` / `INPUT_JSON`, `INTERNAL`.
- Executor worktree: only `status`, `validate`, `recover`, `show-task`,
  `schema`, `context`, `task:start`, `commit`, `repair`, `task:block`,
  `assignment:status`, `assignment:setup`, `assignment:attach`, `help`,
  `hook` and `git-hook` run; every other known command fails with
  `ASSIGNMENT_READ_ONLY` (`details.allowed`) before it runs.
- `install [<path>] [--name] [--update [--with <json|a,b>]] [--host
  harness] [--bundle]` passes `--with` (a JSON or comma list, as `--files`)
  to `workflow-installer` as `with`: the files of the app's managed
  structure for the same `kit-update` commit (Kit 2.2.7, spec M38); the
  installer refuses it without `--update` (`USAGE`) and for paths outside
  `.workflow-kit/manifest.json` (`WITH_NOT_MANAGED`).
- `hook session-start --client claude|codex [--part K/N]`
  (`kit-cli-hook.ts`) prints the raw SessionStart JSON;
  `git-hook <name> [args]` prints the hook message on stderr and exits with
  the hook code.

## Bundle

`npm run build:workflow-kit` (`scripts/build-workflow-kit.mjs`, in
`npm run build` and `npm run dev`) bundles `workflow-kit-cli.ts` with
`vite.workflow-kit.config.ts` (Vite SSR library, Node 22, not minified)
into `dist/workflow-kit/workflow.mjs`, inlining every cluster module; an
import other than a `node:` built-in fails the script. Its smoke test in a
temporary folder: `help`, `status` without the Kit (`installed: false`),
`validate` (`NOT_INSTALLED`), and an installation into a new git project
(temporary global git identity) whose bootstrap commit runs the installed
hooks and launcher, then `scripts/workflow validate` and `doctor`.

## Dependencies

`workflow-platform`, `workflow-plan`, `workflow-git`, `workflow-quality`,
`workflow-recovery`, `workflow-installer`, `workflow-execution-mode`,
`workflow-assignment`, `workflow-integration`, `workflow-autopilot`
(types).
Node built-ins only.

## Tests

Tests are listed in [tests.md](tests.md).
