import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { cleanGitEnvironment } from "./workflow-git-test-repo.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-git"],
  "workflow-git-transaction"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-git-tx-"));
const PLAN = ".harness/plans/todo-plan.md";
const write = (file, text) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};
const read = (file) => readFileSync(path.join(root, file), "utf8");
try {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const git = new WorkflowGitFacade(undefined, cleanGitEnvironment());
  const tx = git.transactions;
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(".gitignore", ".harness/workflow/local/\n");

  // Bootstrap commit creates the plan file and carries trailers.
  const boot = tx.commit(root, {
    files: [".gitignore"],
    message: "chore: bootstrap",
    planPath: PLAN,
    planText: "plan v1\n",
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });
  assert.equal(git.head(root), boot.sha);
  const [bootCommit] = git.history(root, null);
  assert.deepEqual(bootCommit.trailers["Workflow-Role"], ["bootstrap"]);
  assert.equal(bootCommit.trailers["Workflow-Transaction"].length, 1);
  assert.equal(tx.journal(root), null);
  assert.ok(existsSync(git.localPath(root, "last-commit.json")));

  // Task baseline: pre-existing edits and private files stay out of the task commit.
  write("notes.txt", "user draft");
  const identity = { iteration: 1, scopeId: "demo", taskId: "T001" };
  git.beginTask(root, identity);
  write("src/a.ts", "export const a = 1;\n");
  write(".env", "SECRET=1");
  let selection = git.selectTaskFiles(root, identity);
  assert.deepEqual(selection.selected, ["src/a.ts"]);
  assert.deepEqual(selection.excluded.sort(), [".env", "notes.txt"]);
  const done = tx.commit(root, {
    excluded: selection.excluded,
    files: selection.selected,
    iteration: 1,
    message: "feat: a",
    planPath: PLAN,
    planText: "plan v2\n",
    role: "implementation",
    scopeId: "demo",
    taskId: "T001",
  });
  assert.deepEqual(git.commitPaths(root, done.sha), [PLAN, "src/a.ts"]);
  assert.deepEqual(done.excluded.sort(), [".env", "notes.txt"]);
  const taskCommit = git.history(root, boot.sha)[0];
  assert.deepEqual(taskCommit.trailers["Workflow-Task"], ["T001"]);
  assert.deepEqual(taskCommit.trailers["Workflow-Iteration"], ["1"]);
  assert.equal(read("notes.txt"), "user draft");

  // Re-editing a pre-existing file requires an explicit choice.
  const second = { iteration: 1, scopeId: "demo", taskId: "T002" };
  git.beginTask(root, second);
  write("notes.txt", "user draft, continued");
  assert.throws(
    () => git.selectTaskFiles(root, second),
    (e) => e.code === "EXISTING_EDITS_CHANGED"
  );
  selection = git.selectTaskFiles(root, second, ["notes.txt"]);
  assert.deepEqual(selection.selected, ["notes.txt"]);
  assert.throws(
    () => git.selectTaskFiles(root, second, [".harness/workflow/config.json"]),
    (e) => e.code === "MANAGED_FILE"
  );
  assert.throws(
    () => git.selectTaskFiles(root, { ...second, taskId: "T404" }),
    (e) => e.code === "TASK_FILES_UNKNOWN"
  );

  // Foreign staged files block the transaction.
  write("other.txt", "x");
  git.git.run(root, ["add", "other.txt"]);
  assert.throws(
    () =>
      tx.commit(root, {
        files: ["notes.txt"],
        message: "feat: notes",
        planPath: PLAN,
        planText: "plan v3\n",
        role: "implementation",
        scopeId: "demo",
        taskId: "T002",
      }),
    (e) => e.code === "FOREIGN_STAGED"
  );
  git.git.run(root, ["reset", "-q", "other.txt"]);

  // A failing hook restores plan and index and keeps the edits. The hook
  // records pending evidence like the Kit pre-commit hook does.
  const verification = git.localPath(root, "verification");
  const pendingFiles = () =>
    existsSync(verification)
      ? readdirSync(verification).filter((name) => name.startsWith("pending-"))
      : [];
  const evidenceScript = git.gitPath(root, "write-pending.cjs");
  writeFileSync(
    evidenceScript,
    [
      'const fs = require("node:fs");',
      `const journal = JSON.parse(fs.readFileSync(${JSON.stringify(git.localPath(root, "transaction.json"))}, "utf8"));`,
      `fs.mkdirSync(${JSON.stringify(verification)}, { recursive: true });`,
      `fs.writeFileSync(${JSON.stringify(verification)} + "/pending-" + journal.id + ".json", JSON.stringify({ reports: [], transaction: journal.id }));`,
    ].join("\n")
  );
  const hook = path.join(git.gitPath(root, "hooks"), "pre-commit");
  const writeHook = (exitCode) =>
    writeFileSync(
      hook,
      `#!/bin/sh\n"${process.execPath}" "${evidenceScript}"\necho 'lint failed' >&2\nexit ${exitCode}\n`
    );
  mkdirSync(path.dirname(hook), { recursive: true });
  writeHook(1);
  chmodSync(hook, 0o755);
  const before = read(PLAN);
  assert.throws(
    () =>
      tx.commit(root, {
        files: ["notes.txt"],
        message: "feat: notes",
        planPath: PLAN,
        planText: "plan v3\n",
        prepare: (files) => write(files[0], "formatted draft"),
        role: "implementation",
        scopeId: "demo",
        taskId: "T002",
      }),
    (e) =>
      e.code === "COMMIT_FAILED" &&
      e.details.retryable === true &&
      e.details.output.includes("lint failed")
  );
  assert.equal(read(PLAN), before);
  assert.equal(
    read("notes.txt"),
    "formatted draft",
    "prepare-stage edits stay in the working tree"
  );
  assert.deepEqual(git.changes(root).staged, []);
  assert.equal(tx.journal(root), null);
  assert.deepEqual(
    pendingFiles(),
    [],
    "a failed check leaves no pending evidence"
  );
  assert.equal(
    readdirSync(verification).filter((name) => name.startsWith("failed-"))
      .length,
    1
  );

  // Retry succeeds; the pending evidence becomes the commit receipt.
  writeHook(0);
  const retried = tx.commit(root, {
    files: ["notes.txt"],
    message: "feat: notes",
    planPath: PLAN,
    planText: "plan v3\n",
    role: "implementation",
    scopeId: "demo",
    taskId: "T002",
  });
  assert.equal(git.head(root), retried.sha);
  assert.deepEqual(pendingFiles(), [], "a commit leaves no pending evidence");
  assert.equal(
    JSON.parse(read(`.harness/workflow/local/verification/${retried.sha}.json`))
      .commit,
    retried.sha
  );
  assert.equal(
    JSON.parse(read(".harness/workflow/local/verification/last.json")).commit,
    retried.sha
  );
  rmSync(hook);

  // Nothing-to-commit is reported without leaving a journal.
  assert.throws(
    () =>
      tx.commit(root, {
        files: [],
        message: "chore: none",
        planPath: PLAN,
        planText: "plan v3\n",
        role: "docs",
        scopeId: "demo",
        taskId: null,
      }),
    (e) => e.code === "NOTHING_TO_COMMIT"
  );
  assert.equal(tx.journal(root), null);
  assert.equal(tx.finish(root), null);
  assert.equal(tx.cancel(root), false);

  // Integration commits: two parents only while the merge of the source runs.
  // Earlier leftovers (untracked) do not take part in the merge.
  for (const file of git.changes(root).untracked) {
    rmSync(path.join(root, file), { force: true });
  }
  assert.deepEqual(git.changes(root).all, [], "clean before the merge");
  const mainBranch = git.git.text(root, ["branch", "--show-current"]);
  const mainHead = git.head(root);
  git.git.run(root, ["checkout", "-q", "-b", "side"]);
  write("side.txt", "side\n");
  const side = tx.commit(root, {
    files: ["side.txt"],
    message: "docs: side",
    planPath: PLAN,
    planText: "plan side\n",
    role: "docs",
    scopeId: "demo",
    taskId: null,
  }).sha;
  git.git.run(root, ["checkout", "-q", mainBranch]);
  const integration = {
    assignmentId: "demo-T009-1",
    files: ["side.txt"],
    iteration: 1,
    message: "merge: side",
    planPath: PLAN,
    planText: "plan merged\n",
    role: "integration",
    scopeId: "demo",
    sourceCommit: side,
    taskId: "T009",
    transactionId: "op-1",
  };
  assert.throws(
    () => tx.commit(root, integration),
    (e) => e.code === "MERGE_REQUIRED"
  );
  assert.equal(tx.journal(root), null);
  git.git.run(root, ["merge", "--no-commit", "--no-ff", "-q", side]);
  assert.equal(git.mergeHead(root), side);
  assert.deepEqual(git.conflicts(root), []);
  assert.throws(
    () =>
      tx.commit(root, {
        files: ["side.txt"],
        message: "docs: not a merge",
        planPath: PLAN,
        planText: "plan v9\n",
        role: "docs",
        scopeId: "demo",
        taskId: null,
      }),
    (e) => e.code === "MERGE_IN_PROGRESS"
  );
  const merged = tx.commit(root, integration);
  assert.equal(merged.role, "integration");
  const [mergeCommit] = git.history(root, mainHead).slice(-1);
  assert.equal(mergeCommit.sha, merged.sha);
  assert.deepEqual(mergeCommit.parents, [mainHead, side]);
  assert.deepEqual(mergeCommit.trailers["Workflow-Source"], [side]);
  assert.deepEqual(mergeCommit.trailers["Workflow-Transaction"], ["op-1"]);
  assert.deepEqual(mergeCommit.trailers["Workflow-Assignment"], [
    "demo-T009-1",
  ]);
  assert.equal(git.mergeHead(root), null);
  assert.equal(tx.journal(root), null);
  assert.equal(read(PLAN), "plan merged\n");

  // A folder removed from the index and ignored in the same commit: the
  // staged deletions are committed, git add never sees the ignored paths and
  // the files stay on disk. A path neither in the index nor on disk is skipped.
  write("deps/pkg/index.js", "module.exports = 1;\n");
  write("gone.txt", "gone\n");
  const vendored = tx.commit(root, {
    files: ["deps/pkg/index.js", "gone.txt"],
    message: "chore: vendor deps",
    planPath: PLAN,
    planText: "plan deps\n",
    role: "docs",
    scopeId: "demo",
    taskId: null,
  });
  assert.deepEqual(git.commitPaths(root, vendored.sha).sort(), [
    PLAN,
    "deps/pkg/index.js",
    "gone.txt",
  ]);
  git.git.run(root, ["rm", "-r", "-q", "--cached", "deps"]);
  git.git.run(root, ["rm", "-q", "gone.txt"]);
  write(".gitignore", ".harness/workflow/local/\ndeps/\n");
  write("fresh.txt", "new\n");
  // absentPaths names what the candidate will not hold: ignored copies left
  // on disk and paths missing on disk; tracked and new files stay.
  assert.deepEqual(
    git.absentPaths(root, [
      ".gitignore",
      "deps/pkg/index.js",
      "fresh.txt",
      "gone.txt",
      "never.txt",
    ]),
    ["deps/pkg/index.js", "gone.txt", "never.txt"]
  );
  assert.deepEqual(git.absentPaths(root, []), []);
  rmSync(path.join(root, "fresh.txt"));
  const unvendored = tx.commit(root, {
    files: [".gitignore", "deps/pkg/index.js", "gone.txt", "never.txt"],
    message: "chore: ignore deps",
    planPath: PLAN,
    planText: "plan no deps\n",
    role: "docs",
    scopeId: "demo",
    taskId: null,
  });
  assert.deepEqual(git.commitPaths(root, unvendored.sha).sort(), [
    ".gitignore",
    PLAN,
    "deps/pkg/index.js",
    "gone.txt",
  ]);
  assert.equal(git.git.text(root, ["ls-files", "--", "deps", "gone.txt"]), "");
  assert.ok(existsSync(path.join(root, "deps", "pkg", "index.js")));
  assert.deepEqual(git.changes(root).all, []);
  console.log("workflow-git transaction tests passed");
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
