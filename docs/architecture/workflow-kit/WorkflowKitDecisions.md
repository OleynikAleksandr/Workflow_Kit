# Workflow Kit: user decisions and barriers (Kit 2.4.0–2.4.4, M40)

Command reference of the M40 additions to `scripts/workflow`. It complements
[WorkflowKitCommands.md](WorkflowKitCommands.md); the exact contracts live in
the module documents of `workflow-kit`:
[decisions.md](../../../product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/decisions.md)
(requests and host operations) and
[barriers.md](../../../product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/barriers.md)
(push, external commits, task files, input files). Specification —
[M40](../../planning/M40-user-decisions.md),
[contract](../../planning/M40-user-decisions-contract.md).

## Decisions mode

- `install --decisions host` writes `"decisions": "host"` to
  `.harness/workflow/config.json`; the Workflow Kit app passes it when it
  creates a project and on «Обновить Kit» to Kit 2.4.0+. Without the key the
  mode is `agent`: every command behaves as in Kit 2.3.3.
- `status` reports `decisionsMode` and `decisions` — the `pending` decision
  requests that Kit recomputes from the current state on every read (a stale
  or planted record is not listed).

## Decision commands in the `host` mode

`scope:choose`, `task:start <ID>` of a delivery task, `accept`, `close`,
`task:unblock`, `quality:apply` with installs and the new `commits:adopt`
change the plan only as a host operation with a ticket:

```
<command> --decision <id> --source button|message|grant --note "<text>"
          --expected-revision N [--message-id <id>] [--decision-session <id>]
          [--autopilot-run <run>]
```

Without a ticket the command changes nothing, answers
`USER_DECISION_REQUIRED` with `details.decision` (`id`, `kind`, `params`,
`inputDigest`) and registers the request; the panel shows its card. The
same input returns the same `id`; another input of the same kind and target
replaces the request (the old one becomes `stale`). Errors of the host
operation: `DECISION_UNKNOWN`, `DECISION_STALE` (the request no longer
recomputes to the shown digest), `REVISION_MISMATCH`, `HOST_AUTH_REQUIRED`
(no parent channel), `HOST_AUTH_INVALID`, and the M39 refusals of a grant
(`AUTOPILOT_UNAUTHORIZED`, `AUTOPILOT_REVOKED`). A repeated applied
`decisionId` returns `already: true`. `quality:apply --decision` applies the
input stored with the request, not the file.

A live autopilot grant of the scope covers its delivery tasks:
`task:start <ID>` without flags starts such a task and records the
confirmation with the source `grant`; `--autopilot-run` stays accepted.

## Barriers (both modes)

| Code | Command | Meaning |
| --- | --- | --- |
| `PUBLISH_SCOPE_OPEN` | `pre-push` hook | a push to the publication branch while a scope is open (the target ref of every pushed line counts) |
| `CI_PUSH_NOT_ALLOWED` | `pre-push` hook | a push to the CI branch outside its delivery (`automation.ci.task`) or before every task is DONE |
| `EXTERNAL_COMMITS` | `task:start`, `commit`, `accept`, `close` | commits after the scope baseline without the `Workflow-Transaction` trailer; `commits:adopt` lifts it (in `agent`: `--commits <sha,…> --note`) |
| `NO_EXTERNAL_COMMITS`, `ADOPT_NOTE` | `commits:adopt` | nothing to adopt; the note is missing (`agent`) |
| `TASK_FILES_OUTSIDE` | `commit --task` | changed files outside the task's `files`; widen the task with `task:update <ID>` or revert them |
| `INPUT_LOCATION` | every `--input`, `commit --digest` | a file inside the project but outside `.harness/inputs/` |

`automation.ci.task` (optional) names the delivery task that pushes the CI
branch; `scope:proposal` reports the `automation` block (Kit 2.4.4).

## Agent instructions

In the `host` mode the managed `AGENTS.md` section and the recovery packet
give the agent no decision forms (`--confirmed`, `--autopilot-run`,
`accept --note`, `close --note`, `task:unblock`): a decision the user took in
the chat is `wfk decision <kind>` of the service. Texts of both modes —
[agent-rules-modes.md](../../../product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/agent-rules-modes.md).

## OS behaviour

The same on macOS, Linux and Windows (x64 and ARM64): JSON, sha256 and Node
IPC. The parent compares the ticket root with `sameRoot` (case, `\` and `/`,
8.3 names on Windows); the `pre-push` hook strips `\r` from its stdin; the
task and input file checks compare paths with `realpathSync.native` and the
`path` helpers of the injected platform.
