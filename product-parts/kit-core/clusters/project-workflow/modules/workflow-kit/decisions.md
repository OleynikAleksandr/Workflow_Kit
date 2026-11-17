# Workflow Kit: user decisions (Kit 2.4.0, spec M40)

Part of the [module contract](module.md). Specification:
[M40](../../../../../../docs/planning/M40-user-decisions.md), contract of the
decision request:
[M40 contract](../../../../../../docs/planning/M40-user-decisions-contract.md).

## Mode

`config.decisions` (`workflow-quality`): `"host"` or `"agent"`; an absent key
is `agent`. `decisionsMode(root)` and `status.decisionsMode` return it. In
the `agent` mode every command below behaves as in Kit 2.3.3 and
`--decision` is `USAGE`.

In the `host` mode a user decision is written to the plan only by a host
operation with a ticket of the parent (`wfk-host/1`, `kit-host-auth.ts`).
The manual form of a decision command changes nothing, registers a decision
request and fails with `USER_DECISION_REQUIRED` (`details.decision` is the
request view).

| Decision (`kind`) | Command | Asked when |
| --- | --- | --- |
| `choose` | `scope:choose --generation --option --session [--expected-digest]` | always |
| `confirm-delivery` | `task:start <ID>` | the task is a TODO delivery no live grant covers |
| `accept` | `accept` | always (`--autopilot-run` keeps the M39 host form) |
| `close` | `close --scope <id>` | always (`--autopilot-run` keeps the M39 host form) |
| `unblock` | `task:unblock` | always |
| `approve-install` | `quality:apply --input <file>` | the input has a non-empty `install` |

Work, docs and quality tasks, `task:block`, a profile without installs and
every other command need no decision.

## Request (`kit-decisions.ts`)

```
{ id: "dec-<12 hex>", kind, scopeId | null, taskId | null,
  proposal: { digest, generation } | null, params, inputDigest,
  revision, createdAt, state: "pending" | "applied" | "stale" }
```

`inputDigest` is `hostDigest({ kind, params, proposal, scopeId, taskId })`.
`params` by kind: `choose` — `option`, `session` (`proposal` is the current
generation and `scope:proposal --digest`, `scopeId` is null); `confirm-delivery`
— `taskDigest` (title, files, checks, acceptance, dependencies); `accept` —
`head`, `result`; `close` — `head`; `unblock` — `reasonDigest`;
`approve-install` — `install` (the exact commands), `profileDigest` (the
input without `approval`), `configDigest` (the current quality profile).

- `subjectOf(context, choice)` computes the request from the current state
  and runs the preconditions of the operation itself: a decision that cannot
  be applied now fails with the error of the operation (`NOT_READY`,
  `NOT_ACCEPTED`, `SCOPE_NOT_BLOCKED`, `PROPOSAL_CHANGED`, `TASK_NOT_TODO`,
  `DEPENDENCY_PENDING`, …) and no request is registered.
- `requireDecision(context, choice)` registers under the Kit lock. The same
  subject keeps its `id`; another subject of the same kind, scope and task
  replaces the request and the earlier one becomes `stale`.
- The registry is `.harness/workflow/local/decisions.json` (not in git,
  written atomically): the pending requests and the last 50 closed ones. With
  each request Kit stores the `choice` it is recomputed from; for
  `approve-install` this is the whole `quality:apply` input.
- `pendingDecisions(context)` (`status.decisions`) recomputes every pending
  request and lists only those whose digest still matches; the view is built
  from the recomputed subject, so a record edited or planted in the file
  shows neither other data nor a request the state does not ask for. Empty
  in the `agent` mode.

## Host operation (`kit-cli-decisions.ts`, `kit-decision-apply.ts`)

```
<command> --decision <id> --source button|message|grant --note "<text>"
          --expected-revision N [--message-id <id>] [--decision-session <id>]
          [--autopilot-run <run>]
```

`decisionGate` runs before the command. The `HostRequest` of the ticket:
`operation` (the command), `decisionId`, `expectedRevision`, `root` (real
path), `scopeId` (`"NONE"` before the scope exists), `ownerSession` (of the
scope grant, else null), `runId` (null unless the source is `grant`) and
`inputDigest = hostDigest({ decision: <request inputDigest>, note, source })`.
The parent compares every field; the root comparison is the service's
`sameRoot` (case, slashes and 8.3 names on Windows). Refusals before the
ticket: `USAGE` (no `--expected-revision`, an unknown source,
`--autopilot-run` without `--source grant` or the reverse, a request of
another kind), `DECISION_UNKNOWN`; without a parent channel
`HOST_AUTH_REQUIRED`, a refused ticket `HOST_AUTH_INVALID`.

`applyDecision(root, id, { expectedRevision, note, source })`:

1. An applied request, or a decision the plan history already holds
   (`scope.decisions[].decisionId`, `lastClosed.decision`), returns
   `{ already: true, decisionId, kind, result }` and writes nothing.
2. The request is recomputed; a stale, replaced or planted one fails with
   `DECISION_STALE` and is marked `stale`. Then `REVISION_MISMATCH`.
3. A `grant` source (the advance instruction of an autopilot run, M40
   contract §5) decides only `choose` (no scope yet: the host checks its
   run) and `confirm-delivery` of a task the live grant covers
   (`AUTOPILOT_UNAUTHORIZED`, `AUTOPILOT_REVOKED`, `AUTOPILOT_PLAN_CHANGED`
   of M39); any other kind is `AUTOPILOT_UNAUTHORIZED`. Acceptance and close
   of a run keep `accept|close --autopilot-run` with their evidence.
4. The operation runs with the note as the user's words (`accept --note`,
   the delivery confirmation, the close note, the install `approval`; a note
   shorter than 10 characters is extended with the decision id) and records
   `{ at, text, decisionId, kind, source }` in `scope.decisions`
   (`lastClosed.decision` for `close`). `quality:apply --decision` applies
   the stored input, not the file.

`source`: `{ kind: "button" | "message", messageId, session, runId: null }`
for a decision the user takes now, `{ kind: "grant", runId, authorization }`
for a run (`authorization` is the sha256 of the scope grant, null for
`choose`).

## Grant decisions without a request

- `task:start <ID>` without flags in the `host` mode starts a delivery task
  the live grant of the scope covers (`coveringRun`) and records the
  confirmation of M39 and a `confirm-delivery` decision with the source
  `grant`. `--autopilot-run <run>` stays valid in both modes and records the
  same decision.
- `accept --autopilot-run` and `close --autopilot-run` (M39, host only)
  record `accept` and `close` decisions with the source `grant`.

## OS behaviour

The same on macOS, Linux and Windows: Node IPC of the parent, JSON files and
sha256 digests; no OS program is called. The ticket root is the real path
the Kit resolved; comparing it is the parent's job (`sameRoot` with the
platform as a parameter). Tests use injected `win32` and `linux` comparisons
with paths that exist on no host and a real fork of the CLI on every OS.
