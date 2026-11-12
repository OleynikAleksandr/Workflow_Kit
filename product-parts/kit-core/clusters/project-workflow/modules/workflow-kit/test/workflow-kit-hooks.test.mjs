import assert from "node:assert/strict";
import {
  chmodSync,
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
  "workflow-kit-hooks"
);
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-kit-hooks-"));
const root = path.join(sandbox, "project");
const flag = path.join(sandbox, "lint-ok");
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
  const kit = new WorkflowKitFacade({ env, git });
  const code = (action) => {
    try {
      action();
    } catch (error) {
      return error.code;
    }
    return "OK";
  };

  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(".gitignore", ".harness/workflow/local/\n");
  git.transactions.commit(root, {
    files: [".gitignore"],
    message: "chore: bootstrap",
    planPath: ".harness/plans/todo-plan.md",
    planText: plans.render(plans.createEmpty("hooks", "Hooks")),
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });

  // Managed hooks call the facade through a small runner.
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
  mkdirSync(hooks);
  for (const name of GIT_HOOKS) {
    writeFileSync(
      path.join(hooks, name),
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(runner)} ${name} "$@"\n`
    );
    chmodSync(path.join(hooks, name), 0o755);
  }
  git.setConfig(root, "core.hooksPath", hooks);

  // A direct git commit is rejected.
  write("direct.txt", "x");
  git.git.run(root, ["add", "direct.txt"]);
  const direct = git.git.run(root, ["commit", "-q", "-m", "direct"], {
    allowFailure: true,
  });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /MANAGED_COMMIT_REQUIRED/u);
  git.git.run(root, ["reset", "-q"]);
  rmSync(path.join(root, "direct.txt"));

  // quality:apply without a scope is a service commit: only doc builtins run.
  kit.qualityApply(root, {
    checks: [
      {
        command: {
          args: [
            "-e",
            `process.exit(require('fs').existsSync(${JSON.stringify(flag)})?0:1)`,
          ],
          executable: "node",
        },
        id: "lint",
        required: true,
        role: "lint",
        stage: "commit",
      },
      {
        command: {
          args: [
            "-e",
            "for(const f of ['src/b.ts'])require('fs').appendFileSync(f,'//x')",
          ],
          executable: "node",
        },
        id: "mutate",
        role: "custom",
        stage: "commit",
      },
      {
        command: { args: ["-e", "process.exit(0)"], executable: "node" },
        id: "push-ok",
        required: true,
        role: "custom",
        stage: "push",
      },
    ],
    stacks: ["node"],
  });
  write("docs/spec.md", "# Spec\n");
  kit.createScope(root, {
    acceptance: ["done"],
    approval: "User approved the hooks scope",
    id: "hooks-1",
    objective: "Exercise hooks",
    spec: "docs/spec.md",
    tasks: [
      {
        acceptance: ["a"],
        commitMessage: "feat: a",
        files: ["src/a.ts"],
        id: "A",
        title: "A",
      },
      {
        acceptance: ["b"],
        checks: ["mutate"],
        commitMessage: "feat: b",
        files: ["src/b.ts"],
        id: "B",
        title: "B",
      },
    ],
  });

  // A failing commit check rolls back the plan and keeps the edits.
  kit.startTask(root, "A");
  write("src/a.ts", "export const a = 1;\n");
  let failure = null;
  try {
    kit.commitTask(root, "A");
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, "COMMIT_FAILED");
  assert.equal(failure.details.retryable, true);
  assert.match(
    failure.details.output,
    /CHECK_FAILED: Commit checks failed:\n- lint failed/u
  );
  assert.equal(kit.status(root).currentTask.id, "A");
  assert.equal(
    readFileSync(path.join(root, "src", "a.ts"), "utf8"),
    "export const a = 1;\n"
  );
  writeFileSync(flag, "");
  const a = kit.commitTask(root, "A");
  const evidence = JSON.parse(
    readFileSync(
      path.join(
        root,
        ".harness",
        "workflow",
        "local",
        "verification",
        "last.json"
      ),
      "utf8"
    )
  );
  assert.equal(evidence.commit, a.commit.sha);
  assert.deepEqual(
    evidence.reports[0].results.map((item) => [item.id, item.status]),
    [
      ["lint", "passed"],
      ["kit:doc-size", "passed"],
      ["kit:md-links", "passed"],
      ["kit:file-lines", "passed"],
      ["kit:docs-contracts", "passed"],
      ["kit:conflict-markers", "passed"],
    ]
  );

  // A commit check that changes the candidate is rejected.
  kit.startTask(root, "B");
  write("src/b.ts", "export const b = 2;\n");
  assert.equal(
    code(() => kit.commitTask(root, "B")),
    "COMMIT_FAILED"
  );
  kit.updateTask(root, "B", { checks: [] });
  write("src/b.ts", "export const b = 2;\n");
  kit.commitTask(root, "B");

  // Push waits for the DOCS task of the last round with finished work.
  const blockedPush = kit.gitHook(root, "pre-push");
  assert.equal(blockedPush.code, "DOCS_PENDING");
  kit.startTask(root, "DOCS-R1");
  kit.commitTask(root, "DOCS-R1", {
    digest: {
      contracts: [],
      decisions: [],
      references: [],
      result: "Hooks exercised.",
    },
  });
  const push = kit.gitHook(root, "pre-push");
  assert.equal(push.exitCode, 0, push.message);
  assert.match(push.message, /push-ok/u);

  // Service commits still run documentation builtins.
  write("docs/broken.md", "[gone](./missing.md)\n");
  assert.equal(
    code(() => kit.commitDocs(root, ["docs/broken.md"])),
    "COMMIT_FAILED"
  );
  write("docs/broken.md", `fixed\n${"<".repeat(7)} HEAD\n`);
  let conflict = null;
  try {
    kit.commitDocs(root, ["docs/broken.md"]);
  } catch (error) {
    conflict = error;
  }
  assert.equal(conflict?.code, "COMMIT_FAILED");
  assert.match(
    conflict.details.output,
    /kit:conflict-markers failed[\s\S]*docs\/broken\.md: line 2/u
  );
  write("docs/broken.md", "fixed\n");
  kit.commitDocs(root, ["docs/broken.md"]);

  // commit-msg without a transaction and unknown hooks fail.
  write("msg.txt", "direct\n");
  assert.equal(
    kit.gitHook(root, "commit-msg", ["msg.txt"]).code,
    "MANAGED_COMMIT_REQUIRED"
  );
  assert.equal(kit.gitHook(root, "post-commit").exitCode, 0);
  assert.equal(kit.gitHook(root, "pre-rebase").code, "UNKNOWN_HOOK");
  assert.deepEqual(kit.validate(root), { errors: [], ok: true });
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
