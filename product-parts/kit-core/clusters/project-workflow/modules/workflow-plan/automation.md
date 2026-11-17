# Workflow Plan Module — Automation

The optional automation block of a scope (`plan-automation.ts`, spec M39
`docs/planning/M39-autopiloting-kit.md`, section 4) of the
[Workflow Plan module](module.md). Since Kit 2.3.0.

## Model

`scope.automation` (absent on legacy and manual plans):

- `acceptance`: one entry per index of `scope.acceptance`, stored in
  criterion order: `{criterion, kind, checks, evidence}`.
  - `criterion` is the 0-based index of the criterion;
  - `kind` is `automatic` (proven by checks and evidence) or `manual` (the
    user checks it; it never becomes automatic by itself);
  - `checks` are quality check ids (`CHECK_UNKNOWN` is enforced by
    `workflow-kit` with `workflow-quality`);
  - `evidence` are canonical project-relative paths of result files;
  - an automatic entry names at least one check or evidence file: a line
    of text such as "done" is not proof.
- `delivery`: `{taskId, effects}[]` — the concrete build, install and
  external effects of delivery tasks of the scope; default `[]`.
- `ci`: `null` when no remote CI is required, otherwise `{remote, branch,
  requiredChecks, exactSha, task?}`. `requiredChecks` is a non-empty list of
  job names; `workflow-kit` checks them against the project CI configuration
  (`CI_CHECK_UNKNOWN`). `task` (optional, Kit 2.4.1, spec M40) names the
  delivery task that pushes the CI branch itself: the `pre-push` hook allows
  that push once the task is started. Without `task` the CI branch is pushed
  only after every task is DONE (the host pushes the result for the CI
  check); see `workflow-kit/barriers.md`.
- `publication`: `null` when the result stays local, otherwise `{branch,
  upstream}` with `upstream` as `<remote>/<branch>`. Publication follows
  the closed scope; it is not a delivery task.

`scope.proposal` (`ScopeProposalRef`): `{digest, generation}` of the
reviewed proposal a scope was chosen from (`scope:choose`); absent on a
scope created directly. `digest` is a sha256 hex, `generation` a positive
integer (`PLAN_SCHEMA`, field `scope.proposal`).

## Validation

- `normalizeAutomation(input, {acceptance, tasks})` validates the input
  block (refusals name the input entry, e.g.
  `automation.acceptance[1].kind`) and returns the stored form; `null` or
  an absent block gives no field. `createScope` calls it after the tasks
  are normalized.
- `validateAutomation(block, scope)` and, for a stored plan,
  `validatePlanAutomation(plan)` (the last step of `validatePlan`) refuse
  with `PLAN_AUTOMATION` and `details.field`:
  - unknown fields of the block or of an entry (`automation`);
  - `acceptance`, `ci`, `publication` missing (`ci` and `publication` are
    `null` when there is none);
  - a criterion out of range, described twice, or a missing one
    (`details.missing`);
  - a kind other than `automatic`/`manual`, duplicate or empty checks,
    non-canonical evidence paths, an automatic entry without checks and
    evidence;
  - a delivery entry whose `taskId` is not a delivery task of the scope
    (a work task, an unknown id) or is repeated, empty `effects`;
  - `ci.remote`/`ci.branch`/`publication.branch` that are not git names
    without spaces, empty `requiredChecks`, a non-boolean `exactSha`, a
    `ci.task` that is not a delivery task of the scope, an `upstream`
    without `/`.
- `plan:extend` keeps the block unchanged; a new delivery task gets no
  effects (new effects need a new authorization, spec M39).
- `carryover` drops `automation` and `proposal`: the new scope is a new
  agreement.

## Projection and summary

- The plan document shows `- Automation: <n> automatic, <m> manual
  criteria; CI <remote> <branch> (<k> checks) | no CI; publication
  <branch> → <upstream> | no publication` after the execution line, only
  when the block exists, so legacy plans keep their projection.
- `automationSummary(block)` returns the lines that recovery prints:
  `acceptance: <n> automatic, <m> manual (manual: <1-based numbers>)`,
  `delivery effects: <taskId (effects)> | none`, `ci: <remote> <branch>,
  checks <names>[, exact SHA][, pushed by <task>] | none`, `publication: <branch> → <upstream>
  | none`.

## Input schema

`scope:create` and `scope:propose` describe `automation`,
`automation.acceptance[].criterion|kind|checks|evidence`,
`automation.delivery[].taskId|effects`,
`automation.ci.remote|branch|requiredChecks|exactSha|task` and
`automation.publication.branch|upstream` with the code `PLAN_AUTOMATION`;
their example carries a full block and passes the real validator. The
rules name `CHECK_UNKNOWN`, `AUTOMATION_CHECK_UNRECORDED` (Kit 2.4.5: a
check no task of the scope can record, see `workflow-kit/operations.md`),
`CI_CHECK_UNKNOWN` and the proposal digest.

## Tests

`test/workflow-plan-automation.test.mjs`: a legacy plan stays valid and
renders unchanged; the block is stored in criterion order with manual
criteria kept; every refusal above with its field; a hand-edited stored
block is refused; `scope.proposal` round trip and refusal; `plan:extend`
keeps the block; `carryover` drops it; the summary lines.
