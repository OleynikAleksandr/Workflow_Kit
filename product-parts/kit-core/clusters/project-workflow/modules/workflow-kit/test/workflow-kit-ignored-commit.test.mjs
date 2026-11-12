import assert from "node:assert/strict";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// commit --task after `git rm -r --cached node_modules` and a new
// `node_modules/` line in .gitignore: the staged deletions are committed and
// git add never receives the ignored paths (it refuses them). The copies
// left on disk are not part of the commit, so kit:file-lines never reads
// them (a vendored file far over policy.maxFileLines does not fail it).
const build = await buildWorkflowModules(
  ["workflow-kit"],
  "workflow-kit-ignored-commit"
);
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-kit-ignored-"));
const root = path.join(sandbox, "project");
const prepared = path.join(sandbox, "prepared.txt");
const write = (name, text) => {
  const file = path.join(root, ...name.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
try {
  mkdirSync(root);
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
  const env = cleanGitEnvironment();
  const git = new WorkflowGitFacade(undefined, env);
  const plans = new WorkflowPlanFacade();
  let tick = 0;
  const kit = new WorkflowKitFacade({
    env,
    git,
    now: () => `2026-11-05T10:00:${String(tick++).padStart(2, "0")}Z`,
  });

  // An installation whose .gitignore does not know the dependency folders.
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(".gitignore", ".harness/workflow/local/\n");
  write("obsolete.txt", "old\n");
  git.transactions.commit(root, {
    files: [".gitignore", "obsolete.txt"],
    message: "chore: bootstrap",
    planPath: ".harness/plans/todo-plan.md",
    planText: plans.render(plans.createEmpty("demo", "Demo")),
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });
  kit.createScope(root, {
    acceptance: ["The module exists"],
    approval: "User approved the demo scope",
    id: "demo-1",
    objective: "Build a module",
    tasks: [
      {
        acceptance: ["a works"],
        commitMessage: "feat: add module a",
        files: ["src/a.ts", ".gitignore"],
        id: "A",
        title: "Module A",
      },
    ],
  });

  // Managed hooks: the pre-commit hook runs the commit checks.
  const runner = path.join(build.directory, "ignored-hook-runner.mjs");
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

  // QUALITY installs dependencies: untracked and not ignored, they end up in
  // the commit (the defect the managed .gitignore block now prevents).
  kit.startTask(root, "QUALITY");
  write("package.json", "{}\n");
  write("node_modules/pkg/index.js", "module.exports = 1;\n");
  write("node_modules/pkg/package.json", "{}\n");
  write("node_modules/pkg/big.js", "x;\n".repeat(50));
  const quality = kit.qualityApply(root, {
    checks: [
      {
        command: { args: ["-e", "process.exit(0)"], executable: "node" },
        id: "lint",
        required: true,
        role: "lint",
        stage: "commit",
      },
      {
        command: {
          args: [
            "-e",
            `require('fs').writeFileSync(${JSON.stringify(prepared)}, process.argv.slice(1).join('\\n'))`,
            "{files}",
          ],
          executable: "node",
        },
        id: "record",
        required: true,
        role: "format",
        stage: "prepare",
      },
    ],
    policy: { maxFileLines: 10 },
    stacks: ["node"],
  });
  assert.ok(
    git
      .commitPaths(root, quality.commit.sha)
      .includes("node_modules/pkg/index.js")
  );

  // Task A removes the folder from the index and ignores it; a tracked file
  // already removed from the index and the disk is committed as a deletion.
  kit.startTask(root, "A");
  git.git.run(root, ["rm", "-r", "-q", "--cached", "node_modules"]);
  git.git.run(root, ["rm", "-q", "obsolete.txt"]);
  appendFileSync(path.join(root, ".gitignore"), "node_modules/\n");
  write("src/a.ts", "export const a = 1;\n");
  const done = kit.commitTask(root, "A");
  assert.deepEqual(git.commitPaths(root, done.commit.sha).sort(), [
    ".gitignore",
    ".harness/plans/todo-plan.md",
    "node_modules/pkg/big.js",
    "node_modules/pkg/index.js",
    "node_modules/pkg/package.json",
    "obsolete.txt",
    "src/a.ts",
  ]);
  assert.equal(
    git.git.text(root, ["ls-files", "--", "node_modules", "obsolete.txt"]),
    ""
  );
  assert.ok(existsSync(path.join(root, "node_modules", "pkg", "index.js")));
  assert.ok(existsSync(path.join(root, "node_modules", "pkg", "big.js")));
  // The prepare stage passed only the committed files to {files}.
  assert.deepEqual(readFileSync(prepared, "utf8").split("\n").sort(), [
    ".gitignore",
    "src/a.ts",
  ]);
  // The commit checks ran kit:file-lines and it passed.
  const evidence = JSON.parse(
    readFileSync(
      git.localPath(root, "verification", `${done.commit.sha}.json`),
      "utf8"
    )
  );
  const lines = evidence.reports
    .flatMap((report) => report.results)
    .find((item) => item.id === "kit:file-lines");
  assert.equal(lines?.status, "passed");
  assert.deepEqual(git.changes(root).all, []);
  assert.equal(git.transactions.journal(root), null);
  console.log("workflow-kit ignored-path commit tests passed");
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
