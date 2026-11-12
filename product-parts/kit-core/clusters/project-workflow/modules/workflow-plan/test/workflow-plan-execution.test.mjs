import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-execution"
);
try {
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const plans = new WorkflowPlanFacade();
  const context = {
    baselineCommit: "e".repeat(40),
    now: "2026-11-04T10:00:00.000Z",
    qualityConfigured: true,
  };
  const task = (id, extra = {}) => ({
    acceptance: [`${id} works`],
    commitMessage: `feat: ${id}`,
    files: [`src/${id}.ts`],
    id,
    title: id,
    ...extra,
  });
  const create = (tasks, extra = {}) =>
    plans.createScope(
      plans.createEmpty("p", "Demo"),
      {
        acceptance: ["ok"],
        approval: "User approved the demo scope",
        id: "demo",
        objective: "Demo",
        spec: "docs/planning/demo.md",
        tasks,
        ...extra,
      },
      context
    );
  const fails = (action, code) =>
    assert.throws(action, (error) => error.code === code, code);

  // Defaults: parallelSafe is absent (false) and execution is sequential.
  const plain = create([task("A"), task("B")]);
  assert.equal("parallelSafe" in plans.task(plain, "A"), false);
  assert.equal("execution" in plain.scope, false);
  assert.deepEqual(plans.execution(plain), {
    maxWorkers: 3,
    ownerSession: null,
    strategy: "sequential",
  });
  assert.equal(plans.hasParallelWork(plain), false);
  const explicitFalse = create([task("A", { parallelSafe: false })]);
  assert.equal("parallelSafe" in plans.task(explicitFalse, "A"), false);
  const plainText = plans.render(plain);
  assert.doesNotMatch(plainText, /Execution:|parallel-safe/u);
  assert.deepEqual(plans.parse(plainText), plain);

  // parallelSafe needs concrete paths.
  for (const files of [
    ["src/*.ts"],
    ["src/a?.ts"],
    ["src/[ab].ts"],
    ["src/{a,b}.ts"],
    ["."],
    ["src/"],
    [],
  ]) {
    fails(
      () => create([task("A", { files, parallelSafe: true })]),
      "PARALLEL_FILES"
    );
  }
  fails(
    () =>
      create([
        task("A"),
        task("PKG", { files: [], kind: "delivery", parallelSafe: true }),
      ]),
    "PARALLEL_KIND"
  );
  fails(() => create([task("A", { parallelSafe: "yes" })]), "PLAN_SCHEMA");

  // The execution block is validated, defaulted and round-trips.
  for (const execution of [
    { strategy: "parallel" },
    { maxWorkers: 0, strategy: "orchestrated" },
    { maxWorkers: 17, strategy: "orchestrated" },
    { maxWorkers: 2.5, strategy: "orchestrated" },
    { ownerSession: " ", strategy: "orchestrated" },
    "orchestrated",
  ]) {
    fails(() => create([task("A")], { execution }), "PLAN_EXECUTION");
  }
  const orchestrated = create(
    [
      task("A", { parallelSafe: true }),
      task("B", { files: ["src/B.ts", "docs/b.md"], parallelSafe: true }),
    ],
    { execution: { ownerSession: "session-1", strategy: "orchestrated" } }
  );
  assert.deepEqual(orchestrated.scope.execution, {
    maxWorkers: 3,
    ownerSession: "session-1",
    strategy: "orchestrated",
  });
  assert.equal(plans.task(orchestrated, "A").parallelSafe, true);
  const text = plans.render(orchestrated);
  assert.match(
    text,
    /- Execution: orchestrated \(max 3 workers, owner session-1\)/u
  );
  assert.match(text, /- \[TODO\] A — A \(work, parallel-safe\)/u);
  assert.deepEqual(plans.parse(text), orchestrated);
  assert.equal(plans.hasParallelWork(orchestrated), true);
  const sequential = create([task("A")], {
    execution: { maxWorkers: 5, strategy: "sequential" },
  });
  assert.match(plans.render(sequential), /- Execution: sequential\n/u);
  assert.equal(plans.execution(sequential).maxWorkers, 5);
  assert.deepEqual(plans.parse(plans.render(sequential)), sequential);

  // Labels added by plan:extend are stored the same way.
  const extended = plans.extend(
    orchestrated,
    { tasks: [task("C", { files: ["src/C.ts"], parallelSafe: true })] },
    context
  ).plan;
  assert.equal(plans.task(extended, "C").parallelSafe, true);
  fails(
    () =>
      plans.extend(
        orchestrated,
        { tasks: [task("D", { files: ["src/**"], parallelSafe: true })] },
        context
      ),
    "PARALLEL_FILES"
  );

  // Compatibility: dependencies (also transitive), nested paths, kinds.
  const work = (id, files, extra = {}) => ({
    dependencies: [],
    files,
    id,
    kind: "work",
    parallelSafe: true,
    ...extra,
  });
  const graph = {
    tasks: [
      work("A", ["src/a.ts"]),
      work("B", ["src/b.ts"], { dependencies: ["A"] }),
      work("C", ["src/c.ts"], { dependencies: ["B"] }),
      work("D", ["src/lib"]),
      work("E", ["src/lib/e.ts"]),
      work("F", ["src/libx.ts"]),
      work("G", ["src/g.ts"], { parallelSafe: undefined }),
      work("H", ["src/h.ts"], { kind: "delivery" }),
    ],
  };
  assert.equal(plans.compatibleTasks(graph, "A", "B"), false, "direct");
  assert.equal(plans.compatibleTasks(graph, "A", "C"), false, "transitive");
  assert.equal(plans.compatibleTasks(graph, "C", "A"), false, "symmetric");
  assert.equal(plans.compatibleTasks(graph, "D", "E"), false, "nested");
  assert.equal(plans.compatibleTasks(graph, "D", "F"), true, "segment prefix");
  assert.equal(plans.compatibleTasks(graph, "A", "D"), true);
  assert.equal(plans.compatibleTasks(graph, "A", "G"), false, "unlabelled");
  assert.equal(plans.compatibleTasks(graph, "A", "H"), false, "not work");
  assert.equal(plans.compatibleTasks(graph, "A", "A"), false, "same task");
  assert.equal(plans.compatibleTasks(graph, "A", "X"), false, "unknown");
  assert.equal(plans.hasParallelWork(graph), true);
  assert.equal(
    plans.hasParallelWork({ tasks: graph.tasks.slice(0, 3) }),
    false,
    "a dependency chain has no parallel work"
  );
  assert.equal(
    plans.hasParallelWork({
      tasks: [work("D", ["src/lib"]), work("E", ["src/lib/e.ts"])],
    }),
    false,
    "nested paths conflict"
  );
  assert.equal(
    plans.hasParallelWork({
      tasks: [
        work("A", ["src/a.ts"]),
        work("H", ["src/h.ts"], { kind: "delivery" }),
        work("G", ["src/g.ts"], { parallelSafe: false }),
      ],
    }),
    false,
    "non-work and unlabelled tasks never pair"
  );

  // integrateTask: DONE through an integration commit (spec 7).
  const integration = (id, sha) => ({
    digest: null,
    operationId: `op-${id}`,
    sourceCommit: sha.repeat(40),
  });
  const withA = plans.integrateTask(orchestrated, "A", integration("A", "a"));
  assert.equal(withA.revision, orchestrated.revision + 1);
  assert.equal(plans.task(withA, "A").status, "DONE");
  assert.deepEqual(plans.task(withA, "A").integration, {
    operationId: "op-A",
    sourceCommit: "a".repeat(40),
  });
  assert.equal(withA.currentTaskId, null);
  assert.deepEqual(plans.parse(plans.render(withA)), withA);
  fails(
    () => plans.integrateTask(sequential, "A", integration("A", "a")),
    "NOT_ORCHESTRATED"
  );
  fails(
    () => plans.integrateTask(withA, "A", integration("A", "a")),
    "TASK_NOT_TODO"
  );
  fails(
    () => plans.integrateTask(withA, "DOCS-R1", integration("D", "d")),
    "DEPENDENCY_PENDING"
  );
  const withB = plans.integrateTask(withA, "B", integration("B", "b"));
  const roundDigest = {
    contracts: ["c"],
    decisions: ["d"],
    references: ["r"],
    result: "done",
  };
  const closed = plans.integrateTask(withB, "DOCS-R1", {
    ...integration("D", "d"),
    digest: roundDigest,
  });
  assert.equal(closed.rounds[0].status, "CLOSED");
  assert.deepEqual(closed.rounds[0].digest, roundDigest);
  assert.equal(closed.scope.delivery, "READY_FOR_ACCEPTANCE");
  const badIntegration = structuredClone(withA);
  plans.task(badIntegration, "B").integration = plans.task(
    withA,
    "A"
  ).integration;
  fails(() => plans.validate(badIntegration), "PLAN_SCHEMA");
  plans.task(badIntegration, "B").integration = undefined;
  plans.task(badIntegration, "A").integration.sourceCommit = "abc";
  fails(() => plans.validate(badIntegration), "PLAN_SCHEMA");
  console.log("workflow-plan execution tests passed");
} finally {
  await build.cleanup();
}
