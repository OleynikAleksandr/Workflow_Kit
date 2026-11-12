# Workflow Recovery Module

## Responsibility

The bounded recovery packet of the Workflow Kit: the working set an agent
needs to continue the plan after a new session, `/clear` or compaction. Its
size depends on the current task, not on the length of the plan. It names
the agent role of the session (planning, self, orchestrator, executor) and
the next step of that role.

It also answers the provider SessionStart hook and the on-demand
`show-task` and `history` commands, and serves the input descriptors of
Kit commands with their compact text (`schema` command and section).

## Public Facade

`WorkflowRecoveryFacade` (class, singleton `workflowRecoveryFacade`). The
constructor takes a `WorkflowGitFacade`; tests pass one with a clean git
environment.

## Contract

- `build(input)` assembles the packet from gathered state. `RecoveryInput`:
  `{event, plan, quality {status, stacks}, budgetBytes, head, transaction,
  changes, taskCommits, verification, readDocument(path), roles?,
  documents?}`; `roles` are the role facts below (absent: the plan alone
  decides); `documents` is the documents map (see Documents Map; absent or
  empty text: no `documents` section).
- Sections in priority order (`*` — mandatory):
  1. `state`* — project, scope, revision, scope and result status, quality
     profile, HEAD, transaction, event, the agent role (see Roles);
  2. `next`* — the step for the role, then one `Role <role>: …` rule line.
     In order: no scope (the planning step), unfinished transaction
     (`repair`), `BLOCKED: <reason>`, the executor step (an executor
     worktree), `READY_FOR_ACCEPTANCE`, `ACCEPTED`, the orchestrator step
     (orchestrated main), otherwise (role self) continue the task in
     progress, start the next ready task, or confirm a `delivery` task with
     the user first (`task:start <ID> --confirmed "…"`);
  3. `objective`* — scope objective and acceptance criteria;
  4. `task`* — the current task, or the next ready one, in full; a `fixes`
     task shows the original task and its short SHA;
  5. `schema`* — present only when the next step takes a JSON input (see
     Input Schemas): an `Input of the next step` line that names
     `scripts/workflow schema <command>`, then the compact text of the
     descriptor;
  6. `upcoming`* — up to three next `TODO` tasks and the remaining count;
  7. `recent`* — the last three `DONE` tasks with short SHAs;
  8. `rounds` — digests: the last three in full, earlier ones in one line;
  9. `decisions` — the last five user decisions of the scope;
  10. `changes`* — working-tree changes outside the task (up to 40 paths)
      and the pending transaction;
  11. `verification` — the last stored check reports; failed checks with
      at most 1 KB of output in total;
  12. `document <path>[#<heading>]`* — required documents of the scope
      (`spec`, `context`) and of the task (`context`) as text: a
      whole-document reference replaces the heading references of its path
      (one whole-file section); otherwise one section per heading with only
      that Markdown section (matched by text or slug, nested headings
      included); an absent heading includes the whole file with the
      reference `<path>#<heading>: heading not found, the whole file is
      included`. References of one path and heading merge, required if any
      says so;
  13. `documents` — the documents map of the project;
  14. `references`* — optional sections that did not fit, missing files
      (`<label>: missing file`) and optional documents (`<label> (N bytes,
      optional): read the file when needed`).
- Budget (`budgetBytes`, UTF-8):
  - optional sections are tried in the order `documents`, `rounds`,
    `decisions`, `verification` and added while the packet fits; a section
    that does not fit moves to `omitted` and `references` with its size
    and how to read it (`documents`: `scripts/workflow context --list`);
    when the packet is still over budget the added ones are removed last
    first, so `documents` stays longest;
  - required documents are never dropped and never replaced by a
    reference: they stay inline even over the budget; optional sections
    then go first and the packet is `overBudget`;
  - when the packet exceeds the budget without the required documents,
    long task fields (`why`, `files`, `acceptance`, `context`) are capped
    step by step (2000 … 60 bytes) with `[truncated: N bytes, run:
    scripts/workflow show-task ID]`; documents alone never cap task fields;
  - the header states `bytes` (of the whole text, header included),
    `budget`, `included`, `omitted` and `(over budget)` when the packet
    still does not fit.
- Process rules and templates are not part of the packet; the header
  points to the managed Workflow Kit section of `AGENTS.md`.
- `RecoveryPacket`: `{schema "harness-workflow-recovery/1", event, budget,
  bytes, overBudget, truncated, included, omitted, references, sections,
  text}`.
- `section(text, heading)` returns a Markdown section or `null`.
- `documentsMap(root, {specPath?, budget?, folder?, more?})` returns the documents map
  `{entries, shown, text}` (see Documents Map) for the packet, the
  `context` command and the executor brief.

## Documents Map (`recovery-documents.ts`, spec 3.2)

- Files: `git ls-files -z --cached --others --exclude-standard -- '*.md'
  '*.markdown'` (tracked plus untracked files that git does not ignore),
  without paths having a `node_modules` or `.git` segment and without
  `.harness/workflow/**` and `.harness/plans/archive/**`; with `folder`
  (project-relative) only the files under `<folder>/`; a listed file
  that cannot be read (deleted from the working tree) is skipped. Outside
  a git repository the map is empty.
- Order: the files under the folder of `specPath` (the scope
  specification) first, then the rest; both groups sorted by path. Without
  `specPath`, or with a specification at the project root, path order.
- `entries`: `{path, bytes, headings}` of every file in map order;
  `headings` are the `##` headings outside fenced code blocks.
- `text`: one line per entry `<path> (<bytes> bytes): <H2>; <H2>; …`
  (`<path> (<bytes> bytes)` without headings), added in order while the
  text, the tail line included, fits `budget` (default 4000 bytes); the
  rest is one tail line ``… N more documents: <more>``, `more` by default
  `` `scripts/workflow context --list` ``. `shown` counts the entry lines. A budget below the tail line
  leaves only the tail line.
- `gather` builds the map with the scope `spec` as `specPath`.

## Input Schemas (`recovery-schema.ts`)

- `inputSchemaCommands()` — `workflowPlanFacade.inputSchemaCommands()`
  (`scope:create`, `scope:propose`, `plan:extend`, `task:update`,
  `carryover`, `digest`) followed by `quality:apply`.
- `inputSchema(command)` — the descriptor (a copy) from its owner facade:
  `workflowQualityFacade.inputSchema()` for `quality:apply`,
  `workflowPlanFacade.inputSchema(command)` otherwise; `null` for a command
  without one.
- `schemaText(schema)` — `<command>: <description>`, `fields:` with one
  line per field `- <name> <type> required|optional [<limits>, code
  <CODE>[, limitCode <CODE>]] — <description>` (limits in this order:
  `minItems`, `maxItems`, `maxBytes`, `minLength`, `minimum`, `maximum`,
  `enum a|b`, `pattern`), `rules:` with one line per rule, `example:` and
  the example as one line of JSON. The Kit `schema --format text` command
  prints the same text.
- The `schema` section names the descriptor of the next step:
  - no scope: `scope:propose` when `roles.harness`, else `scope:create`;
    none while a proposal waits for the user's choice (not `refining`);
  - none while a transaction is unfinished or the scope is `BLOCKED`;
  - delivery `READY_FOR_ACCEPTANCE` or `ACCEPTED` outside an executor
    worktree: `plan:extend` (defects become a fixes round);
  - the step task — the executor's own task in an executor worktree, else
    the current or next ready task, not `DONE`: kind `quality` —
    `quality:apply`; kind `docs` — `digest`, except in orchestrated main,
    where DOCS goes to an executor;
  - otherwise no section.
  The section is mandatory when present: it is never moved to references.

## Roles (`recovery-roles.ts`, spec section 9)

Role facts (`RoleFacts`): `{harness, proposal, executor, unattachedWorktree,
assignments, integration}`, gathered by `gatherRoleFacts(git, root, plan,
harness, warnings)`:
- `harness` — `config.host` is `harness`;
- `executor` — the worktree record `.harness/workflow/local/assignment.json`
  exists: `{id, taskId, status}`, the status read from the main record
  (`null` without it); nothing else is gathered then;
- without a scope: `proposal` — `{generation, recommended, refining}` of the
  stored scope proposal, or `null`;
- an orchestrated scope: `unattachedWorktree` — this checkout is a linked
  worktree (`locateWorktree` succeeds) without a worktree record; otherwise
  (main) `assignments` — the records of the scope that are active plus every
  record with cleanup `PENDING`, as `{id, scopeId, taskId, status, worktree,
  sourceCommit, cleanupPending}` — and `integration` — the integration
  journal `.harness/workflow/local/integration.json` of `integration:start`
  as `{assignmentId, phase}` (`assignmentId`, else `id`; an unreadable
  journal is phase `UNKNOWN`);
- an unreadable record becomes a `state` warning and empty facts.

`agentRole(input)`: `executor` with an executor record or an unattached
worktree; `planning` without a scope; `orchestrator` for strategy
`orchestrated`; otherwise `self`.

`state` lines: `role: planning|self`; `role: executor (assignment <id>, task
<ID>, <status>)` or `role: executor (not attached)` — only the own task, no
assignment list; in orchestrated main `role: orchestrator`, `assignments:`
(`none`, or one `- <id> <task> <status> <worktree|not attached>[, cleanup
PENDING]` line each) and `integration: <id> <phase>|none`. Every list holds
at most 10 items, then `… N more`.

Steps:
- planning: a pending proposal — `No active scope: the scope proposal
  (generation N, recommended M) is waiting for the user's choice on the
  card`, end the turn; after `refine` — discuss, update spec and plan, then
  `scope:propose` again; otherwise in a Harness project write the spec and
  a plan with `parallelSafe` labels, `scope:propose --input <plan.json>
  --recommended sequential|orchestrated --reason "<why>"` and end the turn;
  without Harness `scope:create --input <plan.json>`;
- executor: not attached — `assignment:attach <id>` with the id from the
  brief; task `DONE` — report the SHA (`taskCommits`) and end the turn;
  `IN_PROGRESS` — continue, then `commit --task <ID>` (`--digest` for DOCS);
  record `NEEDS_SETUP` — `assignment:setup`, then `task:start`; otherwise
  `task:start <ID>`, commit, report the SHA;
- orchestrator: an integration journal comes alone — `CONFLICT` and
  `CHECKS_FAILED` name fixing within the task files and
  `integration:continue --id <id>`, other phases finishing with it (and
  `integration:status`); otherwise, in this order: `Integrate first, one at
  a time:` with `integration:start --id <id> --source <short sha>` for each
  `READY_FOR_INTEGRATION` record; the main task in progress (`Continue <ID>
  in main`) or a ready QUALITY task (`task:start` in main) or a delivery
  task once every other task is `DONE` and no assignment is active; the
  scheduler's `ready` tasks to hand out (`assignment:create --task <ID>`, a
  Claude subagent with `isolation: "worktree"` and the brief, wait for the
  SHA); when none of these applies, `Waiting for executors: <id> (<task>,
  <status>), …`; then `Finish cleanups: assignment:cleanup --id <id>` for
  pending cleanups; with nothing at all `No task is ready`.
- Rule lines: planning — spec, labels, no functional changes before the
  scope, end the turn after proposing; self — tasks in order in main,
  helper subagents work in main without their own worktree and never
  commit, no assignments; orchestrator — work and DOCS tasks go to
  executors and their SHAs to `integration:start`, never implemented in
  main, QUALITY and delivery in main, CONFLICT/CHECKS_FAILED fixed within
  the task files then `integration:continue`; executor — only this worktree
  and paths equal to or nested in the task files, never main, the plan or
  other tasks, no nested executors, no push.

## Project Commands (`recovery-gather.ts`, `recovery-commands.ts`)

- `gather(root, event)` reads:
  - the plan (an empty plan when the file is absent; parse errors throw);
  - the configuration (`budget.recoveryBytes`, quality status and stacks);
  - git: HEAD, the pending transaction journal, changes outside the task
    in progress (its declared files and Kit-managed paths are left out) and
    the commit of every done task;
  - the last verification evidence;
  - the role facts (`gatherRoleFacts`);
  - the documents map (`documentsMap`, only in a git repository);
  - documents through `readDocument`, inside the project only.
  Problems that do not stop the packet become `warnings` shown in the
  `state` section: not a git repository, inconsistent commit references.
- `packet(root, event)` = `build(gather(root, event))`;
  `render(packet, "text" | "json")` is `recover --format`.
- `sessionStart(root, {client, stdin, env, part?})` is `hook session-start`:
  - the event is the `source` of the hook input (`startup`, `resume`,
    `clear`, `compact`; anything else is `startup`);
  - the answer is `{continue: true, hookSpecificOutput: {hookEventName:
    "SessionStart", additionalContext}}`; without `part` the context is the
    whole packet, with `part = {index, count}` it is part `index` of
    `packetParts(text, count)`, and a part the packet does not have gives
    no `additionalContext`;
  - with `HARNESS_WORKFLOW_RECOVERY=host` (`HOST_RECOVERY_VARIABLE`) the
    answer has no `additionalContext`, because Harness delivered it;
  - errors never block the session: the context then names the error code
    and points to `scripts/workflow doctor`.
- `showTask(root, id)` — the full task text with `committed: <sha>` for a
  done task; `UNKNOWN_TASK` otherwise.
- `history(root, {task?, round?})` — commits since the scope baseline as
  `{sha, role, taskId, subject}` from the `Workflow-*` trailers (commits
  without them are `external`), filtered by task or by the tasks of a
  round, plus a one-line-per-commit text.

## Packet Parts (`recovery-parts.ts`, Kit 2.2.3)

Claude Code keeps at most 10 000 UTF-16 units of one hook's output in the
context, so the Claude SessionStart hook asks for the packet in parts
(spec `docs/architecture/KitRecoveryParts-2026-11-12.md`).

- `PART_LIMIT = 9500` units per part, its first line included;
  `MAX_PARTS = 16`.
- `packetParts(text, count) → {parts, needed}`: cuts at section starts
  (`## ` at a line start), a section longer than a part by lines, a line
  longer than a part by characters without splitting a surrogate pair, and
  packs the pieces greedily.
- Every part starts with
  `# Workflow recovery packet — part K/N · revision R · head H · digest D`
  (`N` — parts given, `R` and `H` read from the packet text or `-`, `D` —
  first 12 hex of SHA-256 of the whole text). The parts without their first
  lines join to the text.
- When the packet needs more than `count` parts, the last one ends with
  the line "Packet incomplete: it needs M parts, N delivered. Run
  `scripts/workflow recover --format text`." and `needed` is M.
- `parsePart("K/N")` → `{index, count}` for `1 <= K <= N <= 16`, else null.

## Dependencies

- `workflow-plan` — plan types, reading the plan, plan input descriptors.
- `workflow-git` — HEAD, changes, history, journal, commit references.
- `workflow-quality` — configuration (`host`), verification evidence and
  the `quality:apply` descriptor.
- `workflow-assignment` — assignment records, the worktree record,
  `locateWorktree`, the scheduler.
- `workflow-execution-mode` — the stored scope proposal.
- `workflow-platform` — files inside the project, `WorkflowError`.

Node built-ins only.

## Tests

- `test/workflow-recovery-packet.test.mjs` — full packet, tight and tiny
  budgets, heading sections inline, a required whole document over the
  budget (`overBudget`, optional sections omitted, task fields whole, no
  `read the file` reference), two sections of one path and an absent
  heading, the `documents` section kept longest among optional ones, task
  truncation, every `next` variant, heading extraction.
- `test/workflow-recovery-documents.test.mjs` — the documents map of a git
  project: outside a repository, tracked and untracked files, ignored,
  deleted and excluded paths, the specification folder first, `##`
  headings outside code fences, the budget and the tail line, `folder` and
  `more`, the packet
  `documents` section.
- `test/workflow-recovery-schema.test.mjs` — the descriptor catalog and
  compact text, and the `schema` section for every case: no scope with and
  without Harness, a waiting and a refining proposal, QUALITY, DOCS,
  acceptance and accepted, a work task, a transaction, a blocked scope, an
  executor DOCS task, orchestrated main, a done executor task, and a tight
  budget that keeps the section.
- `test/workflow-recovery-roles.test.mjs` — every role and step from built
  inputs: planning (Harness, without Harness, pending proposal, refine, no
  facts), self, orchestrator (state lines, integrate first, hand out,
  cleanups, every integration phase, waiting, QUALITY, delivery), executor
  (state, setup, start, continue, report, acceptance of the executor plan
  ignored, not attached) and a bounded list within a 3000-byte budget.
- `test/workflow-recovery-worktree.test.mjs` — a real repository through the
  Kit: planning, the pending proposal, the orchestrator before and after
  QUALITY and with an assignment, an executor worktree before and after
  `assignment:attach`, its started and committed task, and main asking to
  integrate the reported SHA.
- `test/workflow-recovery-parts.test.mjs` — packet parts: one short part,
  long packet within the limit with one digest and the joined text, cut by
  characters without a broken surrogate pair, the incomplete line, `--part`
  values, the hook answer for a part, a missing part and host mode.
- `test/workflow-recovery-project.test.mjs` — a git project: packet without
  a repository, changes outside the task, JSON output, the SessionStart
  hook with and without host delivery and with a broken plan, `show-task`,
  `history`.

Test repositories use the real local identity `workflow@harness-ai.test`:
Kit commits refuse placeholder identities (`GIT_IDENTITY_REQUIRED`).
