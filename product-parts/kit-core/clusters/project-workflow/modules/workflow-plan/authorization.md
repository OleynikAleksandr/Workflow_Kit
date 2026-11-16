# Workflow Plan Module — Autopilot Authorization

The autopilot grant of a scope and the acceptance and close of an
authorized run (`plan-authorization.ts`, `plan-authorization-input.ts`,
`plan-autopilot-completion.ts`; spec M39 `docs/planning/M39-autopiloting-kit.md`,
section 4) of the [Workflow Plan module](module.md). Since Kit 2.3.1. Who may
call these transitions (only the host, through its IPC ticket) is checked by
`workflow-kit`; here they are pure.

## Model

`scope.authorization` (`AutopilotGrant`, absent without a run):
`{runId, ownerSession, mode after-start|full, source, note, at,
proposalDigest, delivery, accept, close, ci, publication, acceptancePolicy
automatic|manual, revision, revoked}`.

- `delivery` is a snapshot of the reviewed `automation.delivery` entries of
  the granted tasks (task id and effects); `ci` and `publication` are
  copies of the reviewed automation block (frozen CI policy).
- `revision` is 1 for a new run and grows with every accepted
  re-authorization of the same run.
- `revoked`: `null` or `{reason settings-off|user-stop, note, at,
  resumable}`; `resumable` is true exactly for `settings-off`.

`scope.acceptanceEvidence` (`AcceptanceEvidence`, only on an `ACCEPTED`
scope): `{source "autopilot", runId, authorizationRevision, at, head,
criteria [{criterion, checks [{id, commit}], evidence}], ci {sha, checks} |
null}`. `recomputeDelivery` drops it with the acceptance note when the scope
returns to `IN_PROGRESS`.

`lastClosed` may add `{autopilotRun, finalCommit}` (both or neither) when a
run closed the scope.

## Transitions

- `authorize(plan, input, now)` → `{changed, grant, plan}`. The input
  (`AuthorizeInput`: `runId, scopeId, ownerSession, mode, source, note,
  proposalDigest, deliveryTaskIds, accept, close, ci, publication,
  acceptancePolicy`) is checked in this order:
  1. an active scope (`AUTOPILOT_SCOPE_MISMATCH`), an automation block
     (`AUTOPILOT_UNAUTHORIZED`: a legacy plan gets no new authority);
  2. the fields (`PLAN_SCHEMA` with `details.field`; `note` at least 10
     characters); a manual criterion with `accept: true`, a policy other
     than `manual` or `mode: full` is `AUTOPILOT_MANUAL_REQUIRED`; only
     automatic criteria need `acceptancePolicy: automatic`;
  3. scope id and owner session (`AUTOPILOT_SCOPE_MISMATCH`);
  4. `proposalDigest` equal to `scope.proposal.digest`, `ci` and
     `publication` equal to the automation block (`AUTOPILOT_PLAN_CHANGED`);
  5. every delivery task id has reviewed effects and is a delivery task
     (`AUTOPILOT_SCOPE_MISMATCH`, `details.unknown`).
  Then: another run while the current grant is not revoked is
  `AUTOPILOT_UNAUTHORIZED`; a new run cannot use `source: panel-resume`.
  The same run: after `user-stop` always `AUTOPILOT_REVOKED`; after
  `settings-off` only `panel-resume` with the same boundaries (mode,
  accept, close, policy, delivery); the same boundaries of a live grant
  give `changed: false`; a change keeps the mode and never turns `accept`
  or `close` from false to true (`AUTOPILOT_UNAUTHORIZED`). Every change
  raises the plan revision.
- `revoke(plan, {runId, reason, note}, now)` → `{changed, grant, plan}`:
  `USAGE` for another reason or an empty note, `AUTOPILOT_SCOPE_MISMATCH`
  for another run; the same reason again, or anything after `user-stop`,
  changes nothing; `settings-off` → `user-stop` makes the stop final.
- `grant(plan, runId)` — the live grant: `AUTOPILOT_UNAUTHORIZED` (none or
  another run), `AUTOPILOT_REVOKED`, `AUTOPILOT_PLAN_CHANGED` (the proposal
  digest, CI policy or publication target changed).
- `deliveryConfirmation(plan, runId, taskId)` — the text a delivery task
  records as its confirmation: `Autopilot run <id> (authorization <n>,
  <source>, <at>): <note> | effects: <effects>`. A task outside the grant
  is `AUTOPILOT_UNAUTHORIZED`; effects that differ from the reviewed ones
  are `AUTOPILOT_PLAN_CHANGED`.
- `acceptByAutopilot(plan, {runId, head, criteria, ci}, now)` — the live
  grant with `accept` and no manual criterion (`AUTOPILOT_MANUAL_REQUIRED`),
  then the ordinary acceptance (`NOT_READY` outside
  `READY_FOR_ACCEPTANCE`) with the note `Accepted automatically by autopilot
  run <id> under the user's advance instruction (...)` and the evidence
  record. The evidence itself is verified by `workflow-kit`.
- `closeByAutopilot(plan, {scopeId, runId, head}, now)` — the live grant
  with `close` (`AUTOPILOT_UNAUTHORIZED`), a full SHA `head`
  (`AUTOPILOT_EVIDENCE_REQUIRED`), then the ordinary close (`SCOPE_ID`,
  `NOT_ACCEPTED`) with the note `Closed by autopilot run <id> ...`;
  `lastClosed` keeps `autopilotRun` and `finalCommit`. A manual acceptance
  of a grant with `accept: false` may be closed by the run.
- `carryover` drops `authorization` and `acceptanceEvidence`.
- `authorizationSummary(grant)` — the recovery line `run <id> (<mode>,
  authorization <n>, <source>): delivery <ids>; accept automatic|by the
  user; close yes|no; publication <branch> → <upstream>|none[; revoked:
  <reason> (resumable|final)]`.

## Validation

`validateAutopilotRecords(plan)` (the last step of `validatePlan`) refuses
with `PLAN_SCHEMA`: a grant without its names, mode, policies, revision or
delivery list, a granted entry that is not a delivery task of the scope, a
revocation whose `resumable` does not match its reason, acceptance evidence
outside an `ACCEPTED` scope or without its run, head and criteria, a closed
reference with only one of `autopilotRun`/`finalCommit`.

## Tests

`test/workflow-plan-authorization.test.mjs`: the grant and its round trip;
every refusal of authorize; manual criteria; another run; narrowing and
widening; settings-off, resume, user-stop and a new run; delivery
confirmations; acceptance by the run, its refusals and stray evidence;
close by the run and after a manual acceptance; a new round drops the
evidence; carryover drops the grant.
