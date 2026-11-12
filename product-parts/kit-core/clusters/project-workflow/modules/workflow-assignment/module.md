# Workflow Assignment Module

## Responsibility

Assignments of orchestrated scopes (sections 5.1, 5.2, 5.4, 6 and 7 of
`docs/architecture/workflow-kit/WorkflowKitExecutionModes.md`):
- the assignment records of the main checkout,
  `.harness/workflow/local/assignments/<id>.json`;
- the scheduler: which tasks can be handed out to executors now;
- the executor brief, the ready text for the Claude subagent;
- the executor side (sections 5.1 and 5.3): locating the main checkout of a
  linked worktree, the worktree record
  `.harness/workflow/local/assignment.json`, the one-task executor plan and
  the contract guard of executor commits;
- the executor worktree environment (section 5.4): whether a task needs its
  dependencies installed and the stack install itself;
- the cleanup after integration (section 7): worktree and merged branch
  removal;
- the cancel of an assignment that is not integrated
  (`docs/architecture/KitFixes-2026-11-05.md` section 3): record, worktree
  and branch removal.

The command preconditions (`assignment:create`, `assignment:attach`,
`assignment:setup`, `assignment:cleanup`, `assignment:cancel`), the commits and the git hooks
belong to `workflow-kit`; the integration comes later, updates these records
and calls `cleanup` right after `INTEGRATED`.

## Public Facade

`WorkflowAssignmentFacade` (class, singleton `workflowAssignmentFacade`) in
`src/workflow-assignment-facade.ts`. Types: `AssignmentRecord`,
`AssignmentStatus`, `AssignmentSetup`, `AssignmentCleanup`,
`AssignmentSetupResult`, `AssignmentCancelResult`, `AssignmentSchedule`, `BlockedTask`,
`ScheduleBlockCode`, `WorktreeAssignment`, `WorktreeLocation`,
`ExecutorChange`, `BriefDocument`.

## Contract

Records (`assignment-records.ts`):
- `id(scopeId, taskId, iteration)` — the stable readable id
  `<scopeId>-<taskId>-<iteration>`; characters outside `[A-Za-z0-9._-]`
  become `-`.
- `recordFile(root, id)` — the record path through the local-path helper of
  `workflow-git`; an id that does not match `[A-Za-z0-9][A-Za-z0-9._-]*`
  fails with `ASSIGNMENT_ID`. `root` is the main checkout.
- `create({scopeId, taskId, iteration, baseCommit, configDigest, now})`
  builds a new record without writing it: `version: 1`, the id above,
  `status: "ASSIGNED"`, `worktree`, `branch`, `sourceCommit`,
  `integrationCommit`, `setup` and `cleanup` all `null`, `createdAt` and
  `updatedAt` equal to `now`.
- `setup` is the receipt `{command, lockHash, at}` of `assignment:setup`;
  `cleanup` is `{status: "DONE", at}` or `{status: "PENDING", reason, at}`.
- Statuses: `ASSIGNED`, `NEEDS_SETUP`, `READY`, `RUNNING`,
  `READY_FOR_INTEGRATION`, `INTEGRATED`. `isActive(record)` is true for every
  status except `INTEGRATED`.
- `read(root, id)` — the record, `null` when the file is missing; a file
  that is not JSON or not a version-1 record with the same id, string scope,
  task and base, an integer iteration and a known status fails with
  `ASSIGNMENT_RECORD` (the Kit never guesses an assignment state).
- `list(root)` — every record of the directory, oldest first (`createdAt`,
  then id); an unreadable record fails the same way.
- `write(root, record)` — atomic two-space JSON.
- `configDigest(root)` — sha256 (hex) of the text of
  `.harness/workflow/config.json`, `null` without the file.

Scheduler (`assignment-schedule.ts`), pure:
`schedule(plan, assignments)` takes the plan and records
(`{scopeId, taskId, status}`) and returns
`{orchestrated, idle, maxWorkers, active, ready, blocked}`.
- Only active records of the plan's scope count; `active` lists their task
  ids.
- `idle` is `NOT_ORCHESTRATED` without a scope or with strategy
  `sequential`, `SCOPE_NOT_ACTIVE` for a blocked scope; then `ready` and
  `blocked` are empty.
- Candidates are `TODO` tasks of kind `work` or `docs` without an active
  assignment, visited in plan order. `QUALITY` and delivery tasks are never
  assignments: the orchestrator runs them in main.
- Each candidate gets the first failing rule, as `{taskId, code, message,
  blockedBy}`:
  1. `DEPENDENCY_PENDING` — a dependency is not `DONE`; a `DOCS` task also
     waits for every `work` task of its round;
  2. `ASSIGNMENT_BARRIER` — a task without `parallelSafe` needs every
     earlier task `DONE` and nothing taken; a `parallelSafe` task never
     overtakes an earlier unfinished task without `parallelSafe` and never
     runs beside a taken task without `parallelSafe`;
  3. `ASSIGNMENT_CONFLICT` — a `parallelSafe` task must be compatible
     (`workflowPlanFacade.compatibleTasks`) with every taken task;
  4. `ASSIGNMENT_CAPACITY` — the taken tasks already fill `maxWorkers`.
- "Taken" means the active assignments plus the candidates already found
  ready in this pass, so the whole `ready` list may be assigned together and
  a later candidate yields its slot to an earlier one.

Brief: `brief(plan, task, record, documents = [])` returns the English text for the
executor subagent: it executes task `<ID>` of the scope (assignment id),
works only in its own git worktree, first runs
`scripts/workflow assignment:attach <id>` there (and
`scripts/workflow assignment:setup` when it reports `NEEDS_SETUP`), then
`scripts/workflow task:start <ID>`, implements within the title, why,
files, acceptance and context of the task, changes only the listed files or
paths nested inside a listed directory (anything else fails with
`ASSIGNMENT_SCOPE`; commit a subset with `--files`) and never edits
`.harness/workflow/**`, the launchers `scripts/workflow*` or the plan
(`ASSIGNMENT_CONTRACT`), commits with
`scripts/workflow commit --task <ID>` (`--digest <file.json>` for a DOCS
task) repeating it after a fixed check failure, and replies with the commit
SHA. Rules: only `status`, `validate`, `recover`, `show-task`, `task:start`,
`commit`, `repair`, `task:block`, `assignment:status`, `assignment:setup`
and `assignment:attach` (retry) work in the worktree, anything else fails with
`ASSIGNMENT_READ_ONLY`; never push; never touch the main checkout, the plan
or other tasks; do not set the git identity; do not create nested
executors.
The `documents` (`BriefDocument {path, heading?, text, bytes}`, read and
checked by `workflow-kit`: the task context or the scope specification)
follow the brief lines after the line
`Context documents (full text, do not re-read them):`, each as
`<document path="…" heading="…" bytes="N">`, the text and `</document>`
(`heading` only for a section; `&`, `"` and `<` of attributes escaped).
No documents, no such block.

Executor side (`assignment-attach.ts`):
- `locateWorktree(git, root)` returns `{mainRoot, worktree, branch}`:
  `worktree` is the real path of the git top level, `mainRoot` the parent of
  the common git directory (`git rev-parse --git-common-dir`), `branch` the
  current branch name or `null` when HEAD is detached. Errors:
  - `ASSIGNMENT_LAYOUT` — a bare repository, or a common git directory that
    is not a `.git` folder of a main checkout;
  - `ASSIGNMENT_WORKTREE` — not a repository, or the main checkout itself
    (git directory equal to the common one).
- `worktreeRecord(root)` reads `.harness/workflow/local/assignment.json`:
  `{version: 1, id, mainRoot, scopeId, taskId, baseCommit}` (`scopeId` is the
  scope of main); `null` without the file, `ASSIGNMENT_RECORD` for an
  unreadable one. `writeWorktreeRecord(root, record, mainRoot)` writes it
  atomically from the main record.
- `executorPlan(base, record, now)` builds the plan of the worktree from the
  plan of the base commit: the base scope must be the record's scope and the
  task `TODO` with the record's iteration (`ASSIGNMENT_BASE`). The result has
  revision `base + 1`, scope `assignment-<id>` (baseline the base commit,
  objective `<title>: <why>` or the title, acceptance and context of the
  task, the base spec, approval `Assignment <id>: task <ID> of scope <scope>`
  at `now`, `execution {strategy: sequential, maxWorkers: 1, ownerSession:
  null}`), one open round copied from the task's round without digest, and
  one task: a copy of the assigned task with `dependencies: []` and `fixes:
  null`. It is validated like every plan.

Contract guard (`assignment-guard.ts`): `checkExecutorChange({headPlan,
candidatePlan, paths, planPath})` checks one commit of an executor worktree
against the committed executor plan (`headPlan`, the plan at HEAD), in this
order:
1. `ASSIGNMENT_CONTRACT` (`details.paths`) — a path under
   `.harness/workflow/` or `.harness/plans/` other than the plan file, or a
   launcher (`scripts/workflow`, `scripts/workflow.cmd`,
   `scripts/workflow.ps1`); also when HEAD has no one-task plan;
2. `ASSIGNMENT_SCOPE` (`details.paths`, `details.files`) — a path that is
   neither equal to nor nested (by path segment) in a `files` entry of the
   task, so a task may list a module directory (without a trailing slash) to
   own its tests and `module.md`;
3. `ASSIGNMENT_CONTRACT` — the plan file changes, but the candidate is not
   the Kit's own transition of the single task: started, `files` extended
   only by in-scope paths after the original entries, and completed (with
   the candidate round digest of a DOCS task); the rendered documents must
   be equal.

Worktree setup (`assignment-setup.ts`, spec 5.4):
- The stack install comes from the quality profile of the worktree
  (`workflowQualityFacade.readConfig`): only the `node` stack has one, and
  only when the root `package.json` declares a non-empty `dependencies` or
  `devDependencies`. The package manager is the profile's `packageManager`
  when it is a node one, else the one whose lock file exists, else npm:
  npm — `npm ci` (`package-lock.json` or `npm-shrinkwrap.json`); pnpm,
  yarn, bun — `<manager> install --frozen-lockfile` (`pnpm-lock.yaml`,
  `yarn.lock`, `bun.lock`/`bun.lockb`).
- `needsSetup(worktree, task)` is true when the commit-stage checks the
  hooks would run for the task (`selectChecks` with the task's `checks`;
  `service` for a DOCS task, so only documentation builtins) include a
  command check, the stack has an install and the worktree has no
  `node_modules` entry (directory or link). A DOCS task never needs setup.
- `setup(mainRoot, record, {env, now})`:
  1. `ASSIGNMENT_STATUS` unless the record has a worktree and is
     `NEEDS_SETUP`, `READY` or `RUNNING`; `ASSIGNMENT_WORKTREE` when the
     worktree folder is missing;
  2. without a stack install nothing runs (`ran: false`);
  3. `SETUP_LOCK_REQUIRED` (`details.locks`) without a lock file;
     `SETUP_LINKED_DEPENDENCIES` when the worktree's `node_modules` is a
     link (an install would rewrite what it points to; main's dependencies
     are never copied or linked);
  4. runs the install in the worktree without a shell through the platform
     process runner with `env` (15 min timeout); a non-zero exit, timeout
     or start failure is `SETUP_FAILED` with `details {command, exitCode,
     output}` (the last 4000 characters) and the record is not changed;
  5. re-reads the main record and writes `setup {command, lockHash (sha256
     of the lock file), at}`, `NEEDS_SETUP` becoming `READY` (other statuses
     stay). Returns `{assignment, output, ran}`.

Cleanup (`assignment-cleanup.ts`, spec 7): `cleanup(git, mainRoot, record,
now)` for the integration and `assignment:cleanup`:
- `ASSIGNMENT_NOT_INTEGRATED` unless the record is `INTEGRATED`; a record
  whose cleanup is `DONE` is returned unchanged;
- when git lists the record's worktree (`git worktree list --porcelain`):
  `git worktree remove <path>` without `--force` (ignored files such as
  `node_modules` do not block it); then `git worktree prune`; then, when the
  record has a branch that still exists, `git branch -d <branch>`;
- the first refusal stops the steps and writes `cleanup {status:
  "PENDING", reason: "git <args>: <git message>", at}`; success writes
  `cleanup {status: "DONE", at}`; `updatedAt` is `now` and the updated
  record is returned (a refusal is not an error).

Cancel (`assignment-cancel.ts`): `cancel(git, mainRoot, record, {force})`
for `assignment:cancel`:
- `ASSIGNMENT_INTEGRATED` for an `INTEGRATED` record (next action:
  `assignment:cleanup --id <id>`);
- when git lists the record's worktree and it exists on disk: without
  `force`, uncommitted changes or untracked files that are not ignored fail
  with `ASSIGNMENT_DIRTY` (`details {id, paths, worktree}`, next action
  `--force`) before anything changes; then `git worktree remove` (with
  `force`: `-f -f`, which also drops changes and a lock);
- `git worktree prune`; when the record's branch exists, `git branch -D`
  (commits that were never integrated are dropped; the tip is returned);
- the record file is removed last (`removeRecord` of
  `assignment-records.ts`). A git refusal fails with
  `ASSIGNMENT_CANCEL_FAILED` (`details {id, reason}`) and keeps the record,
  so the cancel can be repeated; finished steps are skipped then.
- Returns `{assignment (the record before), worktree, branch, branchTip}`
  (`null` for what did not exist). The plan of main is not touched.

## Dependencies

`workflow-platform` (files, errors, paths, the process runner), `workflow-git` (`localPath`,
the git runner of the facade passed by the Kit), `workflow-plan` (types,
`execution`, `compatibleTasks`, parse, render, validate, `startTask`,
`completeTask`),
`workflow-quality` (the configuration file path, the profile and check
selection). Node built-ins only.

## Tests

`test/workflow-assignment-facade.test.mjs` — the scheduler matrix
(sequential and blocked scopes, QUALITY and delivery excluded, dependencies
including assigned ones, DOCS after the work of its round, the barrier in
both directions, overtaking a waiting parallel task, path conflicts with
active and ready tasks, integrated and foreign records ignored, capacity),
ids, record create/write/read/list order, `ASSIGNMENT_ID`,
`ASSIGNMENT_RECORD`, the configuration digest and the brief of a work and a
DOCS task (scope rule, contract, setup step, command whitelist, no push)
and the marked document block.
`test/workflow-assignment-cancel.test.mjs` — the cancel with real
worktrees: a record without a worktree, a committed branch with its tip,
`ASSIGNMENT_DIRTY` and `force`, `ASSIGNMENT_INTEGRATED`, and a git refusal
(`ASSIGNMENT_CANCEL_FAILED`) that keeps the record.
The executor side is tested with real git worktrees in
`workflow-kit/test/workflow-kit-executor.test.mjs`; setup and cleanup in
`workflow-kit/test/workflow-kit-worktree.test.mjs`.

## Owned Paths

- `module.md`
- `src/**`
- `test/**`
