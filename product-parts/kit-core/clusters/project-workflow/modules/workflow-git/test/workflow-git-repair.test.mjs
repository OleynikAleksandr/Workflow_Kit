import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
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
  ["workflow-platform", "workflow-plan", "workflow-git"],
  "workflow-git-repair"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-git-repair-"));
const PLAN = ".harness/plans/todo-plan.md";
const file = (name) => path.join(root, ...name.split("/"));
const write = (name, text) => {
  mkdirSync(path.dirname(file(name)), { recursive: true });
  writeFileSync(file(name), text);
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
  const git = new WorkflowGitFacade(undefined, cleanGitEnvironment());
  const plans = new WorkflowPlanFacade();
  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(".gitignore", ".harness/workflow/local/\n");
  let plan = plans.createEmpty("p", "Repair");
  git.transactions.commit(root, {
    files: [".gitignore"],
    message: "chore: bootstrap",
    planPath: PLAN,
    planText: plans.render(plan),
    role: "bootstrap",
    scopeId: null,
    taskId: null,
  });
  const task = (id, files, extra = {}) => ({
    acceptance: ["ok"],
    commitMessage: `feat: ${id}`,
    files,
    id,
    title: id,
    ...extra,
  });
  plan = plans.createScope(
    plan,
    {
      acceptance: ["ok"],
      approval: "User approved the scope",
      id: "demo",
      objective: "x",
      spec: "docs/spec.md",
      tasks: [
        task("A", ["src/a.ts"]),
        task("B", ["src/b.ts"], { dependencies: ["A"] }),
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
  const commitTask = (id, files) => {
    plan = plans.completeTask(plans.startTask(plan, id), id);
    return git.transactions.commit(root, {
      files,
      iteration: 1,
      message: `feat: ${id}`,
      planPath: PLAN,
      planText: plans.render(plan),
      role: "implementation",
      scopeId: "demo",
      taskId: id,
    });
  };
  write("src/a.ts", "a");
  const a = commitTask("A", ["src/a.ts"]);
  let refs = git.resolveReferences(root, plan, PLAN);
  assert.deepEqual(refs.get("A"), {
    paths: [PLAN, "src/a.ts"],
    sha: a.sha,
    status: "committed",
  });
  assert.deepEqual(refs.get("B"), { status: "open" });

  // A commit touching a file outside its task is detected.
  write("src/b.ts", "b");
  write("src/extra.ts", "x");
  commitTask("B", ["src/b.ts", "src/extra.ts"]);
  assert.throws(
    () => git.resolveReferences(root, plan, PLAN),
    (e) => e.code === "COMMIT_SCOPE_MISMATCH"
  );
  plan.tasks.find((t) => t.id === "B").files.push("src/extra.ts");
  refs = git.resolveReferences(root, plan, PLAN);
  assert.equal(refs.get("B").status, "committed");
  const fake = structuredClone(plan);
  fake.tasks.find((t) => t.id === "DOCS-R1").status = "DONE";
  assert.throws(
    () => git.resolveReferences(root, fake, PLAN),
    (e) => e.code === "PLAN_COMMIT_MISMATCH"
  );

  // Projection repair rebuilds the readable part.
  writeFileSync(file(PLAN), plans.render(plan));
  const tampered = readFileSync(file(PLAN), "utf8").replace(
    "## Objective\n\nx",
    "## Objective\n\nedited by hand"
  );
  writeFileSync(file(PLAN), tampered);
  let planned = git.planRepair(root, PLAN);
  assert.equal(planned.kind, "projection");
  assert.throws(
    () => git.applyRepair(root, PLAN, "wrong"),
    (e) => e.code === "REPAIR_CHANGED"
  );
  git.applyRepair(root, PLAN, planned.repairId);
  assert.equal(readFileSync(file(PLAN), "utf8"), plans.render(plan));
  assert.equal(git.planRepair(root, PLAN).kind, "none");

  // A transaction interrupted after preparation is retried.
  const hooks = git.gitPath(root, "hooks");
  mkdirSync(hooks, { recursive: true });
  const snapshot = path.join(root, "journal-copy.json");
  writeFileSync(
    path.join(hooks, "pre-commit"),
    `#!/bin/sh\ncp "${git.localPath(root, "transaction.json")}" "${snapshot}"\nexit 1\n`
  );
  chmodSync(path.join(hooks, "pre-commit"), 0o755);
  write("docs/readme.md", "# doc");
  const docsPlan = plans.render(plan);
  assert.throws(
    () =>
      git.transactions.commit(root, {
        files: ["docs/readme.md"],
        message: "docs: readme",
        planPath: PLAN,
        planText: docsPlan,
        role: "docs",
        scopeId: "demo",
        taskId: null,
      }),
    (e) => e.code === "COMMIT_FAILED"
  );
  rmSync(path.join(hooks, "pre-commit"));
  // Simulates a crash after the hook recorded its evidence.
  const interrupt = () => {
    git.git.run(root, ["add", "docs/readme.md"]);
    writeFileSync(file(PLAN), docsPlan);
    git.git.run(root, ["add", PLAN]);
    copyFileSync(snapshot, git.localPath(root, "transaction.json"));
    const { id } = JSON.parse(readFileSync(snapshot, "utf8"));
    const pending = git.localPath(root, "verification", `pending-${id}.json`);
    writeFileSync(pending, "{}\n");
    return pending;
  };
  const verification = git.localPath(root, "verification");
  const pendingLeft = () =>
    readdirSync(verification).filter((name) => name.startsWith("pending-"));

  // Cancelling the preparation removes the pending evidence.
  const original = readFileSync(file(PLAN), "utf8");
  interrupt();
  const cancelled = git.cancelRepair(
    root,
    PLAN,
    git.planRepair(root, PLAN).repairId
  );
  assert.equal(cancelled.kind, "cancel");
  assert.deepEqual(pendingLeft(), []);
  assert.equal(readFileSync(file(PLAN), "utf8"), original);

  // Retrying the preparation leaves no pending evidence either.
  interrupt();
  rmSync(snapshot);
  planned = git.planRepair(root, PLAN);
  assert.equal(planned.kind, "retry-commit");
  const outcome = git.applyRepair(root, PLAN, planned.repairId);
  assert.equal(outcome.commit.role, "docs");
  assert.deepEqual(pendingLeft(), []);
  assert.equal(git.history(root, null).at(-1).subject, "docs: readme");
  assert.equal(git.transactions.journal(root), null);
  assert.throws(
    () => git.cancelRepair(root, PLAN, git.planRepair(root, PLAN).repairId),
    (e) => e.code === "NO_PREPARATION"
  );
  // A preparation whose index changed afterwards (a PREPARING or PREPARED
  // journal): retry refuses and points to cancel; cancel restores the index
  // and the plan, keeps working-tree files and removes the journal.
  const journalFile = git.localPath(root, "transaction.json");
  const indexBackup = git.localPath(root, "index-before");
  const before = readFileSync(file(PLAN), "utf8");
  const candidate = `${before}\n<!-- candidate -->\n`;
  const prepare = (name) => {
    writeFileSync(
      path.join(hooks, "pre-commit"),
      `#!/bin/sh\ncp "${journalFile}" "${snapshot}"\nexit 1\n`
    );
    chmodSync(path.join(hooks, "pre-commit"), 0o755);
    write(name, `# ${name}\n`);
    assert.throws(
      () =>
        git.transactions.commit(root, {
          files: [name],
          message: `docs: ${name}`,
          planPath: PLAN,
          planText: candidate,
          role: "docs",
          scopeId: "demo",
          taskId: null,
        }),
      (e) => e.code === "COMMIT_FAILED"
    );
    rmSync(path.join(hooks, "pre-commit"));
    // The crash: the index backup, the staged candidate and the journal.
    copyFileSync(git.gitPath(root, "index"), indexBackup);
    git.git.run(root, ["add", name]);
    writeFileSync(file(PLAN), candidate);
    git.git.run(root, ["add", PLAN]);
    const journal = JSON.parse(readFileSync(snapshot, "utf8"));
    writeFileSync(
      journalFile,
      `${JSON.stringify({ ...journal, phase: "PREPARING" }, null, 2)}\n`
    );
    return journal.id;
  };
  const staged = () => git.git.text(root, ["diff", "--cached", "--name-only"]);
  const id = prepare("docs/guide.md");
  write("docs/extra.md", "# extra\n");
  git.git.run(root, ["add", "docs/extra.md"]);
  planned = git.planRepair(root, PLAN);
  assert.equal(planned.kind, "retry-commit");
  assert.throws(
    () => git.applyRepair(root, PLAN, planned.repairId),
    (e) =>
      e.code === "REPAIR_MANUAL" &&
      e.nextAction.includes(`repair --cancel ${planned.repairId}`)
  );
  const restored = git.cancelRepair(root, PLAN, planned.repairId);
  assert.equal(restored.kind, "cancel");
  assert.equal(staged(), "");
  assert.equal(readFileSync(file(PLAN), "utf8"), before);
  assert.equal(
    readFileSync(file("docs/guide.md"), "utf8"),
    "# docs/guide.md\n"
  );
  assert.equal(readFileSync(file("docs/extra.md"), "utf8"), "# extra\n");
  assert.equal(git.transactions.journal(root), null);
  assert.ok(readdirSync(verification).includes(`failed-${id}.json`));
  assert.deepEqual(pendingLeft(), []);

  // HEAD moved after the preparation: REPAIR_MANUAL names both commits and
  // the soft reset; after it the cancel succeeds.
  rmSync(file("docs/extra.md"));
  prepare("docs/notes.md");
  const beforeHead = git.head(root);
  git.git.run(root, ["commit", "-q", "--allow-empty", "-m", "chore: other"]);
  let refusal = null;
  try {
    git.cancelRepair(root, PLAN, git.planRepair(root, PLAN).repairId);
  } catch (error) {
    refusal = error;
  }
  assert.equal(refusal?.code, "REPAIR_MANUAL");
  assert.deepEqual(refusal.details, {
    beforeHead,
    head: git.head(root),
  });
  assert.ok(refusal.nextAction.includes(`git reset --soft ${beforeHead}`));
  assert.notEqual(git.transactions.journal(root), null);
  git.git.run(root, ["reset", "-q", "--soft", beforeHead]);
  git.cancelRepair(root, PLAN, git.planRepair(root, PLAN).repairId);
  assert.equal(git.transactions.journal(root), null);
  assert.equal(staged(), "");
  assert.equal(readFileSync(file(PLAN), "utf8"), before);
  console.log("workflow-git references and repair tests passed");
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
