# Workflow Integration Module

## Responsibility

Integration of executor results into main (section 7 of
`docs/architecture/workflow-kit/WorkflowKitExecutionModes.md`):
- the proof of an executor source: its history, its diff, its check receipt
  and the task contract;
- the merge of a proven source into main with its journal, the plan
  candidate, the scope check and the two-parent integration commit;
- `continue` after a conflict, failed checks or a crash, and the status.

The Kit commands (`integration:start`, `integration:continue`,
`integration:status`), the project lock and the busy refusal of other Kit
writes belong to `workflow-kit`. The commit transaction (two parents,
`Workflow-Source`) and the verification of integration commits in main
history belong to `workflow-git`.

## Public Facade

`WorkflowIntegrationFacade` (class, singleton `workflowIntegrationFacade`)
in `src/workflow-integration-facade.ts`. The constructor takes a
`WorkflowGitFacade` (tests pass one without the hook `GIT_*` variables).
Methods: `proveSource`, `start`, `continue`, `status`, `isActive`.
Types: `IntegrationProof`, `ProvenCheck`, `IntegrationOutcome`,
`IntegrationJournal`, `IntegrationPhase`, `IntegrationState`.

## Source Proof

`proveSource(mainRoot, assignment, sourceSha)` (`src/integration-proof.ts`)
takes the main checkout, the main assignment record and the reported SHA
(full or abbreviated) and returns
`{assignmentId, taskId, baseCommit, sourceCommit, sourceTree, changedFiles,
checks}`, or throws the first failure, in this order:
1. Source:
   - `INTEGRATION_NOT_READY` — the record is not `READY_FOR_INTEGRATION`,
     or has no worktree or source commit;
   - `INTEGRATION_SOURCE` — the SHA does not resolve to the record's
     `sourceCommit`, or the executor worktree HEAD is not that commit;
   - `INTEGRATION_DIRTY` (`details.paths`) — the executor worktree has
     uncommitted changes (ignored local state does not count).
2. `INTEGRATION_CONTRACT` — the plan of the base commit is missing or has no
   task of the record.
3. `INTEGRATION_HISTORY` — `git log base..source` (all parents) is not
   exactly a chain from the base:
   - first the `assignment-plan` commit that changes only the plan file;
   - then one or more task commits: role `implementation` (`docs` for a
     DOCS task, the role its executor commit has);
   - every commit has one parent, the previous commit (the base for the
     first one), and single trailers `Workflow-Scope: assignment-<id>`,
     `Workflow-Task: <task>`, `Workflow-Assignment: <id>` and
     `Workflow-Iteration: <record iteration>`;
   - the last commit is the source.
   Details: `sha` and `mismatches` (`{field, actual, expected}`), or the
   `commits` of a wrong-length chain, or the `paths` of the plan commit.
4. `INTEGRATION_HISTORY` (`details.paths`) — the diff `base..source` holds
   Kit-managed files (`.harness/workflow/**`, `.harness/plans/**`,
   `.harness/runtime/**`) or launchers (`scripts/workflow`,
   `scripts/workflow.cmd`, `scripts/workflow.ps1`), except the plan file.
5. `INTEGRATION_UNCHECKED` — the check receipt of the last task commit,
   `<worktree>/.harness/workflow/local/verification/<sha>.json` (written by
   the commit transaction of `workflow-git`):
   - is missing or unreadable;
   - does not name that commit (`commit`) and its transaction (`transaction`
     equal to the `Workflow-Transaction` trailer). The transaction confirmed
     that the commit tree is the checked candidate tree, so the receipt
     refers to the source tree;
   - has a result other than `passed` or `skipped`;
   - lacks a commit-stage check the hook runs for this commit (the
     `selectChecks` of the worktree configuration with the task's checks;
     the service selection for a DOCS task), or an assigned check
     (`task.checks`) did not pass (`details.checks`).
6. `INTEGRATION_CONTRACT` — main's current plan has another scope, no such
   task, or a task whose `files`, `acceptance`, `kind` or `title` differ from
   the base plan.

`sourceTree` is the tree of the source commit, `changedFiles` the sorted
diff `base..source` (the plan file included) and `checks` every result of
the receipt as `{id, stage, status}`. The proof never writes.

## Integration Journal (`src/integration-journal.ts`)

`.harness/workflow/local/integration.json` of main (ignored local state):
`{operationId, assignmentId, taskId, source, mainHead, phase, startedAt,
error}`. `operationId` is a new UUID per integration and is the
`Workflow-Transaction` of the integration commit; `mainHead` is HEAD before
the merge (the first parent); `error` keeps the tail of the last merge or
check output. Phases:

| Phase | Meaning |
|---|---|
| `PREPARED` | proven and journaled, the merge has not run |
| `MERGING` | `git merge --no-commit --no-ff <source>` ran or is running |
| `CONFLICT` | unresolved conflicts remain; the merge state stays |
| `CHECKING` | the integration commit transaction is running |
| `CHECKS_FAILED` | the merged checks failed; the merge state and fixes stay |
| `UNKNOWN` | the state cannot be proven; never retried automatically |

The journal is removed when the integration is done or aborted. An
unreadable journal fails with `INTEGRATION_UNKNOWN`. `isActive(root)` is
true while the file exists; `workflow-kit` refuses its other write commands
then (`INTEGRATION_ACTIVE`). `status(root)` (`integration:status`) returns
`{status: "IDLE" | phase, journal, mergeHead, conflicts}`.

## Merge (`src/integration-merge.ts`, `src/integration-phases.ts`)

`integration-merge.ts` holds `start`, `continue` and the integration from a
journal (crash reconciliation, the plan reset and the scope check);
`integration-phases.ts` holds the phases that write (the merge, the commit
transaction with the plan candidate, the completion) and the
`IntegrationOutcome` type, which `integration-merge.ts` re-exports.

`start(mainRoot, {assignmentId, source, now})`:
1. An existing journal: the same assignment and source (resolved to the
   journal's SHA) continue it; anything else is `INTEGRATION_ACTIVE`.
2. Preconditions, in this order: a plan (`NOT_INSTALLED`); an orchestrated
   scope (`NOT_ORCHESTRATED`) that is `ACTIVE` (`SCOPE_NOT_ACTIVE`); no
   commit transaction (`TRANSACTION_PENDING`); main clean, untracked files
   included, and no merge in progress (`INTEGRATION_DIRTY`,
   `details.paths`); the record exists (`ASSIGNMENT_UNKNOWN`); the source
   proof above (`INTEGRATION_NOT_READY` for a record that is not
   `READY_FOR_INTEGRATION`, also after it was integrated).
3. The plan candidate is computed once before anything is written (the plan
   errors of `integrateTask`: `TASK_NOT_TODO`, `DEPENDENCY_PENDING`, ...).
4. The journal is written as `PREPARED`, then the integration runs.

`continue(mainRoot, {assignmentId, now})`: `NO_INTEGRATION` without a
journal, `INTEGRATION_ACTIVE` for another assignment; otherwise the
integration runs from its journal.

The integration from a journal:
1. Crash reconciliation:
   - a commit transaction of another role or id is `TRANSACTION_PENDING`;
     one of this integration whose commit exists is finished
     (`transactions.finish`) and the integration completes; an unconfirmed
     one is rolled back (`transactions.cancel`; a refused rollback is
     `UNKNOWN`);
   - HEAD other than `mainHead`: when HEAD is this integration commit
     (parents `mainHead` and `source`, role `integration`,
     `Workflow-Transaction` = `operationId`) the integration completes
     without a second merge; any other HEAD is `UNKNOWN`. Nothing is ever
     reset.
2. `UNKNOWN` stays refused (`INTEGRATION_UNKNOWN`, next action: inspect
   main, `git merge --abort`, remove the journal, start again).
3. `PREPARED`: `INTEGRATION_DIRTY` for changes, then phase `MERGING` and
   `git merge --no-commit --no-ff -q <source>`. No `MERGE_HEAD` equal to the
   source afterwards is `UNKNOWN` with the git output; it is never retried.
   Every later phase needs `MERGE_HEAD` equal to the source (`UNKNOWN`
   otherwise).
4. The executor plan is discarded: the plan file becomes main's plan of
   `mainHead` and is staged (a plan conflict is resolved this way).
5. Unresolved conflicts (`git diff --diff-filter=U`): phase `CONFLICT`, the
   result `{status: "CONFLICT", conflicts}`. The orchestrator resolves them
   inside the task files, `git add`s them and runs `continue`; Kit never
   applies ours/theirs.
6. Every change against main HEAD (staged, unstaged, untracked; the plan
   aside) must equal or be nested by path segment in a `files` entry of the
   task; otherwise `INTEGRATION_SCOPE` (`details.paths`): `git merge
   --abort`, the journal is removed, the record and the source are
   unchanged, so the integration can start again.
7. Phase `CHECKING`, then one commit transaction of `workflow-git`: role
   `integration`, transaction id `operationId`, `sourceCommit` = source,
   `assignmentId`, the task's iteration and checks, files = the changed
   paths, message `merge: <task title>`, plan text = the candidate:
   `workflowPlanFacade.integrateTask` on main's plan with `operationId` and
   `sourceCommit` (a DOCS task takes its round digest from the source plan).
   The managed pre-commit hook of main runs the task's commit checks on the
   merged candidate. `COMMIT_FAILED` sets phase `CHECKS_FAILED` (with the
   output) and throws `INTEGRATION_CHECKS_FAILED` (`details.output`): the
   transaction restored the plan and index, `MERGE_HEAD` and the working
   tree stay, the task stays `TODO`; `continue` retries from step 4. Other
   errors (for example `GIT_IDENTITY_REQUIRED`) are rethrown and `continue`
   retries as well.
8. Completion: the record becomes `INTEGRATED` with `integrationCommit`,
   then `workflowAssignmentFacade.cleanup` removes the worktree and branch;
   a refusal or a thrown error is `cleanup: PENDING` with the reason and the
   integration still succeeds. The journal is removed last, so a crash in
   between completes on `continue`.

The result is `{status: "INTEGRATED" | "CONFLICT", assignmentId, taskId,
operationId, source, mainHead, integrationCommit, conflicts, assignment}`
(`assignment` is the final record).

## Dependencies

`workflow-git` (history, diff paths, changes, `show`, the Kit-managed path
rule, the git runner, `mergeHead`, `conflicts`, the commit transaction),
`workflow-plan` (`PLAN_PATH`, parse, read, render, `integrateTask`, types),
`workflow-quality` (receipt, configuration, check selection),
`workflow-assignment` (records, cleanup), `workflow-platform` (errors,
atomic writes). Node built-ins only.

## Tests

`test/workflow-integration-facade.test.mjs` — a real temporary repository
with real hooks and an executor worktree (orchestrated scope, QUALITY,
`assignment:create`, `assignment:attach`, `task:start`, `commit --task`):
- the proof of the reported source (abbreviated SHA) with its tree,
  changed files and passed checks;
- `INTEGRATION_NOT_READY`, `INTEGRATION_SOURCE`, `INTEGRATION_DIRTY`;
- `INTEGRATION_HISTORY` for a foreign commit and for Kit files and a
  launcher in the diff;
- `INTEGRATION_UNCHECKED` for a missing receipt, a receipt of another
  commit, a failed check and missing checks, then a proof of two task
  commits once the receipt passes;
- `INTEGRATION_CONTRACT` after the task changed in main;
- main history (`resolveReferences` of `workflow-git`): hand-made merges of
  the source are refused without the role, with a wrong `Workflow-Source`,
  without `Workflow-Assignment` (`HISTORY_NOT_LINEAR`) and with a file
  outside the task (`COMMIT_SCOPE_MISMATCH`); a correct integration commit
  is the task's commit with the diff against its first parent.

`test/workflow-integration-merge.test.mjs` (with its support
`test/workflow-integration-merge-support.mjs`: the compiled Kit and CLI,
the main checkout with real hooks, the scope with QUALITY applied and the
executor helper) — a real temporary repository
with real hooks and real executor worktrees (one on a branch), through the
Kit facade and CLI, orchestrated scope with four parallel tasks and a lint
check that fails only on the merged result of A and B:
- happy path A: two parents, subject, identity, every trailer, the plan task
  `DONE` with `integration`, the record `INTEGRATED` with cleanup `DONE`
  (worktree gone), no journal, the main receipt, `validate` (history
  verification), `recover`, `status`, `integration:status` text `IDLE`; a
  second start is `INTEGRATION_NOT_READY`;
- B integrated after A from the same base: the plan conflict resolved by
  the Kit, `INTEGRATION_CHECKS_FAILED` with the journal `CHECKS_FAILED`,
  `MERGE_HEAD` kept, task `TODO`, status text, then a fix in main and
  `integration:continue` through the CLI (same `operationId`, branch
  deleted);
- C against a main `docs:commit` of the same file: `CONFLICT` with the
  conflicted file and main's plan, a repeated start continues, the busy
  refusals (`assignment:create`, `task:start` also through the CLI,
  `docs:commit`, `task:block`, `accept`, another start or continue,
  `pre-push`), `USAGE` without `--source`, a direct `git commit` of the
  merge refused by the hook, `INTEGRATION_SCOPE` for an untracked file
  (merge aborted, record unchanged), `INTEGRATION_DIRTY`, then a resolved
  conflict and `continue`;
- D: a simulated crash right after the merge commit (the transaction journal
  and the integration journal left behind); `status` and `recover` still
  work, `continue` completes the same commit without a second merge;
- `DOCS-R1` through an executor with its digest: the round closes and the
  scope is ready for acceptance; finally `validate`, the task-to-commit
  mapping of every integrated task and five first-parent merges.

`test/orchestration-scenario.test.mjs` (with its support
`test/orchestration-scenario-support.mjs`: the compiled Kit, the CLI as an
agent calls it, git views; and `test/orchestration-scenario-planning.mjs`:
the install, scope and QUALITY step) — one orchestrated scope end to end
through the Kit command line only, on a project installed by `install --host harness`
(real local identity, installed hooks and launcher running a stand-in
bundle) with Claude-style worktrees `<repo>/.claude/worktrees/agent-<n>`
(detached or on a branch):
- `scope:create` refused with `EXECUTION_MODE_REQUIRED`, `scope:propose`
  and `scope:choose --option orchestrated` of A, B (parallel), C
  (sequential), D (parallel) and a delivery task; QUALITY in main;
- `assignment:next`: A and B ready, C behind the barrier of A and B, D
  behind the unfinished C; after A and B a taken C still keeps D out;
- two executors interleaved (attach, `task:start`, `commit --task`), the
  executor scope rule, a direct `git commit` refused by the installed hook
  in the worktree, both `READY_FOR_INTEGRATION`;
- A integrated; B fails a check that fails only on the merged tree
  (`INTEGRATION_CHECKS_FAILED`), is fixed in main within its files and
  continued; the busy refusal while the journal exists;
- a crash right after C's merge commit: recovery names `repair`, the repair
  `finish-commit`, then recovery names `integration:continue`, which
  completes the same commit without a second merge;
- D with a locked worktree: `cleanup: PENDING`, recovery names
  `assignment:cleanup`, which finishes after the unlock;
- DOCS-R1 by an executor with its digest; `DELIVERY_NOT_READY` before and
  while it is active, then the delivery in main and `READY_FOR_ACCEPTANCE`;
- the recovery role lines (planning, orchestrator, executor not attached
  and attached, waiting, integrate first, CHECKS_FAILED, delivery) at each
  step; finally `validate`, five first-parent two-parent integration
  commits mapped to their tasks, no worktree or branch but main left.

## Owned Paths

- `module.md`
- `src/**`
- `test/**`
