import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import {
  code,
  docsScope,
  failure,
  lintProfile,
  local,
  openKit,
  work,
  write,
} from "./workflow-kit-support.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-assignment"],
  "workflow-kit-assignment"
);
const roots = [];
try {
  const { cli, git, kit, orchestrate, plans, project } = await openKit(build, {
    clock: "11:00",
    prefix: "workflow-assignment-",
    roots,
  });

  // --- A sequential scope has no assignments. ---
  const plain = project();
  kit.createScope(plain, docsScope("docs-1"));
  assert.equal(kit.nextAssignments(plain).idle, "NOT_ORCHESTRATED");
  assert.equal(
    code(() => kit.createAssignment(plain, "N")),
    "NOT_ORCHESTRATED"
  );
  assert.equal(existsSync(local(plain, "assignments")), false);

  // --- An orchestrated scope (maxWorkers 2). ---
  const root = project();
  write(root, "docs/spec.md", "# Spec\n\nFive modules.\n");
  orchestrate(root, {
    acceptance: ["The modules exist"],
    approval: "User approved the orchestrated scope",
    execution: { maxWorkers: 2 },
    id: "par-1",
    objective: "Build five modules",
    spec: "docs/spec.md",
    tasks: [
      work("A", { parallelSafe: true }),
      work("B", { parallelSafe: true }),
      work("C", { files: ["src/a.ts"], parallelSafe: true }),
      work("D", { parallelSafe: true }),
      work("E"),
    ],
  });
  let plan = plans.read(root);
  assert.deepEqual(
    plan.tasks.map((task) => task.id),
    ["QUALITY", "A", "B", "C", "D", "E", "DOCS-R1"]
  );

  // QUALITY first: work waits for it, and QUALITY itself is no assignment.
  let next = kit.nextAssignments(root);
  assert.equal(next.orchestrated, true);
  assert.equal(next.idle, null);
  assert.equal(next.scopeId, "par-1");
  assert.deepEqual(next.ready, []);
  assert.equal(next.blocked[0].taskId, "A");
  assert.equal(next.blocked[0].code, "DEPENDENCY_PENDING");
  assert.deepEqual(next.blocked[0].blockedBy, ["QUALITY"]);
  assert.equal(
    code(() => kit.createAssignment(root, "A")),
    "DEPENDENCY_PENDING"
  );
  const quality = failure(() => kit.createAssignment(root, "QUALITY"));
  assert.equal(quality.code, "ASSIGNMENT_KIND");
  assert.match(quality.nextAction, /task:start QUALITY/u);
  assert.equal(
    code(() => kit.createAssignment(root, "X")),
    "UNKNOWN_TASK"
  );

  // The orchestrator runs QUALITY in main.
  kit.startTask(root, "QUALITY");
  kit.qualityApply(root, lintProfile());
  assert.equal(
    code(() => kit.createAssignment(root, "QUALITY")),
    "ASSIGNMENT_KIND"
  );

  // Ready: A and B; C conflicts with A, D exceeds capacity, E waits.
  next = kit.nextAssignments(root);
  assert.equal(next.maxWorkers, 2);
  assert.deepEqual(next.active, []);
  assert.deepEqual(next.ready, [
    { id: "A", kind: "work", parallelSafe: true, title: "Module A" },
    { id: "B", kind: "work", parallelSafe: true, title: "Module B" },
  ]);
  assert.deepEqual(
    next.blocked.map((item) => [item.taskId, item.code, item.blockedBy]),
    [
      ["C", "ASSIGNMENT_CONFLICT", ["A"]],
      ["D", "ASSIGNMENT_CAPACITY", ["A", "B"]],
      ["E", "ASSIGNMENT_BARRIER", ["A", "B", "C", "D"]],
      ["DOCS-R1", "DEPENDENCY_PENDING", ["A", "B", "C", "D", "E"]],
    ]
  );

  // Preconditions: clean tree, no integration, active scope.
  write(root, "src/stray.ts", "export const stray = 1;\n");
  const dirty = failure(() => kit.createAssignment(root, "A"));
  assert.equal(dirty.code, "DIRTY_TREE");
  assert.deepEqual(dirty.details.paths, ["src/stray.ts"]);
  rmSync(path.join(root, "src"), { force: true, recursive: true });
  write(root, ".harness/workflow/local/integration.json", "{}\n");
  assert.equal(
    code(() => kit.createAssignment(root, "A")),
    "INTEGRATION_ACTIVE"
  );
  rmSync(local(root, "integration.json"));
  kit.block(root, "Waiting for the user");
  assert.equal(
    code(() => kit.createAssignment(root, "A")),
    "SCOPE_NOT_ACTIVE"
  );
  assert.equal(kit.nextAssignments(root).idle, "SCOPE_NOT_ACTIVE");
  kit.unblock(root);
  assert.equal(existsSync(local(root, "assignments")), false);

  // create A: a record, the brief, and no plan change.
  const head = git.head(root);
  const revision = plans.read(root).revision;
  const created = kit.createAssignment(root, "A");
  assert.equal(created.created, true);
  const record = created.assignment;
  assert.equal(record.id, "par-1-A-1");
  assert.equal(record.scopeId, "par-1");
  assert.equal(record.taskId, "A");
  assert.equal(record.iteration, 1);
  assert.equal(record.status, "ASSIGNED");
  assert.equal(record.baseCommit, head);
  assert.equal(record.worktree, null);
  assert.equal(record.branch, null);
  assert.equal(record.sourceCommit, null);
  assert.equal(record.integrationCommit, null);
  assert.equal(record.cleanup, null);
  assert.match(record.configDigest, /^[0-9a-f]{64}$/u);
  assert.deepEqual(
    JSON.parse(
      readFileSync(local(root, "assignments", "par-1-A-1.json"), "utf8")
    ),
    record
  );
  assert.equal(git.head(root), head);
  plan = plans.read(root);
  assert.equal(plan.revision, revision);
  assert.equal(plans.task(plan, "A").status, "TODO");
  assert.equal(plan.currentTaskId, null);
  assert.match(created.brief, /executor of task A of scope par-1/u);
  assert.match(created.brief, /assignment:attach par-1-A-1/u);
  assert.match(created.brief, /task:start A\n/u);
  assert.match(created.brief, /- src\/a\.ts\n/u);
  assert.match(created.brief, /- A works\n/u);
  assert.match(created.brief, /commit --task A\n/u);

  // A retry with the same base returns the same record.
  const again = kit.createAssignment(root, "A");
  assert.equal(again.created, false);
  assert.deepEqual(again.assignment, record);
  assert.equal(again.brief, created.brief);

  // The schedule now counts A as active.
  next = kit.nextAssignments(root);
  assert.deepEqual(
    next.active.map((item) => item.id),
    ["par-1-A-1"]
  );
  assert.deepEqual(
    next.ready.map((item) => item.id),
    ["B"]
  );
  assert.equal(
    code(() => kit.createAssignment(root, "C")),
    "ASSIGNMENT_CONFLICT"
  );
  assert.equal(
    code(() => kit.createAssignment(root, "D")),
    "ASSIGNMENT_CAPACITY"
  );
  const barrier = failure(() => kit.createAssignment(root, "E"));
  assert.equal(barrier.code, "ASSIGNMENT_BARRIER");
  assert.deepEqual(barrier.details.blockedBy, ["A", "B", "C", "D"]);
  assert.match(barrier.nextAction, /assignment:next/u);

  // The CLI: next as JSON and text, create, usage errors.
  const run = (argv) => cli(root, argv);
  const json = JSON.parse(run(["assignment:next"]).stdout);
  assert.equal(json.ok, true);
  assert.equal(json.command, "assignment:next");
  assert.deepEqual(
    json.result.ready.map((item) => item.id),
    ["B"]
  );
  const text = run(["assignment:next", "--format", "text"]);
  assert.equal(text.exit, 0);
  assert.equal(
    text.stdout,
    [
      "assignments: scope par-1, 1 of 2 workers active",
      "active: A par-1-A-1 ASSIGNED",
      "ready: B — Module B (parallel)",
      "blocked: C ASSIGNMENT_CONFLICT (waits for A)",
      "blocked: D ASSIGNMENT_CAPACITY (waits for A, B)",
      "blocked: E ASSIGNMENT_BARRIER (waits for A, B, C, D)",
      "blocked: DOCS-R1 DEPENDENCY_PENDING (waits for A, B, C, D, E)",
      "next: scripts/workflow assignment:create --task B",
      "",
    ].join("\n")
  );
  assert.equal(JSON.parse(run(["assignment:create"]).stdout).code, "USAGE");
  const createdB = run([
    "assignment:create",
    "--task",
    "B",
    "--format",
    "text",
  ]);
  assert.equal(createdB.exit, 0);
  assert.match(
    createdB.stdout,
    /^assignment: par-1-B-1 for B, base [0-9a-f]{12}, created\n/u
  );
  assert.match(createdB.stdout, /assignment:attach par-1-B-1/u);
  const retryB = JSON.parse(run(["assignment:create", "--task", "B"]).stdout);
  assert.equal(retryB.result.created, false);
  assert.equal(retryB.result.assignment.id, "par-1-B-1");
  const full = run(["assignment:next", "--format", "text"]);
  assert.match(full.stdout, /2 of 2 workers active/u);
  assert.match(
    full.stdout,
    /next: nothing to assign now; wait for the active assignments\.\n$/u
  );
  assert.equal(
    JSON.parse(run(["assignment:create", "--task", "D"]).stdout).code,
    "ASSIGNMENT_CAPACITY"
  );

  // One active assignment per task: another status or another base.
  const recordFile = local(root, "assignments", "par-1-A-1.json");
  writeFileSync(
    recordFile,
    JSON.stringify({ ...record, status: "RUNNING" }, null, 2)
  );
  const exists = failure(() => kit.createAssignment(root, "A"));
  assert.equal(exists.code, "ASSIGNMENT_EXISTS");
  assert.deepEqual(exists.details, { id: "par-1-A-1", status: "RUNNING" });
  writeFileSync(recordFile, JSON.stringify(record, null, 2));
  write(root, "docs/note.md", "# Note\n");
  kit.commitDocs(root, ["docs/note.md"], "docs: add a note");
  assert.notEqual(git.head(root), record.baseCommit);
  assert.equal(
    code(() => kit.createAssignment(root, "A")),
    "ASSIGNMENT_EXISTS"
  );
  // An integrated assignment frees its worker.
  writeFileSync(
    recordFile,
    JSON.stringify({ ...record, status: "INTEGRATED" }, null, 2)
  );
  next = kit.nextAssignments(root);
  assert.deepEqual(
    next.active.map((item) => item.id),
    ["par-1-B-1"]
  );
  assert.deepEqual(
    next.ready.map((item) => item.id),
    ["A"]
  );
  assert.equal(
    code(() => kit.createAssignment(root, "A")),
    "ASSIGNMENT_EXISTS"
  );

  // assignment:cancel drops a stuck assignment; the task stays TODO and is
  // handed out again. INTEGRATED records are only cleaned up.
  assert.equal(
    JSON.parse(run(["assignment:cancel", "--id", "par-1-A-1"]).stdout).code,
    "ASSIGNMENT_INTEGRATED"
  );
  assert.equal(
    code(() => kit.cancelAssignment(root, "par-1-X-1")),
    "ASSIGNMENT_UNKNOWN"
  );
  assert.equal(JSON.parse(run(["assignment:cancel"]).stdout).code, "USAGE");
  writeFileSync(
    recordFile,
    JSON.stringify({ ...record, status: "RUNNING" }, null, 2)
  );
  const cancelled = run([
    "assignment:cancel",
    "--id",
    "par-1-A-1",
    "--format",
    "text",
  ]);
  assert.equal(cancelled.exit, 0, cancelled.stderr);
  assert.equal(
    cancelled.stdout,
    [
      "assignment: par-1-A-1 cancelled, task A TODO",
      "worktree: none",
      "branch: none",
      "next: scripts/workflow assignment:create --task A",
      "",
    ].join("\n")
  );
  assert.equal(existsSync(recordFile), false);
  assert.equal(kit.createAssignment(root, "A").created, true);
  const forced = JSON.parse(
    run(["assignment:cancel", "--id", "par-1-B-1", "--force"]).stdout
  );
  assert.equal(forced.ok, true);
  assert.deepEqual(forced.result.task, { id: "B", status: "TODO" });
  assert.match(
    run(["help"]).stdout,
    /scripts\/workflow assignment:cancel --id <id> \[--force\]/u
  );

  console.log("workflow-kit assignment tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
