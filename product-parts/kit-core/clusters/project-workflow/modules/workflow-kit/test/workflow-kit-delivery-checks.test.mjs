import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { gitCommit } from "./workflow-kit-autopilot-support.mjs";
import { code, failure, openKit, write } from "./workflow-kit-support.mjs";

// M41 T001: the delivery checks a delivery task names are recorded in the
// evidence of its commit; a criterion no task can record is refused at the
// proposal (AUTOMATION_CHECK_UNRECORDED); autopilot:status names the pending
// and the unreachable checks; the acceptance reads a stored prepare report.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-delivery-checks");
const roots = [];
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-delivery-checks-"));
const runs = path.join(sandbox, "runs.log");
const flag = path.join(sandbox, "smoke-ok");
const logged = (id) => `require('fs').appendFileSync(${JSON.stringify(runs)}, '${id}\\n')`;
const node = (body) => ({ args: ["-e", body], executable: "node" });
const installed = { evidence: "The release answers", role: "installed" };
const PROFILE = {
  checks: [
    { command: node("process.exit(0)"), id: "lint", required: true, role: "lint", stage: "commit" },
    { command: node(logged("prep")), id: "prep", role: "custom", stage: "prepare" },
    { command: node(logged("ship")), id: "ship", required: true, stage: "delivery", ...installed },
    {
      command: node(`${logged("smoke")}; process.exit(require('fs').existsSync(${JSON.stringify(flag)}) ? 0 : 1)`),
      id: "smoke",
      stage: "delivery",
      ...installed,
    },
    { appliesTo: ["src/**"], command: node("process.exit(0)"), id: "src-smoke", stage: "delivery", ...installed },
    { command: node("process.exit(0)"), id: "unit", role: "test", stage: "commit" },
    { command: node("process.exit(0)"), id: "push-guard", role: "custom", stage: "push" },
  ],
  stacks: ["node"],
};
const PUBLICATION = { branch: "main", upstream: "origin/main" };

/** A scope with work W and, unless `delivery` is false, delivery D. */
const scopeInput = (checks, fields = {}) => ({
  acceptance: ["The feature ships"],
  approval: "User approved the delivery scope",
  automation: {
    acceptance: [{ checks, criterion: 0, evidence: ["docs/release.md"], kind: "automatic" }],
    ci: null,
    delivery: [{ effects: ["run the smoke check"], taskId: "D" }],
    publication: PUBLICATION,
  },
  id: "ship",
  objective: "Ship the feature",
  spec: "docs/spec.md",
  tasks: [
    { acceptance: ["w works"], checks: ["prep"], commitMessage: "feat: add w", files: ["src/w.ts"], id: "W", title: "W" },
    {
      acceptance: ["shipped"],
      checks: ["smoke", "src-smoke"],
      commitMessage: "chore: ship",
      dependencies: ["W"],
      files: ["docs/release.md"],
      id: "D",
      kind: "delivery",
      title: "Ship",
    },
  ],
  ...fields,
});
const digestInput = { contracts: [], decisions: [], references: [], result: "Done." };
const ranChecks = () => (existsSync(runs) ? readFileSync(runs, "utf8").trim().split("\n") : []);

try {
  const opened = await openKit(build, { clock: "19:00", prefix: "workflow-delivery-", roots });
  const { env, git, installHooks, kit, plans, project, quality } = opened;

  // ── A configured profile with the Kit hooks.
  const root = project();
  const revision = () => plans.read(root).revision;
  write(root, "docs/spec.md", "# Spec\n");
  gitCommit(root, env, ["docs/spec.md"], "docs: add the specification");
  kit.qualityApply(root, PROFILE);
  installHooks(root, path.join(sandbox, "hooks"));
  const reason = "Work then delivery";

  // Criteria no task of the scope can record are refused before anything is written.
  const refusal = (checks) => failure(() => kit.proposeScope(root, scopeInput(checks), "sequential", reason));
  const expected = {
    "push-guard": ["stage-push", "push"],
    ship: ["delivery-unassigned", "delivery"],
    "src-smoke": ["applies-to", "delivery"],
    unit: ["not-assigned", "commit"],
  };
  for (const [check, [why, stage]] of Object.entries(expected)) {
    const error = refusal(["lint", check]);
    assert.equal(error?.code, "AUTOMATION_CHECK_UNRECORDED", check);
    assert.deepEqual(error.details, { check, field: "automation.acceptance[0].checks", reason: why, stage });
  }
  assert.equal(existsSync(path.join(root, ".harness", "workflow", "local", "scope-proposal.json")), false);

  // Commit, required builtin, stored prepare and named delivery checks are recordable.
  kit.proposeScope(root, scopeInput(["lint", "kit:file-lines", "prep", "smoke"]), "sequential", reason);
  const chosen = kit.chooseScope(root, { generation: 1, note: "User chose sequential", option: "sequential", session: "s-1" });
  kit.authorize(
    root,
    {
      accept: true,
      acceptancePolicy: "automatic",
      ci: null,
      close: true,
      deliveryTaskIds: ["D"],
      mode: "after-start",
      note: "User started the plan with the after-start autopilot",
      ownerSession: "s-1",
      proposalDigest: chosen.proposalDigest,
      publication: PUBLICATION,
      runId: "run-1",
      scopeId: "ship",
      source: "panel-start",
    },
    revision()
  );
  let criterion = kit.autopilotStatus(root).acceptance[0];
  assert.deepEqual(criterion.checksPending, ["lint", "kit:file-lines", "prep", "smoke"]);
  assert.deepEqual(criterion.checksUnreachable, []);

  // The work task: commit checks and its prepare check; no delivery check runs.
  kit.startTask(root, "W");
  write(root, "src/w.ts", "export const w = 1;\n");
  const work = kit.commitTask(root, "W").commit.sha;
  assert.deepEqual(ranChecks(), ["prep"]);
  const workEvidence = quality.readEvidence(root, work);
  assert.deepEqual(workEvidence.reports.map((report) => report.stage), ["prepare", "commit"]);
  criterion = kit.autopilotStatus(root).acceptance[0];
  assert.deepEqual(criterion.checksPending, ["smoke"]);
  assert.deepEqual(criterion.checksUnreachable, []);

  kit.startTask(root, "DOCS-R1");
  write(root, "README.md", "# Demo\n");
  kit.commitTask(root, "DOCS-R1", { digest: digestInput });

  // The delivery task: the named delivery check runs after the commit checks;
  // a failure rolls the commit back and keeps the edits.
  kit.startTask(root, "D", null, "run-1");
  write(root, "docs/release.md", "# Release\n");
  const head = git.head(root);
  const failed = failure(() => kit.commitTask(root, "D"));
  assert.equal(failed?.code, "COMMIT_FAILED");
  assert.match(failed.details.output, /CHECK_FAILED: Delivery checks of the task failed:\n- smoke failed/u);
  assert.equal(git.head(root), head);
  assert.equal(kit.status(root).currentTask.id, "D");
  assert.equal(readFileSync(path.join(root, "docs", "release.md"), "utf8"), "# Release\n");
  writeFileSync(flag, "");
  const shipped = kit.commitTask(root, "D").commit.sha;
  // The required delivery check the task does not name never ran; src-smoke was skipped.
  assert.deepEqual(ranChecks(), ["prep", "smoke", "smoke"]);
  const deliveryReport = quality.readEvidence(root, shipped).reports.find((report) => report.stage === "delivery");
  assert.deepEqual(
    deliveryReport.results.map((result) => [result.id, result.status]),
    [["smoke", "passed"], ["src-smoke", "skipped"]]
  );
  criterion = kit.autopilotStatus(root).acceptance[0];
  assert.deepEqual([criterion.checksPending, criterion.checksUnreachable], [[], []]);

  // The acceptance reads the stored prepare report and the delivery record.
  const accepted = kit.acceptRun(
    root,
    "run-1",
    {
      ci: null,
      criteria: [
        {
          checks: [
            { commit: shipped, id: "lint" },
            { commit: shipped, id: "kit:file-lines" },
            { commit: work, id: "prep" },
            { commit: shipped, id: "smoke" },
          ],
          criterion: 0,
          evidence: ["docs/release.md"],
        },
      ],
      head: git.head(root),
    },
    revision()
  );
  assert.ok(accepted.commit.sha);
  assert.equal(plans.read(root).scope.delivery, "ACCEPTED");

  // ── A new project: a future check id before QUALITY, its stage known after it.
  const fresh = project();
  write(fresh, "docs/spec.md", "# Spec\n");
  gitCommit(fresh, env, ["docs/spec.md"], "docs: add the specification");
  const future = scopeInput([], {
    automation: {
      acceptance: [
        { checks: ["ship"], criterion: 0, evidence: [], kind: "automatic" },
        { checks: ["kit:file-lines", "kit:md-links"], criterion: 1, evidence: [], kind: "automatic" },
      ],
      ci: null,
      delivery: [],
      publication: PUBLICATION,
    },
    acceptance: ["The feature ships", "The documents hold"],
    tasks: [{ acceptance: ["w works"], commitMessage: "feat: add w", files: ["src/w.ts"], id: "W", title: "W" }],
  });
  assert.equal(code(() => kit.proposeScope(fresh, future, "sequential", "One work task")), "OK");
  kit.chooseScope(fresh, { generation: 1, note: "User chose sequential", option: "sequential", session: "s-1" });
  kit.startTask(fresh, "QUALITY");
  kit.qualityApply(fresh, PROFILE);
  let states = kit.autopilotStatus(fresh).acceptance;
  assert.deepEqual(states[0].checksUnreachable, ["ship"], "a delivery check no delivery task names");
  assert.deepEqual(states[1].checksUnreachable, []);
  // Without hooks the work commit records nothing; only DOCS is left, which never runs kit:file-lines.
  kit.startTask(fresh, "W");
  write(fresh, "src/w.ts", "export const w = 1;\n");
  kit.commitTask(fresh, "W");
  states = kit.autopilotStatus(fresh).acceptance;
  assert.deepEqual(states[1].checksPending, ["kit:file-lines", "kit:md-links"]);
  assert.deepEqual(states[1].checksUnreachable, ["kit:file-lines"]);
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  rmSync(sandbox, { force: true, recursive: true });
}
