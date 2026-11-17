import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// M41 T001: which task can record a passed check in the evidence of its
// commit — the runner's selection, the delivery checks a delivery task names
// and `appliesTo` against the task files.
const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-quality"],
  "workflow-quality-recording"
);
const { WorkflowQualityFacade } = await build.load(
  "workflow-quality",
  "workflow-quality-facade.js"
);
const quality = new WorkflowQualityFacade();
const run = { args: ["-e", "process.exit(0)"], executable: "node" };
const check = (id, stage, fields = {}) => ({
  command: run,
  id,
  role: "custom",
  stage,
  // Only package or installed checks run at the delivery stage.
  ...(stage === "delivery" ? { evidence: "The installed app answers", role: "installed" } : {}),
  ...fields,
});
const config = quality.previewProfile(process.cwd(), {
  checks: [
    check("lint", "commit", { required: true }),
    check("unit", "commit"),
    check("fix", "prepare"),
    check("installed", "delivery", { required: true }),
    check("smoke", "delivery"),
    check("src-smoke", "delivery", { appliesTo: ["src/**"] }),
    check("push-guard", "push", { required: true }),
  ],
  stacks: ["node"],
});
const task = (kind, checks = [], files = []) => ({ checks, files, kind });
const work = task("work", [], ["src/a.ts"]);
const docs = task("docs");
const delivery = task("delivery", ["smoke", "src-smoke"], ["docs/release.md"]);

// Commit checks: a required one by any implementation task, an assigned one by its task.
assert.equal(quality.canRecord(config, "lint", work), true);
assert.equal(quality.canRecord(config, "lint", delivery), true);
assert.equal(quality.canRecord(config, "unit", work), false);
assert.equal(quality.canRecord(config, "unit", task("work", ["unit"])), true);
// Service commits run only the documentation builtins: never kit:file-lines.
assert.equal(quality.canRecord(config, "lint", docs), false);
assert.equal(quality.canRecord(config, "kit:md-links", docs), true);
assert.equal(quality.canRecord(config, "kit:file-lines", docs), false);
assert.equal(quality.canRecord(config, "kit:file-lines", work), true);
assert.equal(quality.canRecord(config, "kit:md-links", task("quality")), true);
// Prepare: stored after the task commit; QUALITY has no prepare stage.
assert.equal(quality.canRecord(config, "fix", task("work", ["fix"])), true);
assert.equal(quality.canRecord(config, "fix", task("docs", ["fix"])), true);
assert.equal(quality.canRecord(config, "fix", task("quality", ["fix"])), false);
assert.equal(quality.canRecord(config, "fix", work), false);
// Delivery: only a delivery task that names the check, even a required one.
assert.equal(quality.canRecord(config, "smoke", delivery), true);
assert.equal(quality.canRecord(config, "installed", delivery), false);
assert.equal(quality.canRecord(config, "smoke", task("work", ["smoke"])), false);
// Push never reaches the evidence of a commit.
assert.equal(quality.canRecord(config, "push-guard", work), false);
// appliesTo: src/** with docs-only files is skipped by the runner, so no record.
assert.equal(quality.canRecord(config, "src-smoke", delivery), false);
assert.equal(
  quality.canRecord(config, "src-smoke", task("delivery", ["src-smoke"], ["src"])),
  true,
  "a task directory under which the glob starts"
);
assert.equal(
  quality.canRecord(config, "src-smoke", task("delivery", ["src-smoke"], [])),
  true,
  "a task without files may change anything"
);
assert.equal(quality.canRecord(config, "missing", work), false);

// The reasons of the checks no task records; unknown ids are CHECK_UNKNOWN's.
assert.deepEqual(
  quality.unrecordedChecks(
    config,
    ["lint", "push-guard", "installed", "src-smoke", "unit", "smoke", "missing", "lint"],
    [work, docs, delivery]
  ),
  [
    { check: "push-guard", reason: "stage-push", stage: "push" },
    { check: "installed", reason: "delivery-unassigned", stage: "delivery" },
    { check: "src-smoke", reason: "applies-to", stage: "delivery" },
    { check: "unit", reason: "not-assigned", stage: "commit" },
  ]
);
// Only DOCS left: kit:file-lines can no longer be recorded, kit:md-links can.
assert.deepEqual(
  quality.unrecordedChecks(config, ["kit:file-lines", "kit:md-links"], [docs]),
  [{ check: "kit:file-lines", reason: "not-assigned", stage: "commit" }]
);
assert.deepEqual(quality.unrecordedChecks(config, ["lint"], []), [
  { check: "lint", reason: "not-assigned", stage: "commit" },
]);
