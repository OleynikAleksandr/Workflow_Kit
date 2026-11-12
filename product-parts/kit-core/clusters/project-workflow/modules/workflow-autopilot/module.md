# Workflow Autopilot Module

## Responsibility

The pure decision whether the host continues the workflow with another
turn after a turn ends. It keeps the rule "one task, one commit, one turn"
without making the user type "Continue" after every task. Running the
decision (state per session, sending turns, events) belongs to Core.

## Public Facade

`WorkflowAutopilotFacade` (class, singleton `workflowAutopilotFacade`).

## Contract

- `initialState(maxContinues = 40, enabled = true)` →
  `{enabled, continues, maxContinues, orchestrationKey: null}`; the
  autopilot is on by default, `enabled = false` turns it off.
- `decide(state, status, turn)`:
  - `status` — the project after the turn: `{scope ACTIVE|BLOCKED|NONE,
    blockedReason, delivery, transactionPending, nextTask {id, kind,
    status, title} | null, revision, head}` plus three optional fields (a
    status without them decides as before):
    - `paused` — the user paused the workflow (Kit `pause:set --on`): the
      current micro-task finishes, the next one does not start;
    - `proposalPending` — a scope proposal waits for the mode choice;
    - `orchestration` — `null`/absent in a sequential scope, else the
      orchestrated scope seen from main: `assignments` (active ones and
      `INTEGRATED` ones whose cleanup is pending: `{id, taskId, status,
      sourceCommit, cleanupPending}`), `integration` (`{assignmentId,
      taskId, phase}` of the integration journal, fields may be `null`, or
      `null`) and `readyTasks` (task ids the scheduler hands out now);
  - `turn` — `{outcome completed|error|cancelled, userMessage, before
    {revision, head}}`;
  - result `{action: "continue", taskId, text}` or
    `{action: "stop", reason, detail}`.
- Stop reasons, checked in this order:
  1. `disabled` — autopilot is off for the session;
  2. `turn-error` — the turn failed or was cancelled;
  3. `user-message` — the user wrote; the autopilot yields;
  4. `paused` — in a sequential scope when `paused` is true and the focus
     task is not `IN_PROGRESS` (a task in progress continues as usual);
     an orchestrated scope applies the pause per step (below);
  5. `waiting-for-mode-choice` — `proposalPending`;
  6. `no-scope`;
  7. `blocked` — the scope is blocked (detail is the reason);
  8. `transaction-pending` — unfinished transaction or failed check;
  9. `ready-for-acceptance` — `READY_FOR_ACCEPTANCE` or `ACCEPTED`;
  then a sequential scope:
  10. `blocked` — no task is ready;
  11. `delivery-confirmation` — the next task is a `delivery` task that has
     not started;
  12. `no-progress` — plan revision and HEAD did not change;
  13. `limit` — `continues` reached `maxContinues`.
- An orchestrated scope (`orchestration` set; spec 10.3) continues the
  orchestrator for the first of:
  1. an integration journal — `CONFLICT`: resolve the conflicts within the
     task files, `CHECKS_FAILED`: fix the cause, any other phase: retry;
     each names `scripts/workflow integration:continue --id <id>`;
  2. a `READY_FOR_INTEGRATION` assignment — verify the commit and run
     `scripts/workflow integration:start --id <id> --source <sha>`;
  3. a next task `quality`, or a started `delivery` task — the sequential
     continue text (the orchestrator runs them in main);
  4. `readyTasks` — hand them out with
     `scripts/workflow assignment:create --task <ID>` and start an executor
     subagent in its own worktree with the printed brief (the decision's
     `taskId` is the first ready task);
  5. a pending cleanup — `scripts/workflow assignment:cleanup --id <id>`.
  A pause (`paused`) holds back only the steps that start work: handing
  out `readyTasks` and a `quality` task that is still `TODO`. Integration,
  `READY_FOR_INTEGRATION`, cleanup and a started `quality`/`delivery` task
  continue; with no such step the decision stops with `paused` (before
  `waiting-for-executors`).
  Without such a step it stops with `waiting-for-executors` when an
  assignment is `ASSIGNED`, `NEEDS_SETUP`, `READY` or `RUNNING` (detail
  lists `<task> (<status>)`), else `delivery-confirmation` for a delivery
  task that has not started, else `blocked` ("No task can be handed out
  now."). A continue is still refused with `no-progress` when plan
  revision, HEAD and the orchestration key are all unchanged, and with
  `limit`. Every orchestrated decision carries `orchestrationKey`, a stable
  text of the assignments (id, status, source, cleanup), the integration
  and the ready tasks; `advance` stores it in the state (a decision without
  it clears it), so a turn that only creates assignments counts as progress.
- Continue text: `Continue the workflow: run \`scripts/workflow task:start
  <ID>\` if it is not started, then implement it and commit.`; for a task in
  progress it names `scripts/workflow commit --task <ID>`.
- `advance(state, decision)` counts a continue and resets the counter on
  `user-message`.
- `message(decision, packet)` — the user turn the host sends: the
  instruction plus the fresh packet inside `<workflow-recovery>` tags.

## Dependencies

None. Node built-ins only.

## Tests

`test/workflow-autopilot-pause.test.mjs` — the pause: after the turn
reasons and before the scope reasons when nothing is in progress, a task in
progress continues, per step in an orchestrated scope (hand-out and an
unstarted QUALITY held back; integration, `READY_FOR_INTEGRATION`, cleanup
and started main tasks continue).

`test/workflow-autopilot-decision.test.mjs` — on by default, every stop
reason, both
continue texts, a started delivery task, counters, the turn message; the
pending proposal; the orchestration matrix: integration phases, ready for
integration, QUALITY and a started delivery in main, handing out (one and
several tasks, beside running executors), pending cleanup, waiting for each
working status, delivery confirmation and blocked, the order of earlier
stops, and progress through the orchestration key (no progress, a new
assignment, a new HEAD, limit, the key kept by a stop and cleared by a
sequential decision).
