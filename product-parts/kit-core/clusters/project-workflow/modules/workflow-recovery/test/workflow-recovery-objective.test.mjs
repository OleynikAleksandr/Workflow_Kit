import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// The objective section: a legacy scope and a scope with the M39 automation block.
const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan", "workflow-recovery"],
  "workflow-recovery-objective"
);
try {
  const { WorkflowRecoveryFacade } = await build.load(
    "workflow-recovery",
    "workflow-recovery-facade.js"
  );
  const recovery = new WorkflowRecoveryFacade();
  const plan = (scope = {}) => ({
    currentTaskId: null,
    lastClosed: null,
    projectId: "p-1",
    projectName: "Demo",
    revision: 3,
    rounds: [
      { digest: null, id: "R1", kind: "implementation", status: "OPEN", title: "R1" },
    ],
    schema: "harness-workflow-plan/1",
    scope: {
      acceptance: ["All tests pass"],
      acceptanceNote: null,
      approval: { at: "2026-11-16T10:00:00Z", text: "approved by the user" },
      baselineCommit: "a".repeat(40),
      blockedReason: null,
      context: [],
      decisions: [],
      delivery: "IN_PROGRESS",
      id: "scope-1",
      objective: "Ship the feature",
      spec: null,
      status: "ACTIVE",
      ...scope,
    },
    tasks: [
      {
        acceptance: ["it works"],
        checks: [],
        commitMessage: "feat: T001",
        confirmation: null,
        context: [],
        dependencies: [],
        docsWaiver: null,
        files: ["src/T001.ts"],
        fixes: null,
        id: "T001",
        iteration: 1,
        kind: "work",
        roundId: "R1",
        status: "TODO",
        title: "Task T001",
        why: "because",
      },
    ],
  });
  const packet = (value) =>
    recovery.build({
      budgetBytes: 32_000,
      changes: [],
      event: "startup",
      head: "b".repeat(40),
      plan: value,
      quality: { stacks: [], status: "NONE" },
      readDocument: () => null,
      taskCommits: {},
      transaction: null,
      verification: null,
    }).text;

  // A legacy scope: the section is unchanged.
  const legacy = packet(plan());
  assert.match(
    legacy,
    /## objective\nShip the feature\n\nAcceptance:\n- All tests pass\n\n## /u
  );
  assert.doesNotMatch(legacy, /Automation:|Reviewed proposal/u);

  // Criterion kinds, the automation summary and the reviewed proposal.
  const automated = packet(
    plan({
      acceptance: ["All tests pass", "The user likes it"],
      automation: {
        acceptance: [
          { checks: ["tests"], criterion: 0, evidence: [], kind: "automatic" },
          { checks: [], criterion: 1, evidence: [], kind: "manual" },
        ],
        ci: null,
        delivery: [],
        publication: { branch: "main", upstream: "origin/main" },
      },
      proposal: { digest: "e".repeat(64), generation: 3 },
    })
  );
  assert.ok(
    automated.includes(
      [
        "## objective",
        "Ship the feature",
        "",
        "Acceptance:",
        "- All tests pass [automatic]",
        "- The user likes it [manual]",
        "",
        "Automation:",
        "- acceptance: 1 automatic, 1 manual (manual: 2)",
        "- delivery effects: none",
        "- ci: none",
        "- publication: main → origin/main",
        `Reviewed proposal: generation 3, digest ${"e".repeat(64)}`,
        "",
      ].join("\n")
    ),
    automated
  );
  console.log("workflow-recovery objective tests passed");
} finally {
  await build.cleanup();
}
