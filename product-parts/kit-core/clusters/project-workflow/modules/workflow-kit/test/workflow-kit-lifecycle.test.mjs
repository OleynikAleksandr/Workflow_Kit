import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit"],
  "workflow-kit-lifecycle"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-kit-"));
const write = (name, text) => {
  const file = path.join(root, ...name.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const read = (name) =>
  readFileSync(path.join(root, ...name.split("/")), "utf8");
try {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const { WorkflowKitFacade } = await build.load(
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
    now: () => `2026-11-03T10:00:${String(tick++).padStart(2, "0")}Z`,
  });
  const code = (action) => {
    try {
      action();
    } catch (error) {
      return error.code;
    }
    return "OK";
  };

  // Bootstrap as the installer will: empty plan and ignored local state.
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(".gitignore", ".harness/workflow/local/\n");
  git.transactions.commit(root, {
    files: [".gitignore"],
    message: "chore: bootstrap",
    planPath: ".harness/plans/todo-plan.md",
    planText: plans.render(plans.createEmpty("demo", "Demo")),
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });
  assert.equal(kit.status(root).scope, null);
  assert.equal(kit.autopilotStatus(root).scope, "NONE");

  // Documentation without a scope goes through docs:commit only.
  write("docs/notes.md", "# Notes\n");
  write("src/x.ts", "x");
  assert.equal(
    code(() => kit.commitDocs(root, ["src/x.ts"])),
    "DOCS_ONLY"
  );
  kit.commitDocs(root, ["docs/notes.md"], "docs: add notes");
  // The product tree counts as documentation for docs:commit.
  write(".harness/product-tree/product-tree.json", '{"parts":[]}\n');
  write(".harness/product-tree/product-tree.md", "# Product Tree\n");
  const tree = kit.commitDocs(
    root,
    [
      ".harness/product-tree/product-tree.json",
      ".harness/product-tree/product-tree.md",
    ],
    "docs: add product tree"
  );
  assert.ok(
    git
      .commitPaths(root, tree.sha)
      .includes(".harness/product-tree/product-tree.json")
  );
  rmSync(path.join(root, "src"), { force: true, recursive: true });

  // scope:create commits the plan with its specification; QUALITY comes first.
  write("docs/spec.md", "# Spec\n\n## Plan\n\nTwo tasks.\n");
  const created = kit.createScope(root, {
    acceptance: ["Both modules exist"],
    approval: "User approved the demo scope",
    id: "demo-1",
    objective: "Build two modules",
    spec: "docs/spec.md",
    tasks: [
      {
        acceptance: ["a works"],
        commitMessage: "feat: add module a",
        files: ["src/a.ts"],
        id: "A",
        title: "Module A",
      },
      {
        acceptance: ["b works"],
        commitMessage: "feat: add module b",
        dependencies: ["A"],
        files: ["src/b.ts"],
        id: "B",
        title: "Module B",
      },
    ],
  });
  assert.ok(git.commitPaths(root, created.commit.sha).includes("docs/spec.md"));
  let status = kit.status(root);
  assert.equal(status.scope.status, "ACTIVE");
  assert.equal(status.nextTask.id, "QUALITY");
  assert.deepEqual(status.changes, []);

  // A functional task cannot start before QUALITY.
  assert.equal(
    code(() => kit.startTask(root, "A")),
    "DEPENDENCY_PENDING"
  );

  // QUALITY: quality:apply writes the profile and completes the task.
  kit.startTask(root, "QUALITY");
  write("package.json", "{}\n");
  const applied = kit.qualityApply(root, {
    checks: [
      {
        appliesTo: ["src/**"],
        command: {
          args: [
            "-e",
            "const fs=require('fs');for(const f of process.argv.slice(1)){fs.writeFileSync(f,fs.readFileSync(f,'utf8').trim()+'\\n')}",
            "{files}",
          ],
          executable: "node",
        },
        id: "format",
        required: true,
        role: "format",
        stage: "prepare",
      },
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
  assert.deepEqual(git.commitPaths(root, applied.commit.sha).sort(), [
    ".harness/plans/todo-plan.md",
    ".harness/workflow/config.json",
    "package.json",
  ]);
  assert.equal(kit.qualityStatus(root).status, "CONFIGURED");
  assert.deepEqual(kit.qualityStatus(root).checks.prepare, ["format"]);

  // Task A: earlier changes stay out, prepare checks format the files.
  write("scratch.txt", "keep me out");
  const startA = kit.startTask(root, "A");
  assert.deepEqual(startA.preexisting, ["scratch.txt"]);
  assert.equal(
    code(() => kit.startTask(root, "B")),
    "TASK_ALREADY_ACTIVE"
  );
  write("src/a.ts", "export const a = 1;   \n\n");
  write("src/extra.ts", "export const extra = 2;");
  const a = kit.commitTask(root, "A");
  assert.deepEqual(a.commit.excluded, ["scratch.txt"]);
  assert.deepEqual(git.commitPaths(root, a.commit.sha).sort(), [
    ".harness/plans/todo-plan.md",
    "src/a.ts",
    "src/extra.ts",
  ]);
  assert.equal(read("src/a.ts"), "export const a = 1;\n");
  assert.equal(a.nextTask.id, "B");
  assert.deepEqual(kit.validate(root), { errors: [], ok: true });
  const evidence = JSON.parse(
    read(".harness/workflow/local/verification/last.json")
  );
  assert.equal(evidence.commit, a.commit.sha);
  assert.equal(evidence.reports[0].stage, "prepare");

  // Blocking stops implementation until unblocked.
  kit.block(root, "Waiting for the API decision");
  assert.equal(kit.status(root).scope.status, "BLOCKED");
  assert.equal(
    kit.autopilotStatus(root).blockedReason,
    "Waiting for the API decision"
  );
  assert.equal(
    code(() => kit.startTask(root, "B")),
    "SCOPE_NOT_ACTIVE"
  );
  kit.unblock(root);

  // task:update edits pending tasks only.
  kit.updateTask(root, "B", { why: "B builds on A" });
  assert.equal(
    code(() => kit.updateTask(root, "A", { title: "x" })),
    "TASK_PATCH"
  );
  assert.equal(
    code(() => kit.updateTask(root, "B", { id: "C" })),
    "TASK_PATCH"
  );

  kit.startTask(root, "B");
  write("src/b.ts", "export const b = 2;\n");
  kit.commitTask(root, "B");

  // DOCS closes the round only with a digest.
  status = kit.status(root);
  assert.equal(status.nextTask.id, "DOCS-R1");
  kit.startTask(root, "DOCS-R1");
  write("README.md", "# Demo\n");
  write(".harness/product-tree/product-tree.json", '{"parts":["a","b"]}\n');
  assert.equal(
    code(() => kit.commitTask(root, "DOCS-R1")),
    "ROUND_DIGEST_REQUIRED"
  );
  const docsCommit = kit.commitTask(root, "DOCS-R1", {
    digest: {
      contracts: [],
      decisions: [],
      references: [],
      result: "Modules A and B exist.",
    },
  });
  assert.ok(
    git
      .commitPaths(root, docsCommit.commit.sha)
      .includes(".harness/product-tree/product-tree.json"),
    "the DOCS task commits the product tree"
  );
  status = kit.status(root);
  assert.equal(status.scope.delivery, "READY_FOR_ACCEPTANCE");
  assert.equal(status.rounds[0].status, "CLOSED");

  // A defect found at acceptance becomes a fixes round; revision is checked.
  assert.equal(
    code(() => kit.extend(root, { kind: "fixes", round: "new", tasks: [] }, 1)),
    "REVISION_MISMATCH"
  );
  const extended = kit.extend(
    root,
    {
      kind: "fixes",
      round: "new",
      tasks: [
        {
          acceptance: ["fixed"],
          commitMessage: "fix: module a",
          files: ["src/a.ts"],
          fixes: "A",
          id: "F1",
          title: "Fix A",
        },
      ],
      title: "Fixes",
    },
    status.revision
  );
  assert.equal(extended.roundId, "R2");
  assert.equal(kit.status(root).scope.delivery, "IN_PROGRESS");
  kit.startTask(root, "F1");
  write("src/a.ts", "export const a = 3;\n");
  kit.commitTask(root, "F1");
  kit.startTask(root, "DOCS-R2");
  kit.commitTask(root, "DOCS-R2", {
    digest: {
      contracts: [],
      decisions: [],
      references: [],
      result: "Module A fixed.",
    },
  });
  assert.match(kit.showTask(root, "F1"), /fixes: F1|fixes: A /u);
  assert.deepEqual(
    kit.history(root, { round: "R2" }).entries.map((entry) => entry.taskId),
    ["F1", "DOCS-R2"]
  );

  // Acceptance, then close on a clean tree only.
  kit.accept(root, "The user accepted the demo result");
  assert.equal(kit.status(root).scope.delivery, "ACCEPTED");
  assert.equal(
    code(() => kit.close(root, "demo-1", "User: close the demo scope")),
    "DIRTY_TREE"
  );
  rmSync(path.join(root, "scratch.txt"));
  const closed = kit.close(root, "demo-1", "User: close the demo scope");
  assert.equal(closed.scopeId, null);
  assert.equal(kit.status(root).scope, null);
  assert.equal(kit.validate(root).ok, true);
  assert.match(kit.recover(root).text, /No active scope/u);
  assert.equal(kit.repair(root).kind, "none");
  assert.equal(
    existsSync(
      path.join(root, ".harness", "workflow", "local", "transaction.json")
    ),
    false
  );
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
