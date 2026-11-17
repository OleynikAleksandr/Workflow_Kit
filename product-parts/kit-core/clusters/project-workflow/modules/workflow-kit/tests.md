# Workflow Kit Module — Tests

The tests of the [Workflow Kit module](module.md).

All on temporary repositories with real hooks (and real `git worktree add`
worktrees where noted):

- `test/workflow-kit-lifecycle.test.mjs` — a whole sequential scope: docs
  commits, scope with spec, QUALITY, task snapshots, prepare checks,
  block/unblock, `task:update`, DOCS digests, a fixes round, history,
  acceptance, close (the `DIRTY_TREE` refusal with one, five and seven
  paths, an input file in the ignored `.harness/inputs/`), recovery and
  repair.
- `test/workflow-kit-plan-checks.test.mjs` — planned `CHECK_UNKNOWN` in
  scope, extend and update, before and after QUALITY.
- `test/workflow-kit-ignored-commit.test.mjs` — `commit --task` of an
  ignored folder removed from the index (a file over
  `policy.maxFileLines`) and a deleted tracked file.
- `test/workflow-kit-hooks.test.mjs` — direct commits rejected, service
  commits, failing and candidate-changing checks, a service commit with a
  conflict marker refused, DOCS before push, push checks, `commit-msg`,
  unknown hooks.
- `test/workflow-kit-execution-mode.test.mjs` — propose/choose/refine, the
  automatic sequential scope, `NO_PARALLEL_WORK`, `PROPOSAL_CHANGED`,
  `SCOPE_EXISTS`, the card view, `EXECUTION_MODE_REQUIRED`, the CLI.
- `test/workflow-kit-delivery-defer.test.mjs` — spec M39 T003: refusals
  without a write (`USAGE`, a short reason, a stale revision, a DONE or
  work task, an unknown task, a dirty tree, an unfinished integration,
  `ROUND_OPEN` of `plan:extend` while the delivery runs), the deferral
  commit and record in `show-task`, a fixes round with D002, `task:update`
  making T012 wait for D002, `DEPENDENCY_PENDING` before D002, the second
  attempt, unchanged commits of DONE tasks and a valid history.
- `test/workflow-kit-autopilot-grant.test.mjs` and
  `test/workflow-kit-host-ipc.test.mjs` — spec M39 T002, see
  [autopilot.md](autopilot.md#tests).
- `test/workflow-kit-automation.test.mjs` — spec M39 T001: `NO_PROPOSAL`;
  `CI_CHECK_UNKNOWN` without a CI configuration and for unknown jobs (step
  names are not checks, matrix names and literal job names are);
  `CHECK_UNKNOWN` and `PLAN_AUTOMATION` before a proposal is stored; the
  proposal digest stays the same for a new generation and changes with a
  task, the CI policy and the bytes of the spec, a scope context and a task
  context document (a missing one is `null`); `scope:proposal --digest`
  JSON and text; a stale `--expected-digest` refuses the choice with
  nothing written, a bad one is `USAGE`; the current digest creates the
  scope with `proposal` and `automation` in the plan and in `status`;
  recovery shows the criterion kinds, the automation lines and the
  reviewed digest; a legacy scope answers as before.
- `test/workflow-kit-owner.test.mjs` — `scope:owner` (M31): `NO_SCOPE`,
  `USAGE`, the same owner unchanged, the move (revision + 1, the decision,
  no commit, status), the text form, `help`, `OWNER_BUSY` for a started task
  and for an active assignment.
- `test/workflow-kit-assignment.test.mjs` — the schedule (dependencies,
  barrier, conflict, capacity, DOCS), create preconditions, the brief,
  idempotent retry, `ASSIGNMENT_EXISTS`, `assignment:cancel`, the CLI.
- `test/workflow-kit-context.test.mjs` — `CONTEXT_MISSING` and
  `CONTEXT_TOO_LARGE` in `scope:create`, `task:update`, `plan:extend` and
  `assignment:create` (grown or changed documents), the brief with a
  section, a whole document, the specification fallback and the map.
- `test/workflow-kit-context-command.test.mjs` — `context`: order, budget,
  the left-out list, sections of a large document, `#Heading`, refusals,
  `--list`.
- `test/workflow-kit-executor.test.mjs` (worktrees) — main read-only and
  delivery rules, attach refusals, records and the `assignment-plan`
  commit, the executor whitelist (`schema`, `context` allowed), `pre-push`, `RUNNING`, scope and contract
  guards, `READY_FOR_INTEGRATION`, nested directory entries.
- `test/workflow-kit-worktree.test.mjs` (worktrees, fake `npm`) —
  `NEEDS_SETUP`, setup refusals, success and failure, cleanup `DONE` and
  `PENDING`, branch deletion.
- `test/workflow-kit-decisions.test.mjs` and
  `test/workflow-kit-decisions-grant.test.mjs` (M40, support
  `workflow-kit-decisions-support.mjs`) — the `host` decisions mode:
  every decision command without a ticket (`USER_DECISION_REQUIRED`, the
  request by kind, the same id for the same input, `stale` for another),
  `status.decisions` with a planted and an edited record, the host form over
  a fake parent and a real fork (the bindings of the ticket, the root with
  injected `win32` and `linux`), `DECISION_STALE`, `already`, the stored
  `quality:apply` input, the `grant` source and its M39 refusals, the
  delivery started by the live grant without flags, and the `agent` mode and
  a project without the key behaving as Kit 2.3.3.
- `test/workflow-kit-push.test.mjs` (M40) — the `pre-push` ref lines (LF,
  CRLF), the publication branch by the target ref (`HEAD:main`, another
  local branch, several refs), the CI branch with and without
  `automation.ci.task` and for a plan without automation, deletions, tags
  and other branches, and a push through real git and the compiled CLI.
- `test/workflow-kit-external.test.mjs` (M40) — `EXTERNAL_COMMITS` in
  `task:start`, `commit`, `accept`, `close` and the run forms,
  `commits:adopt` with the exact list in the `agent` mode, the
  `adopt-commits` request registered by the refusal in the `host` mode,
  `DECISION_STALE` after a new commit and the adoption with a ticket.
- `test/workflow-kit-file-barriers.test.mjs` (M40) — `TASK_FILES_OUTSIDE`
  in `commit --task` (paths outside the list, a folder entry, `--files`,
  preexisting changes, a task without a list, the extension by
  `task:update`, the DOCS task), `INPUT_LOCATION` on injected `win32`,
  `linux` and `darwin` with paths that exist on no OS (case, separators, an
  8.3 short name, another drive, a link) and through the command line
  before the file is read.
- `test/workflow-kit-status.test.mjs` — the status fields in every state and
  the text lines.
- `test/workflow-kit-pause.test.mjs` (worktrees) — `pause:set`, statuses and
  refusals while paused, the unaffected executor worktree.
- `test/workflow-kit-schema.test.mjs` — `schema` for every command (JSON
  descriptor, text lines, rules and example), the list, an unknown
  command, outside an installed project.
- `test/workflow-kit-support.mjs` (support, not a test) — shared by the
  execution-mode, assignment, executor and status tests: the compiled Kit
  with a clean git environment and a deterministic clock, temporary
  projects with a bootstrap commit, the command line with captured output,
  real hooks, the orchestrated proposal and choice, and plan fixtures.
- `test/workflow-kit-cli.test.mjs` — envelopes, inspection, `install
  --host`, `install --with` without `--update` (`USAGE`), text output, recovery events, SessionStart and git-hook
  dispatch, the compiled program, and `identity:set` outside a project
  (its refusals and the write to a temporary `GIT_CONFIG_GLOBAL`).
- The integration commands, busy refusals and the merge-aware hook are
  tested in `workflow-integration/test/workflow-integration-merge.test.mjs`.

Test repositories use the real local identity `workflow@harness-ai.test`:
Kit commits refuse placeholder identities (`GIT_IDENTITY_REQUIRED`).
