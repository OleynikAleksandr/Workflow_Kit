import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-assignment"],
  "workflow-kit-worktree"
);
// The long path: git reports worktrees by it (Windows 8.3 names differ).
const sandbox = realpathSync.native(
  mkdtempSync(path.join(tmpdir(), "workflow-kit-worktree-"))
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
  const { workflowAssignmentFacade } = await build.load(
    "workflow-assignment",
    "workflow-assignment-facade.js"
  );
  const { WorkflowKitFacade } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const { runCli } = await build.load("workflow-kit", "workflow-kit-cli.js");

  // A fake `npm` on PATH stands in for the real install: it records its
  // arguments, fails on demand and creates node_modules in its cwd.
  const bin = path.join(sandbox, "bin");
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "npm"),
    `#!/bin/sh
if [ -n "$FAKE_NPM_FAIL" ]; then echo "npm ERR! fake failure" >&2; exit 1; fi
echo "fake npm $*"
mkdir -p node_modules/left-pad
`
  );
  chmodSync(path.join(bin, "npm"), 0o755);
  writeFileSync(
    path.join(bin, "npm.cmd"),
    [
      "@echo off",
      'if "%FAKE_NPM_FAIL%"=="1" (',
      "  echo npm ERR! fake failure 1>&2",
      "  exit /b 1",
      ")",
      "echo fake npm %~1",
      "if not exist node_modules\\left-pad mkdir node_modules\\left-pad",
      "exit /b 0",
      "",
    ].join("\r\n")
  );
  const gitEnv = cleanGitEnvironment();
  // Windows keeps the search path under the key Path.
  const pathKey = Object.keys(gitEnv).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const env = { ...gitEnv, [pathKey]: `${bin}${path.delimiter}${gitEnv[pathKey] ?? ""}` };
  const git = new WorkflowGitFacade(undefined, gitEnv);
  const plans = new WorkflowPlanFacade();
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
  const code = (action) => failure(action)?.code ?? "OK";
  const write = (root, name, text) => {
    const file = path.join(root, ...name.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
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

  // --- Main checkout: a node project with dependencies and a lock file. ---
  const root = path.join(sandbox, "project");
  mkdirSync(root);
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(
    root,
    ".gitignore",
    ".harness/workflow/local/\n.harness/runtime/\nnode_modules/\n"
  );
  write(
    root,
    "package.json",
    `${JSON.stringify({ devDependencies: { "left-pad": "1.3.0" }, name: "demo" })}\n`
  );
  const lockText = `${JSON.stringify({ lockfileVersion: 3, name: "demo" })}\n`;
  write(root, "package-lock.json", lockText);
  git.transactions.commit(root, {
    files: [".gitignore", "package.json", "package-lock.json"],
    message: "chore: bootstrap",
    planPath: PLAN,
    planText: plans.render(plans.createEmpty("demo", "Demo")),
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });
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
          files: ["src/b.ts"],
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
    packageManager: "npm",
    stacks: ["node"],
  });
  const base = git.head(root);
  const idA = kit.createAssignment(root, "A").assignment.id;
  const idB = kit.createAssignment(root, "B").assignment.id;
  const worktree = (name, options) => {
    const folder = path.join(sandbox, name);
    git.git.run(root, ["worktree", "add", "-q", ...options, folder, base]);
    return folder;
  };

  // --- Attach: NEEDS_SETUP without node_modules, READY with them. ---
  const wtA = worktree("wt-a", ["--detach"]);
  const attachA = run(wtA, ["assignment:attach", idA, "--format", "text"]);
  assert.equal(attachA.exit, 0, attachA.stderr);
  assert.match(attachA.stdout, /, NEEDS_SETUP\n/u);
  assert.match(attachA.stdout, /next: scripts\/workflow assignment:setup /u);
  const recordA = kit.assignmentStatus(wtA).assignment;
  assert.equal(recordA.status, "NEEDS_SETUP");
  assert.equal(recordA.setup, null);
  const notReady = failure(() => kit.startTask(wtA, "A"));
  assert.equal(notReady.code, "ASSIGNMENT_NEEDS_SETUP");
  assert.match(notReady.nextAction, /assignment:setup/u);
  assert.equal(plans.read(wtA).tasks[0].status, "TODO");
  // DOCS commits run the documentation builtins only: never setup.
  assert.equal(
    workflowAssignmentFacade.needsSetup(wtA, { checks: [], kind: "docs" }),
    false
  );
  assert.equal(
    workflowAssignmentFacade.needsSetup(wtA, { checks: [], kind: "work" }),
    true
  );

  const wtB = worktree("wt-b", ["-b", "exec-b"]);
  mkdirSync(path.join(wtB, "node_modules", "left-pad"), { recursive: true });
  const attachedB = kit.attachAssignment(wtB, idB);
  assert.equal(attachedB.assignment.status, "READY");
  assert.equal(attachedB.assignment.branch, "exec-b");

  // --- Setup refusals keep NEEDS_SETUP. ---
  assert.equal(
    code(() => kit.setupAssignment(wtA, idB)),
    "ASSIGNMENT_READ_ONLY"
  );
  const noId = JSON.parse(run(root, ["assignment:setup"]).stdout);
  assert.equal(noId.code, "USAGE");
  assert.equal(
    code(() => kit.setupAssignment(root, "par-1-X-1")),
    "ASSIGNMENT_UNKNOWN"
  );
  renameSync(path.join(wtA, "package-lock.json"), path.join(sandbox, "lock"));
  const noLock = failure(() => kit.setupAssignment(wtA));
  assert.equal(noLock.code, "SETUP_LOCK_REQUIRED");
  assert.deepEqual(noLock.details.locks, [
    "package-lock.json",
    "npm-shrinkwrap.json",
  ]);
  renameSync(path.join(sandbox, "lock"), path.join(wtA, "package-lock.json"));
  mkdirSync(path.join(root, "node_modules", "main-only"), { recursive: true });
  symlinkSync(path.join(root, "node_modules"), path.join(wtA, "node_modules"));
  assert.equal(
    code(() => kit.setupAssignment(wtA)),
    "SETUP_LINKED_DEPENDENCIES"
  );
  rmSync(path.join(wtA, "node_modules"));
  env.FAKE_NPM_FAIL = "1";
  const failed = failure(() => kit.setupAssignment(wtA));
  env.FAKE_NPM_FAIL = "";
  assert.equal(failed.code, "SETUP_FAILED");
  assert.equal(failed.details.command, "npm ci");
  assert.equal(failed.details.exitCode, 1);
  assert.match(failed.details.output, /npm ERR! fake failure/u);
  assert.equal(kit.assignmentStatus(wtA).assignment.status, "NEEDS_SETUP");
  assert.equal(existsSync(path.join(wtA, "node_modules")), false);

  // --- Setup in the executor worktree: receipt and READY. ---
  const setupA = run(wtA, ["assignment:setup", "--format", "text"]);
  assert.equal(setupA.exit, 0, setupA.stderr);
  const lockHash = createHash("sha256").update(lockText).digest("hex");
  assert.match(
    setupA.stdout,
    new RegExp(
      `^assignment: ${idA} READY, set up with npm ci \\(lock ${lockHash.slice(0, 12)}\\)\\nnext: scripts/workflow task:start A\\n$`,
      "u"
    )
  );
  const readyA = kit.assignmentStatus(wtA).assignment;
  assert.equal(readyA.status, "READY");
  assert.equal(readyA.setup.command, "npm ci");
  assert.equal(readyA.setup.lockHash, lockHash);
  assert.match(readyA.setup.at, /^2026-11-04T12:00:\d\dZ$/u);
  assert.equal(existsSync(path.join(wtA, "node_modules", "left-pad")), true);
  // Main's own node_modules are untouched and never linked.
  assert.equal(existsSync(path.join(root, "node_modules", "left-pad")), false);
  assert.equal(existsSync(path.join(root, "node_modules", "main-only")), true);
  assert.equal(git.changes(wtA).all.length, 0);
  // In main with --id; a READY record stays READY.
  const setupB = kit.setupAssignment(root, idB);
  assert.equal(setupB.ran, true);
  assert.match(setupB.output, /fake npm ci/u);
  assert.equal(setupB.assignment.status, "READY");
  assert.equal(setupB.assignment.setup.command, "npm ci");
  assert.equal(kit.startTask(wtA, "A").task.status, "IN_PROGRESS");
  assert.equal(kit.assignmentStatus(wtA).assignment.status, "RUNNING");

  // --- Cleanup: main only, INTEGRATED only. ---
  const inWorktree = JSON.parse(run(wtA, ["assignment:cleanup"]).stdout);
  assert.equal(inWorktree.code, "ASSIGNMENT_READ_ONLY");
  assert.equal(
    code(() => kit.cleanupAssignments(root, idA)),
    "ASSIGNMENT_NOT_INTEGRATED"
  );
  assert.equal(
    code(() => kit.cleanupAssignments(root, "par-1-X-1")),
    "ASSIGNMENT_UNKNOWN"
  );
  assert.deepEqual(kit.cleanupAssignments(root).assignments, []);
  const integrate = (id) => {
    const record = workflowAssignmentFacade.read(root, id);
    workflowAssignmentFacade.write(root, { ...record, status: "INTEGRATED" });
  };

  // A detached worktree with ignored node_modules is removed without force.
  // The started task changed the plan; the executor's work is not the point here.
  git.git.run(wtA, ["checkout", "--", PLAN]);
  integrate(idA);
  const [doneA] = kit.cleanupAssignments(root, idA).assignments;
  assert.equal(doneA.cleanup.status, "DONE");
  assert.match(doneA.cleanup.at, /^2026-11-04T12:00:\d\dZ$/u);
  assert.deepEqual(workflowAssignmentFacade.read(root, idA), doneA);
  assert.equal(existsSync(wtA), false);
  assert.doesNotMatch(
    git.git.text(root, ["worktree", "list", "--porcelain"]),
    /wt-a\n/u
  );
  assert.deepEqual(kit.cleanupAssignments(root, idA).assignments, [doneA]);

  // A dirty worktree refuses: PENDING, the worktree stays.
  write(wtB, "src/b.ts", "export const b = 1;\n");
  integrate(idB);
  const pending = run(root, ["assignment:cleanup", "--format", "text"]);
  assert.equal(pending.exit, 0, pending.stderr);
  assert.match(
    pending.stdout,
    new RegExp(`^cleanup: ${idB} PENDING — git worktree remove `, "u")
  );
  assert.match(pending.stdout, /\nnext: resolve the reason/u);
  const pendingB = workflowAssignmentFacade.read(root, idB);
  assert.equal(pendingB.cleanup.status, "PENDING");
  assert.match(pendingB.cleanup.reason, /git worktree remove/u);
  assert.equal(existsSync(wtB), true);

  // An unmerged branch refuses `branch -d` after the worktree is gone.
  git.git.run(wtB, ["add", "src/b.ts"]);
  git.git.run(wtB, ["commit", "-q", "-m", "feat: add B"]);
  const [unmerged] = kit.cleanupAssignments(root).assignments;
  assert.equal(unmerged.id, idB);
  assert.equal(unmerged.cleanup.status, "PENDING");
  assert.match(unmerged.cleanup.reason, /git branch -d exec-b/u);
  assert.equal(existsSync(wtB), false);
  assert.equal(
    git.git.succeeds(root, ["show-ref", "--verify", "refs/heads/exec-b"]),
    true
  );

  // After the merge the next cleanup deletes the branch.
  git.git.run(root, ["merge", "-q", "--no-ff", "-m", "merge: B", "exec-b"]);
  const cleaned = run(root, ["assignment:cleanup", "--id", idB]);
  assert.equal(cleaned.exit, 0, cleaned.stderr);
  const [doneB] = JSON.parse(cleaned.stdout).result.assignments;
  assert.equal(doneB.cleanup.status, "DONE");
  assert.equal(
    git.git.succeeds(root, ["show-ref", "--verify", "refs/heads/exec-b"]),
    false
  );
  assert.equal(
    run(root, ["assignment:cleanup", "--format", "text"]).stdout,
    "cleanup: nothing to clean up.\n"
  );

  console.log("workflow-kit worktree tests passed");
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
