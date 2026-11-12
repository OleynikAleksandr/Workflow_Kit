import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import {
  docsScope,
  lintProfile,
  local,
  openKit,
  work,
} from "./workflow-kit-support.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-assignment", "workflow-autopilot"],
  "workflow-kit-status"
);
const roots = [];
try {
  const { env, git, kit, project, runCli } = await openKit(build, {
    clock: "12:00",
    prefix: "workflow-status-",
    roots,
  });
  const { WorkflowAutopilotFacade } = await build.load(
    "workflow-autopilot",
    "workflow-autopilot-facade.js"
  );
  const autopilot = new WorkflowAutopilotFacade();
  const writeLocal = (root, name, value) => {
    const file = local(root, ...name.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`
    );
  };
  const patchRecord = (root, id, patch) => {
    const file = local(root, "assignments", `${id}.json`);
    const record = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(
      file,
      `${JSON.stringify({ ...record, ...patch }, null, 2)}\n`
    );
  };
  const statusText = (root) => {
    let stdout = "";
    const exit = runCli(
      ["status", "--format", "text"],
      {
        cwd: root,
        env,
        readStdin: () => "",
        stderr: () => undefined,
        stdout: (text) => {
          stdout += text;
        },
      },
      kit
    );
    assert.equal(exit, 0);
    return stdout;
  };
  const executionLine = (root) =>
    statusText(root)
      .split("\n")
      .find((line) => line.startsWith("execution:"));

  // --- No scope: every new field is empty. ---
  const root = project();
  let status = kit.status(root);
  assert.deepEqual(status.tasks, []);
  assert.equal(status.execution, null);
  assert.deepEqual(status.assignments, []);
  assert.equal(status.integration, null);
  assert.equal(status.scopeProposal, null);
  assert.equal(status.executor, null);
  assert.equal(kit.autopilotStatus(root).orchestration, null);
  assert.equal(kit.autopilotStatus(root).proposalPending, false);
  assert.equal(executionLine(root), "execution: none");

  // --- A pending proposal: scopeProposal and the autopilot flag. ---
  mkdirSync(path.join(root, "docs"), { recursive: true });
  writeFileSync(
    path.join(root, "docs", "spec.md"),
    "# Spec\n\nThree modules.\n"
  );
  kit.proposeScope(
    root,
    {
      acceptance: ["The modules exist"],
      approval: "User approved the orchestrated scope",
      execution: { maxWorkers: 2 },
      id: "orc-1",
      objective: "Build three modules",
      spec: "docs/spec.md",
      tasks: [
        work("A", { parallelSafe: true }),
        work("B", { parallelSafe: true }),
        work("C", { dependencies: ["A"] }),
      ],
    },
    "orchestrated",
    "Independent modules with separate files"
  );
  status = kit.status(root);
  assert.deepEqual(status.scopeProposal, {
    generation: 1,
    hasParallelWork: true,
    options: ["orchestrated", "sequential", "refine"],
    recommended: "orchestrated",
    refining: false,
  });
  assert.equal(status.scope, null);
  assert.equal(kit.autopilotStatus(root).proposalPending, true);
  const on = autopilot.initialState(10, true);
  const turn = { before: { head: null, revision: -1 }, outcome: "completed" };
  assert.equal(
    autopilot.decide(on, kit.autopilotStatus(root), {
      ...turn,
      userMessage: false,
    }).reason,
    "waiting-for-mode-choice"
  );

  // --- The orchestrated scope: tasks, execution, no proposal. ---
  kit.chooseScope(root, {
    generation: 1,
    note: "User clicked orchestrated",
    option: "orchestrated",
    session: "session-1",
  });
  status = kit.status(root);
  assert.equal(status.scopeProposal, null);
  assert.deepEqual(status.execution, {
    maxWorkers: 2,
    ownerSession: "session-1",
    strategy: "orchestrated",
  });
  assert.deepEqual(
    status.tasks.map((task) => [
      task.id,
      task.kind,
      task.roundId,
      task.status,
      task.parallelSafe,
      task.dependencies,
    ]),
    [
      ["QUALITY", "quality", "R1", "TODO", false, []],
      ["A", "work", "R1", "TODO", true, ["QUALITY"]],
      ["B", "work", "R1", "TODO", true, []],
      ["C", "work", "R1", "TODO", false, ["A"]],
      ["DOCS-R1", "docs", "R1", "TODO", false, ["QUALITY", "A", "B", "C"]],
    ]
  );
  assert.equal(status.tasks[1].title, "Module A");
  assert.equal(
    executionLine(root),
    "execution: orchestrated (max 2 workers), assignments: none"
  );
  let pilot = kit.autopilotStatus(root);
  assert.equal(pilot.proposalPending, false);
  assert.deepEqual(pilot.orchestration, {
    assignments: [],
    integration: null,
    readyTasks: [],
  });
  assert.equal(pilot.nextTask.id, "QUALITY");

  // QUALITY in main, then A and B are ready to hand out.
  kit.startTask(root, "QUALITY");
  kit.qualityApply(root, lintProfile());
  assert.deepEqual(kit.autopilotStatus(root).orchestration.readyTasks, [
    "A",
    "B",
  ]);

  // An assignment: listed in status, active for the autopilot.
  const { assignment } = kit.createAssignment(root, "A");
  status = kit.status(root);
  assert.deepEqual(status.assignments, [
    {
      branch: null,
      cleanup: null,
      id: assignment.id,
      integrationCommit: null,
      sourceCommit: null,
      status: "ASSIGNED",
      taskId: "A",
      worktree: null,
    },
  ]);
  pilot = kit.autopilotStatus(root);
  assert.deepEqual(pilot.orchestration.assignments, [
    {
      cleanupPending: false,
      id: assignment.id,
      sourceCommit: null,
      status: "ASSIGNED",
      taskId: "A",
    },
  ]);
  assert.deepEqual(pilot.orchestration.readyTasks, ["B"]);
  assert.equal(
    executionLine(root),
    "execution: orchestrated (max 2 workers), assignments: ASSIGNED 1"
  );

  // The executor reported: READY_FOR_INTEGRATION with its source commit.
  patchRecord(root, assignment.id, {
    branch: "worktree-a",
    sourceCommit: "a".repeat(40),
    status: "READY_FOR_INTEGRATION",
    worktree: "/tmp/wt-a",
  });
  status = kit.status(root);
  assert.equal(status.assignments[0].status, "READY_FOR_INTEGRATION");
  assert.equal(status.assignments[0].branch, "worktree-a");
  assert.equal(status.assignments[0].worktree, "/tmp/wt-a");
  assert.equal(status.assignments[0].sourceCommit, "a".repeat(40));
  assert.equal(
    kit.autopilotStatus(root).orchestration.assignments[0].sourceCommit,
    "a".repeat(40)
  );

  // The integration journal, read defensively.
  writeLocal(root, "integration.json", {
    assignmentId: assignment.id,
    operationId: "op-1",
    phase: "CONFLICT",
    source: "a".repeat(40),
    taskId: "A",
  });
  assert.deepEqual(kit.status(root).integration, {
    assignmentId: assignment.id,
    phase: "CONFLICT",
    taskId: "A",
  });
  assert.deepEqual(kit.autopilotStatus(root).orchestration.integration, {
    assignmentId: assignment.id,
    phase: "CONFLICT",
    taskId: "A",
  });
  assert.equal(
    executionLine(root),
    "execution: orchestrated (max 2 workers), assignments: READY_FOR_INTEGRATION 1, integration A CONFLICT"
  );
  writeLocal(root, "integration.json", "not json");
  assert.deepEqual(kit.status(root).integration, {
    assignmentId: null,
    phase: null,
    taskId: null,
  });
  rmSync(local(root, "integration.json"));

  // Integrated: cleanup PENDING stays for the orchestrator, DONE does not.
  patchRecord(root, assignment.id, {
    cleanup: { at: "2026-11-04T12:30:00Z", reason: "dirty", status: "PENDING" },
    integrationCommit: "b".repeat(40),
    status: "INTEGRATED",
  });
  status = kit.status(root);
  assert.equal(status.assignments[0].integrationCommit, "b".repeat(40));
  assert.equal(status.assignments[0].cleanup.status, "PENDING");
  assert.deepEqual(
    kit
      .autopilotStatus(root)
      .orchestration.assignments.map((item) => [item.id, item.cleanupPending]),
    [[assignment.id, true]]
  );
  patchRecord(root, assignment.id, {
    cleanup: { at: "2026-11-04T12:31:00Z", status: "DONE" },
  });
  assert.equal(kit.status(root).assignments.length, 1);
  assert.deepEqual(kit.autopilotStatus(root).orchestration.assignments, []);
  assert.equal(
    executionLine(root),
    "execution: orchestrated (max 2 workers), assignments: INTEGRATED 1"
  );

  // Records of another scope are not listed.
  writeLocal(root, "assignments/old-1-X-1.json", {
    ...JSON.parse(
      readFileSync(local(root, "assignments", `${assignment.id}.json`), "utf8")
    ),
    id: "old-1-X-1",
    scopeId: "old-1",
    taskId: "X",
  });
  assert.deepEqual(
    kit.status(root).assignments.map((item) => item.id),
    [assignment.id]
  );

  // --- A sequential scope: execution sequential, no orchestration. ---
  const plain = project();
  kit.createScope(plain, docsScope("docs-1"));
  status = kit.status(plain);
  assert.equal(status.execution.strategy, "sequential");
  assert.deepEqual(
    status.tasks.map((task) => [task.id, task.parallelSafe]),
    [
      ["N", false],
      ["DOCS-R1", false],
    ]
  );
  assert.equal(kit.autopilotStatus(plain).orchestration, null);
  assert.equal(executionLine(plain), "execution: sequential");

  // --- An executor worktree: executor set, no assignments or integration. ---
  writeLocal(plain, "assignment.json", {
    baseCommit: git.head(plain),
    id: "orc-1-N-1",
    mainRoot: root,
    scopeId: "orc-1",
    taskId: "N",
    version: 1,
  });
  writeLocal(plain, "integration.json", { phase: "CONFLICT" });
  writeLocal(plain, "assignments/orc-1-N-1.json", {
    ...JSON.parse(
      readFileSync(local(root, "assignments", `${assignment.id}.json`), "utf8")
    ),
    id: "orc-1-N-1",
    scopeId: "docs-1",
    taskId: "N",
  });
  status = kit.status(plain);
  assert.deepEqual(status.executor, {
    assignmentId: "orc-1-N-1",
    taskId: "N",
  });
  assert.deepEqual(status.assignments, []);
  assert.equal(status.integration, null);
  assert.match(
    statusText(plain),
    /\nexecutor: assignment orc-1-N-1, task N\n/u
  );
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
