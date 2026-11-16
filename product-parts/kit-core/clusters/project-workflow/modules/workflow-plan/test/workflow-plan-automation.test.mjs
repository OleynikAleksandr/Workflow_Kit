import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// The optional M39 automation block: structure, compatibility, carryover.
const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-automation"
);
try {
  const { WorkflowPlanFacade, automationSummary } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const plans = new WorkflowPlanFacade();
  const context = {
    baselineCommit: "a".repeat(40),
    now: "2026-11-16T10:00:00.000Z",
    qualityConfigured: false,
  };
  const tasks = [
    {
      acceptance: ["A works"],
      commitMessage: "feat: A",
      files: ["src/a.ts"],
      id: "T001",
      title: "A",
    },
    {
      acceptance: ["Packaged"],
      commitMessage: "chore: package",
      dependencies: ["T001"],
      id: "T002",
      kind: "delivery",
      title: "Package",
    },
  ];
  const automation = () => ({
    acceptance: [
      {
        checks: [],
        criterion: 1,
        evidence: [],
        kind: "manual",
      },
      {
        checks: ["unit"],
        criterion: 0,
        evidence: ["docs/evidence/a.md"],
        kind: "automatic",
      },
    ],
    ci: {
      branch: "ci/demo",
      exactSha: true,
      remote: "origin",
      requiredChecks: ["macOS ARM64", "Linux x64"],
    },
    delivery: [{ effects: ["npm run package"], taskId: "T002" }],
    publication: { branch: "main", upstream: "origin/main" },
  });
  const input = (extra = {}) => ({
    acceptance: ["A works for users", "The user sees the packaged app"],
    approval: "User approved the demo scope",
    id: "demo",
    objective: "Demo",
    spec: "docs/planning/demo.md",
    tasks: structuredClone(tasks),
    ...extra,
  });
  const create = (extra) =>
    plans.createScope(plans.createEmpty("p", "Demo"), input(extra), context);
  const refused = (block, field) =>
    assert.throws(
      () => create({ automation: block }),
      (error) =>
        error.code === "PLAN_AUTOMATION" && error.details?.field === field,
      field
    );

  // A legacy plan without the block stays valid and renders unchanged.
  const legacy = create();
  assert.equal("automation" in legacy.scope, false);
  assert.equal("proposal" in legacy.scope, false);
  assert.doesNotMatch(plans.render(legacy), /Automation:/u);
  assert.deepEqual(plans.parse(plans.render(legacy)), legacy);
  assert.equal(create({ automation: null }).scope.automation, undefined);

  // The block is stored in criterion order; manual criteria stay.
  const plan = create({ automation: automation() });
  assert.deepEqual(
    plan.scope.automation.acceptance.map((entry) => entry.criterion),
    [0, 1]
  );
  assert.equal(plan.scope.automation.acceptance[1].kind, "manual");
  assert.deepEqual(plan.scope.automation.ci.requiredChecks, [
    "macOS ARM64",
    "Linux x64",
  ]);
  const text = plans.render(plan);
  assert.match(
    text,
    /- Automation: 1 automatic, 1 manual criteria; CI origin ci\/demo \(2 checks\); publication main → origin\/main/u
  );
  assert.deepEqual(plans.parse(text), plan);
  assert.deepEqual(automationSummary(plan.scope.automation), [
    "acceptance: 1 automatic, 1 manual (manual: 2)",
    "delivery effects: T002 (npm run package)",
    "ci: origin ci/demo, checks macOS ARM64, Linux x64, exact SHA",
    "publication: main → origin/main",
  ]);
  // delivery defaults to an empty list; ci and publication may be null.
  const minimal = automation();
  delete minimal.delivery;
  minimal.ci = null;
  minimal.publication = null;
  const local = create({ automation: minimal });
  assert.deepEqual(local.scope.automation.delivery, []);
  assert.equal(local.scope.automation.ci, null);
  assert.deepEqual(automationSummary(local.scope.automation).slice(1), [
    "delivery effects: none",
    "ci: none",
    "publication: none",
  ]);

  // Every criterion exactly once.
  const missing = automation();
  missing.acceptance.pop();
  refused(missing, "automation.acceptance");
  const twice = automation();
  twice.acceptance[0].criterion = 0;
  refused(twice, "automation.acceptance[1].criterion");
  const outside = automation();
  outside.acceptance[0].criterion = 2;
  refused(outside, "automation.acceptance[0].criterion");
  // An automatic criterion names checks or evidence; "done" text is not enough.
  const bare = automation();
  bare.acceptance[1].checks = [];
  bare.acceptance[1].evidence = [];
  refused(bare, "automation.acceptance[1]");
  const loose = automation();
  loose.acceptance[1].evidence = ["./docs/a.md"];
  refused(loose, "automation.acceptance[1].evidence");
  // Delivery entries name delivery tasks of the scope, once.
  const foreign = automation();
  foreign.delivery[0].taskId = "T001";
  refused(foreign, "automation.delivery[0].taskId");
  const unknownTask = automation();
  unknownTask.delivery[0].taskId = "T009";
  refused(unknownTask, "automation.delivery[0].taskId");
  const repeated = automation();
  repeated.delivery.push({ effects: ["again"], taskId: "T002" });
  refused(repeated, "automation.delivery[1].taskId");
  // CI and publication shapes.
  const noChecks = automation();
  noChecks.ci.requiredChecks = [];
  refused(noChecks, "automation.ci.requiredChecks");
  const spaced = automation();
  spaced.ci.branch = "ci branch";
  refused(spaced, "automation.ci.branch");
  const exact = automation();
  exact.ci.exactSha = "yes";
  refused(exact, "automation.ci.exactSha");
  const upstream = automation();
  upstream.publication.upstream = "main";
  refused(upstream, "automation.publication.upstream");
  const absentCi = automation();
  delete absentCi.ci;
  refused(absentCi, "automation.ci");
  const extra = automation();
  extra.approved = true;
  refused(extra, "automation");

  // The stored plan is validated too (a hand-edited block is refused).
  const edited = structuredClone(plan);
  edited.scope.automation.delivery[0].taskId = "T001";
  assert.throws(
    () => plans.validate(edited),
    (error) => error.code === "PLAN_AUTOMATION"
  );
  // scope.proposal: the reviewed proposal of a chosen scope.
  const chosen = structuredClone(plan);
  chosen.scope.proposal = { digest: "b".repeat(64), generation: 2 };
  assert.deepEqual(plans.parse(plans.render(chosen)), chosen);
  chosen.scope.proposal = { digest: "short", generation: 2 };
  assert.throws(
    () => plans.validate(chosen),
    (error) =>
      error.code === "PLAN_SCHEMA" && error.details?.field === "scope.proposal"
  );

  // plan:extend keeps the block; a new delivery task gets no effects.
  const extended = plans.extend(
    plan,
    {
      round: "current",
      tasks: [
        {
          acceptance: ["B works"],
          commitMessage: "fix: B",
          files: ["src/b.ts"],
          id: "T003",
          title: "B",
        },
      ],
    },
    context
  );
  assert.deepEqual(extended.plan.scope.automation, plan.scope.automation);

  // Carryover starts a new agreement: the block and the proposal are dropped.
  const proposed = structuredClone(plan);
  proposed.scope.proposal = { digest: "c".repeat(64), generation: 1 };
  const carried = plans.carryover(
    plans.validate(proposed),
    { approval: "User: continue in a new scope", id: "demo-2" },
    context
  );
  assert.equal("automation" in carried.scope, false);
  assert.equal("proposal" in carried.scope, false);
  console.log("workflow-plan automation tests passed");
} finally {
  build.cleanup();
}
