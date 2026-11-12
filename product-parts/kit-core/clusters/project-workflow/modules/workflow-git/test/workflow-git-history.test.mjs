import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { cleanGitEnvironment } from "./workflow-git-test-repo.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-git"],
  "workflow-git-history"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-git-history-"));
try {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const env = cleanGitEnvironment();
  const git = new WorkflowGitFacade(undefined, env);
  assert.equal(git.isRepository(root), false);
  git.init(root);
  assert.equal(git.isRepository(root), true);
  assert.equal(git.head(root), null);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  assert.deepEqual(git.identity(root), {
    email: "workflow@harness-ai.test",
    name: "Workflow Test",
  });

  writeFileSync(path.join(root, "a.txt"), "a");
  writeFileSync(path.join(root, "space name.txt"), "b");
  let changes = git.changes(root);
  assert.deepEqual(changes.untracked, ["a.txt", "space name.txt"]);
  git.git.run(root, ["add", "a.txt"]);
  git.git.run(root, [
    "commit",
    "-q",
    "-m",
    "feat: first\n\nWorkflow-Scope: demo\nWorkflow-Task: T001",
  ]);
  const first = git.head(root);
  assert.match(first, /^[0-9a-f]{40}$/u);

  writeFileSync(path.join(root, "a.txt"), "changed");
  git.git.run(root, ["mv", "space name.txt", "b.txt"], { allowFailure: true });
  git.git.run(root, ["add", "space name.txt"]);
  git.git.run(root, ["commit", "-q", "-m", "chore: second"]);
  git.git.run(root, ["mv", "space name.txt", "b.txt"]);
  changes = git.changes(root);
  assert.deepEqual(changes.staged, ["b.txt", "space name.txt"]);
  assert.deepEqual(changes.unstaged, ["a.txt"]);
  assert.deepEqual(changes.all, ["a.txt", "b.txt", "space name.txt"]);

  const history = git.history(root, null);
  assert.equal(history.length, 2);
  assert.deepEqual(history[0].trailers, {
    "Workflow-Scope": ["demo"],
    "Workflow-Task": ["T001"],
  });
  assert.equal(history[0].subject, "feat: first");
  assert.deepEqual(history[1].parents, [first]);
  assert.deepEqual(
    git.history(root, first).map((c) => c.subject),
    ["chore: second"]
  );
  assert.deepEqual(git.commitPaths(root, first), ["a.txt"]);
  assert.equal(git.isAncestor(root, first, "HEAD"), true);
  assert.equal(git.show(root, first, "a.txt"), "a");
  assert.equal(git.show(root, first, "missing.txt"), null);
  assert.equal(git.config(root, "core.hooksPath"), null);
  assert.ok(git.gitPath(root, "hooks").endsWith(path.join(".git", "hooks")));
  assert.throws(
    () => git.git.run(root, ["no-such-command"]),
    (e) => e.code === "GIT_FAILED"
  );
  console.log("workflow-git history tests passed");
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
