# Workflow Kit: barriers of Git and files (Kit 2.4.1–2.4.2, spec M40)

Part of the [module contract](module.md). Specification:
[M40, section 3](../../../../../../docs/planning/M40-user-decisions.md#3-барьеры-ядра).
The rules below were instruction text before; now the Kit checks them. They
apply in both decisions modes.

## Push (`kit-push.ts`, the `pre-push` hook)

Git writes one line per pushed ref to the hook's stdin:
`<local ref> <local sha> <remote ref> <remote sha>`. `git-hook pre-push`
reads it (`io.readStdin`, only for this hook: git closes that pipe) and
passes it to `gitHook(root, "pre-push", args, stdin)`.

- `parsePushRefs(stdin)` splits the lines; a trailing `\r` (CRLF), blank
  lines and lines without four fields are skipped.
- `pushRefusal(context, plan, refs)` checks the **target** (remote) ref of
  every line, so `git push origin HEAD:main` and a push of another local
  branch into `main` are pushes of `main`. The first refused ref refuses the
  whole push. Without an open scope, and for an empty input, nothing is
  refused.
- **Publication branch** — `automation.publication.branch` of the open
  scope, else the checked-out branch (`git symbolic-ref --short HEAD`).
  A push into it is `PUBLISH_SCOPE_OPEN` while a scope is open (also when it
  is accepted); after `close` it passes.
- **CI branch** — `automation.ci.branch`; for a plan without `automation`
  it is `ci/<scope id>`; a plan with `automation.ci: null` has none. A push
  into it is `CI_PUSH_NOT_ALLOWED` unless:
  - `automation.ci.task` is declared and that task is `IN_PROGRESS` or
    `DONE` (another delivery in progress does not allow it);
  - `automation.ci` has no `task` (the host pushes the result for the CI
    check) and every task of the scope is `DONE`;
  - the plan has no `automation` and a delivery task is `IN_PROGRESS` or
    every task is `DONE`.
- A deletion (zero local SHA), tags and every other branch pass.
- The earlier checks of the hook stay and run in this order:
  `ASSIGNMENT_READ_ONLY`, `TRANSACTION_PENDING`, `INTEGRATION_ACTIVE`, the
  ref rules, `DOCS_PENDING`, the `push` checks.

## Commits made past the Kit (`kit-external.ts`)

- `externalCommits(context, plan)` — the full SHAs of the commits in
  `scope.baselineCommit..HEAD` without the `Workflow-Transaction` trailer
  that are not in `scope.adoptedCommits`, oldest first (for example
  `git commit --no-verify`). Kit commits of every role, integration commits
  and the executor commits they bring in carry the trailer.
- `ensureNoExternalCommits(context, plan)` (`kit-decisions.ts`, under the
  Kit lock) fails with `EXTERNAL_COMMITS` (`details.commits`) in
  `task:start`, `commit --task`, `accept`, `close`, `accept --autopilot-run`
  and `close --autopilot-run`. In the `host` decisions mode the refusal
  registers the `adopt-commits` decision request itself
  (`details.decision`), so the card appears without another command; the
  manual forms of `accept`, `close` and a delivery `task:start` get the same
  refusal before their own request (`externalGuard`).
- `commits:adopt`:
  - `agent` mode: `commits:adopt --commits <json|sha,sha> --note "<the
    user's words>"`. The list must be the current external list in order
    (`EXTERNAL_COMMITS` with the current list otherwise); `USAGE` without
    `--commits` or `--note`, `ADOPT_NOTE` for a note shorter than 3
    characters, `NO_EXTERNAL_COMMITS` when there is nothing to adopt.
  - `host` mode: the command is the `adopt-commits` decision
    ([decisions.md](decisions.md)): `params.commits` is the exact ordered
    list; a new external commit after the request makes it stale
    (`DECISION_STALE`), the host applies it with `commits:adopt --decision
    <id> …`. The agent's `--commits` and `--note` are ignored.
  - Result: `scope.adoptedCommits` gets the list and `scope.decisions` a
    record of kind `adopt-commits` (`workflowPlanFacade.adopt`); the plan
    change is saved and recorded by the next Kit commit, like `task:block`.

## Task files (`kit-task-files.ts`, Kit 2.4.2)

`commit --task <ID>` in main refuses with `TASK_FILES_OUTSIDE` when a path
it would commit is outside the `files` of the task; nothing is committed and
the task keeps its list. `details` carry `files` (the list) and `paths`
(what is outside).

- A path is inside when it equals an entry or lies below it by whole
  segments (`docs/guide` covers `docs/guide/a.md`, not `docs/guide2/a.md`):
  `inTaskFiles(files, file, platform?)`. The case is ignored on win32 and
  darwin, where two spellings name one file.
- The check runs on the selected paths: everything changed since
  `task:start`, or the explicit `--files` list. Changes that existed before
  `task:start` (preexisting), Kit state and private files are not selected,
  as before, so they are no refusal; a preexisting path given with `--files`
  is checked like any other.
- A task with an empty `files` list is not limited.
- The DOCS task of a round reconciles shared documents and its list is made
  by the Kit, so its documentation paths are never outside; a code path is.
- The way out: revert what does not belong to the task, or extend it with
  `task:update <ID> --input <patch.json>` (`files` of a task in progress);
  the plan commit of the update shows the extension in the history.
- In an executor worktree the assignment contract stays the rule
  (`ASSIGNMENT_SCOPE`), this check does not run there.

## Input files (`kit-input-location.ts`, Kit 2.4.2)

Every `--input <file>` and `commit --digest <file>` goes through
`readJsonFile(root, cwd, file)`, which calls `ensureInputLocation` before
the file is read: a file inside the project but not under `.harness/inputs/`
(git-ignored) is `INPUT_LOCATION` (`details.path`), because it would land in
a commit. A file outside the project passes. A missing or broken file in the
wrong place is `INPUT_LOCATION` too, not `INPUT_UNREADABLE` or `INPUT_JSON`.

- `insideProject(root, file, {platform?, realpath?})` returns the
  project-relative segments or null. Both paths are made real first
  (`realpathSync.native`: links and Windows 8.3 short names; a missing tail
  keeps its spelling under the real path of the nearest existing folder), so
  a link in `.harness/inputs/` that leads to another project file is
  refused and a short name of the project folder is the same project.
- win32 uses `path.win32` (both separators, drive letters) and ignores the
  case; darwin uses `path.posix` and ignores the case; linux uses
  `path.posix` and compares the case.
- The service writes its host inputs to `.harness/inputs/` already.

## OS behaviour

Task files and input files: the comparison takes the platform as a
parameter; the tests inject `win32`, `linux` and `darwin` with paths that
exist on no OS (case, separators, an 8.3 short name, another drive, a link).

The same on macOS, Linux and Windows (x64 and ARM64): the hook is a `sh`
script (Git for Windows runs it with its own `sh`) that starts
`scripts/workflow`, so the stdin of the hook reaches the Kit process
unchanged; `\r` at the end of a ref line is removed. Ref names are compared
as text (git refs are case-sensitive on every OS). The commit list comes
from `git log` records separated by control characters, so CRLF in commit
messages does not affect it. No OS program other than git is called. The
test pushes through real git and the compiled CLI on every OS in CI.
