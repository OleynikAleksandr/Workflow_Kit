import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// The workflow pause: it takes effect before the next micro-task.
const build = await buildWorkflowModules(
  ["workflow-autopilot"],
  "workflow-autopilot-pause"
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

  // With nothing in progress the pause comes after the turn reasons and
  // before every scope reason.
  const paused = autopilot.decide(on, status({ paused: true }), turn());
  assert.deepEqual(paused, {
    action: "stop",
    detail:
      "The workflow is paused; the autopilot waits for the user to continue.",
    reason: "paused",
  });
  assert.equal(
    reason(on, status({ paused: true }), turn({ outcome: "error" })),
    "turn-error"
  );
  assert.equal(
    reason(on, status({ paused: true }), turn({ userMessage: true })),
    "user-message"
  );
  for (const extra of [
    { proposalPending: true },
    { scope: "NONE" },
    { scope: "BLOCKED" },
    { transactionPending: true },
    { delivery: "READY_FOR_ACCEPTANCE" },
    { nextTask: null },
  ]) {
    assert.equal(
      reason(on, status({ ...extra, paused: true }), turn()),
      "paused"
    );
  }
  // The task in progress finishes: the pause waits for the next task.
  const finishing = autopilot.decide(
    on,
    status({
      nextTask: { id: "T008", kind: "work", status: "IN_PROGRESS", title: "x" },
      paused: true,
    }),
    turn()
  );
  assert.equal(finishing.action, "continue");
  assert.match(finishing.text, /commit --task T008/u);
  assert.equal(
    reason(
      on,
      status({
        nextTask: {
          id: "T008",
          kind: "work",
          status: "IN_PROGRESS",
          title: "x",
        },
        paused: true,
        transactionPending: true,
      }),
      turn()
    ),
    "transaction-pending"
  );
  assert.equal(
    autopilot.decide(on, status({ paused: false }), turn()).action,
    "continue"
  );

  // The pause holds back only new work: handing out and a QUALITY task
  // that has not started; integration, cleanup and started main tasks go on.
  const pausedRun = (orchestration, extra = {}) =>
    decide(orchestrated(orchestration, { ...extra, paused: true }));
  assert.equal(pausedRun({ readyTasks: ["B"] }).reason, "paused");
  assert.equal(
    pausedRun({
      assignments: [record("x-A-1", "A", "RUNNING")],
      readyTasks: ["B"],
    }).reason,
    "paused"
  );
  assert.equal(
    pausedRun(
      { readyTasks: ["B"] },
      { nextTask: { id: "Q", kind: "quality", status: "TODO", title: "Q" } }
    ).reason,
    "paused"
  );
  assert.match(
    pausedRun({
      integration: { assignmentId: "x-A-1", phase: "CONFLICT", taskId: "A" },
      readyTasks: ["B"],
    }).text,
    /integration:continue --id x-A-1/u
  );
  assert.match(
    pausedRun({
      assignments: [record("x-A-1", "A", "READY_FOR_INTEGRATION")],
      readyTasks: ["B"],
    }).text,
    /integration:start --id x-A-1/u
  );
  assert.match(
    pausedRun({
      assignments: [
        record("x-A-1", "A", "INTEGRATED", { cleanupPending: true }),
      ],
      readyTasks: ["B"],
    }).text,
    /assignment:cleanup --id x-A-1/u
  );
  for (const kind of ["quality", "delivery"]) {
    assert.match(
      pausedRun(
        { readyTasks: ["B"] },
        { nextTask: { id: "M", kind, status: "IN_PROGRESS", title: "M" } }
      ).text,
      /commit --task M/u
    );
  }
  assert.equal(
    typeof pausedRun({ readyTasks: ["B"] }).orchestrationKey,
    "string"
  );
} finally {
  await build.cleanup();
}
