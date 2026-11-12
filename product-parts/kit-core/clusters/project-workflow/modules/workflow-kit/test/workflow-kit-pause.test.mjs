import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-assignment"],
  "workflow-kit-pause"
);
const sandbox = realpathSync(
  mkdtempSync(path.join(tmpdir(), "workflow-kit-pause-"))
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
  const { WorkflowKitFacade } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const { runCli } = await build.load("workflow-kit", "workflow-kit-cli.js");
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
  const code = (action) => failure(action)?.code ?? "OK";
  const write = (root, name, text) => {
    const file = path.join(root, ...name.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const local = (root, ...parts) =>
    path.join(root, ".harness", "workflow", "local", ...parts);
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
  const json = (cwd, argv) => {
    const out = run(cwd, argv);
    return { ...JSON.parse(out.stdout), exit: out.exit };
  };
  const PLAN = ".harness/plans/todo-plan.md";
  const project = (name) => {
    const root = path.join(sandbox, name);
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
    return root;
  };

  // --- No scope: not paused, then pause:set --on and --off. ---
  const root = project("sequential");
  assert.equal(kit.status(root).paused, false);
  assert.equal(kit.autopilotStatus(root).paused, false);
  assert.match(
    run(root, ["status", "--format", "text"]).stdout,
    /^paused: false$/mu
  );
  const on = json(root, [
    "pause:set",
    "--on",
    "--note",
    "  User pressed Pause  ",
  ]);
  assert.equal(on.exit, 0);
  assert.equal(on.command, "pause:set");
  assert.deepEqual(on.result, {
    at: on.result.at,
    note: "User pressed Pause",
    paused: true,
  });
  assert.deepEqual(
    JSON.parse(readFileSync(local(root, "pause.json"), "utf8")),
    on.result
  );
  assert.equal(kit.status(root).paused, true);
  assert.equal(kit.autopilotStatus(root).paused, true);
  assert.equal(json(root, ["status"]).result.paused, true);
  assert.equal(json(root, ["autopilot:status"]).result.paused, true);
  assert.match(
    run(root, ["status", "--format", "text"]).stdout,
    /^paused: true$/mu
  );
  assert.deepEqual(git.changes(root).all, []);

  // --- USAGE: exactly one of --on/--off and a non-empty --note. ---
  for (const argv of [
    ["pause:set", "--note", "x"],
    ["pause:set", "--on", "--off", "--note", "x"],
    ["pause:set", "--on"],
    ["pause:set", "--off", "--note", "   "],
    ["pause:set", "--on=yes", "--note", "x"],
  ]) {
    const refused = json(root, argv);
    assert.equal(refused.exit, 1, argv.join(" "));
    assert.equal(refused.code, "USAGE", argv.join(" "));
  }
  assert.equal(
    code(() => kit.setPause(root, false, " ")),
    "USAGE"
  );
  assert.equal(kit.status(root).paused, true);

  // --- A folder without the Kit: NOT_INSTALLED, nothing written. ---
  const bare = path.join(sandbox, "bare");
  mkdirSync(bare);
  assert.equal(
    json(bare, ["pause:set", "--on", "--note", "x"]).code,
    "NOT_INSTALLED"
  );
  assert.equal(existsSync(local(bare, "pause.json")), false);

  // --- Sequential scope: task:start refuses while paused. ---
  kit.createScope(root, {
    acceptance: ["The note exists"],
    approval: "User approved the docs-only scope",
    id: "docs-1",
    objective: "Write one note",
    tasks: [
      {
        acceptance: ["note written"],
        commitMessage: "docs: write the note",
        files: ["docs/note.md"],
        id: "N",
        title: "Note",
      },
    ],
  });
  const paused = json(root, ["task:start", "N"]);
  assert.equal(paused.exit, 1);
  assert.equal(paused.code, "WORKFLOW_PAUSED");
  assert.match(paused.message, /paused by the user .*User pressed Pause/u);
  assert.match(paused.nextAction, /Continue in Harness/u);
  assert.match(paused.nextAction, /pause:set --off --note/u);
  assert.deepEqual(paused.details, {
    at: on.result.at,
    note: "User pressed Pause",
  });
  assert.equal(plans.read(root).currentTaskId, null);
  // Reads are not affected.
  assert.equal(kit.validate(root).ok, true);
  assert.equal(json(root, ["recover"]).exit, 0);

  // --- An unreadable file: PAUSE_STATE, and pause:set rewrites it. ---
  write(root, ".harness/workflow/local/pause.json", "{broken");
  assert.equal(json(root, ["status"]).code, "PAUSE_STATE");
  assert.equal(
    code(() => kit.startTask(root, "N")),
    "PAUSE_STATE"
  );
  const unreadable = failure(() => kit.autopilotStatus(root));
  assert.equal(unreadable.code, "PAUSE_STATE");
  assert.match(unreadable.nextAction, /pause:set --on\|--off/u);
  write(root, ".harness/workflow/local/pause.json", '{"paused":"yes"}\n');
  assert.equal(
    code(() => kit.status(root)),
    "PAUSE_STATE"
  );
  const offText = run(root, [
    "pause:set",
    "--off",
    "--note",
    "User pressed Continue",
    "--format",
    "text",
  ]);
  assert.equal(offText.exit, 0);
  assert.match(
    offText.stdout,
    /^pause: off \(.+\) — User pressed Continue\n$/u
  );
  assert.equal(
    JSON.parse(readFileSync(local(root, "pause.json"), "utf8")).paused,
    false
  );
  assert.equal(kit.status(root).paused, false);
  assert.equal(kit.startTask(root, "N").task.status, "IN_PROGRESS");
  const onText = run(root, [
    "pause:set",
    "--on",
    "--note",
    "Pause again",
    "--format",
    "text",
  ]);
  assert.match(
    onText.stdout,
    /^pause: on \(.+\) — Pause again\ntask:start in main/u
  );
  // A started task still commits while paused.
  write(root, "docs/note.md", "# Note\n");
  kit.commitTask(root, "N");
  assert.equal(
    plans.read(root).tasks.find((task) => task.id === "N").status,
    "DONE"
  );

  // --- Orchestrated scope: assignment:create refuses, executors go on. ---
  const main = project("orchestrated");
  write(main, "docs/spec.md", "# Spec\n\nTwo modules.\n");
  kit.proposeScope(
    main,
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
  kit.chooseScope(main, {
    generation: 1,
    note: "User clicked orchestrated",
    option: "orchestrated",
    session: "session-1",
  });
  kit.startTask(main, "QUALITY");
  kit.qualityApply(main, {
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
  const base = git.head(main);
  const idA = kit.createAssignment(main, "A").assignment.id;
  kit.setPause(main, true, "User pressed Pause");
  const create = json(main, ["assignment:create", "--task", "B"]);
  assert.equal(create.code, "WORKFLOW_PAUSED");
  assert.equal(
    kit.nextAssignments(main).ready.some((task) => task.id === "B"),
    true
  );
  const wtA = path.join(sandbox, "wt-a");
  git.git.run(main, ["worktree", "add", "-q", "--detach", wtA, base]);
  assert.equal(kit.attachAssignment(wtA, idA).assignment.status, "READY");
  // Even a paused state file in the worktree does not stop the executor.
  write(
    wtA,
    ".harness/workflow/local/pause.json",
    `${JSON.stringify({ at: "2026-11-04T12:00:00Z", note: "x", paused: true })}\n`
  );
  const started = json(wtA, ["task:start", "A"]);
  assert.equal(started.exit, 0, JSON.stringify(started));
  assert.equal(started.result.task.status, "IN_PROGRESS");
  const readOnly = json(wtA, ["pause:set", "--off", "--note", "x"]);
  assert.equal(readOnly.code, "ASSIGNMENT_READ_ONLY");
  assert.equal(kit.status(main).paused, true);
  kit.setPause(main, false, "User pressed Continue");
  assert.equal(kit.createAssignment(main, "B").created, true);

  console.log("workflow-kit pause tests passed");
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
