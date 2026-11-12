import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// Planning refuses `checks` that are not quality check ids (CHECK_UNKNOWN)
// and writes nothing; valid ids pass before and after QUALITY.
const build = await buildWorkflowModules(
  ["workflow-kit"],
  "workflow-kit-plan-checks"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-kit-checks-"));
const write = (name, text) => {
  const file = path.join(root, ...name.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
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
    now: () => `2026-11-05T11:00:${String(tick++).padStart(2, "0")}Z`,
  });
  const failure = (action) => {
    try {
      action();
    } catch (error) {
      return error;
    }
    assert.fail("expected a refusal");
  };

  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(".gitignore", ".harness/workflow/local/\n");
  write("docs/spec.md", "# Spec\n\nModules.\n");
  git.transactions.commit(root, {
    files: [".gitignore", "docs/spec.md"],
    message: "chore: bootstrap",
    planPath: ".harness/plans/todo-plan.md",
    planText: plans.render(plans.createEmpty("demo", "Demo")),
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });
  const head = git.head(root);
  const task = (id, checks) => ({
    acceptance: [`${id} works`],
    checks,
    commitMessage: `feat: add ${id}`,
    files: [`src/${id.toLowerCase()}.ts`],
    id,
    title: `Module ${id}`,
  });
  const scope = (tasks) => ({
    acceptance: ["The modules exist"],
    approval: "User approved the demo scope",
    id: "demo-1",
    objective: "Build the modules",
    spec: "docs/spec.md",
    tasks,
  });

  // Before QUALITY: manual text and unknown kit builtins are refused, the
  // proposal and the scope are not written.
  const manual = failure(() =>
    kit.createScope(
      root,
      scope([task("A", []), task("B", ["Open the app and check the hint"])])
    )
  );
  assert.equal(manual.code, "CHECK_UNKNOWN");
  assert.deepEqual(manual.details.field, "tasks[1].checks");
  assert.equal(manual.details.taskId, "B");
  assert.deepEqual(manual.details.checks, ["Open the app and check the hint"]);
  assert.match(manual.nextAction, /acceptance/u);
  const proposed = failure(() =>
    kit.proposeScope(
      root,
      scope([task("A", ["kit:nope"])]),
      "sequential",
      "One module"
    )
  );
  assert.equal(proposed.code, "CHECK_UNKNOWN");
  assert.equal(proposed.details.field, "tasks[0].checks");
  assert.equal(kit.proposalView(root), null);
  assert.equal(git.head(root), head);
  assert.equal(kit.status(root).scope, null);

  // A Kit builtin and an id QUALITY will define are accepted.
  kit.createScope(
    root,
    scope([task("A", ["kit:file-lines"]), task("B", ["package-app"])])
  );
  kit.startTask(root, "QUALITY");
  write("package.json", "{}\n");
  kit.qualityApply(root, {
    checks: [
      {
        command: { args: ["-e", "process.exit(0)"], executable: "node" },
        id: "lint",
        required: true,
        role: "lint",
        stage: "commit",
      },
      {
        command: { args: ["-e", "process.exit(0)"], executable: "node" },
        evidence: "The app package is built from the current commit.",
        id: "package-app",
        required: false,
        role: "package",
        stage: "delivery",
      },
    ],
    stacks: ["node"],
  });

  // CONFIGURED: plan:extend and task:update check the profile ids.
  const revision = kit.status(root).revision;
  const extended = failure(() =>
    kit.extend(root, {
      round: "current",
      tasks: [task("C", ["lint", "package"])],
    })
  );
  assert.equal(extended.code, "CHECK_UNKNOWN");
  assert.equal(extended.details.field, "tasks[0].checks");
  assert.deepEqual(extended.details.checks, ["package"]);
  assert.ok(extended.details.known.includes("package-app"));
  const patched = failure(() =>
    kit.updateTask(root, "A", { checks: ["manual smoke test"] })
  );
  assert.equal(patched.code, "CHECK_UNKNOWN");
  assert.equal(patched.details.field, "checks");
  assert.equal(patched.details.taskId, "A");
  assert.equal(kit.status(root).revision, revision);

  // Valid ids pass; a patch without checks does not re-check old tasks.
  kit.extend(root, {
    round: "current",
    tasks: [task("C", ["package-app"])],
  });
  kit.updateTask(root, "A", { checks: ["package-app"] });
  kit.updateTask(root, "B", { title: "Module B, renamed" });
  assert.equal(kit.status(root).revision, revision + 3);
  console.log("workflow-kit planned checks tests passed");
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
