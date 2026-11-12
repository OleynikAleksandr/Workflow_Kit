import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-recovery", "workflow-kit"],
  "workflow-recovery-worktree"
);
// The long path: git reports worktrees by it (Windows 8.3 names differ).
const sandbox = realpathSync.native(
  mkdtempSync(path.join(tmpdir(), "workflow-recovery-worktree-"))
);
try {
  const sectionOf = (packet, name) =>
    packet.sections.find((section) => section.name === name).text;
  // --- A real project: main orchestrator and an executor worktree. ---
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
    now: () => `2026-11-04T12:00:${String(tick++).padStart(2, "0")}Z`,
  });
  const write = (root, name, text) => {
    const file = path.join(root, ...name.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const PLAN = ".harness/plans/todo-plan.md";
  const root = path.join(sandbox, "project");
  mkdirSync(root);
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(root, ".gitignore", ".harness/workflow/local/\n.harness/runtime/\n");
  git.transactions.commit(root, {
    files: [".gitignore"],
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
  const recover = (folder) => kit.recover(folder);
  const nextOf = (folder) => sectionOf(recover(folder), "next");

  assert.match(recover(root).text, /\nrole: planning\n/u);
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
  assert.match(
    nextOf(root),
    /^No active scope: the scope proposal \(generation 1, recommended orchestrated\) is waiting for the user's choice/u
  );
  kit.chooseScope(root, {
    generation: 1,
    note: "User clicked orchestrated",
    option: "orchestrated",
    session: "session-1",
  });
  assert.match(
    recover(root).text,
    /\nrole: orchestrator\nassignments: none\nintegration: none\n/u
  );
  assert.match(nextOf(root), /^Run QUALITY yourself in main/u);
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
    stacks: ["node"],
  });
  assert.match(nextOf(root), /^Hand out A, B: for each/u);
  const base = git.head(root);
  const id = kit.createAssignment(root, "A").assignment.id;
  assert.match(
    recover(root).text,
    new RegExp(`assignments:\\n- ${id} A ASSIGNED not attached\\n`, "u")
  );
  assert.match(nextOf(root), /^Hand out B: /u);

  // Before attach a linked worktree of the orchestrated scope is an executor.
  const wt = path.join(sandbox, "wt-a");
  git.git.run(root, ["worktree", "add", "-q", "--detach", wt, base]);
  assert.match(recover(wt).text, /\nrole: executor \(not attached\)\n/u);
  assert.match(
    nextOf(wt),
    /^Executor worktree not attached: run `scripts\/workflow assignment:attach <id>`/u
  );

  kit.attachAssignment(wt, id);
  const attached = recover(wt);
  assert.match(
    attached.text,
    new RegExp(
      `\\nrole: executor \\(assignment ${id}, task A, READY\\)\\n`,
      "u"
    )
  );
  assert.doesNotMatch(attached.text, /assignments:|Module B/u);
  assert.match(
    sectionOf(attached, "next"),
    /^Start A via `scripts\/workflow task:start A`: Module A\./u
  );
  assert.match(
    recover(root).text,
    new RegExp(
      `- ${id} A READY ${wt.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\n`,
      "u"
    )
  );

  kit.startTask(wt, "A");
  assert.match(nextOf(wt), /^Continue A: Module A\. Commit with/u);
  write(wt, "src/a.ts", "export const a = 1;\n");
  const committed = kit.commitTask(wt, "A").commit.sha;
  assert.match(
    nextOf(wt),
    new RegExp(`^Task A is committed \\(${committed}\\): report the SHA`, "u")
  );
  assert.match(
    nextOf(root),
    new RegExp(
      `^Integrate first, one at a time:\\n- \`scripts/workflow integration:start --id ${id} --source ${committed.slice(0, 8)}\` \\(task A\\)\\nHand out B: `,
      "u"
    )
  );
  rmSync(wt, { force: true, recursive: true });
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
