import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { code, local, openKit, write } from "./workflow-kit-support.mjs";

// M39 T003: a started delivery whose CI failed goes back to TODO
// (task:defer-delivery), a new fixes round and a new delivery D002 come
// before it, and DONE tasks keep their commits.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-delivery-defer");
const roots = [];
const delivery = (id, fields = {}) => ({
  acceptance: [`${id} done`],
  commitMessage: `chore: ${id.toLowerCase()}`,
  files: [`docs/${id.toLowerCase()}.md`],
  id,
  kind: "delivery",
  title: `Delivery ${id}`,
  ...fields,
});
const scope = {
  acceptance: ["The note is delivered"],
  approval: "User approved the delivery scope",
  id: "ship",
  objective: "Deliver one note",
  spec: "docs/spec.md",
  tasks: [
    { acceptance: ["note"], commitMessage: "docs: note", files: ["docs/note.md"], id: "T001", title: "Note" },
    delivery("T011"),
    delivery("T012", { dependencies: ["T011"], files: ["docs/ci.md"] }),
  ],
};
const digest = { contracts: [], decisions: [], references: [], result: "Done." };
try {
  const { cli, git, kit, plans, project } = await openKit(build, { clock: "14:00", prefix: "workflow-defer-", roots });
  const root = project();
  write(root, "docs/spec.md", "# Spec\n");
  kit.commitDocs(root, ["docs/spec.md"], "docs: add the spec");
  const revision = () => plans.read(root).revision;
  const order = () => plans.read(root).tasks.map((task) => `${task.id}:${task.status}`);
  const envelope = (argv) => JSON.parse(cli(root, argv).stdout);
  const commits = () =>
    Object.fromEntries(
      git.history(root, null)
        .filter((entry) => (entry.trailers["Workflow-Task"]?.[0] ?? "-") !== "-")
        .map((entry) => [entry.trailers["Workflow-Task"][0], entry.sha])
    );

  kit.createScope(root, scope);
  kit.startTask(root, "T001");
  write(root, "docs/note.md", "# Note\n");
  kit.commitTask(root, "T001");
  kit.startTask(root, "DOCS-R1");
  write(root, "README.md", "# Demo\n");
  kit.commitTask(root, "DOCS-R1", { digest });
  kit.startTask(root, "T011", "User: build and install the note");
  write(root, "docs/t011.md", "# Installed\n");
  kit.commitTask(root, "T011");
  kit.startTask(root, "T012", "User: check CI on the exact SHA");
  const done = commits();
  assert.deepEqual(Object.keys(done).sort(), ["DOCS-R1", "T001", "T011"]);

  // Refusals change nothing.
  const before = revision();
  const head = git.head(root);
  const defer = (id, rev = revision(), reason = "CI failed: abc123 https://ci/run/1") =>
    envelope(["task:defer-delivery", id, "--reason", reason, "--expected-revision", String(rev)]);
  assert.equal(envelope(["task:defer-delivery", "T012", "--reason", "CI failed: abc123"]).code, "USAGE");
  assert.equal(defer("T012", before, "red").code, "USAGE");
  assert.equal(defer("T012", before - 1).code, "REVISION_MISMATCH");
  assert.equal(defer("T011").code, "DELIVERY_DEFER_NOT_ALLOWED");
  assert.equal(defer("T001").code, "DELIVERY_DEFER_NOT_ALLOWED");
  assert.equal(defer("T999").code, "UNKNOWN_TASK");
  write(root, "docs/ci.md", "# Evidence written too early\n");
  const dirty = defer("T012");
  assert.equal(dirty.code, "DIRTY_TREE");
  assert.deepEqual(dirty.details.paths, ["docs/ci.md"]);
  rmSync(`${root}/docs/ci.md`);
  write(root, ".harness/workflow/local/integration.json", "{}");
  assert.equal(defer("T012").code, "INTEGRATION_ACTIVE");
  rmSync(local(root, "integration.json"));
  // A new round cannot open while the delivery runs.
  const fixes = {
    kind: "fixes",
    round: "new",
    tasks: [
      { acceptance: ["fixed"], commitMessage: "fix: note", files: ["docs/note.md"], fixes: "T001", id: "F001", title: "Fix the note", why: "CI failed on the note" },
      delivery("D002", { files: ["docs/t011.md"], title: "Deliver the next patch" }),
    ],
  };
  assert.equal(code(() => kit.extend(root, fixes, revision())), "ROUND_OPEN");
  assert.equal(revision(), before);
  assert.equal(git.head(root), head);

  // The defer: a Kit commit; the attempt, its confirmation and the reason stay.
  const deferred = envelope(["task:defer-delivery", "T012", "--reason", "CI failed: abc123 https://ci/run/1", "--outcome", "Windows ARM64 failed", "--expected-revision", String(before)]);
  assert.equal(deferred.ok, true, JSON.stringify(deferred));
  assert.deepEqual(
    [deferred.result.deferredIteration, deferred.result.nextIteration, deferred.result.commit.role],
    [1, 2, "deferral"]
  );
  assert.equal(git.history(root, null).at(-1).subject, "chore: defer delivery T012 (attempt 1)");
  const t012 = plans.read(root).tasks.find((task) => task.id === "T012");
  assert.deepEqual(
    [t012.status, t012.iteration, t012.confirmation, plans.read(root).currentTaskId],
    ["TODO", 2, null, null]
  );
  assert.deepEqual(t012.deferrals.map((entry) => [entry.iteration, entry.reason, entry.outcome, entry.confirmation]), [
    [1, "CI failed: abc123 https://ci/run/1", "Windows ARM64 failed", "User: check CI on the exact SHA"],
  ]);
  assert.match(kit.showTask(root, "T012"), /deferred attempt 1: .+: CI failed: abc123 https:\/\/ci\/run\/1; outcome: Windows ARM64 failed/u);
  assert.equal(defer("T012").code, "DELIVERY_DEFER_NOT_ALLOWED");

  // A new fixes round with D002; T012 then waits for D002.
  const extended = kit.extend(root, fixes, revision());
  assert.equal(extended.roundId, "R2");
  assert.deepEqual(order(), ["T001:DONE", "DOCS-R1:DONE", "T011:DONE", "F001:TODO", "DOCS-R2:TODO", "D002:TODO", "T012:TODO"]);
  const deps = (id) => plans.read(root).tasks.find((task) => task.id === id).dependencies;
  kit.updateTask(root, "T012", { dependencies: [...deps("T012"), "D002"] }, revision());
  assert.ok(deps("T012").includes("D002"));
  assert.notEqual(code(() => kit.startTask(root, "T012", "User: check CI again")), "OK");
  kit.startTask(root, "F001");
  write(root, "docs/note.md", "# Note, fixed\n");
  kit.commitTask(root, "F001");
  kit.startTask(root, "DOCS-R2");
  write(root, "README.md", "# Demo, fixed\n");
  kit.commitTask(root, "DOCS-R2", { digest });
  assert.equal(code(() => kit.startTask(root, "T012", "User: check CI again")), "DEPENDENCY_PENDING");
  kit.startTask(root, "D002", "User: deliver the next patch");
  write(root, "docs/t011.md", "# Installed 0.15.1\n");
  kit.commitTask(root, "D002");
  kit.startTask(root, "T012", "User: check CI on the exact SHA");
  write(root, "docs/ci.md", "# CI green\n");
  kit.commitTask(root, "T012");
  const final = commits();
  for (const [id, sha] of Object.entries(done)) {
    assert.equal(final[id], sha, `${id} keeps its commit`);
  }
  assert.equal(plans.read(root).tasks.find((task) => task.id === "T012").iteration, 2);
  assert.equal(kit.status(root).scope.delivery, "READY_FOR_ACCEPTANCE");
  assert.deepEqual(kit.validate(root).errors, []);
  console.log("workflow-kit delivery defer tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
