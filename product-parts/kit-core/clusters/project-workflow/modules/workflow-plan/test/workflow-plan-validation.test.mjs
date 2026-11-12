import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-validation"
);
try {
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const plans = new WorkflowPlanFacade();
  const at = "2026-11-03T10:00:00.000Z";
  const task = (id, extra = {}) => ({
    acceptance: ["works"],
    checks: [],
    commitMessage: `feat: ${id}`,
    confirmation: null,
    context: [],
    dependencies: [],
    docsWaiver: null,
    files: ["src/main.ts"],
    fixes: null,
    id,
    iteration: 1,
    kind: "work",
    roundId: "R1",
    status: "TODO",
    title: `Task ${id}`,
    why: "because",
    ...extra,
  });
  const sample = () => ({
    ...plans.createEmpty("p-1", "Demo"),
    currentTaskId: "T001",
    rounds: [
      {
        digest: null,
        id: "R1",
        kind: "implementation",
        status: "OPEN",
        title: "Implementation",
      },
    ],
    scope: {
      acceptance: ["user can run it"],
      acceptanceNote: null,
      approval: { at, text: "User approved the scope" },
      baselineCommit: "a".repeat(40),
      blockedReason: null,
      context: [{ path: "docs/architecture/OVERVIEW.md", required: true }],
      decisions: [],
      delivery: "IN_PROGRESS",
      id: "demo-scope",
      objective: "Build the demo",
      spec: "docs/planning/demo.md",
      status: "ACTIVE",
    },
    tasks: [
      task("T001", { status: "IN_PROGRESS" }),
      task("T002", { dependencies: ["T001"] }),
      task("DOCS-R1", {
        dependencies: ["T001", "T002"],
        files: ["README.md"],
        kind: "docs",
      }),
      task("PKG", {
        confirmation: null,
        dependencies: ["DOCS-R1"],
        files: [],
        kind: "delivery",
      }),
    ],
  });
  assert.equal(plans.validate(sample()).scope.id, "demo-scope");
  assert.equal(plans.validate(plans.createEmpty("p", "Empty")).scope, null);

  // The DOCS task may hold the product tree; it is documentation, not code.
  const withTree = sample();
  withTree.tasks[2].files = [
    "README.md",
    ".harness/product-tree/product-tree.json",
    ".harness/product-tree/product-tree.md",
  ];
  assert.equal(plans.validate(withTree).tasks[2].files.length, 3);

  const rejects = (mutate, code) => {
    const plan = sample();
    mutate(plan);
    assert.throws(
      () => plans.validate(plan),
      (error) => error.code === code,
      code
    );
  };
  rejects((p) => {
    p.schema = "harness-ai-plan-v1";
  }, "PLAN_SCHEMA");
  rejects((p) => {
    p.tasks[1].dependencies = ["DOCS-R1"];
  }, "TASK_ORDER");
  rejects((p) => {
    p.tasks[0].files = ["../outside.ts"];
  }, "UNSAFE_PATH");
  rejects((p) => {
    p.tasks[0].files = ["./src/main.ts"];
  }, "PLAN_SCHEMA");
  rejects((p) => {
    p.tasks[0].commitMessage = "a\nb";
  }, "PLAN_SCHEMA");
  rejects((p) => {
    p.currentTaskId = "T002";
  }, "PLAN_SCHEMA");
  rejects((p) => {
    p.tasks[2].files = ["src/x.ts"];
  }, "DOCS_TASK");
  rejects((p) => {
    p.tasks[2].dependencies = ["T001"];
  }, "DOCS_TASK");
  rejects((p) => {
    p.tasks[3].dependencies = [];
  }, "DELIVERY_ORDER");
  rejects((p) => {
    p.tasks[2].id = "DOCS";
    p.tasks[3].dependencies = ["DOCS"];
  }, "DOCS_TASK");
  rejects((p) => {
    p.scope.status = "BLOCKED";
  }, "PLAN_SCHEMA");
  rejects((p) => {
    p.scope.delivery = "READY_FOR_ACCEPTANCE";
  }, "PLAN_SCHEMA");
  rejects((p) => {
    p.scope.baselineCommit = "HEAD";
  }, "PLAN_SCHEMA");
  rejects((p) => {
    p.rounds[0].status = "CLOSED";
  }, "ROUND_DIGEST_REQUIRED");
  rejects((p) => {
    p.tasks[0].confirmation = "yes";
  }, "PLAN_SCHEMA");
  rejects((p) => {
    p.tasks[1].fixes = "T009";
  }, "PLAN_SCHEMA");

  const done = sample();
  done.currentTaskId = null;
  for (const item of done.tasks) {
    item.status = "DONE";
  }
  done.rounds[0].digest = {
    contracts: [],
    decisions: [],
    references: [],
    result: "Shipped.",
  };
  assert.throws(() => plans.validate(done), /IN_PROGRESS exactly/u);
  done.scope.delivery = "READY_FOR_ACCEPTANCE";
  plans.validate(done);
  done.scope.delivery = "ACCEPTED";
  assert.throws(() => plans.validate(done), /acceptanceNote/u);
  done.scope.acceptanceNote = { at, text: "accepted" };
  plans.validate(done);

  plans.validateDigest({
    contracts: [],
    decisions: ["d"],
    references: [],
    result: "Delivered.",
  });
  assert.throws(
    () =>
      plans.validateDigest({
        contracts: [],
        decisions: [],
        references: [],
        result: "x".repeat(601),
      }),
    (error) => error.code === "ROUND_DIGEST_TOO_LARGE"
  );
  assert.throws(
    () => plans.validateDigest(null),
    (error) => error.code === "ROUND_DIGEST_REQUIRED"
  );
  console.log("workflow-plan validation tests passed");
} finally {
  await build.cleanup();
}
