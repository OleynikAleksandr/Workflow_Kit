import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { openMergeProject } from "./workflow-integration-merge-support.mjs";

const build = await buildWorkflowModules(
  ["workflow-integration", "workflow-kit"],
  "workflow-integration-merge"
);
const sandbox = realpathSync(
  mkdtempSync(path.join(tmpdir(), "workflow-integration-merge-"))
);
try {
  const project = await openMergeProject(build, sandbox);
  const { code, execute, failure, git, kit, local, PLAN, parents } = project;
  const { plans, record, root, run, task, trailer, write } = project;

  // --- Two independent executors, both started from the same base. ---
  const a = execute("A", [["src/a.ts", "export const a = 'shared';\n"]]);
  const b = execute("B", [["src/mod/b.ts", "export const b = 'shared';\n"]], {
    branch: "exec-b",
  });

  // --- Happy path: A. ---
  const beforeA = git.head(root);
  const integratedA = kit.startIntegration(root, a.id, a.sha.slice(0, 12));
  assert.equal(integratedA.status, "INTEGRATED");
  const mergeA = integratedA.integrationCommit;
  assert.equal(git.head(root), mergeA);
  assert.deepEqual(parents(mergeA), [beforeA, a.sha]);
  assert.equal(
    git.git.text(root, ["log", "-1", "--format=%s|%an|%ae", mergeA]),
    "merge: Module A|Workflow Test|workflow@harness-ai.test"
  );
  for (const [key, value] of [
    ["Workflow-Scope", "par-1"],
    ["Workflow-Task", "A"],
    ["Workflow-Role", "integration"],
    ["Workflow-Iteration", "1"],
    ["Workflow-Assignment", a.id],
    ["Workflow-Source", a.sha],
    ["Workflow-Transaction", integratedA.operationId],
  ]) {
    assert.deepEqual(trailer(mergeA, key), [value], key);
  }
  assert.deepEqual(task("A").integration, {
    operationId: integratedA.operationId,
    sourceCommit: a.sha,
  });
  assert.equal(task("A").status, "DONE");
  assert.deepEqual(git.commitPaths(root, mergeA), []);
  assert.deepEqual(git.diffPaths(root, beforeA, mergeA), [PLAN, "src/a.ts"]);
  assert.equal(record(a.id).status, "INTEGRATED");
  assert.equal(record(a.id).integrationCommit, mergeA);
  assert.equal(record(a.id).cleanup.status, "DONE");
  assert.equal(existsSync(a.worktree), false);
  assert.equal(existsSync(local(root, "integration.json")), false);
  assert.equal(git.transactions.journal(root), null);
  assert.ok(existsSync(local(root, "verification", `${mergeA}.json`)));
  assert.equal(git.mergeHead(root), null);
  assert.deepEqual(git.changes(root).all, []);
  assert.deepEqual(kit.validate(root), { errors: [], ok: true });
  assert.ok(kit.recover(root).text.length > 0);
  assert.equal(kit.status(root).scope.id, "par-1");
  assert.equal(kit.integrationStatus(root).status, "IDLE");
  assert.match(
    run(root, ["integration:status", "--format", "text"]).stdout,
    /integration: IDLE/u
  );
  // A repeated integration of an integrated record is refused by the proof.
  assert.equal(
    code(() => kit.startIntegration(root, a.id, a.sha)),
    "INTEGRATION_NOT_READY"
  );

  // --- B: the merged checks fail, a fix in main, then continue. ---
  const beforeB = git.head(root);
  const checks = failure(() => kit.startIntegration(root, b.id, b.sha));
  assert.equal(checks.code, "INTEGRATION_CHECKS_FAILED");
  assert.match(checks.details.output, /lint/u);
  const failedB = JSON.parse(
    readFileSync(local(root, "integration.json"), "utf8")
  );
  assert.equal(failedB.phase, "CHECKS_FAILED");
  assert.equal(failedB.assignmentId, b.id);
  assert.equal(failedB.taskId, "B");
  assert.equal(failedB.source, b.sha);
  assert.equal(failedB.mainHead, beforeB);
  assert.ok(failedB.operationId && failedB.startedAt);
  assert.equal(git.head(root), beforeB);
  assert.equal(git.mergeHead(root), b.sha);
  assert.equal(git.transactions.journal(root), null);
  assert.equal(task("B").status, "TODO");
  assert.equal(record(b.id).status, "READY_FOR_INTEGRATION");
  const statusB = run(root, ["integration:status", "--format", "text"]);
  assert.match(
    statusB.stdout,
    new RegExp(`integration: ${b.id} CHECKS_FAILED`, "u")
  );
  assert.match(statusB.stdout, /next: scripts\/workflow integration:continue/u);
  write(root, "src/mod/b.ts", "export const b = 'own';\n");
  const continuedB = run(root, [
    "integration:continue",
    "--id",
    b.id,
    "--format",
    "text",
  ]);
  assert.equal(continuedB.exit, 0, continuedB.stderr);
  assert.match(
    continuedB.stdout,
    new RegExp(`integration: ${b.id} INTEGRATED`, "u")
  );
  assert.match(continuedB.stdout, /cleanup: DONE/u);
  const mergeB = git.head(root);
  assert.deepEqual(parents(mergeB), [beforeB, b.sha]);
  assert.equal(
    git.show(root, mergeB, "src/mod/b.ts"),
    "export const b = 'own';\n"
  );
  assert.equal(task("B").status, "DONE");
  assert.equal(task("B").integration.operationId, failedB.operationId);
  assert.equal(record(b.id).integrationCommit, mergeB);
  assert.equal(
    git.git.succeeds(root, [
      "show-ref",
      "--verify",
      "--quiet",
      "refs/heads/exec-b",
    ]),
    false
  );
  assert.deepEqual(kit.validate(root), { errors: [], ok: true });

  // --- C: a conflict with main, the busy refusals, scope abort, continue. ---
  const c = execute("C", [
    ["docs/guide.md", "# Guide\n\nThe executor line.\n"],
  ]);
  write(root, "docs/guide.md", "# Guide\n\nThe main line.\n");
  kit.commitDocs(root, ["docs/guide.md"], "docs: edit the guide in main");
  const beforeC = git.head(root);
  const conflict = kit.startIntegration(root, c.id, c.sha);
  assert.equal(conflict.status, "CONFLICT");
  assert.deepEqual(conflict.conflicts, ["docs/guide.md"]);
  assert.equal(git.mergeHead(root), c.sha);
  assert.equal(
    JSON.parse(readFileSync(local(root, "integration.json"), "utf8")).phase,
    "CONFLICT"
  );
  // The plan conflict is resolved by the Kit: main's plan, not the executor's.
  assert.equal(
    readFileSync(path.join(root, ...PLAN.split("/")), "utf8"),
    git.show(root, beforeC, PLAN)
  );
  const conflictText = run(root, ["integration:status", "--format", "text"]);
  assert.match(conflictText.stdout, /conflict: docs\/guide\.md/u);
  // Retrying start with the same assignment and source continues.
  assert.equal(kit.startIntegration(root, c.id, c.sha).status, "CONFLICT");
  // Busy refusals while the journal exists.
  for (const action of [
    () => kit.createAssignment(root, "D"),
    () => kit.startTask(root, "D"),
    () => kit.commitDocs(root, ["docs/spec.md"]),
    () => kit.block(root, "waiting for the user"),
    () => kit.accept(root, "looks fine"),
    () => kit.startIntegration(root, "other-id", c.sha),
    () => kit.continueIntegration(root, "other-id"),
  ]) {
    assert.equal(code(action), "INTEGRATION_ACTIVE");
  }
  const busy = run(root, ["task:start", "D"]);
  assert.equal(busy.exit, 1);
  assert.equal(JSON.parse(busy.stdout).code, "INTEGRATION_ACTIVE");
  assert.equal(kit.gitHook(root, "pre-push").code, "INTEGRATION_ACTIVE");
  assert.equal(
    run(root, ["integration:start", "--id", c.id]).exit,
    1,
    "--source is required"
  );
  // A direct commit of the merge is refused by the hook.
  write(root, "docs/guide.md", "# Guide\n\nThe resolved line.\n");
  git.git.run(root, ["add", "--", "docs/guide.md"]);
  const direct = git.git.run(root, ["commit", "-q", "-m", "merge by hand"], {
    allowFailure: true,
  });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /MANAGED_COMMIT_REQUIRED/u);
  assert.equal(git.head(root), beforeC);
  // A file outside the task aborts the merge; the source stays integrable.
  write(root, "stray.txt", "outside\n");
  const scope = failure(() => kit.continueIntegration(root, c.id));
  assert.equal(scope.code, "INTEGRATION_SCOPE");
  assert.deepEqual(scope.details.paths, ["stray.txt"]);
  assert.equal(git.mergeHead(root), null);
  assert.equal(git.head(root), beforeC);
  assert.equal(existsSync(local(root, "integration.json")), false);
  assert.equal(record(c.id).status, "READY_FOR_INTEGRATION");
  assert.ok(existsSync(c.worktree));
  assert.equal(
    code(() => kit.startIntegration(root, c.id, c.sha)),
    "INTEGRATION_DIRTY"
  );
  rmSync(path.join(root, "stray.txt"));
  assert.equal(kit.startIntegration(root, c.id, c.sha).status, "CONFLICT");
  write(root, "docs/guide.md", "# Guide\n\nThe resolved line.\n");
  git.git.run(root, ["add", "--", "docs/guide.md"]);
  const integratedC = kit.continueIntegration(root, c.id);
  assert.equal(integratedC.status, "INTEGRATED");
  assert.deepEqual(parents(integratedC.integrationCommit), [beforeC, c.sha]);
  assert.equal(
    git.show(root, "HEAD", "docs/guide.md"),
    "# Guide\n\nThe resolved line.\n"
  );

  // --- D: a crash right after the merge commit; continue completes it. ---
  const d = execute("D", [["src/d.ts", "export const d = 4;\n"]]);
  const beforeD = git.head(root);
  const original = git.git.run;
  git.git.run = (cwd, args, options) => {
    const output = original.call(git.git, cwd, args, options);
    if (args.includes("commit") && args.includes("-F")) {
      git.git.run = original;
      throw new Error("simulated crash after the merge commit");
    }
    return output;
  };
  const crash = failure(() => kit.startIntegration(root, d.id, d.sha));
  git.git.run = original;
  assert.match(crash.message, /simulated crash/u);
  const crashedHead = git.head(root);
  assert.deepEqual(parents(crashedHead), [beforeD, d.sha]);
  assert.equal(git.transactions.journal(root).role, "integration");
  assert.equal(
    JSON.parse(readFileSync(local(root, "integration.json"), "utf8")).phase,
    "CHECKING"
  );
  assert.equal(record(d.id).status, "READY_FOR_INTEGRATION");
  // Status and recovery still work while the journal is left behind.
  assert.ok(kit.status(root));
  assert.ok(kit.recover(root).text.length > 0);
  assert.equal(kit.integrationStatus(root).status, "CHECKING");
  const integratedD = kit.continueIntegration(root, d.id);
  assert.equal(integratedD.status, "INTEGRATED");
  assert.equal(integratedD.integrationCommit, crashedHead);
  assert.equal(git.head(root), crashedHead);
  assert.equal(git.transactions.journal(root), null);
  assert.ok(existsSync(local(root, "verification", `${crashedHead}.json`)));
  assert.equal(record(d.id).status, "INTEGRATED");
  assert.equal(task("D").status, "DONE");

  // --- DOCS-R1 through an executor: the digest comes from its source plan. ---
  const digest = {
    contracts: ["Integration commits"],
    decisions: ["Orchestrated"],
    references: ["docs/spec.md"],
    result: "Four modules integrated",
  };
  const docs = execute(
    "DOCS-R1",
    [["docs/spec.md", "# Spec\n\nFour modules, integrated.\n"]],
    { digest }
  );
  const integratedDocs = kit.startIntegration(root, docs.id, docs.sha);
  assert.equal(integratedDocs.status, "INTEGRATED");
  const finalPlan = plans.read(root);
  assert.ok(finalPlan.tasks.every((item) => item.status === "DONE"));
  assert.deepEqual(finalPlan.rounds[0].digest, digest);
  assert.equal(finalPlan.rounds[0].status, "CLOSED");
  assert.equal(finalPlan.scope.delivery, "READY_FOR_ACCEPTANCE");

  // --- The whole history: one first-parent commit per integration. ---
  assert.deepEqual(kit.validate(root), { errors: [], ok: true });
  const references = git.resolveReferences(root, finalPlan, PLAN);
  for (const [id, sha] of [
    ["A", mergeA],
    ["B", mergeB],
    ["C", integratedC.integrationCommit],
    ["D", crashedHead],
    ["DOCS-R1", integratedDocs.integrationCommit],
  ]) {
    assert.equal(references.get(id).sha, sha, id);
  }
  const merges = git.git
    .text(root, ["rev-list", "--first-parent", "--merges", "HEAD"])
    .split("\n")
    .filter(Boolean);
  assert.equal(merges.length, 5);
  assert.ok(kit.recover(root).text.length > 0);

  console.log("workflow-integration merge tests passed");
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
