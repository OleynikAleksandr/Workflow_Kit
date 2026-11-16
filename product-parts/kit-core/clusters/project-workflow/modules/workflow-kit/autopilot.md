# Workflow Kit Module — Autopilot Authority

The host-only autopilot operations of the [Workflow Kit module](module.md)
(spec M39 `docs/planning/M39-autopiloting-kit.md`, section 4; Kit 2.3.1):
`kit-host-auth.ts`, `kit-autopilot.ts`, `kit-cli-autopilot.ts`,
`kit-autopilot-status.ts`. The plan transitions are in
`workflow-plan/authorization.md`.

## Host authority (`kit-host-auth.ts`)

`autopilot:authorize`, `autopilot:revoke`, `accept --autopilot-run` and
`close --autopilot-run` write only after the direct parent of the Kit
process confirmed the one-time ticket of the operation over the Node IPC
channel of `child_process.fork` (the app's `KitRunner.runHost`). There is no
verifier address, socket file, flag or environment variable; a process
without the channel is refused.

- `HostRequest` — what the ticket is bound to: `{operation, root (realpath),
  runId, scopeId, ownerSession, expectedRevision, inputDigest}`;
  `inputDigest` is `hostDigest` (sha256 of the canonical JSON, sorted keys)
  of the operation input: the authorize file, `{runId, reason, note}`, the
  evidence file, `{runId, scopeId}`.
- `verifyHost(channel, request, timeoutMs = 10 000)`, protocol
  `wfk-host/1`, one request id per call:
  1. child → `{type: "wfk-host-hello", requestId, operation}`;
  2. parent → `{type: "wfk-host-ticket", requestId, ticket}`;
  3. child → `{type: "wfk-host-verify", requestId, ticket, payload,
     payloadDigest}`;
  4. parent → `{type: "wfk-host-verdict", requestId, ok, reason?}`.
  Messages of another request id or protocol and a verdict before the
  ticket are ignored. No channel: `HOST_AUTH_REQUIRED` before anything
  else. A refusal, a disconnect or no answer in time: `HOST_AUTH_INVALID`
  (`details.reason`). Nothing is written in either case.
- `processHostChannel()` — the channel of this process when it was forked
  with one and is connected, else `null`. The command line passes it as
  `CliIo.host`; a forked Kit disconnects after the command so the process
  exits. The ticket is never printed, logged or put into an environment.
- After the verdict the operation re-checks under the project lock that the
  plan is still at `expectedRevision` (`REVISION_MISMATCH`), so the
  verified state is the written one. This guards the workflow against an
  agent confirming itself through a public command; it is not isolation
  from a malicious process with full access to the OS account.

## Operations (`kit-autopilot.ts`, facade in `kit-facade-base.ts`)

All run under the project lock and refuse an unfinished transaction.

- `authorize(root, input, expectedRevision)` → `GrantResult {changed,
  commit, grant, revision}`: the plan transition `authorize`; a change is a
  Kit commit with the role `authorization` (`chore: authorize autopilot run
  <id>`), unless a task is in progress — then the plan is saved and the task
  commit records it, like `task:block`, and `commit` is `null`.
- `revoke(root, {runId, reason, note}, expectedRevision)` — the same way
  (`chore: revoke autopilot run <id> (<reason>)`).
- `acceptRun(root, runId, input, expectedRevision)` — the live grant, then
  the evidence (`AcceptanceInput {head, criteria, ci}`, gathered by the
  host) against the plan and the Kit's own records, else
  `AUTOPILOT_EVIDENCE_REQUIRED`:
  - `head` is the current HEAD;
  - every check of every automatic criterion has an entry `{id, commit}`
    whose commit is on the history of HEAD and whose verification record
    (`workflow-quality` `readEvidence(<commit>)`) has that id `passed`;
  - every evidence file of the criterion is named and tracked at HEAD;
  - with `automation.ci`: every required check is listed, `sha` is a commit
    on the history of HEAD, and with `exactSha` only documentation and the
    plan changed between `sha` and HEAD.
  Then the plan transition `acceptByAutopilot` and a commit with the role
  `acceptance` (`chore: accept scope <id> (autopilot run <id>)`).
- `closeRun(root, scopeId, runId, expectedRevision)` — a clean tree
  (`ensureCleanTree` of `kit-scope.ts`, `DIRTY_TREE`), then
  `closeByAutopilot` with HEAD as `finalCommit`, a commit with the role
  `close` (`chore: close scope <id> (autopilot run <id>)`), the proposal
  record cleared.
- `startTask(root, taskId, null, runId)` — `task:start <ID>
  --autopilot-run <id>` for a delivery task: the confirmation is
  `deliveryConfirmation` of the live grant. Not host-only: it only uses
  authority the host already granted. With `--confirmed` or for another
  task kind it is `USAGE`.

## Command line (`kit-cli-autopilot.ts`)

`AUTOPILOT_COMMANDS` (`autopilot:authorize --input <file.json>
--expected-revision N`, `autopilot:revoke --run <id> --reason
settings-off|user-stop --note "<why>" --expected-revision N`) and the hosts
`acceptHost`/`closeHost` of the `accept`/`close` specs return a `HostedRun
{request, run}`; `dispatch` of `workflow-kit-cli.ts` awaits `verifyHost`
and only then runs and prints it, so `runCli` returns a promise for these
forms. `--expected-revision` is required (`USAGE`). `accept`/`close` with
both `--note` and `--autopilot-run` is `USAGE`; without `--autopilot-run`
they keep the manual form.

## Status (`kit-autopilot-status.ts`)

`autopilotStatus(root)` (`autopilot:status`) is the decision input plus:
`capability {automation, authorization, complete: false, hostProtocol
"wfk-host/1"}` (`complete` arrives with T004), `proposal` (the reviewed
proposal reference or `null`), `authorization` (the grant or `null`) and
`acceptance` (`null` on a legacy plan, else every criterion with `kind`,
`checks`, `evidence` and `evidenceMissing` — evidence not tracked at HEAD).
The decision of `workflow-autopilot` is unchanged in T002.

## Tests

- `test/workflow-kit-autopilot-grant.test.mjs` (fixtures in
  `test/workflow-kit-autopilot-support.mjs`) — the status facts, stale
  revision and digest, authorize as a commit and idempotent, settings-off
  and resume, a revoke saved during a task, the delivery start by the grant
  and its refusals, every evidence refusal (another head, no record,
  missing or unknown CI, a functional change after CI, unnamed evidence,
  another run, a stale revision), the automatic acceptance and recovery
  lines, the close with a dirty tree and the final commit, a final
  user-stop.
- `test/workflow-kit-host-ipc.test.mjs` — `verifyHost` with a fake parent
  (verdict, refusal, foreign request id, a verdict before the ticket,
  disconnect, timeout), every host command in process (`HOST_AUTH_REQUIRED`,
  `USAGE`, nothing written), and a real `fork` of the compiled CLI: a
  refused binding, a parent disconnect, a run without the channel despite
  `WFK_HOST`/ticket variables, the honest parent with every bound field, the
  ticket absent from the output, a stale revision afterwards.
