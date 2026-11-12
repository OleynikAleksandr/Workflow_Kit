import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-assignment"],
  "workflow-kit-context"
);
const roots = [];
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
  const project = () => {
    const root = mkdtempSync(path.join(tmpdir(), "workflow-context-"));
    roots.push(root);
    git.init(root);
    git.setConfig(root, "user.name", "Workflow Test");
    git.setConfig(root, "user.email", "workflow@harness-ai.test");
    writeFileSync(
      path.join(root, ".gitignore"),
      ".harness/workflow/local/\n.harness/runtime/\n"
    );
    git.transactions.commit(root, {
      files: [".gitignore"],
      message: "chore: bootstrap",
      planPath: ".harness/plans/todo-plan.md",
      planText: plans.render(plans.createEmpty("demo", "Demo")),
      role: "bootstrap",
      scopeId: null,
      taskId: null,
    });
    return root;
  };
  const write = (root, name, text) => {
    const file = path.join(root, ...name.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const work = (id, fields = {}) => ({
    acceptance: [`${id} works`],
    commitMessage: `feat: add ${id}`,
    files: [`src/${id.toLowerCase()}.ts`],
    id,
    title: `Module ${id}`,
    ...fields,
  });
  const scope = (id, tasks, fields = {}) => ({
    acceptance: ["The modules exist"],
    approval: "User approved the scope",
    id,
    objective: "Build modules",
    spec: "docs/spec.md",
    tasks,
    ...fields,
  });
  const big = `# Big\n\n${"x".repeat(70_000)}\n`;
  const design = (storage) =>
    `# Design\n\n## Storage\n\n${storage}\n\n## Network\n\nNetwork text.\n`;

  // --- Plan-time checks in scope:create. ---
  const plain = project();
  write(plain, "docs/spec.md", "# Spec\n\nThe modules.\n");
  write(plain, "docs/design.md", design("Storage text."));
  write(plain, "docs/big.md", big);
  let error = failure(() =>
    kit.createScope(
      plain,
      scope("ctx-1", [
        work("A", { context: [{ path: "docs/absent.md", required: true }] }),
      ])
    )
  );
  assert.equal(error.code, "CONTEXT_MISSING");
  assert.deepEqual(error.details, { path: "docs/absent.md", taskId: "A" });
  error = failure(() =>
    kit.createScope(
      plain,
      scope("ctx-1", [
        work("A", {
          context: [
            { heading: "Missing", path: "docs/design.md", required: true },
          ],
        }),
      ])
    )
  );
  assert.equal(error.code, "CONTEXT_MISSING");
  assert.deepEqual(error.details, {
    heading: "Missing",
    path: "docs/design.md",
    taskId: "A",
  });
  error = failure(() =>
    kit.createScope(
      plain,
      scope("ctx-1", [
        work("A", { context: [{ path: "docs/big.md", required: true }] }),
      ])
    )
  );
  assert.equal(error.code, "CONTEXT_TOO_LARGE");
  assert.equal(error.details.taskId, "A");
  assert.equal(error.details.budget, 60_000);
  assert.ok(error.details.bytes > 60_000);
  assert.match(error.nextAction, /heading/u);
  // A task without context brings the specification: too large as well.
  error = failure(() =>
    kit.createScope(
      plain,
      scope("ctx-1", [work("A", { context: [] })], { spec: "docs/big.md" })
    )
  );
  assert.equal(error.code, "CONTEXT_TOO_LARGE");
  assert.equal(plans.read(plain).scope, null);

  // A section reference fits; the scope is created.
  kit.createScope(
    plain,
    scope("ctx-1", [
      work("A", {
        context: [
          { heading: "Storage", path: "docs/design.md", required: true },
        ],
      }),
      work("B"),
    ])
  );
  assert.equal(plans.read(plain).scope.id, "ctx-1");

  // task:update checks the patched task, plan:extend the new tasks.
  error = failure(() =>
    kit.updateTask(plain, "B", {
      context: [{ path: "docs/big.md", required: true }],
    })
  );
  assert.equal(error.code, "CONTEXT_TOO_LARGE");
  assert.equal(error.details.taskId, "B");
  error = failure(() =>
    kit.extend(plain, {
      round: "current",
      tasks: [
        work("C", { context: [{ path: "docs/gone.md", required: true }] }),
      ],
    })
  );
  assert.equal(error.code, "CONTEXT_MISSING");
  assert.equal(error.details.taskId, "C");
  assert.equal(
    plans.read(plain).tasks.some((task) => task.id === "C"),
    false
  );

  // --- The brief in an orchestrated scope. ---
  const root = project();
  write(root, "docs/spec.md", "# Spec\n\nThe modules.\n");
  write(root, "docs/design.md", design("Storage text."));
  write(root, "docs/notes.md", "# Notes\n\nNote text.\n");
  kit.commitDocs(root, ["docs/notes.md"]);
  kit.proposeScope(
    root,
    scope(
      "ctx-2",
      [
        work("A", {
          context: [
            { heading: "Storage", path: "docs/design.md", required: true },
            { path: "docs/notes.md", required: false },
          ],
          parallelSafe: true,
        }),
        work("B", { parallelSafe: true }),
      ],
      {
        context: [{ path: "docs/design.md", required: true }],
        execution: { maxWorkers: 2 },
      }
    ),
    "orchestrated",
    "Independent modules"
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
    stacks: ["node"],
  });

  // B has no context: the brief carries the specification whole.
  const briefB = kit.createAssignment(root, "B").brief;
  assert.match(
    briefB,
    /Context documents \(full text, do not re-read them\):\n\n<document path="docs\/spec\.md" bytes="20">\n# Spec\n\nThe modules\.\n<\/document>\n/u
  );
  assert.doesNotMatch(briefB, /<document path="docs\/design\.md"/u);
  // The documents map follows the context documents, the spec folder first.
  assert.match(
    briefB,
    /<\/document>\n\nProject documents \(ask with scripts\/workflow context <path>\):\ndocs\/design\.md \(\d+ bytes\): Storage; Network\ndocs\/notes\.md \(\d+ bytes\)\ndocs\/spec\.md \(\d+ bytes\)\n.*\.harness\/plans\/todo-plan\.md/su
  );

  // The documents grew after planning: assignment:create refuses, no record.
  write(root, "docs/design.md", design("y".repeat(70_000)));
  kit.commitDocs(root, ["docs/design.md"]);
  error = failure(() => kit.createAssignment(root, "A"));
  assert.equal(error.code, "CONTEXT_TOO_LARGE");
  assert.equal(error.details.taskId, "A");
  assert.equal(error.details.budget, 60_000);
  const recordA = path.join(
    root,
    ".harness",
    "workflow",
    "local",
    "assignments",
    "ctx-2-A-1.json"
  );
  assert.equal(existsSync(recordA), false);
  // A heading that disappeared: CONTEXT_MISSING.
  write(root, "docs/design.md", "# Design\n\n## Network\n\nNetwork text.\n");
  kit.commitDocs(root, ["docs/design.md"]);
  error = failure(() => kit.createAssignment(root, "A"));
  assert.equal(error.code, "CONTEXT_MISSING");
  assert.deepEqual(error.details, {
    heading: "Storage",
    path: "docs/design.md",
    taskId: "A",
  });
  assert.equal(existsSync(recordA), false);

  // Restored: the brief carries the section and the whole optional note.
  write(root, "docs/design.md", design("Storage text."));
  kit.commitDocs(root, ["docs/design.md"]);
  const briefA = kit.createAssignment(root, "A").brief;
  assert.match(briefA, /Context:\n {3}- docs\/design\.md \(Storage\)\n/u);
  assert.match(
    briefA,
    /<document path="docs\/design\.md" heading="Storage" bytes="25">\n## Storage\n\nStorage text\.\n<\/document>\n/u
  );
  assert.doesNotMatch(briefA, /Network text/u);
  assert.match(
    briefA,
    /<document path="docs\/notes\.md" bytes="19">\n# Notes\n\nNote text\.\n<\/document>\n/u
  );
  assert.doesNotMatch(briefA, /<document path="docs\/spec\.md"/u);
  assert.equal(existsSync(recordA), true);

  console.log("workflow-kit context tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
