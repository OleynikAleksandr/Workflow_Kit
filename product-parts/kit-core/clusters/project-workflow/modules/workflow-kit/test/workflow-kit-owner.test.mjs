import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import {
  code,
  docsScope,
  failure,
  lintProfile,
  openKit,
  work,
  write,
} from "./workflow-kit-support.mjs";

// scope:owner moves the owner session of an unstarted plan (spec M31 3.1).
const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-assignment"],
  "workflow-kit-owner"
);
const roots = [];
try {
  const { cli, git, kit, orchestrate, plans, project } = await openKit(build, {
    clock: "12:00",
    prefix: "workflow-owner-",
    roots,
  });

  // --- No scope: NO_SCOPE; empty flags: USAGE. ---
  const empty = project("harness");
  assert.equal(
    code(() => kit.moveOwner(empty, { note: "moved", session: "s-2" })),
    "NO_SCOPE"
  );
  const run = (root, argv) => JSON.parse(cli(root, argv).stdout);
  assert.equal(
    run(empty, ["scope:owner", "--session", "s-2"]).code,
    "USAGE"
  );
  assert.equal(
    run(empty, ["scope:owner", "--session", " ", "--note", "moved"]).code,
    "USAGE"
  );

  // --- A chosen, unstarted sequential plan of session s-1. ---
  const root = project("harness");
  kit.proposeScope(root, docsScope("docs-o"), "sequential", "One small note");
  kit.chooseScope(root, {
    generation: 1,
    note: "Run it sequentially",
    option: "sequential",
    session: "s-1",
  });
  const before = plans.read(root);
  const head = git.head(root);
  assert.equal(before.scope.execution.ownerSession, "s-1");

  // The same owner changes nothing.
  const same = kit.moveOwner(root, { note: "same session", session: "s-1" });
  assert.equal(same.changed, false);
  assert.equal(same.previous, "s-1");
  assert.equal(same.revision, before.revision);
  assert.equal(plans.read(root).revision, before.revision);

  // Another session becomes the owner: revision + 1, a decision, no commit.
  const moved = run(root, [
    "scope:owner",
    "--session",
    "s-2",
    "--note",
    "The user started the plan from this session",
  ]);
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.result, {
    changed: true,
    execution: { maxWorkers: 3, ownerSession: "s-2", strategy: "sequential" },
    previous: "s-1",
    revision: before.revision + 1,
  });
  const after = plans.read(root);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.scope.execution.ownerSession, "s-2");
  assert.equal(
    after.scope.decisions.at(-1).text,
    "Owner session moved from s-1 to s-2: The user started the plan from this session"
  );
  assert.equal(git.head(root), head);
  assert.equal(kit.status(root).execution.ownerSession, "s-2");
  assert.equal(
    cli(root, ["scope:owner", "--session", "s-3", "--note", "again", "--format", "text"]).stdout,
    `owner: s-2 → s-3 (revision ${before.revision + 2})\n`
  );
  assert.equal(
    cli(root, ["scope:owner", "--session", "s-3", "--note", "again", "--format", "text"]).stdout,
    "owner: s-3 (unchanged)\n"
  );
  assert.match(cli(root, ["help"]).stdout, /scope:owner --session <id> --note/u);

  // A started task keeps the owner.
  kit.startTask(root, "N");
  const busy = failure(() =>
    kit.moveOwner(root, { note: "too late", session: "s-4" })
  );
  assert.equal(busy.code, "OWNER_BUSY");
  assert.deepEqual(busy.details.tasks, ["N"]);
  assert.match(busy.nextAction, /owner session/u);
  assert.equal(plans.read(root).scope.execution.ownerSession, "s-3");
  // The same owner is still answered without a change.
  assert.equal(
    kit.moveOwner(root, { note: "same", session: "s-3" }).changed,
    false
  );

  // --- An orchestrated plan with an open assignment keeps the owner. ---
  const par = project("harness");
  write(par, "docs/spec.md", "# Spec\n\nTwo modules.\n");
  orchestrate(par, {
    acceptance: ["The modules exist"],
    approval: "User approved the orchestrated scope",
    id: "par-o",
    objective: "Build two modules",
    spec: "docs/spec.md",
    tasks: [work("A", { parallelSafe: true }), work("B", { parallelSafe: true })],
  });
  kit.startTask(par, "QUALITY");
  kit.qualityApply(par, lintProfile());
  kit.createAssignment(par, "A");
  const assigned = failure(() =>
    kit.moveOwner(par, { note: "too late", session: "s-9" })
  );
  assert.equal(assigned.code, "OWNER_BUSY");
  assert.deepEqual(assigned.details.assignments, ["par-o-A-1"]);
  assert.equal(plans.read(par).scope.execution.ownerSession, "session-1");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
