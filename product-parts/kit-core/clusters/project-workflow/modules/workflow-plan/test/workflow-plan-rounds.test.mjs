import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-rounds"
);
try {
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const plans = new WorkflowPlanFacade();
  const now = "2026-11-03T13:00:00.000Z";
  const context = {
    baselineCommit: "d".repeat(40),
    now,
    qualityConfigured: true,
  };
  const digest = {
    contracts: [],
    decisions: [],
    references: [],
    result: "Round done.",
  };
  const task = (id, extra = {}) => ({
    acceptance: [`${id} works`],
    commitMessage: `feat: ${id}`,
    files: [`src/${id}.ts`],
    id,
    title: id,
    ...extra,
  });
  const run = (plan, id, extra = {}) =>
    plans.completeTask(
      plans.startTask(plan, id, extra.confirmation ?? null),
      id,
      extra.digest ?? null
    );

  let plan = plans.createScope(
    plans.createEmpty("p", "Demo"),
    {
      acceptance: ["ok"],
      approval: "User approved demo scope",
      id: "demo",
      objective: "Demo",
      spec: "docs/planning/demo.md",
      tasks: [
        task("A"),
        task("B"),
        task("PKG", { files: [], kind: "delivery" }),
      ],
    },
    context
  );
  plan = run(plan, "A");

  // Extending the open round inserts before DOCS, honours `before`, defers DOCS in progress.
  let extended = plans.extend(
    plan,
    { tasks: [task("C", { before: "B" })] },
    context
  );
  assert.deepEqual(
    extended.plan.tasks.map((t) => t.id),
    ["A", "C", "B", "DOCS-R1", "PKG"]
  );
  assert.ok(plans.task(extended.plan, "B").dependencies.includes("C"));
  assert.deepEqual(plans.task(extended.plan, "DOCS-R1").dependencies, [
    "A",
    "C",
    "B",
  ]);
  assert.equal(extended.roundId, "R1");
  plan = run(run(extended.plan, "C"), "B");
  plan = plans.startTask(plan, "DOCS-R1");
  extended = plans.extend(plan, { tasks: [task("D")] }, context);
  assert.equal(extended.deferredDocsTaskId, "DOCS-R1");
  assert.equal(extended.plan.currentTaskId, null);
  assert.equal(plans.task(extended.plan, "DOCS-R1").status, "TODO");
  assert.throws(
    () =>
      plans.extend(
        extended.plan,
        { round: "new", tasks: [task("E")] },
        context
      ),
    (e) => e.code === "ROUND_OPEN"
  );
  assert.throws(
    () =>
      plans.extend(
        extended.plan,
        { tasks: [task("E", { before: "A" })] },
        context
      ),
    (e) => e.code === "TASK_STARTED"
  );
  plan = run(run(extended.plan, "D"), "DOCS-R1", { digest });

  // After DOCS, new work opens a fixes round and pending delivery moves along.
  extended = plans.extend(
    plan,
    { title: "Fixes after review", tasks: [task("F", { fixes: "B" })] },
    context
  );
  plan = extended.plan;
  assert.equal(extended.roundId, "R2");
  assert.equal(plan.rounds[0].status, "CLOSED");
  assert.deepEqual(
    plan.tasks.filter((t) => t.roundId === "R2").map((t) => t.id),
    ["F", "DOCS-R2", "PKG"]
  );
  assert.deepEqual(plans.task(plan, "PKG").dependencies, ["DOCS-R2"]);
  plan = run(run(plan, "F"), "DOCS-R2", { digest });
  plan = run(plan, "PKG", { confirmation: "User confirmed packaging" });
  assert.equal(plan.scope.delivery, "READY_FOR_ACCEPTANCE");

  // Acceptance, reopening by a fixes round, and closing.
  assert.throws(
    () => plans.close(plan, "demo", "close it now please", now),
    (e) => e.code === "NOT_ACCEPTED"
  );
  plan = plans.accept(plan, "Looks good", now);
  assert.equal(plan.scope.delivery, "ACCEPTED");
  const reopened = plans.extend(
    plan,
    { tasks: [task("G", { fixes: "F" })] },
    context
  ).plan;
  assert.equal(reopened.scope.delivery, "IN_PROGRESS");
  assert.equal(reopened.scope.acceptanceNote, null);
  assert.equal(reopened.rounds.at(-1).id, "R3");
  assert.throws(
    () => plans.close(plan, "other", "close it now please", now),
    (e) => e.code === "SCOPE_ID"
  );
  assert.throws(
    () => plans.close(plan, "demo", "ok", now),
    (e) => e.code === "USER_CLOSE_REQUIRED"
  );
  const closed = plans.close(plan, "demo", "User: close the scope now", now);
  assert.equal(closed.scope, null);
  assert.deepEqual(closed.lastClosed, { closedAt: now, scopeId: "demo" });
  assert.equal(closed.revision, plan.revision + 1);

  // Carryover moves unfinished tasks into a fresh scope.
  const carried = plans.carryover(
    reopened,
    { approval: "User asked to carry the rest over", id: "demo-2" },
    { ...context, qualityConfigured: false }
  );
  assert.equal(carried.scope.id, "demo-2");
  assert.equal(carried.lastClosed.scopeId, "demo");
  assert.deepEqual(
    carried.tasks.map((t) => t.id),
    ["QUALITY", "G", "DOCS-R1"]
  );
  assert.deepEqual(plans.parse(plans.render(carried)), carried);

  // deferDocs repair action.
  const docsRunning = plans.startTask(
    run(
      run(
        plans.createScope(
          plans.createEmpty("p", "x"),
          {
            acceptance: ["ok"],
            approval: "User approved small scope",
            id: "s",
            objective: "x",
            spec: "docs/s.md",
            tasks: [task("X"), task("Y")],
          },
          context
        ),
        "X"
      ),
      "Y"
    ),
    "DOCS-R1"
  );
  assert.equal(plans.deferDocs(docsRunning).currentTaskId, null);
  console.log("workflow-plan rounds tests passed");
} finally {
  await build.cleanup();
}
