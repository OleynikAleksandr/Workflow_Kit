import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import {
  chosenProject,
  grantInput,
  passedRecord,
} from "./workflow-kit-autopilot-support.mjs";
import { code, failure, openKit, write } from "./workflow-kit-support.mjs";

// M39 T002: the grant through the Kit facade, the delivery start, the
// verified acceptance and the close of an authorized run.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-autopilot-grant");
const roots = [];
try {
  const opened = await openKit(build, { clock: "12:00", prefix: "workflow-grant-", roots });
  const { git, kit, plans } = opened;
  const { ciCommit, digest, root } = chosenProject(opened);
  const revision = () => plans.read(root).revision;
  const subject = () =>
    execFileSync("git", ["log", "-1", "--format=%s"], { cwd: root, encoding: "utf8", env: opened.env }).trim();

  // The status the host reads: capability, no grant yet, the evidence state.
  let status = kit.autopilotStatus(root);
  assert.deepEqual(status.capability, {
    authorization: true,
    automation: true,
    complete: false,
    hostProtocol: "wfk-host/1",
  });
  assert.equal(status.authorization, null);
  assert.deepEqual(status.proposal, { digest, generation: 1 });
  assert.deepEqual(status.acceptance, [
    {
      checks: ["unit"],
      criterion: 0,
      evidence: ["docs/evidence/result.md"],
      evidenceMissing: ["docs/evidence/result.md"],
      kind: "automatic",
    },
  ]);

  // A stale revision and a changed digest are refused before any write.
  const head = git.head(root);
  assert.equal(code(() => kit.authorize(root, grantInput(digest), revision() - 1)), "REVISION_MISMATCH");
  assert.equal(code(() => kit.authorize(root, grantInput("0".repeat(64)), revision())), "AUTOPILOT_PLAN_CHANGED");
  assert.equal(git.head(root), head);

  // Authorize: a Kit commit with the role authorization.
  const granted = kit.authorize(root, grantInput(digest), revision());
  assert.equal(granted.changed, true);
  assert.equal(granted.commit.role, "authorization");
  assert.equal(subject(), "chore: authorize autopilot run run-1");
  assert.equal(kit.autopilotStatus(root).authorization.runId, "run-1");
  const again = kit.authorize(root, grantInput(digest), revision());
  assert.equal(again.changed, false);
  assert.equal(again.commit, null);

  // settings-off pauses the run; a resume with the same boundaries continues it.
  const off = kit.revoke(root, { note: "Settings: autopilot off", reason: "settings-off", runId: "run-1" }, revision());
  assert.equal(off.grant.revoked.resumable, true);
  assert.equal(subject(), "chore: revoke autopilot run run-1 (settings-off)");
  const resumed = kit.authorize(root, grantInput(digest, { source: "panel-resume" }), revision());
  assert.equal(resumed.grant.revision, 2);
  assert.equal(resumed.grant.revoked, null);

  // Work task N; the grant does not start work tasks.
  assert.equal(code(() => kit.startTask(root, "N", null, "run-1")), "USAGE");
  kit.startTask(root, "N");
  write(root, "docs/note.md", "# Note\n");
  const noteCommit = kit.commitTask(root, "N").commit.sha;
  kit.startTask(root, "DOCS-R1");
  write(root, "README.md", "# Demo\n");
  kit.commitTask(root, "DOCS-R1", {
    digest: { contracts: [], decisions: [], references: [], result: "The note exists." },
  });

  // Delivery: --confirmed and --autopilot-run exclude each other; an unknown run is refused.
  assert.equal(code(() => kit.startTask(root, "D1", "User said ship", "run-1")), "USAGE");
  assert.equal(code(() => kit.startTask(root, "D1", null, "run-x")), "AUTOPILOT_UNAUTHORIZED");
  const started = kit.startTask(root, "D1", null, "run-1");
  assert.equal(started.task.id, "D1");
  assert.match(
    plans.read(root).tasks.find((task) => task.id === "D1").confirmation,
    /^Autopilot run run-1 \(authorization 2, panel-resume, .+\): User started the plan .+ \| effects: write the release note$/u
  );
  // A revoke while the task runs is saved for the task commit, not committed.
  const headInTask = git.head(root);
  const offInTask = kit.revoke(root, { note: "Settings: off", reason: "settings-off", runId: "run-1" }, revision());
  assert.equal(offInTask.commit, null);
  assert.equal(git.head(root), headInTask);
  kit.authorize(root, grantInput(digest, { source: "panel-resume" }), revision());
  write(root, "docs/release.md", "# Release\n");
  kit.commitTask(root, "D1");
  assert.equal(kit.status(root).scope.delivery, "READY_FOR_ACCEPTANCE");

  // Acceptance evidence: committed result files, passed checks, CI of the result.
  write(root, "docs/evidence/result.md", "# Result\n");
  kit.commitDocs(root, ["docs/evidence/result.md"], "docs: add the result evidence");
  status = kit.autopilotStatus(root);
  assert.deepEqual(status.acceptance[0].evidenceMissing, []);
  const current = git.head(root);
  const evidence = (fields = {}) => ({
    ci: { checks: ["Linux x64"], sha: ciCommit },
    criteria: [
      {
        checks: [{ commit: noteCommit, id: "unit" }],
        criterion: 0,
        evidence: ["docs/evidence/result.md"],
      },
    ],
    head: current,
    ...fields,
  });
  const refused = (input, label) => {
    const error = failure(() => kit.acceptRun(root, "run-1", input, revision()));
    assert.equal(error?.code, "AUTOPILOT_EVIDENCE_REQUIRED", label);
    assert.equal(kit.status(root).scope.delivery, "READY_FOR_ACCEPTANCE", label);
  };
  refused(evidence({ head: noteCommit }), "another head");
  refused(evidence(), "no verification record");
  passedRecord(root, noteCommit, "unit");
  refused(evidence({ ci: { checks: [], sha: ciCommit } }), "missing CI check");
  refused(evidence({ ci: null }), "no CI result");
  refused(evidence({ ci: { checks: ["Linux x64"], sha: "f".repeat(40) } }), "CI of an unknown commit");
  // exactSha: after the CI commit only documentation and the plan may change.
  const beforeCi = execFileSync("git", ["rev-parse", `${ciCommit}^`], { cwd: root, encoding: "utf8", env: opened.env }).trim();
  refused(evidence({ ci: { checks: ["Linux x64"], sha: beforeCi } }), "functional change after CI");
  refused(evidence({ criteria: [{ checks: [{ commit: noteCommit, id: "unit" }], criterion: 0, evidence: [] }] }), "evidence not named");
  assert.equal(code(() => kit.acceptRun(root, "run-x", evidence(), revision())), "AUTOPILOT_UNAUTHORIZED");
  assert.equal(code(() => kit.acceptRun(root, "run-1", evidence(), revision() - 1)), "REVISION_MISMATCH");
  const accepted = kit.acceptRun(root, "run-1", evidence(), revision());
  assert.match(subject(), /^chore: accept scope auto \(autopilot run run-1\)$/u);
  let plan = plans.read(root);
  assert.equal(plan.scope.delivery, "ACCEPTED");
  assert.equal(plan.scope.acceptanceEvidence.head, current);
  assert.deepEqual(plan.scope.acceptanceEvidence.ci, { checks: ["Linux x64"], sha: ciCommit });
  assert.ok(accepted.commit.sha);
  const packet = kit.recover(root).text;
  assert.match(packet, /Autopilot: run run-1 \(after-start, authorization 3, panel-resume\)/u);
  assert.match(packet, /Accepted automatically by run run-1 at /u);

  // Close: a clean tree, the run and the final commit in the closed reference.
  write(root, "notes.txt", "temporary\n");
  assert.equal(code(() => kit.closeRun(root, "auto", "run-1", revision())), "DIRTY_TREE");
  rmSync(`${root}/notes.txt`);
  const finalHead = git.head(root);
  kit.closeRun(root, "auto", "run-1", revision());
  plan = plans.read(root);
  assert.equal(plan.scope, null);
  assert.equal(plan.lastClosed.autopilotRun, "run-1");
  assert.equal(plan.lastClosed.finalCommit, finalHead);
  assert.equal(subject(), "chore: close scope auto (autopilot run run-1)");

  // user-stop is final: the old run never resumes.
  const second = chosenProject(opened);
  const rev2 = () => plans.read(second.root).revision;
  kit.authorize(second.root, grantInput(second.digest), rev2());
  kit.revoke(second.root, { note: "User: stop", reason: "user-stop", runId: "run-1" }, rev2());
  assert.equal(
    code(() => kit.authorize(second.root, grantInput(second.digest, { source: "panel-resume" }), rev2())),
    "AUTOPILOT_REVOKED"
  );
  assert.equal(code(() => kit.startTask(second.root, "D1", null, "run-1")), "AUTOPILOT_REVOKED");
  console.log("workflow-kit autopilot grant tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
