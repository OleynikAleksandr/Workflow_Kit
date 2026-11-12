# Workflow Kit Commands (`scripts/workflow`)

Detailed command reference of the Workflow Kit command line
(`workflow-kit-cli.ts` and `kit-cli-*.ts` of the module
`product-parts/core-runtime/clusters/project-workflow/modules/workflow-kit`).
The module's `module.md` keeps the summary and the facade operations; this
document is updated in the same commit as the commands it describes.

## Conventions

- `runCli(argv, io, kit?)` returns the exit code; `io` is `{cwd, env,
  readStdin, stdout, stderr}`. `workflow-kit-cli.ts` runs `runCli` itself
  when it is the program entry (the bundle or the compiled file), and not
  when imported.
- Project root: `--root`, else `HARNESS_WORKFLOW_ROOT`, else the git top
  level of the working directory, else the working directory. Input files
  resolve against the working directory.
- Output: `{ok: true, command, result}` as JSON (default; `context`
  defaults to text), or the text of `--format text` described per command
  (JSON when none is described).
- Errors: `{ok: false, code, message, nextAction, details}` on stdout with
  exit code 1; with `--format text` `CODE: message` (and `Next: ...`) on
  stderr. Common refusals of every command:
  - `USAGE` — a missing or invalid argument (a required flag without a
    value, a non-integer `--expected-revision`, an invalid list);
  - `UNKNOWN_COMMAND` — an unknown command (next action `help`);
  - `INPUT_UNREADABLE` / `INPUT_JSON` — an `--input`/`--digest` file that
    cannot be read or parsed;
  - `NOT_INSTALLED` — a project without the plan file;
  - `TRANSACTION_PENDING` / `INTEGRATION_ACTIVE` — a mutating command while
    a commit transaction or an integration journal is unfinished (`repair`
    stays available);
  - `INTERNAL` — an unexpected error.
- `--files` and `--stack` take a JSON list or a comma-separated list.
  Boolean flags (no value): `--help`, `--fix`, `--dry-run`, `--global`,
  `--off`, `--on`, `--update`.
- Mutating commands run under the project lock; the behaviour of each
  operation is in the Operations section of `workflow-kit/module.md`.

## Executor Worktree

In a checkout with `.harness/workflow/local/assignment.json` only
`status`, `validate`, `recover`, `show-task`, `schema`, `context`,
`task:start`,
`commit`, `repair`, `task:block`, `assignment:status`, `assignment:setup`,
`assignment:attach` (retry), `help`, `hook` and `git-hook` run. Every other
known command fails with `ASSIGNMENT_READ_ONLY` (`details.allowed`) before
it runs.

## State And Recovery

- `status` — the Kit status (`kit-status.ts`). Text: `project`, `scope`
  (or `scope: NONE`), `blocked` when blocked, `execution:
  none|sequential|orchestrated (max <N> workers), assignments: <STATUS>
  <count>, ...|none[, integration <task> <phase>]`, `executor: assignment
  <id>, task <ID>` in an executor worktree, `paused: true|false`,
  `progress`, `current`, `next`, `quality` (status, stacks, drift), `head`,
  `transaction`, `changes`.
- `autopilot:status` — the status the Harness Core autopilot decides on.
  JSON only.
- `validate` — `{ok, errors[]}` for the plan, its projection, the
  configuration and the task-to-commit mapping. Text: `Plan and history
  are consistent.` or one `CODE: message` line per error.
- `recover [--event startup|resume|clear|compact]` — the recovery packet
  of `workflow-recovery` (default `startup`); text is the packet itself.
  Another `--event` is `USAGE`.
- `show-task <ID>` — the full task text with its commit when done (text:
  the task). `USAGE` without the id; `UNKNOWN_TASK`.
- `history [--task <ID>] [--round <R>]` — workflow commits from git
  (text: one line per commit).
- `schema [<command>]` — the JSON input descriptor of a Kit command,
  read through `workflowRecoveryFacade` from the owner facades
  (`workflow-plan`: `scope:create`, `scope:propose`, `plan:extend`,
  `task:update`, `carryover`, `digest` — the `commit --digest` file;
  `workflow-quality`: `quality:apply`). A pure read: it needs no scope or
  installed Kit and runs in an executor worktree.
  - With a command: `result` is the descriptor `{command, description,
    fields[], rules[], example}` (a field is `{name, type, required,
    description, code}` plus any of `minItems`, `maxItems`, `maxBytes`,
    `minLength`, `minimum`, `maximum`, `enum`, `pattern`, `limitCode`).
    Text: `<command>: <description>`, `fields:` with one line per field
    `- <name> <type> required|optional [<limits>, code <CODE>[, limitCode
    <CODE>]] — <description>`, `rules:` with one line per rule, `example:`
    and the example as one line of JSON. The recovery packet `schema`
    section uses the same text.
  - Without a command: `result` is `{commands: [{command, description}]}`
    in the order above. Text: `Commands with an input schema:`, one line
    `- <command> — <description>` each, and a pointer to
    `schema <command>`.
  - A command without a descriptor is `USAGE` (`<command> has no input
    schema. Commands with a schema: ...`, `details.commands`, next action
    `scripts/workflow schema`).

- `context <path>[#Heading] … | context --list [<folder>]`
  (`kit-cli-context.ts`, spec 3.1 of `ReleaseFixes-2026-11-04-3.md`) —
  project documents as marked text in one call, instead of reading large
  files piecewise. A pure read: no scope needed, allowed in an executor
  worktree; text is the default format.
  - Every argument is checked first: a path outside the project root
    (symbolic links resolved), under `.harness/workflow/**`, a folder or a
    file with a NUL byte is `CONTEXT_FORBIDDEN`; a missing file or heading
    is `CONTEXT_MISSING` (next action: `context --list`).
  - Documents are returned whole, in argument order, as `<document
    path="…" heading="…" bytes="N">` blocks (`heading` only for a section)
    while the answer fits 28 000 bytes (Claude Code cuts tool output near
    30 000 characters). After the first misfit every later request is
    listed as `not included (ask again): <path>[#H] (N bytes)`, so the next
    call continues in order.
  - A document larger than the budget alone is returned by its `##`
    sections (the preamble stays with the first); one without sections is
    listed as too large. `#Heading` selects a section by text or slug, like
    the recovery packet.
  - JSON: `{documents: [{path, heading?, bytes, text}], notIncluded:
    [{path, heading?, bytes, tooLarge?}]}`.
  - `--list [<folder>]` — the documents map (path, bytes, `##` headings;
    the Documents Map of `WorkflowKitRecovery.md`) within 28 000 bytes,
    the tail line pointing to a subfolder; JSON `{folder, entries, shown,
    text}`. A missing folder is `CONTEXT_MISSING`, a file
    `CONTEXT_FORBIDDEN`; more than one folder is `USAGE`.

## Scope

Context budget refusals (`kit-context-budget.ts`; spec 2): `scope:create`,
`scope:propose`, `scope:choose`, `plan:extend` (new and changed tasks) and
`task:update` read each task's brief documents (its `context`, or the scope
specification) and refuse with `CONTEXT_MISSING` (`details {taskId, path,
heading?}`) for a missing file or heading and `CONTEXT_TOO_LARGE`
(`details {taskId, bytes, budget}`, next action: narrow `context` to
sections with `heading`) when the text exceeds `budget.briefBytes`
(default 60 000). Nothing is written then.

Planned checks (`workflowQualityFacade.ensurePlannedChecks`; spec
`KitFixes-2026-11-05.md` section 2): the same commands refuse with
`CHECK_UNKNOWN` (`details {taskId, field, checks, known}`, `field`
`tasks[<index>].checks` or `checks`) when a new task or a changed `checks`
names an id that is not a quality check: the profile's checks and implicit
guards when `CONFIGURED`, before QUALITY an id without spaces (`kit:*` only
for Kit builtins). Manual checks belong in `acceptance`.

- `scope:create --input <file.json>` — the agreed scope; input:
  `schema scope:create`. Refusals: `SCOPE_EXISTS`, `NO_BASELINE`,
  `SPEC_REQUIRED`, `SCOPE_APPROVAL`, `PLAN_SCHEMA`, `PLAN_EXECUTION`;
  `EXECUTION_MODE_REQUIRED` with config `host: "harness"` (next action
  `scope:propose`), `CONTEXT_MISSING`, `CONTEXT_TOO_LARGE`.
- `scope:propose --input <file.json> --recommended sequential|orchestrated
  --reason "<why>"` (`kit-cli-execution.ts`) — stores the proposal for the
  user's choice; input: `schema scope:propose`. An invalid `--recommended`
  is `USAGE`; `NO_PARALLEL_WORK`, `PROPOSAL_REASON` and the `scope:create`
  validation refusals. Text: the generation, recommendation, reason,
  options and the next step.
- `scope:choose --generation <N> --option sequential|orchestrated|refine
  --session <id> --note "<the user's choice>"` (`kit-cli-execution.ts`) —
  the user's choice on the card. An invalid `--option` or a non-positive
  `--generation` is `USAGE`; `PROPOSAL_CHANGED`, `NO_PARALLEL_WORK`. Text:
  the choice and the created scope.
- `scope:proposal` (`kit-cli-execution.ts`) — the card view of the stored
  proposal or `null`. Text: the generation and state, the scope, reason
  and options, or `proposal: none`.
- `plan:extend --input <file.json> [--expected-revision N]` — tasks for the
  open round or a new round; input: `schema plan:extend`. Refusals:
  `REVISION_MISMATCH`, `ROUND_OPEN`, `TASK_STARTED`, `UNKNOWN_TASK`,
  `PLAN_SCHEMA`, `TASK_ORDER`, `CONTEXT_MISSING`, `CONTEXT_TOO_LARGE`.
- `task:update <ID> --input <patch.json> [--expected-revision N]` — patch
  of a task that is not `DONE`; input: `schema task:update`. Refusals:
  `TASK_PATCH`, `REVISION_MISMATCH`, `UNKNOWN_TASK`, `PLAN_SCHEMA`,
  `CONTEXT_MISSING`, `CONTEXT_TOO_LARGE`.
- `accept --note "<the user's words>"` — records the user's acceptance;
  the scope stays open. Refusals: `NOT_READY` (delivery is not
  `READY_FOR_ACCEPTANCE`), `ACCEPTANCE_NOTE`.
- `close --scope <id> --note "<direct user command>"` — closes an accepted
  scope. Refusals: `SCOPE_ID`, `NOT_ACCEPTED`, `USER_CLOSE_REQUIRED`,
  `DIRTY_TREE`.
- `carryover --input <file.json>` — closes the scope and opens a new one
  with the unfinished tasks; input: `schema carryover`. Refusals:
  `NO_SCOPE`, `NO_BASELINE`, `NOTHING_TO_CARRY`, `SCOPE_APPROVAL`.

## Tasks

- `task:start <ID> [--confirmed "<user confirmation>"]` — starts a task.
  Refusals: `WORKFLOW_PAUSED` (main), `ORCHESTRATED_MAIN_READ_ONLY`,
  `DELIVERY_NOT_READY`, `CHECK_UNKNOWN`, `SCOPE_NOT_ACTIVE`,
  `TASK_ALREADY_ACTIVE`, `TASK_NOT_TODO`, `DEPENDENCY_PENDING`,
  `DELIVERY_CONFIRMATION`, `ASSIGNMENT_NEEDS_SETUP` (executor).
- `commit --task <ID> [--files <json|a,b>] [--digest <file.json>]` — the
  task commit; the digest of a DOCS task: `schema digest`. Refusals:
  `TASK_NOT_ACTIVE`, `USE_QUALITY_APPLY`, `ROUND_DIGEST_REQUIRED`,
  `ROUND_DIGEST_TOO_LARGE`, `NOT_CONFIGURED`, `CHECK_FAILED`,
  `COMMIT_FAILED`, `ASSIGNMENT_CONTRACT`, `ASSIGNMENT_SCOPE` (executor).
- `task:block --reason "<text>"` / `task:unblock` — write the plan only.
  Refusals: `SCOPE_NOT_ACTIVE`, `BLOCK_REASON`, `SCOPE_NOT_BLOCKED`.
- `docs:commit --files <json|a,b> [--message "docs: ..."]` — a
  documentation-only commit (Markdown and `.harness/product-tree/**`).
  `USAGE` without `--files`; `DOCS_ONLY`, `TASK_IN_PROGRESS`.

## Pause

- `pause:set --on|--off --note "<the user's words>"` (`kit-cli-pause.ts`) —
  the user's pause of the workflow in main, stored in
  `.harness/workflow/local/pause.json` (`{paused, note, at}`, survives a
  restart); no scope needed. `status` and `autopilot:status` show
  `paused`. While paused, `task:start` in main and `assignment:create` fail
  with `WORKFLOW_PAUSED` (`details {at, note}`); a task already in progress
  finishes, and executor worktrees, `commit`, integration, `accept`,
  `repair` and reads are not affected. Exactly one of the flags and a
  note, else `USAGE`; `PAUSE_STATE` for an unreadable pause file. Text:
  `pause: on|off (<at>) — <note>`; when on, a second line says that
  `task:start` in main and `assignment:create` are refused until the user
  continues.

## Assignments And Integration

Defined in `kit-cli-assignment.ts` and `kit-cli-integration.ts`; the
preconditions and their order are in `workflow-kit/module.md`
(Assignments, Executor worktree) and `workflow-integration/module.md`.
- `assignment:next` — what the scheduler hands out now. Text: the scope
  and workers, one line per active, ready and blocked task and the next
  `assignment:create`, or `assignments: none (<idle code>)`.
- `assignment:create --task <ID>` — the `ASSIGNED` record and the brief.
  Refusals: `NOT_ORCHESTRATED`, `SCOPE_NOT_ACTIVE`, `DIRTY_TREE`,
  `WORKFLOW_PAUSED`, `NO_COMMITS`, `UNKNOWN_TASK`, `ASSIGNMENT_KIND`,
  `TASK_NOT_TODO`, `CONTEXT_MISSING` / `CONTEXT_TOO_LARGE` (the budget
  check repeated on the current files: a document may have grown),
  `ASSIGNMENT_EXISTS`, the scheduler codes, `DEPENDENCY_NOT_IN_BASE`. Text: the
  id, task, short base and whether it was created, followed by the brief:
  the task lines, the checked documents as marked full text and the
  documents map (its own 4000-byte budget, outside `budget.briefBytes`).
- `assignment:attach <id>` — binds the executor worktree. Refusals:
  `ASSIGNMENT_LAYOUT`, `ASSIGNMENT_WORKTREE`, `ASSIGNMENT_UNKNOWN`,
  `ASSIGNMENT_ATTACHED`, `ASSIGNMENT_STATUS`, `ASSIGNMENT_DIRTY`,
  `ASSIGNMENT_BASE`. Text: the id, whether it was attached now, task,
  status, worktree and branch (`detached`), main, the short plan commit
  and the next `task:start` (the next `assignment:setup` for
  `NEEDS_SETUP`).
- `assignment:status` — the executor's record and task;
  `ASSIGNMENT_NOT_ATTACHED` outside an executor worktree. Text: the id
  with the main status, scope, short base and head, the task line and the
  source commit.
- `assignment:setup [--id <id>]` — installs the worktree dependencies.
  Refusals: `ASSIGNMENT_READ_ONLY` (another id in an executor worktree),
  `USAGE` (no `--id` in main), `ASSIGNMENT_UNKNOWN`, `SETUP_LOCK_REQUIRED`,
  `SETUP_LINKED_DEPENDENCIES`, `SETUP_FAILED`. Text: the id, status and
  the command with the short lock hash (or `no dependencies to install`)
  and the next `task:start` when `READY`.
- `assignment:cleanup [--id <id>]` — removes integrated worktrees.
  Refusals: `ASSIGNMENT_UNKNOWN`, `ASSIGNMENT_NOT_INTEGRATED`; a refused
  removal is recorded as `PENDING`, not an error. Text: one `cleanup: <id>
  DONE` or `cleanup: <id> PENDING — <reason>` line per record plus a next
  step for pending ones, or `cleanup: nothing to clean up.`.
- `assignment:cancel --id <id> [--force]` — main only: drops an assignment
  that is not `INTEGRATED` (record, registered worktree, branch with
  `branch -D`); the plan does not change and the task stays `TODO`.
  Refusals: `USAGE`, `TRANSACTION_PENDING`, `INTEGRATION_ACTIVE`,
  `ASSIGNMENT_UNKNOWN`, `ASSIGNMENT_INTEGRATED` (use `assignment:cleanup`),
  `ASSIGNMENT_DIRTY` (uncommitted changes in the worktree, `details.paths`;
  `--force` drops them), `ASSIGNMENT_CANCEL_FAILED` (a git refusal; the
  record is kept, repeat the command). Text: `assignment: <id> cancelled,
  task <ID> <status>`, the removed worktree, the deleted branch with its
  short tip and the restore command `git branch <name> <sha>`, then `next:
  scripts/workflow assignment:create --task <ID>`.
- `integration:start --id <assignment> --source <sha>` and
  `integration:continue --id <assignment>` — integrate an executor result
  into main. Text: the id, status, task, short source and main, then
  `conflict: <file>` lines and the resolve-and-continue step, or the short
  commit, the cleanup line and `next: scripts/workflow assignment:next`.
- `integration:status` — text: `integration: IDLE` or the phase line,
  conflicts, the error tail and the next step.

## Quality And Repair

- `quality:detect [--stack node,python]` — the proposal of
  `workflow-quality`.
- `quality:apply --input <profile.json>` — installs the approved tools,
  writes the `CONFIGURED` profile and commits it (role `quality`); input:
  `schema quality:apply`. Refusals: `PROFILE_INVALID`, `UNKNOWN_STACK`,
  `CONFIG_SCHEMA`, `INSTALL_APPROVAL`, `INSTALL_FAILED`.
- `quality:status` — status, stacks, check ids by stage, drift.
- `repair [--apply <repairId> | --cancel <repairId>]` — dry run, apply or
  cancel the repair of an unfinished transaction. `--cancel` of a
  preparation whose index or plan changed afterwards restores the index
  (`index-before`, else the HEAD tree) and the original plan, keeps
  working-tree files and removes the journal while HEAD is unchanged;
  after HEAD moved it is `REPAIR_MANUAL` (`details {beforeHead, head}`,
  next: `git reset --soft <beforeHead>` with the user's consent, then
  `repair` again). `--apply` of such a preparation refuses with
  `REPAIR_MANUAL` and names `repair --cancel <id>`.

## Installation And Identity

- `inspect [<path>]` — folder classification. Text: `path`, `state`,
  `action`, `kit version`, `git` (repository and short head), `identity`,
  `stacks`, `transaction`, plus `nested in` and `damaged` when present.
- `install [<path>] [--name <project name>] [--update] [--host harness]
  [--bundle <workflow.mjs>]` — installs or updates the Kit. Another
  `--host` is `USAGE`; `NOT_INSTALLED` for `--update` without the Kit.
- `doctor [<path>] [--fix] [--bundle <workflow.mjs>]` — checks and, with
  `--fix`, repairs the installation.
- `install` and `doctor --fix` copy their own bundle file unless
  `--bundle` names another and record the running executable as the
  project runtime (`electron` mode under Electron).
- `migrate:harness-plan [<path>] [--message "chore: ..."] [--objective
  "..."] [--spec <doc.md>] [--name <project name>]` — migrates a Harness
  plan into the Kit.
- `identity:set --name "<name>" --email <email> --global`
  (`kit-cli-identity.ts`) — needs no project and runs in any folder.
  `--global` is required, otherwise `USAGE`. The `workflow-git` validator
  refuses an invalid name or email (`GIT_IDENTITY_INVALID`; a missing or
  empty `--name` / `--email` is invalid too) or a placeholder
  (`GIT_IDENTITY_PLACEHOLDER`), both with `details.field` `name` or
  `email`. Otherwise the trimmed values are written with `git config
  --global`; result `{name, email, scope: "global"}`, text `identity:
  <name> <<email>> (global git config)`.

## Help And Hooks

- `help` (or `--help`, `-h`) — the usage of every command; without a
  command the help is printed with exit code 1.
- `hook session-start --client claude|codex [--part K/N]` — prints the raw
  SessionStart JSON from the stdin input; another hook or client is
  `USAGE`. Without `--part` the context is the whole recovery packet. With
  `--part K/N` (`1 <= K <= N <= 16`, `parsePart` of `workflow-recovery`) it
  is part K of the packet cut into at most N parts of at most 9 500 UTF-16
  units (`packetParts`); a part the packet does not have gives an answer
  without `additionalContext`. A wrong `--part` gives an answer without
  `additionalContext`, the line `hook session-start: --part must be K/N with
  1 <= K <= N <= 16` on stderr and exit code 0, so the session is never
  blocked. The Claude settings run six such hooks (`--part 1/6` … `6/6`),
  spec `docs/architecture/KitRecoveryParts-2026-11-12.md`.
- `git-hook <pre-commit|commit-msg|post-commit|pre-push> [args]` — prints
  the hook message on stderr and exits with the hook code (Git Hooks in
  `workflow-kit/module.md`).
