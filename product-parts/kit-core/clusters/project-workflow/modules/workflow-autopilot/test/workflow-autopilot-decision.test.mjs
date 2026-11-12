import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-autopilot"],
  "workflow-autopilot-decision"
);
try {
  const { WorkflowAutopilotFacade } = await build.load(
    "workflow-autopilot",
    "workflow-autopilot-facade.js"
  );
  const autopilot = new WorkflowAutopilotFacade();
  const on = autopilot.initialState(3, true);
  const status = (extra = {}) => ({
    blockedReason: null,
    delivery: "IN_PROGRESS",
    head: "h2",
    nextTask: { id: "T008", kind: "work", status: "TODO", title: "Next" },
    revision: 5,
    scope: "ACTIVE",
    transactionPending: false,
    ...extra,
  });
  const turn = (extra = {}) => ({
    before: { head: "h1", revision: 4 },
    outcome: "completed",
    userMessage: false,
    ...extra,
  });
  const reason = (state, s, t) => autopilot.decide(state, s, t).reason;

  // On by default; an explicit off stops first.
  assert.equal(autopilot.initialState().enabled, true);
  assert.equal(autopilot.initialState().maxContinues, 40);
  assert.equal(
    autopilot.decide(autopilot.initialState(), status(), turn()).action,
    "continue"
  );
  assert.equal(
    reason(autopilot.initialState(40, false), status(), turn()),
    "disabled"
  );
  assert.equal(
    reason(autopilot.initialState(40, false), status({ paused: true }), turn()),
    "disabled"
  );
  assert.equal(reason(on, status(), turn({ outcome: "error" })), "turn-error");
  assert.equal(
    reason(on, status(), turn({ outcome: "cancelled" })),
    "turn-error"
  );
  assert.equal(
    reason(on, status(), turn({ userMessage: true })),
    "user-message"
  );
  assert.equal(reason(on, status({ scope: "NONE" }), turn()), "no-scope");
  const blocked = autopilot.decide(
    on,
    status({ blockedReason: "needs input", scope: "BLOCKED" }),
    turn()
  );
  assert.deepEqual(blocked, {
    action: "stop",
    detail: "needs input",
    reason: "blocked",
  });
  assert.equal(
    reason(on, status({ transactionPending: true }), turn()),
    "transaction-pending"
  );
  assert.equal(
    reason(on, status({ delivery: "READY_FOR_ACCEPTANCE" }), turn()),
    "ready-for-acceptance"
  );
  assert.equal(
    reason(on, status({ delivery: "ACCEPTED" }), turn()),
    "ready-for-acceptance"
  );
  assert.equal(reason(on, status({ nextTask: null }), turn()), "blocked");
  assert.equal(
    reason(
      on,
      status({
        nextTask: { id: "T9", kind: "delivery", status: "TODO", title: "Ship" },
      }),
      turn()
    ),
    "delivery-confirmation"
  );
  assert.equal(
    reason(on, status({ head: "h1", revision: 4 }), turn()),
    "no-progress"
  );
  assert.equal(reason({ ...on, continues: 3 }, status(), turn()), "limit");

  // Continue: instruction text, counter and message with a fresh packet.
  const go = autopilot.decide(on, status(), turn());
  assert.deepEqual(go, {
    action: "continue",
    taskId: "T008",
    text: "Continue the workflow: run `scripts/workflow task:start T008` if it is not started, then implement it and commit.",
  });
  const started = autopilot.decide(
    on,
    status({
      nextTask: {
        id: "T008",
        kind: "work",
        status: "IN_PROGRESS",
        title: "Next",
      },
    }),
    turn()
  );
  assert.match(
    started.text,
    /task T008 is in progress; implement it and commit with `scripts\/workflow commit --task T008`/u
  );
  // A delivery task already started by the user continues normally.
  assert.equal(
    autopilot.decide(
      on,
      status({
        nextTask: {
          id: "T9",
          kind: "delivery",
          status: "IN_PROGRESS",
          title: "Ship",
        },
      }),
      turn()
    ).action,
    "continue"
  );
  const after = autopilot.advance(on, go);
  assert.equal(after.continues, 1);
  assert.equal(
    autopilot.advance(
      after,
      autopilot.decide(after, status(), turn({ userMessage: true }))
    ).continues,
    0
  );
  assert.equal(
    autopilot.advance(
      after,
      autopilot.decide(after, status({ scope: "NONE" }), turn())
    ).continues,
    1
  );
  assert.equal(
    autopilot.message(go, "# Workflow recovery packet\n"),
    `${go.text}\n\n<workflow-recovery>\n# Workflow recovery packet\n</workflow-recovery>\n`
  );
  assert.equal(autopilot.message(go, null), `${go.text}\n`);

  // A pending scope proposal waits for the user's mode choice.
  assert.equal(autopilot.initialState().orchestrationKey, null);
  assert.equal(
    reason(on, status({ proposalPending: true, scope: "NONE" }), turn()),
    "waiting-for-mode-choice"
  );
  assert.equal(
    reason(on, status({ proposalPending: false, scope: "NONE" }), turn()),
    "no-scope"
  );
  // Sequential statuses (orchestration null) decide exactly as before.
  assert.deepEqual(
    autopilot.decide(on, status({ orchestration: null }), turn()),
    go
  );

  // --- Orchestrated scope: the orchestrator in main. ---
  const record = (id, task, state, extra = {}) => ({
    cleanupPending: false,
    id,
    sourceCommit: null,
    status: state,
    taskId: task,
    ...extra,
  });
  const orchestrated = (orchestration, extra = {}) =>
    status({
      nextTask: { id: "A", kind: "work", status: "TODO", title: "Module A" },
      orchestration: {
        assignments: [],
        integration: null,
        readyTasks: [],
        ...orchestration,
      },
      ...extra,
    });
  const decide = (s, state = on, t = turn()) => autopilot.decide(state, s, t);

  // An integration needs the orchestrator first, by phase.
  const conflict = decide(
    orchestrated({
      assignments: [record("x-A-1", "A", "READY_FOR_INTEGRATION")],
      integration: { assignmentId: "x-A-1", phase: "CONFLICT", taskId: "A" },
      readyTasks: ["B"],
    })
  );
  assert.equal(conflict.action, "continue");
  assert.equal(conflict.taskId, "A");
  assert.match(
    conflict.text,
    /merge conflicts; resolve them within the task files, then run `scripts\/workflow integration:continue --id x-A-1`/u
  );
  assert.equal(typeof conflict.orchestrationKey, "string");
  assert.match(
    decide(
      orchestrated({
        integration: {
          assignmentId: "x-A-1",
          phase: "CHECKS_FAILED",
          taskId: "A",
        },
      })
    ).text,
    /checks of task A \(assignment x-A-1\) failed on the merged result/u
  );
  assert.match(
    decide(
      orchestrated({
        integration: { assignmentId: null, phase: null, taskId: null },
      })
    ).text,
    /unfinished \(unknown phase\); run `scripts\/workflow integration:continue --id <assignment>`/u
  );

  // READY_FOR_INTEGRATION: integrate the reported source.
  const ready = decide(
    orchestrated({
      assignments: [
        record("x-B-1", "B", "RUNNING"),
        record("x-A-1", "A", "READY_FOR_INTEGRATION", {
          sourceCommit: "abc123",
        }),
      ],
      readyTasks: ["C"],
    })
  );
  assert.equal(ready.action, "continue");
  assert.equal(ready.taskId, "A");
  assert.match(
    ready.text,
    /assignment x-A-1 of task A is READY_FOR_INTEGRATION; .*`scripts\/workflow integration:start --id x-A-1 --source abc123`/u
  );

  // QUALITY and a started delivery run in main with the usual text.
  const quality = decide(
    orchestrated(
      {},
      {
        nextTask: {
          id: "QUALITY",
          kind: "quality",
          status: "TODO",
          title: "Quality",
        },
      }
    )
  );
  assert.equal(quality.action, "continue");
  assert.match(quality.text, /task:start QUALITY/u);
  assert.equal(
    decide(
      orchestrated(
        {},
        {
          nextTask: {
            id: "SHIP",
            kind: "delivery",
            status: "IN_PROGRESS",
            title: "Ship",
          },
        }
      )
    ).taskId,
    "SHIP"
  );

  // Ready tasks are handed out, also while other executors work.
  const handOut = decide(
    orchestrated({
      assignments: [record("x-A-1", "A", "RUNNING")],
      readyTasks: ["B", "C"],
    })
  );
  assert.equal(handOut.action, "continue");
  assert.equal(handOut.taskId, "B");
  assert.match(
    handOut.text,
    /tasks B, C can be handed out; for each run `scripts\/workflow assignment:create --task <ID>` and start an executor subagent/u
  );
  assert.match(
    decide(orchestrated({ readyTasks: ["B"] })).text,
    /task B can be handed out/u
  );

  // A pending cleanup is the orchestrator's.
  const cleanup = decide(
    orchestrated({
      assignments: [
        record("x-A-1", "A", "INTEGRATED", { cleanupPending: true }),
        record("x-B-1", "B", "RUNNING"),
      ],
    })
  );
  assert.equal(cleanup.action, "continue");
  assert.match(
    cleanup.text,
    /`scripts\/workflow assignment:cleanup --id x-A-1`/u
  );

  // Executors working and nothing for the orchestrator: stop and wait.
  for (const state of ["ASSIGNED", "NEEDS_SETUP", "READY", "RUNNING"]) {
    const waiting = decide(
      orchestrated({ assignments: [record("x-A-1", "A", state)] })
    );
    assert.equal(waiting.action, "stop");
    assert.equal(waiting.reason, "waiting-for-executors");
    assert.match(waiting.detail, new RegExp(`A \\(${state}\\)`, "u"));
  }
  // Nothing at all: delivery confirmation or blocked.
  assert.equal(
    decide(
      orchestrated(
        {},
        {
          nextTask: {
            id: "SHIP",
            kind: "delivery",
            status: "TODO",
            title: "Ship",
          },
        }
      )
    ).reason,
    "delivery-confirmation"
  );
  assert.equal(decide(orchestrated({})).reason, "blocked");
  assert.equal(decide(orchestrated({}, { nextTask: null })).reason, "blocked");
  // Earlier stops keep their order.
  assert.equal(
    decide(orchestrated({ readyTasks: ["B"] }, { transactionPending: true }))
      .reason,
    "transaction-pending"
  );
  assert.equal(
    decide(orchestrated({ readyTasks: ["B"] }, { scope: "BLOCKED" })).reason,
    "blocked"
  );
  assert.equal(
    decide(orchestrated({ readyTasks: ["B"] }), on, turn({ userMessage: true }))
      .reason,
    "user-message"
  );

  // Progress: the assignments count as progress, not only plan and HEAD.
  const still = turn({ before: { head: "h2", revision: 5 } });
  const handing = orchestrated({ readyTasks: ["B", "C"] });
  const first = decide(handing, on, still);
  assert.equal(first.action, "continue");
  const kept = autopilot.advance(on, first);
  assert.equal(kept.orchestrationKey, first.orchestrationKey);
  assert.equal(kept.continues, 1);
  // The same orchestration after a turn without plan or HEAD change.
  assert.equal(decide(handing, kept, still).reason, "no-progress");
  // An assignment created in the turn is progress.
  const created = orchestrated({
    assignments: [record("x-B-1", "B", "ASSIGNED")],
    readyTasks: ["C"],
  });
  assert.equal(decide(created, kept, still).action, "continue");
  // A new HEAD is progress even with the same orchestration.
  assert.equal(decide(handing, kept, turn()).action, "continue");
  assert.equal(
    decide(handing, { ...kept, continues: 3 }, turn()).reason,
    "limit"
  );
  // A stop keeps the key; a sequential decision clears it.
  const waitingStop = decide(
    orchestrated({ assignments: [record("x-A-1", "A", "RUNNING")] })
  );
  assert.equal(
    autopilot.advance(kept, waitingStop).orchestrationKey,
    waitingStop.orchestrationKey
  );
  assert.equal(autopilot.advance(kept, go).orchestrationKey, null);
} finally {
  await build.cleanup();
}
