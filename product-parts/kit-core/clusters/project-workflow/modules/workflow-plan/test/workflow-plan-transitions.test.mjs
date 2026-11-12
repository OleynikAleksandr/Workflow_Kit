import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-transitions"
);
try {
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const plans = new WorkflowPlanFacade();
  const now = "2026-11-03T12:00:00.000Z";
  const context = {
    baselineCommit: "c".repeat(40),
    now,
    qualityConfigured: false,
  };
  const input = {
    acceptance: ["Demo runs"],
    approval: "User asked to build the demo app",
    id: "demo-1",
    objective: "Demo",
    spec: "docs/planning/demo.md",
    tasks: [
      {
        acceptance: ["Spec ready"],
        commitMessage: "docs: outline",
        files: ["docs/modules/demo.md"],
        title: "Outline",
      },
      {
        acceptance: ["Code runs"],
        commitMessage: "feat: core",
        files: ["src/core.ts"],
        title: "Core",
      },
      {
        acceptance: ["Package built"],
        commitMessage: "chore: package",
        kind: "delivery",
        title: "Package",
      },
    ],
  };
  const empty = plans.createEmpty("p", "Demo");
  assert.throws(
    () => plans.createScope(empty, { ...input, approval: "ok" }, context),
    (e) => e.code === "SCOPE_APPROVAL"
  );
  assert.throws(
    () => plans.createScope(empty, { ...input, spec: null }, context),
    (e) => e.code === "SPEC_REQUIRED"
  );
  assert.throws(
    () => plans.createScope(empty, input, { ...context, baselineCommit: null }),
    (e) => e.code === "NO_BASELINE"
  );

  let plan = plans.createScope(empty, input, context);
  assert.deepEqual(
    plan.tasks.map((t) => t.id),
    ["T001", "QUALITY", "T002", "DOCS-R1", "T003"]
  );
  assert.deepEqual(plans.task(plan, "T002").dependencies, ["QUALITY"]);
  assert.deepEqual(plans.task(plan, "DOCS-R1").dependencies, [
    "T001",
    "QUALITY",
    "T002",
  ]);
  assert.ok(
    plans.task(plan, "DOCS-R1").files.includes("docs/planning/demo.md")
  );
  assert.ok(plans.task(plan, "DOCS-R1").files.includes("docs/modules/demo.md"));
  assert.deepEqual(plans.task(plan, "T003").dependencies, ["DOCS-R1"]);
  assert.equal(plan.revision, 2);
  assert.throws(
    () => plans.createScope(plan, input, context),
    (e) => e.code === "SCOPE_EXISTS"
  );

  const configured = plans.createScope(empty, input, {
    ...context,
    qualityConfigured: true,
  });
  assert.equal(
    configured.tasks.some((t) => t.kind === "quality"),
    false
  );

  assert.equal(plans.nextTask(plan).id, "T001");
  assert.throws(
    () => plans.startTask(plan, "T002"),
    (e) => e.code === "DEPENDENCY_PENDING"
  );
  const run = (current, id, digest = null, confirmation = null) =>
    plans.completeTask(plans.startTask(current, id, confirmation), id, digest);
  plan = plans.startTask(plan, "T001");
  assert.equal(
    plans.startTask(plan, "T001"),
    plan,
    "starting the current task again is a no-op"
  );
  assert.throws(
    () => plans.startTask(plan, "QUALITY"),
    (e) => e.code === "TASK_ALREADY_ACTIVE"
  );
  plan = plans.completeTask(plan, "T001");
  assert.throws(
    () => plans.completeTask(plan, "QUALITY"),
    (e) => e.code === "TASK_NOT_ACTIVE"
  );
  plan = run(plan, "QUALITY");
  plan = run(plan, "T002");

  plan = plans.block(plan, "Waiting for API keys");
  assert.throws(
    () => plans.startTask(plan, "DOCS-R1"),
    (e) => e.code === "SCOPE_NOT_ACTIVE"
  );
  plan = plans.unblock(plan);

  plan = plans.startTask(plan, "DOCS-R1");
  assert.throws(
    () => plans.completeTask(plan, "DOCS-R1"),
    (e) => e.code === "ROUND_DIGEST_REQUIRED"
  );
  const digest = {
    contracts: [],
    decisions: ["Kept the CLI small"],
    references: [],
    result: "Demo core shipped.",
  };
  plan = plans.completeTask(plan, "DOCS-R1", digest);
  assert.equal(plan.rounds[0].status, "OPEN", "delivery keeps the round open");
  assert.equal(plan.rounds[0].digest.result, "Demo core shipped.");
  assert.throws(
    () => plans.startTask(plan, "T003"),
    (e) => e.code === "DELIVERY_CONFIRMATION"
  );
  plan = run(plan, "T003", null, "User confirmed the package build");
  assert.equal(
    plans.task(plan, "T003").confirmation,
    "User confirmed the package build"
  );
  assert.equal(plan.rounds[0].status, "CLOSED");
  assert.equal(plan.scope.delivery, "READY_FOR_ACCEPTANCE");
  assert.equal(plans.nextTask(plan), null);
  assert.deepEqual(plans.parse(plans.render(plan)), plan);
  console.log("workflow-plan transitions tests passed");
} finally {
  await build.cleanup();
}
