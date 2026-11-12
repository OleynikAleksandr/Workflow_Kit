import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cleanGitEnvironment,
  identityTemplate,
} from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-installer"],
  "workflow-installer-migrate"
);
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-migrate-"));
const fence = "```";
const legacyPlan = (status) => `# Demo Development TODO Plan

<!-- harness-plan-state:start -->
${fence}json
{
  "schema": "harness-ai-plan-v1",
  "executionScopeStatus": "${status}",
  "planId": "demo-plan-2026",
  "branch": "main",
  "lastRecordedCommit": "self",
  "currentTaskId": "demo.p2.t1",
  "expectedCommitMessage": "chore: move demo onto the workflow kit",
  "debt": null
}
${fence}
<!-- harness-plan-state:end -->

## Context Pack For This Cycle

- **Planning source:** \`docs/spec.md\`.
- **Missing doc:** \`docs/gone.md\`.

## Phase 1 - Foundation (owner: Claude, updated: 2026-11-03)

1. [DONE] \`demo.p1.t1\` Build the core (scope: \`src/core/**\`; expected commit: \`feat: build the core\`). Result: Completed in commit \`feat: build the core\`.
2. [DONE] Git Commit: \`feat: build the core\` (hash: self)
3. [DONE] \`demo.p1.t2\` Add the API (scope: \`src/api/**\`; expected commit: \`feat: add the api\`).
4. [DONE] Git Commit: \`feat: add the api\` (hash: self)

## Phase 2 - Move And Finish (owner: Claude, updated: 2026-11-03)

5. [IN_PROGRESS] \`demo.p2.t1\` Move the project onto the kit (scope: \`whole repository\`; expected commit: \`chore: move demo onto the workflow kit\`).
6. [TODO] Git Commit: \`chore: move demo onto the workflow kit\` (hash: TBD)
7. [TODO] \`demo.p2.t2\` Add the export feature with a long description that
   wraps onto a continuation line (scope: \`src/export/**\`; expected commit: \`feat: add export\`).
8. [TODO] Git Commit: \`feat: add export\` (hash: TBD)
9. [TODO] \`demo.p2.t3\` Apply the quality profile (kind: quality) (scope: \`.harness/workflow/config.json\`; expected commit: \`chore: apply demo quality profile\`).
10. [TODO] Git Commit: \`chore: apply demo quality profile\` (hash: TBD)
11. [TODO] \`demo.p2.t4\` Reconcile the documentation (kind: docs) (scope: \`docs/**\`; expected commit: \`docs: reconcile demo documentation\`).
12. [TODO] Git Commit: \`docs: reconcile demo documentation\` (hash: TBD)
13. [TODO] \`demo.p2.t5\` Package the app (kind: delivery) (scope: \`docs/evidence/**\`; expected commit: \`chore: package demo\`).
14. [TODO] Git Commit: \`chore: package demo\` (hash: TBD)

## Final Acceptance

15. [TODO] \`demo.p2.t6\` User verifies the release (completion: user-acceptance; scope: user workflow; expected commit: none).
`;
try {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowInstallerFacade } = await build.load(
    "workflow-installer",
    "workflow-installer-facade.js"
  );
  const { WorkflowKitFacade } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const identity = path.join(sandbox, "gitconfig");
  writeFileSync(
    identity,
    "[user]\n\tname = Workflow Test\n\temail = workflow@harness-ai.test\n"
  );
  const env = {
    ...cleanGitEnvironment(),
    GIT_CONFIG_GLOBAL: identity,
    GIT_TEMPLATE_DIR: identityTemplate(sandbox),
  };
  const git = new WorkflowGitFacade(undefined, env);
  const installer = new WorkflowInstallerFacade(git);
  const kit = new WorkflowKitFacade({ env, git });
  const bundle = `import { readFileSync } from "node:fs";
import { runCli } from ${JSON.stringify(path.join(build.directory, "workflow-kit", "src", "workflow-kit-cli.js"))};
process.exitCode = runCli(process.argv.slice(2), { cwd: process.cwd(), env: process.env, readStdin: () => { try { return readFileSync(0, "utf8"); } catch { return ""; } }, stderr: (t) => process.stderr.write(t), stdout: (t) => process.stdout.write(t) });
`;
  const runtime = { executable: process.execPath, mode: "node" };
  const legacyRepo = (name, status) => {
    const root = path.join(sandbox, name);
    mkdirSync(path.join(root, ".harness", "plans"), { recursive: true });
    mkdirSync(path.join(root, "docs"));
    writeFileSync(path.join(root, "docs", "spec.md"), "# Spec\n");
    writeFileSync(
      path.join(root, ".harness", "plans", "todo-plan.md"),
      legacyPlan(status)
    );
    git.init(root);
    git.git.run(root, ["add", "-A"]);
    git.git.run(root, ["commit", "-q", "-m", "legacy history"]);
    return root;
  };

  // Migration needs the Kit first.
  const root = legacyRepo("demo", "ACTIVE");
  assert.throws(
    () => installer.migrateHarnessPlan(root, { now: "2026-11-03T12:00:00Z" }),
    { code: "NOT_INSTALLED" }
  );
  assert.equal(
    installer.install(root, { bundle, name: "Demo", runtime })
      .migrationRequired,
    true
  );
  const baseline = git.head(root);
  const outcome = installer.migrateHarnessPlan(root, {
    message: "chore: move demo onto the workflow kit",
    now: "2026-11-03T12:00:00Z",
    objective: "Finish the demo",
    spec: "docs/spec.md",
  });
  assert.equal(outcome.scopeId, "demo-plan-2026");
  assert.equal(outcome.legacyDone, 3);
  assert.deepEqual(outcome.migrated, [
    "demo.p2.t2",
    "demo.p2.t3",
    "DOCS-R1",
    "demo.p2.t5",
  ]);
  assert.deepEqual(outcome.converted, [
    "demo.p2.t6 → the user's acceptance through `accept`",
    "demo.p2.t4 → DOCS-R1",
  ]);
  const commit = git.history(root, baseline).at(-1);
  assert.equal(commit.subject, "chore: move demo onto the workflow kit");
  assert.equal(commit.trailers["Workflow-Role"][0], "kit-update");

  // The new plan: a closed legacy round with its digest, then the remaining work.
  const status = kit.status(root);
  assert.deepEqual(status.rounds, [
    { id: "R0-legacy", kind: "legacy", status: "CLOSED" },
    { id: "R1", kind: "implementation", status: "OPEN" },
  ]);
  assert.equal(status.nextTask.id, "demo.p2.t2");
  assert.deepEqual(kit.validate(root), { errors: [], ok: true });
  const plan = readPlanJson(root);
  const byId = Object.fromEntries(plan.tasks.map((item) => [item.id, item]));
  assert.equal(
    byId["demo.p2.t2"].title,
    "Add the export feature with a long description that wraps onto a continuation line"
  );
  assert.equal(byId["demo.p2.t2"].commitMessage, "feat: add export");
  assert.match(
    byId["demo.p2.t2"].why,
    /Phase 2 - Move And Finish.*legacy scope: `src\/export\/\*\*`/u
  );
  assert.equal(byId["demo.p2.t3"].kind, "quality");
  assert.deepEqual(
    [byId["DOCS-R1"].title, byId["DOCS-R1"].commitMessage],
    ["Reconcile the documentation", "docs: reconcile demo documentation"]
  );
  assert.deepEqual(byId["DOCS-R1"].dependencies, ["demo.p2.t2", "demo.p2.t3"]);
  assert.deepEqual(
    [byId["demo.p2.t5"].kind, byId["demo.p2.t5"].dependencies],
    ["delivery", ["DOCS-R1"]]
  );
  assert.equal(plan.scope.objective, "Finish the demo");
  assert.equal(plan.scope.spec, "docs/spec.md");
  assert.equal(plan.scope.baselineCommit, baseline);
  assert.deepEqual(plan.scope.context, [
    { path: "docs/spec.md", required: false },
  ]);
  assert.match(
    plan.rounds[0].digest.result,
    /^Legacy plan demo-plan-2026: 3 tasks were done .*\(demo\.p1\.t1 … demo\.p2\.t1\)/u
  );
  assert.deepEqual(plan.rounds[0].digest.references, [
    `git show ${baseline}:.harness/plans/todo-plan.md`,
  ]);
  assert.equal(plan.scope.decisions.length, 2);
  assert.match(
    git.show(root, baseline, ".harness/plans/todo-plan.md"),
    /harness-ai-plan-v1/u
  );

  // The migrated plan works with the Kit commands.
  kit.startTask(root, "demo.p2.t2");
  assert.equal(kit.status(root).currentTask.id, "demo.p2.t2");
  assert.throws(
    () => installer.migrateHarnessPlan(root, { now: "2026-11-03T12:00:00Z" }),
    { code: "NOT_LEGACY_PLAN" }
  );

  // A legacy plan without an active scope becomes an empty Kit plan.
  const idle = legacyRepo("idle", "NONE");
  installer.install(idle, { bundle, runtime });
  const idleOutcome = installer.migrateHarnessPlan(idle, {
    now: "2026-11-03T12:00:00Z",
  });
  assert.equal(idleOutcome.scopeId, null);
  assert.equal(kit.status(idle).scope, null);
  assert.equal(
    git.history(idle, null).at(-1).subject,
    "chore: migrate the plan into the workflow kit"
  );
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}

function readPlanJson(root) {
  const text = readFileSync(
    path.join(root, ".harness", "plans", "todo-plan.md"),
    "utf8"
  );
  const start = text.indexOf(
    "```json",
    text.indexOf("<!-- harness-workflow:begin -->")
  );
  return JSON.parse(text.slice(start + 7, text.indexOf("```", start + 7)));
}
