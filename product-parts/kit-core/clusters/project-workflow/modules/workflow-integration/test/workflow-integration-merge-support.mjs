import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";

// Test support for workflow-integration-merge.test.mjs: the compiled Kit and
// its CLI, a main checkout with real hooks shared by every worktree, an
// orchestrated scope of four parallel tasks with QUALITY applied (a lint
// check that fails only on the merged result of A and B), and an executor
// that commits one task in its own real worktree.

export async function openMergeProject(build, sandbox) {
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
  const { runCli } = await build.load("workflow-kit", "workflow-kit-cli.js");
  const env = cleanGitEnvironment();
  const git = new WorkflowGitFacade(undefined, env);
  const plans = new WorkflowPlanFacade();
  let tick = 0;
  const kit = new WorkflowKitFacade({
    env,
    git,
    now: () =>
      `2026-11-04T12:${String(Math.floor(tick / 60)).padStart(2, "0")}:${String(tick++ % 60).padStart(2, "0")}Z`,
  });
  const failure = (action) => {
    try {
      action();
    } catch (error) {
      return error;
    }
    return null;
  };
  const code = (action) => failure(action)?.code ?? "OK";
  const write = (root, name, text) => {
    const file = path.join(root, ...name.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const local = (root, ...parts) =>
    path.join(root, ".harness", "workflow", "local", ...parts);
  const run = (cwd, argv) => {
    const out = { stderr: "", stdout: "" };
    const exit = runCli(
      argv,
      {
        cwd,
        env,
        readStdin: () => "",
        stderr: (text) => {
          out.stderr += text;
        },
        stdout: (text) => {
          out.stdout += text;
        },
      },
      kit
    );
    return { ...out, exit };
  };
  const PLAN = ".harness/plans/todo-plan.md";

  // --- Main checkout with real hooks shared by every worktree. ---
  const root = path.join(sandbox, "project");
  mkdirSync(root);
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(root, ".gitignore", ".harness/workflow/local/\n.harness/runtime/\n");
  write(root, "docs/guide.md", "# Guide\n\nThe first line.\n");
  git.transactions.commit(root, {
    files: [".gitignore", "docs/guide.md"],
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
    `import { WorkflowKitFacade } from ${JSON.stringify(pathToFileURL(path.join(build.directory, "workflow-kit", "src", "workflow-kit-facade.js")).href)};
const [name, ...args] = process.argv.slice(2);
const result = new WorkflowKitFacade().gitHook(process.cwd(), name, args);
if (result.message) process.stderr.write(result.message + "\\n");
process.exit(result.exitCode);
`
  );
  const hooks = path.join(sandbox, "hooks");
  mkdirSync(hooks);
  for (const name of GIT_HOOKS) {
    writeFileSync(
      path.join(hooks, name),
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(runner)} ${name} "$@"\n`
    );
    chmodSync(path.join(hooks, name), 0o755);
  }
  git.setConfig(root, "core.hooksPath", hooks);

  write(root, "docs/spec.md", "# Spec\n\nFour modules.\n");
  const work = (id, files, title) => ({
    acceptance: [`${id} works`],
    commitMessage: `feat: add ${id}`,
    files,
    id,
    parallelSafe: true,
    title,
  });
  kit.proposeScope(
    root,
    {
      acceptance: ["The modules exist"],
      approval: "User approved the orchestrated scope",
      id: "par-1",
      objective: "Build four modules",
      spec: "docs/spec.md",
      tasks: [
        work("A", ["src/a.ts"], "Module A"),
        work("B", ["src/mod"], "Module B"),
        work("C", ["docs/guide.md"], "Guide C"),
        work("D", ["src/d.ts"], "Module D"),
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
  // The lint check fails only on the merged result of A and B.
  const lint =
    "const fs=require('fs');const read=(f)=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';process.exit(read('src/a.ts').includes('shared')&&read('src/mod/b.ts').includes('shared')?1:0)";
  kit.startTask(root, "QUALITY");
  kit.qualityApply(root, {
    checks: [
      {
        command: { args: ["-e", lint], executable: process.execPath },
        id: "lint",
        required: true,
        role: "lint",
        stage: "commit",
      },
    ],
    stacks: ["node"],
  });

  const record = (id) =>
    JSON.parse(readFileSync(local(root, "assignments", `${id}.json`), "utf8"));
  /** One executor: assignment, real worktree, attach, task, commit; returns ids. */
  const execute = (taskId, edits, { branch = null, digest = null } = {}) => {
    const id = kit.createAssignment(root, taskId).assignment.id;
    const worktree = path.join(sandbox, `wt-${taskId.toLowerCase()}`);
    git.git.run(root, [
      "worktree",
      "add",
      "-q",
      ...(branch ? ["-b", branch] : ["--detach"]),
      worktree,
      git.head(root),
    ]);
    kit.attachAssignment(worktree, id);
    kit.startTask(worktree, taskId);
    for (const [name, text] of edits) {
      write(worktree, name, text);
    }
    const sha = kit.commitTask(worktree, taskId, { digest }).commit.sha;
    assert.equal(record(id).status, "READY_FOR_INTEGRATION");
    return { id, sha, worktree };
  };
  const trailer = (sha, key) =>
    git.history(root, `${sha}~1`, sha).find((item) => item.sha === sha)
      .trailers[key];
  const parents = (sha) =>
    git.git
      .text(root, ["rev-list", "--parents", "-n", "1", sha])
      .split(" ")
      .slice(1);
  const task = (id) => plans.read(root).tasks.find((item) => item.id === id);

  return {
    code,
    execute,
    failure,
    git,
    kit,
    local,
    PLAN,
    parents,
    plans,
    record,
    root,
    run,
    task,
    trailer,
    write,
  };
}
