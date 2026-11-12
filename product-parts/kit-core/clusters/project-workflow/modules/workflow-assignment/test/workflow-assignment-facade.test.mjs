import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-assignment"],
  "workflow-assignment"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-assignment-"));
try {
  const { WorkflowAssignmentFacade } = await build.load(
    "workflow-assignment",
    "workflow-assignment-facade.js"
  );
  const assignments = new WorkflowAssignmentFacade();
  const code = (action) => {
    try {
      action();
    } catch (error) {
      return error.code;
    }
    return "OK";
  };

  // A plan fixture: tasks in order, defaults filled in.
  const task = (id, fields = {}) => ({
    acceptance: [`${id} works`],
    checks: [],
    commitMessage: `feat: ${id}`,
    confirmation: null,
    context: [],
    dependencies: [],
    docsWaiver: null,
    files: [`src/${id.toLowerCase()}.ts`],
    fixes: null,
    id,
    iteration: 1,
    kind: "work",
    roundId: "R1",
    status: "TODO",
    title: `Task ${id}`,
    why: `Because of ${id}`,
    ...fields,
  });
  const plan = (
    tasks,
    execution = { maxWorkers: 3, strategy: "orchestrated" }
  ) => ({
    currentTaskId: null,
    projectId: "demo",
    projectName: "Demo",
    revision: 3,
    rounds: [
      { digest: null, id: "R1", kind: "implementation", status: "OPEN" },
    ],
    scope: {
      execution: execution
        ? { ownerSession: "session-1", ...execution }
        : undefined,
      id: "par-1",
      status: "ACTIVE",
    },
    tasks,
  });
  const active = (taskId, status = "ASSIGNED", scopeId = "par-1") => ({
    scopeId,
    status,
    taskId,
  });
  const schedule = (p, records = []) => assignments.schedule(p, records);
  const reasons = (result) =>
    Object.fromEntries(
      result.blocked.map((item) => [item.taskId, [item.code, item.blockedBy]])
    );
  const ps = { parallelSafe: true };

  // --- Scheduler matrix. ---

  // Sequential scope (and a scope without the execution block): nothing.
  const sequential = schedule(
    plan([task("A", ps), task("B", ps)], {
      maxWorkers: 3,
      strategy: "sequential",
    })
  );
  assert.equal(sequential.orchestrated, false);
  assert.equal(sequential.idle, "NOT_ORCHESTRATED");
  assert.deepEqual(sequential.ready, []);
  assert.deepEqual(sequential.blocked, []);
  assert.equal(schedule(plan([task("A", ps)], null)).idle, "NOT_ORCHESTRATED");
  const blockedScope = plan([task("A", ps)]);
  blockedScope.scope.status = "BLOCKED";
  assert.equal(schedule(blockedScope).idle, "SCOPE_NOT_ACTIVE");
  assert.deepEqual(schedule(blockedScope).ready, []);

  // QUALITY and delivery are never assignments; dependencies must be DONE.
  const withQuality = plan([
    task("QUALITY", {
      files: [".harness/workflow/config.json"],
      kind: "quality",
    }),
    task("A", { ...ps, dependencies: ["QUALITY"] }),
    task("DOCS-R1", {
      dependencies: ["QUALITY", "A"],
      files: ["README.md"],
      kind: "docs",
    }),
    task("SHIP", { dependencies: ["DOCS-R1"], files: [], kind: "delivery" }),
  ]);
  let result = schedule(withQuality);
  assert.equal(result.orchestrated, true);
  assert.equal(result.idle, null);
  assert.deepEqual(result.ready, []);
  assert.deepEqual(reasons(result), {
    A: ["DEPENDENCY_PENDING", ["QUALITY"]],
    "DOCS-R1": ["DEPENDENCY_PENDING", ["QUALITY", "A"]],
  });
  withQuality.tasks[0].status = "DONE";
  result = schedule(withQuality);
  assert.deepEqual(result.ready, ["A"]);
  assert.deepEqual(reasons(result), {
    "DOCS-R1": ["DEPENDENCY_PENDING", ["A"]],
  });
  // A dependency with an active assignment is still pending.
  result = schedule(withQuality, [active("A")]);
  assert.deepEqual(result.active, ["A"]);
  assert.deepEqual(result.ready, []);
  // DOCS after all work of its round, even when the dependency list misses one.
  withQuality.tasks[1].status = "DONE";
  result = schedule(withQuality);
  assert.deepEqual(result.ready, ["DOCS-R1"]);
  const extraWork = structuredClone(withQuality);
  extraWork.tasks.splice(2, 0, task("B", { status: "IN_PROGRESS" }));
  assert.deepEqual(reasons(schedule(extraWork))["DOCS-R1"], [
    "DEPENDENCY_PENDING",
    ["B"],
  ]);
  // DONE DOCS: the delivery task stays with the orchestrator.
  withQuality.tasks[2].status = "DONE";
  result = schedule(withQuality);
  assert.deepEqual(result.ready, []);
  assert.deepEqual(result.blocked, []);

  // Barrier: a sequential task needs every earlier task DONE...
  const barrier = plan([task("A", ps), task("S"), task("B", ps)]);
  result = schedule(barrier);
  assert.deepEqual(result.ready, ["A"]);
  assert.deepEqual(reasons(result), {
    B: ["ASSIGNMENT_BARRIER", ["S"]],
    S: ["ASSIGNMENT_BARRIER", ["A"]],
  });
  // ... and no active assignment, even of a later parallel task.
  barrier.tasks[0].status = "DONE";
  assert.deepEqual(schedule(barrier).ready, ["S"]);
  const lone = schedule(barrier, [active("B")]);
  assert.deepEqual(lone.ready, []);
  assert.deepEqual(reasons(lone).S, ["ASSIGNMENT_BARRIER", ["B"]]);
  // An assigned sequential task holds back every later parallel task.
  result = schedule(barrier, [active("S")]);
  assert.deepEqual(result.ready, []);
  assert.deepEqual(reasons(result).B, ["ASSIGNMENT_BARRIER", ["S"]]);
  // A ready sequential task is handed out alone.
  barrier.tasks.push(task("C", ps));
  result = schedule(barrier);
  assert.deepEqual(result.ready, ["S"]);
  assert.deepEqual(reasons(result).C, ["ASSIGNMENT_BARRIER", ["S"]]);
  // A parallel task may overtake an earlier parallel task that waits.
  const overtake = plan([
    task("P", ps),
    task("Q", { ...ps, dependencies: ["P"] }),
    task("R", ps),
  ]);
  result = schedule(overtake, [active("P")]);
  assert.deepEqual(result.ready, ["R"]);
  assert.deepEqual(reasons(result), { Q: ["DEPENDENCY_PENDING", ["P"]] });

  // Path conflicts with active assignments and with earlier ready tasks.
  const conflict = plan([
    task("A", { ...ps, files: ["src/lib"] }),
    task("B", { ...ps, files: ["src/lib/b.ts"] }),
    task("C", { ...ps, files: ["src/libx.ts"] }),
  ]);
  result = schedule(conflict);
  assert.deepEqual(result.ready, ["A", "C"]);
  assert.deepEqual(reasons(result), { B: ["ASSIGNMENT_CONFLICT", ["A"]] });
  result = schedule(conflict, [active("B")]);
  assert.deepEqual(result.ready, ["C"]);
  assert.deepEqual(reasons(result), { A: ["ASSIGNMENT_CONFLICT", ["B"]] });
  // Integrated assignments and other scopes do not count.
  result = schedule(conflict, [
    active("B", "INTEGRATED"),
    active("C", "RUNNING", "old-scope"),
  ]);
  assert.deepEqual(result.active, []);
  assert.deepEqual(result.ready, ["A", "C"]);

  // Capacity: maxWorkers counts active and earlier ready tasks.
  const capacity = plan(
    [task("A", ps), task("B", ps), task("C", ps), task("D", ps)],
    { maxWorkers: 2, strategy: "orchestrated" }
  );
  result = schedule(capacity);
  assert.equal(result.maxWorkers, 2);
  assert.deepEqual(result.ready, ["A", "B"]);
  assert.deepEqual(reasons(result), {
    C: ["ASSIGNMENT_CAPACITY", ["A", "B"]],
    D: ["ASSIGNMENT_CAPACITY", ["A", "B"]],
  });
  result = schedule(capacity, [active("C", "READY_FOR_INTEGRATION")]);
  assert.deepEqual(result.ready, ["A"]);
  assert.deepEqual(reasons(result).B, ["ASSIGNMENT_CAPACITY", ["C", "A"]]);
  // Started tasks (IN_PROGRESS in main) are no candidates.
  capacity.tasks[0].status = "IN_PROGRESS";
  assert.deepEqual(schedule(capacity).ready, ["B", "C"]);

  // --- Records. ---
  assert.equal(assignments.id("par-1", "T001", 1), "par-1-T001-1");
  assert.equal(assignments.id("a b", "T/1", 2), "a-b-T-1-2");
  assert.deepEqual(assignments.list(root), []);
  assert.equal(assignments.read(root, "par-1-A-1"), null);
  assert.equal(
    code(() => assignments.read(root, "../escape")),
    "ASSIGNMENT_ID"
  );
  assert.equal(assignments.configDigest(root), null);
  const record = assignments.create({
    baseCommit: "a".repeat(40),
    configDigest: null,
    iteration: 1,
    now: "2026-11-04T10:00:00Z",
    scopeId: "par-1",
    taskId: "B",
  });
  assert.deepEqual(record, {
    baseCommit: "a".repeat(40),
    branch: null,
    cleanup: null,
    configDigest: null,
    createdAt: "2026-11-04T10:00:00Z",
    id: "par-1-B-1",
    integrationCommit: null,
    iteration: 1,
    scopeId: "par-1",
    setup: null,
    sourceCommit: null,
    status: "ASSIGNED",
    taskId: "B",
    updatedAt: "2026-11-04T10:00:00Z",
    version: 1,
    worktree: null,
  });
  assert.equal(assignments.isActive(record), true);
  assert.equal(assignments.isActive({ status: "INTEGRATED" }), false);
  assignments.write(root, record);
  const older = {
    ...record,
    createdAt: "2026-11-04T09:00:00Z",
    id: "par-1-A-1",
    taskId: "A",
  };
  assignments.write(root, older);
  assert.equal(
    assignments.recordFile(root, record.id),
    path.join(
      root,
      ".harness",
      "workflow",
      "local",
      "assignments",
      "par-1-B-1.json"
    )
  );
  assert.deepEqual(assignments.read(root, record.id), record);
  assert.deepEqual(
    assignments.list(root).map((item) => item.id),
    ["par-1-A-1", "par-1-B-1"]
  );
  // An unreadable record fails instead of being skipped.
  writeFileSync(assignments.recordFile(root, "broken"), "{not json");
  assert.equal(
    code(() => assignments.list(root)),
    "ASSIGNMENT_RECORD"
  );
  writeFileSync(
    assignments.recordFile(root, "broken"),
    JSON.stringify({ ...record, id: "other" })
  );
  assert.equal(
    code(() => assignments.read(root, "broken")),
    "ASSIGNMENT_RECORD"
  );
  rmSync(assignments.recordFile(root, "broken"));
  // The configuration digest is the sha256 of the file text.
  mkdirSync(path.join(root, ".harness", "workflow"), { recursive: true });
  writeFileSync(path.join(root, ".harness", "workflow", "config.json"), "{}\n");
  assert.equal(
    assignments.configDigest(root),
    "ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356"
  );

  // --- Executor brief. ---
  const docsTask = task("DOCS-R1", {
    acceptance: ["Docs are current"],
    context: [{ heading: "Plan", path: "docs/spec.md", required: true }],
    files: ["README.md"],
    kind: "docs",
  });
  const brief = assignments.brief(plan([docsTask]), docsTask, {
    ...record,
    id: "par-1-DOCS-R1-1",
    taskId: "DOCS-R1",
  });
  assert.match(brief, /^You are the executor of task DOCS-R1 of scope par-1/u);
  assert.match(brief, /own git worktree/u);
  assert.match(
    brief,
    /1\. FIRST run in your worktree: scripts\/workflow assignment:attach par-1-DOCS-R1-1\n/u
  );
  assert.match(
    brief,
    / {3}If it reports NEEDS_SETUP, run scripts\/workflow assignment:setup\n/u
  );
  assert.match(brief, /2\. Then run: scripts\/workflow task:start DOCS-R1\n/u);
  assert.match(
    brief,
    / {3}Title: Task DOCS-R1\n {3}Why: Because of DOCS-R1\n/u
  );
  assert.match(brief, / {3}Files:\n {3}- README.md\n/u);
  assert.match(brief, / {3}Acceptance:\n {3}- Docs are current\n/u);
  assert.match(brief, / {3}Context:\n {3}- docs\/spec.md \(Plan\)\n/u);
  assert.match(brief, /commit --task DOCS-R1 --digest <file\.json>/u);
  assert.match(brief, /Reply with the SHA/u);
  assert.match(
    brief,
    /Never touch the main checkout, the plan or other tasks/u
  );
  assert.match(brief, /Do not set the git identity/u);
  assert.match(brief, /Do not create nested executors/u);
  assert.match(
    brief,
    /paths nested inside a listed directory;\n {3}anything else fails with ASSIGNMENT_SCOPE/u
  );
  assert.match(
    brief,
    /scripts\/workflow\* or the plan\n {3}\(ASSIGNMENT_CONTRACT\)/u
  );
  assert.match(
    brief,
    /only these Kit commands work: status, validate, recover,\n {2}show-task, task:start, commit, repair, task:block, assignment:status,\n {2}assignment:setup, assignment:attach \(retry\); anything else fails with\n {2}ASSIGNMENT_READ_ONLY/u
  );
  assert.match(brief, /Never push; the orchestrator integrates your commit/u);
  const workBrief = assignments.brief(plan([task("A")]), task("A"), record);
  assert.match(
    workBrief,
    /Kit: scripts\/workflow commit --task A\n {3}If a check fails/u
  );
  assert.doesNotMatch(workBrief, /Context:/u);
  assert.doesNotMatch(workBrief, /<document /u);

  // The documents follow the brief lines as marked full text.
  const documentBrief = assignments.brief(plan([docsTask]), docsTask, record, [
    {
      bytes: 13,
      heading: 'Plan "A"',
      path: "docs/spec.md",
      text: "## Plan\n\nText",
    },
  ]);
  assert.ok(
    documentBrief.endsWith(
      'Do not create nested executors.\n\nContext documents (full text, do not re-read them):\n\n<document path="docs/spec.md" heading="Plan &quot;A&quot;" bytes="13">\n## Plan\n\nText\n</document>\n'
    )
  );

  console.log("workflow-assignment facade tests passed");
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
