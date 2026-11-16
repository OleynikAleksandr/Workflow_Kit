import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// M39 T003: the plan transition of task:defer-delivery and its records.
const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-delivery-defer"
);
try {
  const { WorkflowPlanFacade } = await build.load("workflow-plan", "workflow-plan-facade.js");
  const plans = new WorkflowPlanFacade();
  const context = { baselineCommit: "a".repeat(40), now: "2026-11-16T10:00:00.000Z", qualityConfigured: true };
  const code = (action) => {
    try {
      action();
    } catch (error) {
      return error.code;
    }
    return "OK";
  };
  const base = plans.createScope(
    plans.createEmpty("p", "Demo"),
    {
      acceptance: ["Shipped"],
      approval: "User approved the demo scope",
      id: "demo",
      objective: "Demo",
      spec: "docs/spec.md",
      tasks: [
        { acceptance: ["w"], commitMessage: "docs: w", files: ["docs/w.md"], id: "W", title: "W" },
        { acceptance: ["c"], commitMessage: "chore: ci", dependencies: ["W"], id: "D2", kind: "delivery", title: "CI" },
      ],
    },
    context
  );
  // W and DOCS-R1 are DONE (their commits live in git), D2 runs with a confirmation.
  const running = structuredClone(base);
  for (const task of running.tasks) {
    task.status = task.id === "D2" ? "IN_PROGRESS" : "DONE";
  }
  running.tasks.find((task) => task.id === "D2").confirmation = "User: check CI";
  running.currentTaskId = "D2";
  running.rounds[0].digest = { contracts: [], decisions: [], references: [], result: "W written." };
  const started = plans.validate(running);
  const request = { now: "2026-11-16T11:00:00.000Z", reason: "CI failed: abc123 https://ci/run/1" };

  // Refusals: a short reason, another task, a DONE task, no current task.
  assert.equal(code(() => plans.deferDelivery(started, "D2", { ...request, reason: "red" })), "USAGE");
  assert.equal(code(() => plans.deferDelivery(started, "W", request)), "DELIVERY_DEFER_NOT_ALLOWED");
  assert.equal(code(() => plans.deferDelivery(base, "D2", request)), "DELIVERY_DEFER_NOT_ALLOWED");
  assert.equal(code(() => plans.deferDelivery(started, "X", request)), "DELIVERY_DEFER_NOT_ALLOWED");

  // Two failed attempts: each is recorded, the confirmation is never reused.
  const first = plans.deferDelivery(started, "D2", { ...request, outcome: "  " });
  const task = (plan) => plan.tasks.find((item) => item.id === "D2");
  assert.deepEqual(
    [task(first).status, task(first).iteration, task(first).confirmation, first.currentTaskId, first.revision],
    ["TODO", 2, null, null, started.revision + 1]
  );
  assert.deepEqual(task(first).deferrals, [
    { at: request.now, confirmation: "User: check CI", iteration: 1, outcome: null, reason: request.reason },
  ]);
  const again = structuredClone(first);
  task(again).status = "IN_PROGRESS";
  task(again).confirmation = "User: check CI again";
  again.currentTaskId = "D2";
  const second = plans.deferDelivery(plans.validate(again), "D2", { ...request, outcome: "macOS job cancelled" });
  assert.deepEqual(task(second).deferrals.map((entry) => [entry.iteration, entry.outcome]), [
    [1, null],
    [2, "macOS job cancelled"],
  ]);
  // The other tasks are untouched; the record survives the projection round trip.
  assert.deepEqual(second.tasks.filter((item) => item.id !== "D2"), started.tasks.filter((item) => item.id !== "D2"));
  assert.deepEqual(task(plans.parse(plans.render(second))).deferrals, task(second).deferrals);

  // Validation of stored records.
  const broken = (mutate) => {
    const plan = structuredClone(first);
    mutate(plan);
    return code(() => plans.validate(plan));
  };
  assert.equal(broken((plan) => {
    plan.tasks.find((item) => item.id === "W").deferrals = task(plan).deferrals;
  }), "PLAN_SCHEMA");
  assert.equal(broken((plan) => {
    task(plan).deferrals[0].iteration = 2;
  }), "PLAN_SCHEMA");
  assert.equal(broken((plan) => {
    task(plan).deferrals[0].reason = " ";
  }), "PLAN_SCHEMA");
  assert.equal(broken((plan) => {
    task(plan).deferrals = "x";
  }), "PLAN_SCHEMA");
  // A plan without the field (every older plan) stays valid.
  assert.equal("deferrals" in task(base), false);
  console.log("workflow-plan delivery defer tests passed");
} finally {
  await build.cleanup();
}
