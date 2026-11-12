# Workflow Git Module

## Responsibility

All git work of the Workflow Kit:
- repository queries: repository, HEAD, identity, config, git paths;
- working-tree changes;
- commit history with `Workflow-*` trailers;
- the transactional task commit;
- resolving each task to its commit;
- repair.

## Public Facade

`WorkflowGitFacade` (class, singleton `workflowGitFacade`). The constructor
takes a platform facade and an environment. Tests pass an environment
without the `GIT_*` hook variables, including the `GIT_AUTHOR_*` and
`GIT_COMMITTER_*` identity and `GIT_CONFIG_PARAMETERS`/`GIT_CONFIG_COUNT` that
Kit commits pass to hooks (`test/workflow-git-test-repo.mjs`), so
they work on temporary repositories even when they run inside a commit hook
of this repository. Test repositories set a real local identity;
repositories that git creates during a test (for example
through install) get it from `identityTemplate(folder)`, passed as
`GIT_TEMPLATE_DIR`.

## Contract

- `git.run(root, args, {allowFailure, input, timeoutMs})` runs git without a
  shell. Errors:
  - `GIT_UNAVAILABLE` — git did not start;
  - `GIT_FAILED` — non-zero exit, unless `allowFailure` is set.
- `isRepository`, `topLevel`, `init(root, "main")`.
- `head(root)` returns the full SHA, or `null` before the first commit.
- `identity(root)` returns the effective `{name, email}` (every config
  scope git reads), or `null`.
- `changes(root)` returns `{staged, unstaged, untracked, all}`: sorted
  canonical paths from `git status --porcelain=v1 -z`. Renames and copies
  record both paths.
- `history(root, from, tip)` returns the commits in `from..tip`, oldest
  first: `{sha, parents, subject, message, trailers}`. Trailers are the
  `Workflow-*` lines of the last message paragraph.
  Inside the module `readHistory` also takes `{firstParent: true}`
  (`git log --first-parent`) for the main walk of commit references.
- `diffPaths(root, from, to)` returns the sorted paths that differ between
  two commits (`git diff-tree -r --no-renames`; a rename is a deletion plus
  an addition).
- `mergeHead(root)` returns the `MERGE_HEAD` commit of the checkout, or
  `null` without a merge in progress; `conflicts(root)` the sorted paths
  with unresolved conflicts (`git diff --diff-filter=U`).
- `absentPaths(root, files)` returns, in the given order, the paths of
  `files` a commit candidate will not contain: outside the index and missing
  on disk or ignored by git (the rule of staging, step 4 of the
  transaction).
- `commitPaths(root, sha)`, `isAncestor(root, a, b)`,
  `show(root, revision, path)` (`null` when the file is absent),
  `config`/`setConfig`, and `gitPath(root, name)` (absolute path inside the
  git directory).

## Git Identity (`git-identity.ts`)

- `readIdentity(root, scope)` reads `user.name` and `user.email` from one
  config file only: `"local"` (`git config --local`, the repository config
  shared by all its worktrees) or `"global"` (`git config --global`).
  Returns `null` unless both values are set.
- `isPlaceholderIdentity({name, email})` is true when, after trimming and
  ignoring case:
  - the name or the email is empty;
  - the name is `Your Name` or `Ваше Имя`;
  - the email is `you@example.com` or has no `@`;
  - the email domain is `example`, `example.<anything>`, `invalid`,
    `*.invalid` or `localhost`.
- `isUsableIdentity({name, email})` is the one validator, used when an
  identity is set and when it is read. After trimming:
  - the name must not be empty and must not contain quotes of any kind
    (`"`, `'`, `` ` ``, `“`, `”`, `„`, `‘`, `’`, `‚`, `«`, `»`, `‹`, `›`) or
    angle brackets (`GIT_IDENTITY_INVALID`, `details.field: "name"`);
  - the email must look like `local@domain.tld`: exactly one `@`, no
    whitespace, quotes or angle brackets, a dot in the domain
    (`GIT_IDENTITY_INVALID`, `details.field: "email"`);
  - then a placeholder name or email (`isPlaceholderIdentity`) is
    `GIT_IDENTITY_PLACEHOLDER` with the field.
  The refusals carry only the message and `details.field`, no next action.
- `resolveIdentity(root)` returns the local identity, else the global one,
  skipping unusable ones, as `{name, email, source: "local" | "global"}`,
  or `null`. A configured identity that is invalid (for example an email in
  typographic quotes) counts like a placeholder.
- `writeLocalIdentity(root, identity)` validates and writes the trimmed
  identity to the repository-local config; a refusal writes nothing.
- `writeGlobalIdentity(cwd, identity)` validates and writes the trimmed
  identity with `git config --global user.name/user.email` and returns it;
  it needs no repository (the Kit command `identity:set --global`). The
  global config is whatever git reads (`HOME`, `XDG_CONFIG_HOME`,
  `GIT_CONFIG_GLOBAL` of the runner environment); tests point them at
  temporary files.
- `identityRequired(configured, suffix?)` builds the `GIT_IDENTITY_REQUIRED`
  refusal of this module and of the installer. The message names the
  problem once: `The Workflow Kit needs a real git name and email for its
  commits; none is set.` or `...; the configured one is a placeholder or
  invalid.` plus the optional suffix. `details.placeholder` is true when an
  identity is configured. The terminal commands are only in `nextAction`.
- `identityFix` is that next action: run once `git config --global
  user.name …` and `git config --global user.email …`, then
  `scripts/workflow doctor --fix` applies it to the project.

## Task Files (`git-task-files.ts`)

- `beginTask(root, {scopeId, taskId, iteration})` records every change that
  exists when the task starts, with content fingerprints, in
  `.harness/workflow/local/task-files/<hash>.json`. Kit state is not
  recorded.
- `selectTaskFiles(root, identity, explicit?)` returns
  `{selected, excluded, preexisting}`:
  - without `explicit`, every file changed since the snapshot is selected,
    except:
    - edits that existed before the task;
    - Kit state (`.harness/workflow/**`, `.harness/plans/**`,
      `.harness/runtime/**`);
    - private files (`.env*`, keys and certificates, SSH keys, `.npmrc`).
  - errors:
    - `TASK_FILES_UNKNOWN` — there is no snapshot;
    - `EXISTING_EDITS_CHANGED` — a file that had edits before the task
      changed again;
    - `MANAGED_FILE` — an explicit list names Kit state.
  - every other changed file is reported as `excluded`.

## Commit Transaction (`git-journal.ts`, `git-transaction.ts`, `git-staging.ts`)

`transactions.commit(root, request)` creates exactly one commit. The request
holds:
- `role` (`bootstrap`, `kit-update`, `scope-plan`, `quality`,
  `implementation`, `docs`, `acceptance`, `close`, `carryover`, `repair`,
  `assignment-plan` for the executor plan of an assignment, or
  `integration` for the merge of an executor source in main), `scopeId`,
  `taskId`, `iteration`;
- `sourceCommit` (optional): the executor source of an integration commit,
  kept in the journal;
- `transactionId` (optional): the id to use instead of a new UUID (the
  integration passes its operation id, so every retry of one integration
  has the same `Workflow-Transaction`);
- `assignmentId` (optional): the assignment of an executor worktree commit,
  kept in the journal;
- `message`, `files`;
- `planPath` and `planText`: the plan document after the operation;
- `checks` and `excluded`;
- an optional `prepare` stage.

Steps:

1. Refuses to start, before anything is written, when:
   - another transaction is pending (`TRANSACTION_PENDING`);
   - `MERGE_HEAD` differs from `sourceCommit`: a merge in progress without
     `sourceCommit` is `MERGE_IN_PROGRESS`, an integration without the merge
     of its source is `MERGE_REQUIRED`;
   - the index holds files outside the operation (`FOREIGN_STAGED`);
   - the repository-local identity is missing, a placeholder or invalid
     (`GIT_IDENTITY_REQUIRED` from `identityRequired`). The global identity
     is never used here. Only the next action names the one-time fix:
     `git config --global user.name "Your Real Name"`,
     `git config --global user.email "you@your-domain"`, then
     `scripts/workflow doctor --fix` applies it to the project.
2. Backs the index up to `.harness/workflow/local/index-before` and writes
   the journal (`transaction.json`) with the original and candidate plan.
3. Runs `prepare(files)`: formatters may rewrite files here.
4. Writes the candidate plan, stages the files (deletions included) and
   records the candidate tree. A path in the index is staged as it is on
   disk (`git add -A`). A path outside the index is staged only when it
   exists and git does not ignore it (`git check-ignore -z --stdin`, so any
   number of paths fits); the skipped paths are exactly
   `absentPaths(root, files)` of the facade (`git-staging.ts`, re-exported
   by `git-transaction.ts`; the paths the candidate will
   not contain, in the given order), which `workflow-kit` passes to the
   quality checks as `removed`: a deletion already staged for an ignored folder
   (`git rm -r --cached node_modules` with `node_modules/` in `.gitignore`)
   or for a path missing on disk stays in the index and is committed, and
   git never refuses with "paths are ignored" or "pathspec did not match".
   If nothing is staged, it rolls back and fails with `NOTHING_TO_COMMIT`.
5. Runs `git -c user.name=<local name> -c user.email=<local email> commit
   -F -` with `GIT_AUTHOR_NAME/EMAIL` and `GIT_COMMITTER_NAME/EMAIL` set to
   the same identity (`identityEnv`; Git exports `GIT_AUTHOR_*` to hooks and
   they win over `-c`), so the author and committer are the
   repository-local identity whatever the home directory, global config,
   `GIT_CONFIG_*` or `GIT_AUTHOR_*` variables of the caller say. The message ends with trailers:
   - `Workflow-Scope`, `Workflow-Task`, `Workflow-Role`;
   - `Workflow-Iteration` (every commit that names a task);
   - `Workflow-Assignment: <id>` when the request carries `assignmentId`;
   - `Workflow-Source: <sha>` when the request carries `sourceCommit`
     (`git commit` concludes the merge, so the commit has two parents);
   - `Workflow-Transaction`.
6. On a non-zero exit (hook checks), restores the original plan and index,
   keeps working-tree edits, saves the failed journal under
   `verification/failed-<id>.json`, removes the hook evidence
   `verification/pending-<id>.json` and throws `COMMIT_FAILED` with
   `retryable: true`. If HEAD, plan or index changed concurrently, the
   journal is kept for repair.
7. On success, confirms the commit (the newest first-parent commit after
   the previous HEAD): the trailer transaction id, the parents equal to the
   previous HEAD (plus `sourceCommit` for an integration;
   `TRANSACTION_PARENT` otherwise), and the tree equal to the candidate.
   Then it copies `verification/pending-<id>.json` (with `commit: <sha>`) to
   `verification/<sha>.json` and `last.json`, removes the pending file,
   writes `last-commit.json` and removes the journal.
   Every rollback (failed checks, nothing to commit, repair retry or
   cancel) and every finished transaction (including `finish-commit`
   repair) removes the pending file, so none remains; it lives only while
   the journal of an unresolved transaction is kept.

Other transaction calls:
- `transactions.journal(root)` returns the pending journal.
- `transactions.confirmed(root, journal)` returns the SHA of the commit the
  journal produced, if it exists.
- `transactions.finish(root)` completes the bookkeeping of a confirmed
  commit.
- `transactions.cancel(root)` rolls back an unconfirmed preparation.

`test/workflow-git-transaction.test.mjs` covers the integration commit:
`MERGE_REQUIRED` without the merge, `MERGE_IN_PROGRESS` for another role
during it, then two parents, `Workflow-Source`, `Workflow-Assignment` and
the given transaction id. It also commits a folder removed from the index
and ignored in the same commit (files kept on disk) and skips a path that is
neither in the index nor on disk; before that commit `absentPaths` names the
ignored copies and the missing paths, not the tracked or new files.

## Commit References (`git-references.ts`)

`resolveReferences(root, plan, planPath)` maps every task outside legacy
rounds to one of:
- `{status: "committed", sha, paths}`;
- `{status: "pending"}` — inside the current transaction;
- `{status: "open"}`.

It walks `baselineCommit..HEAD` by first parents only, so the executor
history an integration commit brings in through its second parent
(`assignment-plan` and task commits of scope `assignment-<id>`) is never a
main task commit. It searches that walk for task commits (roles
`implementation`, `docs` for a round's DOCS task, `quality` for the
QUALITY task, and `integration` for an orchestrated work or DOCS task)
whose `Workflow-Scope`, `Workflow-Task` and `Workflow-Iteration` match the
task.

Every commit of the walk with more than one parent must be an integration
commit (spec section 7): exactly two parents, `Workflow-Role: integration`,
`Workflow-Source` equal to its second parent, a `Workflow-Task` and a
`Workflow-Assignment`. Its first parent continues main.

Errors:
- `AMBIGUOUS_COMMIT` — several matching commits, or duplicated trailers;
- `PLAN_COMMIT_MISMATCH` — a `DONE` task without a commit, or a commit for a
  task that is not `DONE`;
- `HISTORY_NOT_LINEAR` — a commit of the walk with several parents that is
  not such an integration commit, a task commit of another role with more
  than one parent, or an integration commit without two parents;
- `COMMIT_SCOPE_MISMATCH` — a single-parent task commit touches files other
  than the task's files and the plan; an integration commit, compared with
  its first parent, touches files that are neither the plan nor equal to or
  nested (by path segment) in a task file entry. The reference `paths` are
  these compared paths;
- `DEPENDENCY_ORDER` — a dependency commit is not an ancestor. Legacy-round
  dependencies are exempt.

Integration commits are tested with real executor worktrees in
`workflow-integration/test/workflow-integration-facade.test.mjs`.

## Repair (`git-repair.ts`)

`planRepair(root, planPath)` is a dry run. It returns `{kind, message,
repairId}`, where the id pins HEAD, the plan text and the journal. Kinds:
- `finish-commit` — a journal whose commit exists;
- `retry-commit` — a journal whose commit does not exist;
- `projection` — the readable plan differs from its JSON;
- `defer-docs` — the current `DOCS` task waits for added work;
- `none`.

`applyRepair(root, planPath, id)` performs the action. If the id no longer
matches, it fails with `REPAIR_CHANGED`. A retry rolls the preparation back
and repeats the same request (with its `assignmentId` and `sourceCommit`)
with the same transaction id; it fails with
`REPAIR_MANUAL` when state changed concurrently, and the next action names
`repair --cancel <id>`. `cancelRepair` only cancels an unconfirmed
preparation (`NO_PREPARATION`) and keeps edits:
- nothing changed since the preparation — the usual rollback;
- the index or plan changed (or the journal is still `PREPARING`) but HEAD
  is `beforeHead` — `discardPreparation` (`git-transaction.ts`) restores
  the index and the original plan of the journal (no plan before: the file
  is removed), leaves every other working-tree file alone, stores the
  journal as `verification/failed-<id>.json` and removes the journal, the
  index backup and the pending evidence;
- HEAD moved — `REPAIR_MANUAL` with `details {beforeHead, head}` and the
  next action to ask the user and return HEAD with `git reset --soft
  <beforeHead>` before running `repair` again.

During rollback the index is restored from `index-before`. If the backup is
missing, it is restored from the previous HEAD tree, or emptied when there
was no commit yet.

## Owned Paths

- `module.md`
- `src/**`
- `test/**`
