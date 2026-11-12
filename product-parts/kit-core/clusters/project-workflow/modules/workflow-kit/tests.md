# Workflow Kit Module — Tests

The tests of the [Workflow Kit module](module.md).

All on temporary repositories with real hooks (and real `git worktree add`
worktrees where noted):

- `test/workflow-kit-lifecycle.test.mjs` — a whole sequential scope: docs
  commits, scope with spec, QUALITY, task snapshots, prepare checks,
  block/unblock, `task:update`, DOCS digests, a fixes round, history,
  acceptance, close, recovery and repair.
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
  --host`, text output, recovery events, SessionStart and git-hook
  dispatch, the compiled program, and `identity:set` outside a project
  (its refusals and the write to a temporary `GIT_CONFIG_GLOBAL`).
- The integration commands, busy refusals and the merge-aware hook are
  tested in `workflow-integration/test/workflow-integration-merge.test.mjs`.

Test repositories use the real local identity `workflow@harness-ai.test`:
Kit commits refuse placeholder identities (`GIT_IDENTITY_REQUIRED`).
