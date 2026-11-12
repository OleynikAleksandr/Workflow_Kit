import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  [
    "workflow-platform",
    "workflow-plan",
    "workflow-git",
    "workflow-quality",
    "workflow-recovery",
  ],
  "workflow-recovery-project"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-recovery-"));
const PLAN = ".harness/plans/todo-plan.md";
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
  const { WorkflowRecoveryFacade } = await build.load(
    "workflow-recovery",
    "workflow-recovery-facade.js"
  );
  const git = new WorkflowGitFacade(undefined, cleanGitEnvironment());
  const plans = new WorkflowPlanFacade();
  const recovery = new WorkflowRecoveryFacade(git);

  // Not a repository yet: the packet still builds and says so.
  const bare = recovery.packet(root);
  assert.match(bare.text, /warning: The project is not a git repository\./u);
  assert.match(bare.text, /No active scope/u);

  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(".gitignore", ".harness/workflow/local/\n");
  write("docs/spec.md", "# Spec\n\n## Goal\n\nShip it.\n");
  let plan = plans.createEmpty("p", "Recovery");
  git.transactions.commit(root, {
    files: [".gitignore", "docs/spec.md"],
    message: "chore: bootstrap",
    planPath: PLAN,
    planText: plans.render(plan),
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });
  plan = plans.createScope(
    plan,
    {
      acceptance: ["works"],
      approval: "User approved the scope",
      id: "demo",
      objective: "Ship the demo",
      spec: "docs/spec.md",
      tasks: [
        {
          acceptance: ["a"],
          commitMessage: "feat: A",
          files: ["src/a.ts"],
          id: "A",
          title: "Task A",
        },
        {
          acceptance: ["b"],
          commitMessage: "feat: B",
          dependencies: ["A"],
          files: ["src/b.ts"],
          id: "B",
          title: "Task B",
        },
      ],
    },
    {
      baselineCommit: git.head(root),
      now: "2026-11-03T00:00:00Z",
      qualityConfigured: true,
    }
  );
  git.transactions.commit(root, {
    files: [],
    message: "docs: scope",
    planPath: PLAN,
    planText: plans.render(plan),
    role: "scope-plan",
    scopeId: "demo",
    taskId: null,
  });
  plan = plans.completeTask(plans.startTask(plan, "A"), "A");
  write("src/a.ts", "a");
  const a = git.transactions.commit(root, {
    files: ["src/a.ts"],
    iteration: 1,
    message: "feat: A",
    planPath: PLAN,
    planText: plans.render(plan),
    role: "implementation",
    scopeId: "demo",
    taskId: "A",
  });
  plan = plans.startTask(plan, "B");
  plans.write(root, plan);
  write("src/b.ts", "b");
  write("notes.txt", "scratch");

  // The packet reflects the plan, git and the changes outside the task.
  const packet = recovery.packet(root, "compact");
  assert.match(packet.text, /event: compact/u);
  assert.match(packet.text, /## next\nContinue B: Task B/u);
  assert.match(packet.text, new RegExp(`- A ${a.sha.slice(0, 8)} Task A`, "u"));
  assert.match(packet.text, /## changes\noutside the task:\n- notes\.txt\n/u);
  assert.doesNotMatch(packet.text, /- src\/b\.ts/u);
  assert.ok(packet.included.includes("document docs/spec.md"));
  const json = JSON.parse(recovery.render(packet, "json"));
  assert.equal(json.schema, "harness-workflow-recovery/1");
  assert.equal(json.bytes, packet.bytes);

  // SessionStart hook: context for providers, nothing inside Harness.
  const hook = JSON.parse(
    recovery.sessionStart(root, {
      client: "claude",
      env: {},
      stdin: '{"source":"clear"}',
    })
  );
  assert.equal(hook.continue, true);
  assert.equal(hook.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(hook.hookSpecificOutput.additionalContext, /event: clear/u);
  const hosted = JSON.parse(
    recovery.sessionStart(root, {
      client: "codex",
      env: { HARNESS_WORKFLOW_RECOVERY: "host" },
      stdin: "not json",
    })
  );
  assert.deepEqual(hosted, {
    continue: true,
    hookSpecificOutput: { hookEventName: "SessionStart" },
  });
  write(
    PLAN,
    "<!-- harness-workflow:begin -->\n{broken\n<!-- harness-workflow:end -->\n"
  );
  const broken = JSON.parse(
    recovery.sessionStart(root, { client: "claude", env: {}, stdin: "" })
  );
  assert.match(
    broken.hookSpecificOutput.additionalContext,
    /could not build the recovery packet \(PLAN_MARKERS\)/u
  );
  plans.write(root, plan);

  // show-task and history come from the plan and git trailers.
  assert.match(
    recovery.showTask(root, "A"),
    new RegExp(`committed: ${a.sha}`, "u")
  );
  assert.throws(() => recovery.showTask(root, "Z"), { code: "UNKNOWN_TASK" });
  const all = recovery.history(root);
  assert.deepEqual(
    all.entries.map((entry) => [entry.role, entry.taskId]),
    [
      ["scope-plan", null],
      ["implementation", "A"],
    ]
  );
  assert.deepEqual(
    recovery.history(root, { task: "A" }).entries.map((entry) => entry.sha),
    [a.sha]
  );
  assert.equal(
    recovery.history(root, { round: "R9" }).text,
    "No workflow commits match.\n"
  );
  assert.match(
    all.text,
    new RegExp(`${a.sha.slice(0, 8)} implementation A feat: A`, "u")
  );
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
