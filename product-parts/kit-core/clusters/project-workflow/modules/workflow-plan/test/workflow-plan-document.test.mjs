import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-document"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-plan-document-"));
try {
  const { WorkflowPlanFacade, PLAN_PATH } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const plans = new WorkflowPlanFacade();
  const at = "2026-11-03T10:00:00.000Z";
  const plan = {
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
      acceptance: ["it works"],
      acceptanceNote: null,
      approval: { at, text: "approved" },
      baselineCommit: "b".repeat(40),
      blockedReason: null,
      context: [],
      decisions: [],
      delivery: "IN_PROGRESS",
      id: "demo",
      objective: "Ship the demo",
      spec: null,
      status: "ACTIVE",
    },
    tasks: [
      {
        acceptance: ["done"],
        checks: [],
        commitMessage: "feat: demo",
        confirmation: null,
        context: [],
        dependencies: [],
        docsWaiver: null,
        files: ["src/a.ts"],
        fixes: null,
        id: "T001",
        iteration: 1,
        kind: "work",
        roundId: "R1",
        status: "IN_PROGRESS",
        title: "Demo task",
        why: "needed",
      },
    ],
  };
  const text = plans.render(plan);
  assert.match(text, /<!-- harness-workflow:begin -->/u);
  assert.match(text, /- \[IN_PROGRESS\] T001 — Demo task \(work\)/u);
  assert.deepEqual(plans.parse(text), plan);
  assert.deepEqual(
    plans.parse(text.replaceAll("\n", "\r\n")),
    plan,
    "CRLF checkouts parse"
  );
  assert.equal(plans.isPlanDocument(text), true);
  assert.equal(
    plans.isPlanDocument("# Harness AI Development TODO Plan"),
    false
  );

  const tampered = text.replace(
    "Ship the demo\n\n## Acceptance",
    "Ship it now\n\n## Acceptance"
  );
  assert.throws(
    () => plans.parse(tampered),
    (error) => error.code === "PLAN_PROJECTION"
  );
  assert.deepEqual(plans.parse(tampered, { projection: false }), plan);
  assert.throws(
    () => plans.parse(`${text}\n<!-- harness-workflow:begin -->`),
    (error) => error.code === "PLAN_MARKERS"
  );
  assert.throws(
    () => plans.parse(text.replace('"schema"', '"schema" "x"')),
    (error) => error.code === "PLAN_JSON"
  );

  assert.equal(plans.read(root), null);
  plans.write(root, plan);
  assert.equal(
    readFileSync(path.join(root, ...PLAN_PATH.split("/")), "utf8"),
    text
  );
  assert.deepEqual(plans.read(root), plan);
  writeFileSync(plans.planFile(root), tampered);
  assert.throws(
    () => plans.read(root),
    (error) => error.code === "PLAN_PROJECTION"
  );

  const empty = plans.render(plans.createEmpty("p-2", "Fresh"));
  assert.match(empty, /No active scope\./u);
  console.log("workflow-plan document tests passed");
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
