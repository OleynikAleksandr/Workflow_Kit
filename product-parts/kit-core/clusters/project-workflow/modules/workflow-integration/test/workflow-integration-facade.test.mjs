import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-integration", "workflow-kit"],
  "workflow-integration"
);
const sandbox = realpathSync(
  mkdtempSync(path.join(tmpdir(), "workflow-integration-"))
);
try {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const { WorkflowKitFacade, GIT_HOOKS } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const { WorkflowIntegrationFacade } = await build.load(
    "workflow-integration",
    "workflow-integration-facade.js"
  );
  const env = cleanGitEnvironment();
  const git = new WorkflowGitFacade(undefined, env);
  const plans = new WorkflowPlanFacade();
  const integration = new WorkflowIntegrationFacade(git);
  let tick = 0;
  const kit = new WorkflowKitFacade({
    env,
    git,
    now: () => `2026-11-04T12:00:${String(tick++).padStart(2, "0")}Z`,
  });
  const failure = (action) => {
    try {
      action();
    } catch (error) {
      return error;
    }
    return null;
  };
  const write = (root, name, text) => {
    const file = path.join(root, ...name.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const local = (root, ...parts) =>
    path.join(root, ".harness", "workflow", "local", ...parts);
  const PLAN = ".harness/plans/todo-plan.md";

  // --- Main checkout with real hooks shared by every worktree. ---
  const root = path.join(sandbox, "project");
  mkdirSync(root);
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(root, ".gitignore", ".harness/workflow/local/\n.harness/runtime/\n");
  git.transactions.commit(root, {
    files: [".gitignore"],
    message: "chore: bootstrap",
    planPath: PLAN,
    planText: plans.render(plans.createEmpty("demo", "Demo")),
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });
  const runner = path.join(build.directory, "hook-runner.mjs");
  writeFileSync(
    runner,
    `import { WorkflowKitFacade } from ${JSON.stringify(path.join(build.directory, "workflow-kit", "src", "workflow-kit-facade.js"))};
const [name, ...args] = process.argv.slice(2);
const result = new WorkflowKitFacade().gitHook(process.cwd(), name, args);
if (result.message) process.stderr.write(result.message + "\\n");
process.exit(result.exitCode);
`
  );
  const hooks = path.join(sandbox, "hooks");
  const noHooks = path.join(sandbox, "no-hooks");
  mkdirSync(hooks);
  mkdirSync(noHooks);
  for (const name of GIT_HOOKS) {
    writeFileSync(
      path.join(hooks, name),
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(runner)} ${name} "$@"\n`
    );
    chmodSync(path.join(hooks, name), 0o755);
  }
  git.setConfig(root, "core.hooksPath", hooks);
  // Hand-made commits of this test bypass the Kit hooks.
  const raw = (cwd, args) =>
    git.git.run(cwd, ["-c", `core.hooksPath=${noHooks}`, ...args]);
  const rawCommit = (cwd, files, message) => {
    raw(cwd, ["add", "-A", "--", ...files]);
    raw(cwd, ["commit", "-q", "-m", message]);
    return git.head(cwd);
  };

  write(root, "docs/spec.md", "# Spec\n\nTwo modules.\n");
  kit.proposeScope(
    root,
    {
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
        },
        {
          acceptance: ["B works"],
          commitMessage: "feat: add B",
          files: ["src/mod"],
          id: "B",
          parallelSafe: true,
          title: "Module B",
        },
      ],
    },
    "orchestrated",
    "Independent modules with separate files"
  );
  kit.chooseScope(root, {
    generation: 1,
    note: "User clicked orchestrated",
    option: "orchestrated",
    session: "session-1",
  });
  kit.startTask(root, "QUALITY");
  kit.qualityApply(root, {
    checks: [
      {
        command: { args: ["-e", "process.exit(0)"], executable: "node" },
        id: "lint",
        required: true,
        role: "lint",
        stage: "commit",
      },
    ],
    stacks: ["node"],
  });
  const base = git.head(root);
  const id = kit.createAssignment(root, "A").assignment.id;
  const wtA = path.join(sandbox, "wt-a");
  git.git.run(root, ["worktree", "add", "-q", "--detach", wtA, base]);
  kit.attachAssignment(wtA, id);
  kit.startTask(wtA, "A");
  write(wtA, "src/a.ts", "export const a = 1;\n");
  const source = kit.commitTask(wtA, "A").commit.sha;
  const recordFile = local(root, "assignments", `${id}.json`);
  const ready = JSON.parse(readFileSync(recordFile, "utf8"));
  assert.equal(ready.status, "READY_FOR_INTEGRATION");
  const prove = (record = ready, sha = source) =>
    integration.proveSource(root, record, sha);
  const code = (action) => failure(action)?.code ?? "OK";

  // --- Happy path. ---
  const proof = prove(ready, source.slice(0, 12));
  assert.deepEqual(
    { ...proof, checks: undefined },
    {
      assignmentId: id,
      baseCommit: base,
      changedFiles: [PLAN, "src/a.ts"],
      checks: undefined,
      sourceCommit: source,
      sourceTree: git.git.text(wtA, ["rev-parse", "HEAD^{tree}"]),
      taskId: "A",
    }
  );
  assert.ok(
    proof.checks.some(
      (check) => check.id === "lint" && check.status === "passed"
    )
  );

  // --- Record state, source and worktree. ---
  assert.equal(
    code(() => prove({ ...ready, status: "RUNNING" })),
    "INTEGRATION_NOT_READY"
  );
  assert.equal(
    code(() => prove(ready, base)),
    "INTEGRATION_SOURCE"
  );
  write(wtA, "stray.txt", "x\n");
  const dirty = failure(() => prove());
  assert.equal(dirty.code, "INTEGRATION_DIRTY");
  assert.deepEqual(dirty.details.paths, ["stray.txt"]);
  rmSync(path.join(wtA, "stray.txt"));

  const trailers = (extra = "") =>
    `\n\nWorkflow-Scope: assignment-${id}\nWorkflow-Task: A\nWorkflow-Role: implementation\nWorkflow-Iteration: 1\nWorkflow-Assignment: ${id}\nWorkflow-Transaction: tx-hand${extra}`;
  const tryOn = (sha) => prove({ ...ready, sourceCommit: sha }, sha);
  const reset = () => raw(wtA, ["reset", "-q", "--hard", source]);

  // --- Foreign commit after the task commit. ---
  write(wtA, "src/a.ts", "export const a = 2;\n");
  const foreign = rawCommit(wtA, ["src/a.ts"], "chore: stray edit");
  const history = failure(() => tryOn(foreign));
  assert.equal(history.code, "INTEGRATION_HISTORY");
  assert.equal(history.details.sha, foreign);
  assert.ok(
    history.details.mismatches.some(
      (item) => item.field === "Workflow-Role" && item.actual === null
    )
  );
  reset();

  // --- Kit-managed files and launchers in the diff. ---
  write(wtA, "scripts/workflow", "#!/bin/sh\necho hacked\n");
  const config = path.join(wtA, ".harness", "workflow", "config.json");
  writeFileSync(config, `${readFileSync(config, "utf8")}\n`);
  const managed = rawCommit(
    wtA,
    ["scripts/workflow", ".harness/workflow/config.json"],
    `feat: add A${trailers()}`
  );
  const kitFiles = failure(() => tryOn(managed));
  assert.equal(kitFiles.code, "INTEGRATION_HISTORY");
  assert.deepEqual(kitFiles.details.paths, [
    ".harness/workflow/config.json",
    "scripts/workflow",
  ]);
  reset();

  // --- A second task commit: missing, foreign and failed receipts. ---
  write(wtA, "src/a.ts", "export const a = 3;\n");
  const second = rawCommit(wtA, ["src/a.ts"], `feat: add A${trailers()}`);
  const receipt = local(wtA, "verification", `${second}.json`);
  assert.equal(
    code(() => tryOn(second)),
    "INTEGRATION_UNCHECKED"
  );
  // Hand receipts reuse the real one of the source with the lint status set.
  const real = JSON.parse(
    readFileSync(local(wtA, "verification", `${source}.json`), "utf8")
  );
  const report = (status) =>
    real.reports.map((item) => ({
      ...item,
      ok: status === "passed",
      results: item.results.map((result) =>
        result.id === "lint" ? { ...result, status } : result
      ),
    }));
  const store = (fields) =>
    writeFileSync(receipt, `${JSON.stringify(fields, null, 2)}\n`);
  store({ commit: source, reports: report("passed"), transaction: "tx-hand" });
  assert.equal(
    code(() => tryOn(second)),
    "INTEGRATION_UNCHECKED"
  );
  store({ commit: second, reports: report("failed"), transaction: "tx-hand" });
  const failed = failure(() => tryOn(second));
  assert.equal(failed.code, "INTEGRATION_UNCHECKED");
  assert.deepEqual(failed.details.checks, ["lint"]);
  store({ commit: second, reports: [], transaction: "tx-hand" });
  assert.equal(
    code(() => tryOn(second)),
    "INTEGRATION_UNCHECKED"
  );
  store({ commit: second, reports: report("passed"), transaction: "tx-hand" });
  assert.equal(tryOn(second).sourceCommit, second);
  reset();

  // --- The task contract changed in main after the base. ---
  const mainPlan = plans.read(root);
  const changed = structuredClone(mainPlan);
  changed.tasks.find((task) => task.id === "A").acceptance = ["A works fast"];
  plans.write(root, changed);
  assert.equal(
    code(() => prove()),
    "INTEGRATION_CONTRACT"
  );
  plans.write(root, mainPlan);
  assert.equal(prove().sourceCommit, source);

  // --- History of main: two-parent integration commits. ---
  const before = git.head(root);
  const donePlan = structuredClone(mainPlan);
  Object.assign(
    donePlan.tasks.find((task) => task.id === "A"),
    { status: "DONE" }
  );
  donePlan.revision += 1;
  const merge = (message, extra = []) => {
    raw(root, ["merge", "--no-commit", "--no-ff", "-q", source]);
    plans.write(root, donePlan);
    for (const [name, text] of extra) {
      write(root, name, text);
    }
    return rawCommit(root, [PLAN, ...extra.map(([name]) => name)], message);
  };
  const merged = (fields) =>
    `merge: Module A\n\n${[
      "Workflow-Scope: par-1",
      "Workflow-Task: A",
      "Workflow-Iteration: 1",
      ...fields,
    ].join("\n")}`;
  const resolve = () => git.resolveReferences(root, donePlan, PLAN);
  const undo = () => raw(root, ["reset", "-q", "--hard", before]);

  merge(merged([`Workflow-Assignment: ${id}`, `Workflow-Source: ${source}`]));
  const noRole = failure(resolve);
  assert.equal(noRole.code, "HISTORY_NOT_LINEAR");
  undo();
  merge(
    merged([
      "Workflow-Role: integration",
      `Workflow-Assignment: ${id}`,
      `Workflow-Source: ${base}`,
    ])
  );
  assert.equal(code(resolve), "HISTORY_NOT_LINEAR");
  undo();
  merge(merged(["Workflow-Role: integration", `Workflow-Source: ${source}`]));
  assert.equal(code(resolve), "HISTORY_NOT_LINEAR");
  undo();
  merge(
    merged([
      "Workflow-Role: integration",
      `Workflow-Assignment: ${id}`,
      `Workflow-Source: ${source}`,
    ]),
    [["other.txt", "outside\n"]]
  );
  const outside = failure(resolve);
  assert.equal(outside.code, "COMMIT_SCOPE_MISMATCH");
  assert.deepEqual(outside.details.paths, ["other.txt"]);
  undo();
  const accepted = merge(
    merged([
      "Workflow-Role: integration",
      `Workflow-Assignment: ${id}`,
      `Workflow-Source: ${source}`,
    ])
  );
  const references = resolve();
  assert.deepEqual(references.get("A"), {
    paths: [PLAN, "src/a.ts"],
    sha: accepted,
    status: "committed",
  });
  assert.equal(references.get("QUALITY").status, "committed");
  assert.equal(references.get("B").status, "open");
  // The executor commits behind the second parent are not main task commits.
  assert.equal(
    git.history(root, base).filter((commit) => commit.parents.length === 1)
      .length,
    2
  );

  console.log("workflow-integration tests passed");
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
