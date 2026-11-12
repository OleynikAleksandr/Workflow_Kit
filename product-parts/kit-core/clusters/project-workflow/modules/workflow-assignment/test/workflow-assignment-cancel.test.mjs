import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// Cancelling assignments that are not INTEGRATED: record, worktree, branch.
const build = await buildWorkflowModules(
  ["workflow-assignment"],
  "workflow-assignment-cancel"
);
// The long path: git reports worktrees by it (Windows 8.3 names differ).
const sandbox = realpathSync.native(
  mkdtempSync(path.join(tmpdir(), "workflow-assignment-cancel-"))
);
try {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowAssignmentFacade } = await build.load(
    "workflow-assignment",
    "workflow-assignment-facade.js"
  );
  const git = new WorkflowGitFacade(undefined, cleanGitEnvironment());
  const assignments = new WorkflowAssignmentFacade();
  const failure = (action) => {
    try {
      action();
    } catch (error) {
      return error;
    }
    assert.fail("expected a refusal");
  };
  const root = path.join(sandbox, "main");
  mkdirSync(root);
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  writeFileSync(path.join(root, ".gitignore"), ".harness/workflow/local/\n");
  git.git.run(root, ["add", ".gitignore"]);
  git.git.run(root, ["commit", "-q", "-m", "chore: init"]);
  const base = git.head(root);
  const mainBranch = git.git.text(root, ["branch", "--show-current"]);
  const record = (taskId, fields = {}) => {
    const created = {
      ...assignments.create({
        baseCommit: base,
        configDigest: null,
        iteration: 1,
        now: "2026-11-05T12:00:00Z",
        scopeId: "demo",
        taskId,
      }),
      ...fields,
    };
    assignments.write(root, created);
    return created;
  };
  const worktree = (name) => {
    const folder = path.join(sandbox, name);
    git.git.run(root, ["worktree", "add", "-q", "-b", name, folder, base]);
    return folder;
  };
  const branchExists = (name) =>
    git.git.succeeds(root, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${name}`,
    ]);

  // An ASSIGNED record without a worktree: only the record goes.
  const plain = record("A");
  const cancelledA = assignments.cancel(git, root, plain, { force: false });
  assert.deepEqual(
    [cancelledA.worktree, cancelledA.branch, cancelledA.branchTip],
    [null, null, null]
  );
  assert.equal(assignments.read(root, plain.id), null);

  // A RUNNING record with a committed worktree branch: worktree and branch
  // (with its unintegrated commit) are removed, the tip is reported.
  const wtB = worktree("exec-b");
  writeFileSync(path.join(wtB, "b.txt"), "b\n");
  git.git.run(wtB, ["add", "b.txt"]);
  git.git.run(wtB, ["commit", "-q", "-m", "feat: b"]);
  const tipB = git.head(wtB);
  const running = record("B", {
    branch: "exec-b",
    status: "RUNNING",
    worktree: wtB,
  });
  const cancelledB = assignments.cancel(git, root, running, { force: false });
  assert.equal(cancelledB.worktree, wtB);
  assert.equal(cancelledB.branch, "exec-b");
  assert.equal(cancelledB.branchTip, tipB);
  assert.equal(existsSync(wtB), false);
  assert.equal(branchExists("exec-b"), false);
  assert.equal(assignments.read(root, running.id), null);

  // A dirty worktree is refused without --force and nothing changes.
  const wtC = worktree("exec-c");
  writeFileSync(path.join(wtC, "draft.txt"), "draft\n");
  const dirty = record("C", {
    branch: "exec-c",
    status: "READY",
    worktree: wtC,
  });
  const refused = failure(() =>
    assignments.cancel(git, root, dirty, { force: false })
  );
  assert.equal(refused.code, "ASSIGNMENT_DIRTY");
  assert.deepEqual(refused.details.paths, ["draft.txt"]);
  assert.match(refused.nextAction, /--force/u);
  assert.ok(existsSync(path.join(wtC, "draft.txt")));
  assert.ok(branchExists("exec-c"));
  assert.notEqual(assignments.read(root, dirty.id), null);
  const forced = assignments.cancel(git, root, dirty, { force: true });
  assert.equal(forced.worktree, wtC);
  assert.equal(existsSync(wtC), false);
  assert.equal(branchExists("exec-c"), false);
  assert.equal(assignments.read(root, dirty.id), null);

  // INTEGRATED is cleaned up, never cancelled.
  const integrated = record("D", { status: "INTEGRATED" });
  const done = failure(() =>
    assignments.cancel(git, root, integrated, { force: true })
  );
  assert.equal(done.code, "ASSIGNMENT_INTEGRATED");
  assert.match(done.nextAction, /assignment:cleanup --id/u);

  // A git refusal (the branch is checked out in main) keeps the record.
  const stuck = record("E", { branch: mainBranch, status: "ASSIGNED" });
  const blocked = failure(() =>
    assignments.cancel(git, root, stuck, { force: true })
  );
  assert.equal(blocked.code, "ASSIGNMENT_CANCEL_FAILED");
  assert.notEqual(assignments.read(root, stuck.id), null);
  assert.ok(branchExists(mainBranch));
  console.log("workflow-assignment cancel tests passed");
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
