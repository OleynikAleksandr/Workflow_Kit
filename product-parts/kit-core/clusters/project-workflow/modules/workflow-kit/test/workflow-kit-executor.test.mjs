import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import {
  code,
  failure,
  lintProfile,
  local,
  openKit,
  PLAN,
  write,
} from "./workflow-kit-support.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-assignment"],
  "workflow-kit-executor"
);
// The long path: git reports worktrees by it (Windows 8.3 names differ).
const sandbox = realpathSync.native(
  mkdtempSync(path.join(tmpdir(), "workflow-kit-executor-"))
);
try {
  const { bootstrap, cli, git, installHooks, kit, orchestrate, plans } =
    await openKit(build, { clock: "12:00" });
  const readRecord = (id) =>
    JSON.parse(readFileSync(local(root, "assignments", `${id}.json`), "utf8"));
  const run = cli;

  // --- Main checkout with real hooks shared by every worktree. ---
  const root = path.join(sandbox, "project");
  mkdirSync(root);
  bootstrap(root);
  installHooks(root, path.join(sandbox, "hooks"));

  write(root, "docs/spec.md", "# Spec\n\nTwo modules and a release.\n");
  orchestrate(root, {
    acceptance: ["The modules exist"],
    approval: "User approved the orchestrated scope",
    id: "par-1",
    objective: "Build two modules",
    spec: "docs/spec.md",
    tasks: [
      {
        acceptance: ["A works"],
        commitMessage: "feat: add A",
        files: ["src/a.ts"],
        id: "A",
        parallelSafe: true,
        title: "Module A",
        why: "The product needs A",
      },
      {
        acceptance: ["B works"],
        commitMessage: "feat: add B",
        files: ["src/mod"],
        id: "B",
        parallelSafe: true,
        title: "Module B",
      },
      {
        acceptance: ["Released"],
        commitMessage: "chore: release",
        files: [],
        id: "SHIP",
        kind: "delivery",
        title: "Release",
      },
    ],
  });
  assert.deepEqual(
    plans.read(root).tasks.map((task) => task.id),
    ["QUALITY", "A", "B", "DOCS-R1", "SHIP"]
  );

  // QUALITY runs in main; work, DOCS and an early delivery do not.
  kit.startTask(root, "QUALITY");
  kit.qualityApply(root, lintProfile());
  const readOnly = failure(() => kit.startTask(root, "A"));
  assert.equal(readOnly.code, "ORCHESTRATED_MAIN_READ_ONLY");
  assert.match(readOnly.nextAction, /assignment:create --task A/u);
  assert.equal(
    code(() => kit.startTask(root, "DOCS-R1")),
    "ORCHESTRATED_MAIN_READ_ONLY"
  );
  const early = failure(() => kit.startTask(root, "SHIP", "User said ship"));
  assert.equal(early.code, "DELIVERY_NOT_READY");
  assert.deepEqual(early.details.pending, ["A", "B", "DOCS-R1"]);
  assert.equal(plans.read(root).currentTaskId, null);

  const base = git.head(root);
  const idA = kit.createAssignment(root, "A").assignment.id;
  const idB = kit.createAssignment(root, "B").assignment.id;
  assert.equal(idA, "par-1-A-1");

  // --- Attach refusals: main checkout, wrong base, dirty tree, unknown id. ---
  const inMain = failure(() => kit.attachAssignment(root, idA));
  assert.equal(inMain.code, "ASSIGNMENT_WORKTREE");
  const worktree = (name, options, commit) => {
    const folder = path.join(sandbox, name);
    git.git.run(root, ["worktree", "add", "-q", ...options, folder, commit]);
    return folder;
  };
  const old = worktree("wt-old", ["--detach"], `${base}~1`);
  const wrongBase = failure(() => kit.attachAssignment(old, idA));
  assert.equal(wrongBase.code, "ASSIGNMENT_BASE");
  assert.equal(wrongBase.details.base, base);
  const wtA = worktree("wt-a", ["--detach"], base);
  write(wtA, "stray.txt", "left over\n");
  const dirty = failure(() => kit.attachAssignment(wtA, idA));
  assert.equal(dirty.code, "ASSIGNMENT_DIRTY");
  assert.deepEqual(dirty.details.paths, ["stray.txt"]);
  rmSync(path.join(wtA, "stray.txt"));
  assert.equal(
    code(() => kit.attachAssignment(wtA, "par-1-X-1")),
    "ASSIGNMENT_UNKNOWN"
  );
  assert.equal(readRecord(idA).status, "ASSIGNED");

  // --- Attach A: executor plan commit and both records. ---
  const attached = kit.attachAssignment(wtA, idA);
  assert.equal(attached.attached, true);
  assert.equal(attached.planCommit, git.head(wtA));
  assert.equal(attached.assignment.status, "READY");
  assert.equal(attached.assignment.worktree, wtA);
  assert.equal(attached.assignment.branch, null);
  assert.deepEqual(readRecord(idA), attached.assignment);
  assert.deepEqual(
    JSON.parse(readFileSync(local(wtA, "assignment.json"), "utf8")),
    {
      baseCommit: base,
      id: idA,
      mainRoot: root,
      scopeId: "par-1",
      taskId: "A",
      version: 1,
    }
  );
  assert.equal(git.head(root), base);
  const [planCommit] = git.history(wtA, base);
  assert.equal(git.history(wtA, base).length, 1);
  assert.deepEqual(planCommit.parents, [base]);
  assert.equal(planCommit.subject, `docs: plan assignment ${idA}`);
  assert.deepEqual(git.commitPaths(wtA, planCommit.sha), [PLAN]);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(planCommit.trailers)
        .filter(([key]) => key !== "Workflow-Transaction")
        .map(([key, values]) => [key, values[0]])
    ),
    {
      "Workflow-Assignment": idA,
      "Workflow-Iteration": "1",
      "Workflow-Role": "assignment-plan",
      "Workflow-Scope": `assignment-${idA}`,
      "Workflow-Task": "A",
    }
  );
  const executorPlan = plans.read(wtA);
  assert.equal(executorPlan.scope.id, `assignment-${idA}`);
  assert.equal(executorPlan.scope.baselineCommit, base);
  assert.equal(executorPlan.scope.execution.strategy, "sequential");
  assert.equal(executorPlan.scope.objective, "Module A: The product needs A");
  assert.deepEqual(executorPlan.scope.acceptance, ["A works"]);
  assert.deepEqual(
    executorPlan.tasks.map((task) => [task.id, task.status, task.dependencies]),
    [["A", "TODO", []]]
  );
  assert.deepEqual(executorPlan.tasks[0].files, ["src/a.ts"]);
  assert.equal(git.changes(wtA).all.length, 0);

  // A retry changes nothing; a second worktree or assignment is refused.
  const retry = kit.attachAssignment(wtA, idA);
  assert.equal(retry.attached, false);
  assert.equal(retry.planCommit, null);
  assert.deepEqual(retry.assignment, readRecord(idA));
  assert.equal(git.head(wtA), planCommit.sha);
  const other = worktree("wt-a2", ["--detach"], base);
  assert.equal(
    code(() => kit.attachAssignment(other, idA)),
    "ASSIGNMENT_ATTACHED"
  );
  assert.equal(
    code(() => kit.attachAssignment(wtA, idB)),
    "ASSIGNMENT_ATTACHED"
  );

  // --- Executor whitelist. ---
  for (const argv of [
    ["assignment:next"],
    ["scope:create", "--input", "plan.json"],
    ["history"],
    ["task:unblock"],
    ["docs:commit", "--files", "README.md"],
  ]) {
    const refused = run(wtA, argv);
    assert.equal(refused.exit, 1, argv[0]);
    assert.equal(JSON.parse(refused.stdout).code, "ASSIGNMENT_READ_ONLY");
    assert.ok(JSON.parse(refused.stdout).details.allowed.includes("schema"));
    assert.ok(JSON.parse(refused.stdout).details.allowed.includes("context"));
  }
  assert.equal(run(wtA, ["status"]).exit, 0);
  const schema = run(wtA, ["schema", "digest", "--format", "text"]);
  assert.equal(schema.exit, 0);
  assert.match(schema.stdout, /^digest: Round digest of the DOCS task/u);
  assert.equal(run(wtA, ["schema"]).exit, 0);
  // `context` reads the documents of the executor worktree.
  const context = run(wtA, ["context", "docs/spec.md"]);
  assert.equal(context.exit, 0);
  assert.match(
    context.stdout,
    /^<document path="docs\/spec\.md" bytes="\d+">\n# Spec\n/u
  );
  assert.match(
    run(wtA, ["context", "--list"]).stdout,
    /^docs\/spec\.md \(\d+ bytes\)$/mu
  );
  assert.equal(run(wtA, ["validate"]).exit, 0);
  assert.equal(run(root, ["assignment:next"]).exit, 0);
  const statusText = run(wtA, ["assignment:status", "--format", "text"]);
  assert.equal(statusText.exit, 0);
  assert.match(statusText.stdout, /^assignment: par-1-A-1 \(READY\)\n/u);
  assert.match(statusText.stdout, /task: A TODO — Module A\n/u);
  assert.equal(
    code(() => kit.assignmentStatus(root)),
    "ASSIGNMENT_NOT_ATTACHED"
  );
  const push = kit.gitHook(wtA, "pre-push");
  assert.equal(push.exitCode, 1);
  assert.equal(push.code, "ASSIGNMENT_READ_ONLY");

  // --- task:start marks RUNNING; scope and contract refusals. ---
  kit.startTask(wtA, "A");
  assert.equal(readRecord(idA).status, "RUNNING");
  write(wtA, "src/a.ts", "export const a = 1;\n");
  write(wtA, "src/other.ts", "export const other = 1;\n");
  const scope = failure(() => kit.commitTask(wtA, "A"));
  assert.equal(scope.code, "ASSIGNMENT_SCOPE");
  assert.deepEqual(scope.details.paths, ["src/other.ts"]);
  assert.match(scope.nextAction, /--files/u);
  rmSync(path.join(wtA, "src", "other.ts"));
  write(wtA, "scripts/workflow", "#!/bin/sh\necho hacked\n");
  const launcher = failure(() => kit.commitTask(wtA, "A"));
  assert.equal(launcher.code, "ASSIGNMENT_CONTRACT");
  assert.deepEqual(launcher.details.paths, ["scripts/workflow"]);
  rmSync(path.join(wtA, "scripts"), { force: true, recursive: true });
  assert.equal(git.head(wtA), planCommit.sha);

  // The pre-commit hook guards any transaction: configuration and plan edits.
  const config = path.join(wtA, ".harness", "workflow", "config.json");
  writeFileSync(config, `${readFileSync(config, "utf8")}\n`);
  const working = readFileSync(path.join(wtA, ...PLAN.split("/")), "utf8");
  const direct = (files, planText) =>
    failure(() =>
      git.transactions.commit(wtA, {
        assignmentId: idA,
        files,
        iteration: 1,
        message: "feat: add A",
        planPath: PLAN,
        planText,
        role: "implementation",
        scopeId: `assignment-${idA}`,
        taskId: "A",
      })
    );
  const configEdit = direct([".harness/workflow/config.json"], working);
  assert.equal(configEdit.code, "COMMIT_FAILED");
  assert.match(configEdit.details.output, /ASSIGNMENT_CONTRACT/u);
  git.git.run(wtA, ["checkout", "--", ".harness/workflow/config.json"]);
  const edited = plans.parse(working);
  edited.scope.objective = "Something else";
  const planEdit = direct(["src/a.ts"], plans.render(edited));
  assert.equal(planEdit.code, "COMMIT_FAILED");
  assert.match(
    planEdit.details.output,
    /ASSIGNMENT_CONTRACT: The plan may change only through the Kit's own transitions of A/u
  );
  assert.equal(
    readFileSync(path.join(wtA, ...PLAN.split("/")), "utf8"),
    working
  );
  assert.equal(git.head(wtA), planCommit.sha);

  // --- commit --task: READY_FOR_INTEGRATION with the source commit. ---
  const committed = kit.commitTask(wtA, "A");
  assert.equal(committed.commit.role, "implementation");
  const source = readRecord(idA);
  assert.equal(source.status, "READY_FOR_INTEGRATION");
  assert.equal(source.sourceCommit, committed.commit.sha);
  assert.equal(source.sourceCommit, git.head(wtA));
  const [, implementation] = git.history(wtA, base);
  assert.equal(implementation.trailers["Workflow-Assignment"][0], idA);
  assert.equal(
    implementation.trailers["Workflow-Scope"][0],
    `assignment-${idA}`
  );
  assert.deepEqual(git.commitPaths(wtA, implementation.sha).sort(), [
    PLAN,
    "src/a.ts",
  ]);
  assert.equal(kit.validate(wtA).ok, true);
  const state = kit.assignmentStatus(wtA);
  assert.equal(state.task.status, "DONE");
  assert.equal(state.assignment.sourceCommit, committed.commit.sha);
  assert.equal(git.head(root), base);

  // --- B on its own branch: CLI attach, a directory entry owns nested files. ---
  const wtB = worktree("wt-b", ["-b", "exec-b"], base);
  const attachB = run(wtB, ["assignment:attach", idB, "--format", "text"]);
  assert.equal(attachB.exit, 0, attachB.stderr);
  assert.match(
    attachB.stdout,
    /^assignment: par-1-B-1 attached, task B, READY\n/u
  );
  assert.match(attachB.stdout, /\(exec-b\)\n/u);
  assert.match(attachB.stdout, /next: scripts\/workflow task:start B\n/u);
  assert.equal(readRecord(idB).branch, "exec-b");
  assert.equal(run(wtB, ["task:start", "B"]).exit, 0);
  write(wtB, "src/modx.ts", "export const x = 1;\n");
  assert.equal(
    code(() => kit.commitTask(wtB, "B")),
    "ASSIGNMENT_SCOPE"
  );
  rmSync(path.join(wtB, "src", "modx.ts"));
  write(wtB, "src/mod/b.ts", "export const b = 1;\n");
  write(wtB, "src/mod/b.test.mjs", "// test\n");
  const commitB = JSON.parse(run(wtB, ["commit", "--task", "B"]).stdout);
  assert.equal(commitB.ok, true, JSON.stringify(commitB));
  assert.deepEqual(plans.read(wtB).tasks[0].files, [
    "src/mod",
    "src/mod/b.test.mjs",
    "src/mod/b.ts",
  ]);
  assert.equal(readRecord(idB).status, "READY_FOR_INTEGRATION");
  assert.equal(readRecord(idB).sourceCommit, git.head(wtB));

  // --- Delivery waits for active assignments even when every task is DONE. ---
  const done = plans.read(root);
  for (const task of done.tasks) {
    task.status = task.kind === "delivery" ? "TODO" : "DONE";
  }
  done.rounds[0].digest = {
    contracts: [],
    decisions: [],
    references: [],
    result: "Both modules exist.",
  };
  done.revision += 1;
  plans.write(root, done);
  const waiting = failure(() => kit.startTask(root, "SHIP", "User said ship"));
  assert.equal(waiting.code, "DELIVERY_NOT_READY");
  assert.deepEqual(waiting.details.pending, []);
  assert.deepEqual(waiting.details.active, [idA, idB]);
  for (const id of [idA, idB]) {
    writeFileSync(
      local(root, "assignments", `${id}.json`),
      `${JSON.stringify({ ...readRecord(id), status: "INTEGRATED" }, null, 2)}\n`
    );
  }
  assert.equal(
    kit.startTask(root, "SHIP", "User said ship").task.status,
    "IN_PROGRESS"
  );

  console.log("workflow-kit executor tests passed");
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
