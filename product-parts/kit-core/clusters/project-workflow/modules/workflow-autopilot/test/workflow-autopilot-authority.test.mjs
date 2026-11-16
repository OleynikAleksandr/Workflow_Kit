import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// M39 T004: the decision under an autopilot grant. Without a live grant
// (none, revoked, another reviewed digest) every barrier stays as before.
const build = await buildWorkflowModules(["workflow-autopilot"], "workflow-autopilot-authority");
try {
  const { WorkflowAutopilotFacade } = await build.load("workflow-autopilot", "workflow-autopilot-facade.js");
  const autopilot = new WorkflowAutopilotFacade();
  const on = autopilot.initialState(3, true);
  const grant = (extra = {}) => ({
    accept: true,
    close: true,
    delivery: [{ effects: ["npm run package"], taskId: "D1" }],
    proposalDigest: "d1",
    revoked: null,
    runId: "run-1",
    ...extra,
  });
  const status = (extra = {}) => ({
    authorization: grant(),
    blockedReason: null,
    delivery: "IN_PROGRESS",
    head: "h2",
    nextTask: { id: "D1", kind: "delivery", status: "TODO", title: "Package" },
    proposal: { digest: "d1" },
    revision: 5,
    scope: "ACTIVE",
    transactionPending: false,
    ...extra,
  });
  const turn = { before: { head: "h1", revision: 4 }, outcome: "completed", userMessage: false };
  const decide = (s, t = turn, state = on) => autopilot.decide(state, s, t);

  // A granted delivery continues with the run instead of the user's confirmation.
  const go = decide(status());
  assert.equal(go.action, "continue");
  assert.equal(go.taskId, "D1");
  assert.match(go.text, /task:start D1 --autopilot-run run-1/u);
  // Not granted, revoked, another digest, no grant, a legacy Kit: the user confirms.
  for (const extra of [
    { authorization: grant({ delivery: [{ effects: ["x"], taskId: "D2" }] }) },
    { authorization: grant({ revoked: { reason: "settings-off" } }) },
    { proposal: { digest: "d2" } },
    { proposal: null },
    { authorization: null },
    { authorization: undefined, proposal: undefined },
  ]) {
    assert.equal(decide(status(extra)).reason, "delivery-confirmation", JSON.stringify(extra));
  }
  // No progress and the limit still stop a granted delivery.
  assert.equal(decide(status(), { ...turn, before: { head: "h2", revision: 5 } }).reason, "no-progress");
  assert.equal(decide(status(), turn, { ...on, continues: 3 }).reason, "limit");
  // The user's message, pause and blocks keep their priority.
  assert.equal(decide(status(), { ...turn, userMessage: true }).reason, "user-message");
  assert.equal(decide(status({ paused: true })).reason, "paused");
  assert.equal(decide(status({ scope: "BLOCKED" })).reason, "blocked");

  // Acceptance and close: the host performs them; the agent gets no turn.
  const ready = decide(status({ delivery: "READY_FOR_ACCEPTANCE", nextTask: null }));
  assert.deepEqual([ready.action, ready.reason], ["stop", "host-transition"]);
  assert.match(ready.detail, /run-1 accepts/u);
  const accepted = decide(status({ delivery: "ACCEPTED", nextTask: null }));
  assert.equal(accepted.reason, "host-transition");
  assert.match(accepted.detail, /closes the scope/u);
  // after-start with a manual criterion: the user accepts, the run closes.
  const manual = { authorization: grant({ accept: false }), nextTask: null };
  assert.equal(decide(status({ ...manual, delivery: "READY_FOR_ACCEPTANCE" })).reason, "ready-for-acceptance");
  assert.equal(decide(status({ ...manual, delivery: "ACCEPTED" })).reason, "host-transition");
  assert.equal(
    decide(status({ authorization: grant({ close: false }), delivery: "ACCEPTED", nextTask: null })).reason,
    "ready-for-acceptance"
  );
  assert.equal(decide(status({ authorization: null, delivery: "READY_FOR_ACCEPTANCE", nextTask: null })).reason, "ready-for-acceptance");

  // Orchestrated: the granted delivery runs in main once nothing else is open.
  const orchestration = (extra = {}) => ({ assignments: [], integration: null, readyTasks: [], ...extra });
  const orchestrated = decide(status({ orchestration: orchestration() }));
  assert.equal(orchestrated.action, "continue");
  assert.match(orchestrated.text, /--autopilot-run run-1/u);
  assert.equal(
    decide(status({ orchestration: orchestration({ assignments: [{ cleanupPending: false, id: "a1", sourceCommit: null, status: "RUNNING", taskId: "W" }] }) })).reason,
    "waiting-for-executors"
  );
  assert.equal(decide(status({ authorization: null, orchestration: orchestration() })).reason, "delivery-confirmation");
  const key = orchestrated.orchestrationKey;
  assert.equal(
    decide(status({ orchestration: orchestration() }), { ...turn, before: { head: "h2", revision: 5 } }, { ...on, orchestrationKey: key }).reason,
    "no-progress"
  );
  console.log("workflow-autopilot authority tests passed");
} finally {
  await build.cleanup();
}
