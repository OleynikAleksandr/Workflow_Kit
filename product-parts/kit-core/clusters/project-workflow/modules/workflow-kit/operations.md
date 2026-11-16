# Workflow Kit Module — Operations

The operations of the [Workflow Kit module](module.md).

## Operations

Every mutating operation runs under the project lock
`.harness/workflow/local/kit.lock` and, before its own checks, refuses to
start while a commit transaction is unfinished (`TRANSACTION_PENDING`) or
an integration journal exists (`INTEGRATION_ACTIVE`; the shared
`ensureNoTransaction` of `kit-context.ts`, `task:block`/`task:unblock`
included). `repair` stays available. A project without a plan
file fails with `NOT_INSTALLED`.

State (`kit-status.ts`):
Autopilot authority (spec M39, Kit 2.3.1): `authorize`, `revoke`,
`acceptRun`, `closeRun`, `startTask` with a run and the extended
`autopilotStatus` are described in [autopilot.md](autopilot.md).

- `status(root)` — project, scope (status, result, blocked reason,
  objective, `automation` and `proposal` of spec M39, `null` on a legacy
  scope), revision, current and next task, progress, rounds, quality
  (status, stacks, drift), HEAD, pending transaction, changes outside
  Kit-managed paths, `installed`, and (spec 10.1):
  - `tasks` — plan order, `{id, kind, roundId, status, title, parallelSafe,
    dependencies}`;
  - `execution` — `{strategy, maxWorkers, ownerSession}`, `null` without a
    scope;
  - `assignments` — records of the current scope, oldest first: `{id,
    taskId, status, worktree, branch, sourceCommit, integrationCommit,
    cleanup}`; empty in an executor worktree;
  - `integration` — `{assignmentId, taskId, phase}` of
    `.harness/workflow/local/integration.json`, read defensively (a
    non-string field or an unreadable file gives `null`s); `null` without
    the file and in an executor worktree;
  - `scopeProposal` — `{generation, recommended, hasParallelWork, options,
    refining}` or `null`;
  - `executor` — `{assignmentId, taskId}` in an executor worktree, else
    `null`; `paused` — the user's pause of this checkout.
- `autopilotStatus(root)` (`kit-autopilot-status.ts`) — the autopilot
  decision input plus the M39 facts of [autopilot.md](autopilot.md#status-kit-autopilot-statusts):
  scope, blocked
  reason, delivery, next task, revision, HEAD, pending transaction, `paused`,
  `proposalPending` (a proposal not in refinement) and `orchestration`
  (`null` unless orchestrated in main): active assignments plus
  `INTEGRATED` ones with cleanup `PENDING` (`{id, taskId, status,
  sourceCommit, cleanupPending}`), `integration` and `readyTasks` (the
  scheduler's ready list).
- `validate(root)` — `{ok, errors[]}`: plan document and projection,
  configuration, and the task-to-commit mapping of `workflow-git`.
- `recover(root, event)`, `showTask(root, id)`, `history(root, filter)`,
  `sessionStart(root, client, stdin, part?)` — delegated to `workflow-recovery`.
- `inspect(path)`, `install(path, options)`, `doctor(path, options)`,
  `migrateHarnessPlan(path, options)` — delegated to `workflow-installer` (`installer` exposes it, bound to the same git
  facade).

Scope (`kit-scope.ts`; create, propose and choose in `kit-scope-create.ts`);
every change is a Kit commit unless noted:
- `createScope(root, input)` — baseline is HEAD; role `scope-plan`
  (`docs: plan scope <id>`); the commit also takes the specification and
  `context` documents when they are changed. When the configuration has
  `host: "harness"` it fails with `EXECUTION_MODE_REQUIRED` (next action:
  `scope:propose`); without a host it works as before (no execution block,
  `sequential`). Every scope creation (here, `chooseScope` and an automatic
  choice of `proposeScope`) clears the scope proposal record.
- Every scope creation and `proposeScope` check the optional `automation`
  block (`kit-automation.ts`, spec M39) before anything is written: the
  plan validates its structure (`PLAN_AUTOMATION`), the Kit checks
  `automation.acceptance[i].checks` with `workflow-quality`
  (`CHECK_UNKNOWN`, field `automation.acceptance[i].checks`) and
  `automation.ci.requiredChecks` against the project CI configuration
  (`CI_CHECK_UNKNOWN`, details `{field, known, unknown}`). The check names
  come from `kit-ci-config.ts`: every `.github/workflows/*.yml|yaml`, job
  ids, literal job names and the matrix values of a job named
  `${{ matrix.<key> }}`; step names do not count. Without a workflow file
  any required check is unknown.
- `proposeScope(root, input, recommended, reason)` — `scope:propose`
  (section 4.1 of `WorkflowKitExecutionModes.md`); the record and its rules
  belong to `workflow-execution-mode`:
  - validates the input exactly like `createScope` (the same plan
    transition, with `execution.strategy` set to the recommendation), so a
    scope still open fails with `SCOPE_EXISTS`; nothing is committed;
  - computes `hasParallelWork` on the candidate plan and the options
    (`NO_PARALLEL_WORK` for `orchestrated` without parallel work,
    `PROPOSAL_REASON` for a reason outside 10..300 characters);
  - stores the proposal and returns `{autoChosen: false, generation,
    options, hasParallelWork, recommended, reason, scope: null}`;
  - when the stored record is in refinement (`refining: true`) and the new
    plan has no parallel work, it creates the scope as `sequential` at once
    (approval suffix `| Execution mode chosen automatically: sequential
    ...`, `ownerSession: null`) and returns `autoChosen: true` with the
    `PlanChange` in `scope`; that scope records `proposal {digest,
    generation}` of the new proposal.
- `proposalDigest(root)` — `scope:proposal --digest` (spec M39): the
  read-only `ProposalDigest {generation, scopeId, proposalDigest,
  documentDigests}` of `workflow-execution-mode`; `NO_PROPOSAL` without an
  open proposal (none, or in refinement).
- `chooseScope(root, {generation, option, session, note, expectedDigest?})`
  — `scope:choose`: the proposal verification of `workflow-execution-mode`
  runs first (`PROPOSAL_CHANGED` for a stale choice, `NO_PARALLEL_WORK`
  for `orchestrated` without parallel work; nothing is written). Under the
  same lock the current proposal digest is computed; an `expectedDigest`
  (`--expected-digest`, the reviewed digest) that differs fails with
  `PROPOSAL_CHANGED` (details `{expected, current, generation}`) before
  anything is written, so a review of an older body or older documents
  never chooses the new one.
  - `sequential`/`orchestrated` create the scope from the stored input with
    `execution {strategy: option, maxWorkers: input value or 3,
    ownerSession: session}` and the approval
    `<approval> | Execution mode chosen by the user: <option>: <note>`;
  - `refine` drops the stored plan and keeps `refining: true`.
  The created scope records `proposal {digest, generation}`. Returns
  `{option, generation, proposalDigest, refining, execution, scope}`.
- `moveOwner(root, {session, note})` — `scope:owner` (`kit-scope-owner.ts`,
  spec M31 3.1): moves `execution.ownerSession` of the open scope to
  `session` before its work starts. `NO_SCOPE` without a scope, `USAGE` for
  an empty session or note, `OWNER_BUSY` while an assignment of the scope is
  active or a task is `IN_PROGRESS` (details `assignments` or `tasks`). The
  same owner answers `changed: false` and writes nothing; otherwise the plan
  gets revision + 1 and the decision `Owner session moved from <old|none>
  to <session>: <note>`, saved like `task:block` (the next Kit commit
  records it). Returns `{changed, previous, execution, revision}`; the text
  form is `owner: <old> → <new> (revision N)` or `owner: <id> (unchanged)`.
- `readProposal(root)` — the stored proposal record or `null` (for status
  and recovery).
- `proposalView(root)` — `scope:proposal`, read-only: the card view of the
  stored proposal without the plan input, or `null`:
  `{generation, recommended, reason, hasParallelWork, options, refining,
  createdAt, scopeId, objective, host}`; `scopeId`/`objective` come from the
  stored input (`null` after `refine`), `host` is `config.host` or `null`.
  Harness Core builds the mode card from it.
- `extend(root, input, expectedRevision?)` — role `scope-plan`
  (`docs: extend scope <id> (<round>)`); `REVISION_MISMATCH` when the plan
  moved on.
- `updateTask(root, id, patch, expectedRevision?)` — `task:update`: a `TODO`
  task may change `title`, `why`, `files`, `dependencies`, `acceptance`,
  `checks`, `context`, `commitMessage`, `docsWaiver`; a task in progress
  only `acceptance`, `checks`, `docsWaiver`, `files`; a `DONE` task never
  (`TASK_PATCH`). Role `scope-plan` (`docs: update task <id>`).
- Planned checks: the scope commands and `extend` pass the `checks` of
  every input task, `updateTask` a patched `checks`, to
  `workflowQualityFacade.ensurePlannedChecks` (rule in `workflow-quality`)
  before anything is written: `CHECK_UNKNOWN`, `details.field`
  `tasks[<index>].checks` or `checks`.
- Context budget (`kit-context-budget.ts`): the scope commands (every task
  of the new plan), `extend` (new tasks and changed `context`) and
  `updateTask` read each task's brief documents: its `context` (a whole
  file wins over a heading of the same path; a heading takes that section
  via `workflowRecoveryFacade.section`) or the scope specification.
  `CONTEXT_MISSING` (`details {taskId, path, heading?}`) or, over
  `budget.briefBytes`, `CONTEXT_TOO_LARGE` (`details {taskId, bytes,
  budget}`); nothing is written.
- `accept(root, note)` — role `acceptance`; the scope stays open.
- `close(root, scopeId, note)` — only from `ACCEPTED` and on a clean
  working tree outside Kit-managed paths (`DIRTY_TREE`: the message names
  up to five paths and `(and N more)`, `details.paths` holds all of them,
  `nextAction` tells to delete temporary files or commit documents with
  `docs:commit`; spec M37); role `close`;
  clears the scope proposal record.
- `carryover(root, input)` — role `carryover`.
- `block(root, reason)` / `unblock(root)` — write the plan only; the next
  Kit commit records the state.

Pause (`kit-pause.ts`): `.harness/workflow/local/pause.json` `{paused,
note, at}`; no file is not paused, an unreadable or malformed one is
`PAUSE_STATE`. `setPause(root, paused, note)` (`pause:set`, locked, no
scope needed; `NOT_INSTALLED`; `USAGE` for an empty note) writes it
atomically with the trimmed note. While paused, `task:start` in main and
`assignment:create` fail with `WORKFLOW_PAUSED` (`details {at, note}`);
executor worktrees, `commit`, integration, `accept`, `repair` and reads
are not affected.

Assignments (`kit-assignment.ts`; records, scheduler and brief belong to
`workflow-assignment`; section 5.1 of `WorkflowKitExecutionModes.md`):
- `nextAssignments(root)` — `assignment:next`, read-only: `{orchestrated,
  idle, scopeId, maxWorkers, active, ready, blocked}`; `active` holds the
  active records of the current scope, `ready` the tasks
  (`{id, kind, parallelSafe, title}`) the scheduler hands out now, `blocked`
  the other candidates with `DEPENDENCY_PENDING`, `ASSIGNMENT_BARRIER`,
  `ASSIGNMENT_CONFLICT` or `ASSIGNMENT_CAPACITY` and the tasks they wait for.
- `createAssignment(root, taskId)` — `assignment:create` in main, under the
  project lock; fails in this order:
  1. `NOT_ORCHESTRATED` — no scope or strategy `sequential`;
     `SCOPE_NOT_ACTIVE` — a blocked scope;
  2. `TRANSACTION_PENDING`; `INTEGRATION_ACTIVE` (the shared busy check);
  3. `DIRTY_TREE` — changes outside Kit-managed paths (`details.paths`);
     `WORKFLOW_PAUSED`;
  4. `NO_COMMITS`; the base is HEAD;
  5. `UNKNOWN_TASK`; `ASSIGNMENT_KIND` for QUALITY and delivery tasks (the
     orchestrator runs them in main); `TASK_NOT_TODO`;
  6. an active record of the task: the same `ASSIGNED` record (same
     iteration, base and configuration digest) is returned with
     `created: false`; anything else is `ASSIGNMENT_EXISTS`
     (`details {id, status}`);
  7. the scheduler: the candidate's code (`DEPENDENCY_PENDING`,
     `ASSIGNMENT_BARRIER`, `ASSIGNMENT_CONFLICT`, `ASSIGNMENT_CAPACITY`) with
     `details.blockedBy`; a task outside `ready` is `ASSIGNMENT_BARRIER`;
  8. `DEPENDENCY_NOT_IN_BASE` — a dependency commit (from the task-to-commit
     mapping of `workflow-git`) is not an ancestor of the base;
  9. `ASSIGNMENT_EXISTS` — a record file with the new id already exists
     (for example an integrated one).
  Between 5 and 6 the context budget check runs again on the current files
  (`CONTEXT_MISSING`, `CONTEXT_TOO_LARGE`; no record is written); the brief
  carries the checked documents as marked full text, then
  `Project documents (ask with scripts/workflow context <path>):` and the
  documents map (`documentsMap` with the scope `spec`; its own 4000-byte
  budget and tail line, outside `budget.briefBytes`).
  It writes the `ASSIGNED` record (`baseCommit` HEAD, `configDigest` of the
  configuration) and returns `{assignment, brief, created: true}`. The task
  stays `TODO` and nothing is committed: the plan changes only on
  integration.
- `cleanupAssignments(root, id?)` — `assignment:cleanup [--id]` in main
  (section 7), under the project lock: with `--id` the record
  (`ASSIGNMENT_UNKNOWN`, `ASSIGNMENT_NOT_INTEGRATED` from
  `workflow-assignment`), without it every `INTEGRATED` record whose cleanup
  is not `DONE`. Each goes through `workflowAssignmentFacade.cleanup`
  (worktree remove without force, prune, `branch -d`); a refusal is recorded
  as `cleanup: PENDING` with its reason and is not an error. Returns
  `{assignments}` (the processed records).
- `cancelAssignment(root, id, force)` — `assignment:cancel --id <id>
  [--force]` in main, locked, busy check first; `ASSIGNMENT_UNKNOWN`, then
  `workflowAssignmentFacade.cancel` (`ASSIGNMENT_INTEGRATED`,
  `ASSIGNMENT_DIRTY`, `ASSIGNMENT_CANCEL_FAILED`). The plan is unchanged.
  Returns `{assignment, worktree, branch, branchTip, task {id, status}}`;
  the text names the restore command and `assignment:create --task`.

Integration (`kit-integration.ts`, main, section 7): `startIntegration(root,
id, source)`, `continueIntegration(root, id)` (both under the project lock)
and `integrationStatus(root)` call `WorkflowIntegrationFacade` bound to the
Kit's git facade; preconditions, phases, errors and results are in
`workflow-integration/module.md`.

Executor worktree (`kit-executor.ts`; sections 5.1–5.4 of
`WorkflowKitExecutionModes.md`). A checkout with
`.harness/workflow/local/assignment.json` is an executor worktree
(`executorAssignment(root)` returns that record, `null` elsewhere):
- `attachAssignment(root, id)` — `assignment:attach <id>`, run in the linked
  worktree Claude created for the subagent, under the worktree's lock:
  1. `ASSIGNMENT_LAYOUT` / `ASSIGNMENT_WORKTREE` — the location checks of
     `workflow-assignment` (the main checkout is refused);
  2. `ASSIGNMENT_UNKNOWN` — main has no record `<id>`;
  3. `ASSIGNMENT_ATTACHED` — this worktree is attached to another id, or the
     record names another worktree;
  4. a worktree already attached to this id (both records written) returns
     `{attached: false, planCommit: null}` without any change;
  5. `ASSIGNMENT_STATUS` — the record is not `ASSIGNED` (and not attached to
     this worktree); `TRANSACTION_PENDING`;
  6. `ASSIGNMENT_DIRTY` — any change in the worktree (`details.paths`);
  7. HEAD equals `baseCommit`: the executor plan (built from
     `git show <base>:.harness/plans/todo-plan.md`) is committed as a Kit
     service commit with role `assignment-plan`, only the plan file, message
     `docs: plan assignment <id>`, trailers `Workflow-Scope:
     assignment-<id>`, `Workflow-Task`, `Workflow-Iteration` and
     `Workflow-Assignment: <id>`; HEAD that already is this plan commit (one
     commit on the base with that role and trailer) continues an interrupted
     attach; any other HEAD is `ASSIGNMENT_BASE` (`details {base, head}`);
  8. writes the main record (`worktree` real path, `branch` or `null` when
     detached, `updatedAt`, status `NEEDS_SETUP` when
     `workflowAssignmentFacade.needsSetup` says the task's commit checks need
     dependencies the worktree lacks, `READY` otherwise) and then the
     worktree record.
  Returns `{assignment, attached: true, planCommit, worktree}`.
- `assignmentStatus(root)` — `assignment:status`: `{assignment (the main
  record or null), worktree (the worktree record), scopeId, head, task {id,
  kind, status, title, files}}`; `ASSIGNMENT_NOT_ATTACHED` outside an
  executor worktree.
- `setupAssignment(root, id?)` — `assignment:setup [--id]` (section 5.4): in
  an executor worktree for its own assignment (another `--id` is
  `ASSIGNMENT_READ_ONLY`), elsewhere for `--id` (`USAGE` without it) in the
  records of that checkout; `ASSIGNMENT_UNKNOWN` for a missing record. Runs
  `workflowAssignmentFacade.setup` with the Kit environment, without the Kit
  lock (an install may outlast the lock's stale limit and changes no plan or
  git state): `SETUP_LOCK_REQUIRED`, `SETUP_LINKED_DEPENDENCIES`,
  `SETUP_FAILED` (record unchanged) or the receipt and `READY`. Returns
  `{assignment, output, ran}`.
- `task:start` in an executor worktree whose main record is `NEEDS_SETUP`
  fails with `ASSIGNMENT_NEEDS_SETUP` (next action `assignment:setup`)
  before the plan changes; otherwise it sets the main record to `RUNNING`;
  a successful `commit --task` sets `READY_FOR_INTEGRATION` and
  `sourceCommit` to the new commit (written through `mainRoot`; nothing
  happens when the main record is missing).
- Executor commits carry `Workflow-Assignment: <id>`. Before any transaction
  `commit --task` checks the selected files plus the plan with the contract
  guard of `workflow-assignment` (`ASSIGNMENT_CONTRACT`, `ASSIGNMENT_SCOPE`);
  Kit-managed paths are excluded from the selection as usual.

Tasks (`kit-task.ts`):
- `startTask(root, id, confirmation?)` — `WORKFLOW_PAUSED` in main after
  the busy check; in an orchestrated scope (section 6
  of `WorkflowKitExecutionModes.md`; the executor plan is sequential) a
  `work` or `DOCS` task fails with `ORCHESTRATED_MAIN_READ_ONLY` (next action:
  `assignment:next`, `assignment:create --task <ID>`) and a delivery task
  with `DELIVERY_NOT_READY` (`details {pending, active}`) while an earlier
  task is not `DONE` or an assignment of the scope is active; `QUALITY`
  starts as usual and sequential scopes are unchanged. Then assigned checks
  must exist in the profile (`CHECK_UNKNOWN`); the plan module checks scope, status,
  dependencies and delivery confirmation; the git module records the
  snapshot of earlier changes. Returns `{task, preexisting, warnings}`;
  a warning reports more functional files than
  `policy.taskFileSoftLimit`.
- `commitTask(root, id, {files?, digest?})`:
  1. the task must be in progress (`TASK_NOT_ACTIVE`); a QUALITY task is
     completed by `qualityApply` (`USE_QUALITY_APPLY`); a DOCS task needs a
     digest (`ROUND_DIGEST_REQUIRED`);
  2. selects the task files (changed since the start, or `files`);
  3. functional files need a commit-stage command check
     (`NOT_CONFIGURED`);
  4. adds the selected files to `task.files` and completes the task in the
     candidate plan; in an executor worktree the contract guard runs here;
  5. runs the `prepare` stage on the selected files (`CHECK_FAILED`
     stops before any transaction), with `removed` as in `pre-commit`;
  6. commits the candidate through the transaction: role `docs` for a DOCS task,
     `implementation` otherwise; commit-stage checks run in the git hook;
  7. stores the prepare report in the commit evidence.
  Returns `{commit, prepare, preexisting, nextTask}`.
- `commitDocs(root, files, message?)` — `docs:commit`: documentation files
  only — Markdown and `.harness/product-tree/**` (`DOCS_ONLY`), never while a task is in progress (`TASK_IN_PROGRESS`);
  role `docs`.

Quality and repair (`kit-quality.ts`):
- `qualityDetect(root, stacks?)` — the proposal of `workflow-quality`.
- `qualityApply(root, input)` — installs approved tools, writes the
  `CONFIGURED` profile and commits it with role `quality` together with the
  files changed by the installation. A QUALITY task in progress is
  completed by this commit (its changes since the start are included).
- `qualityStatus(root)` — status, stacks, check ids by stage, drift.
- `repair(root, {apply?, cancel?})` — dry run, apply or cancel through
  `workflow-git`.
