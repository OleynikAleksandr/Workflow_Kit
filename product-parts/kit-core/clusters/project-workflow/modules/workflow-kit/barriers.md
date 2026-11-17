# Workflow Kit: Git barriers (Kit 2.4.1, spec M40)

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

## OS behaviour

The same on macOS, Linux and Windows (x64 and ARM64): the hook is a `sh`
script (Git for Windows runs it with its own `sh`) that starts
`scripts/workflow`, so the stdin of the hook reaches the Kit process
unchanged; `\r` at the end of a ref line is removed. Ref names are compared
as text (git refs are case-sensitive on every OS). The commit list comes
from `git log` records separated by control characters, so CRLF in commit
messages does not affect it. No OS program other than git is called. The
test pushes through real git and the compiled CLI on every OS in CI.
