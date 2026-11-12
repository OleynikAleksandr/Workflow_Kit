import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { installAndPlan } from "./orchestration-scenario-planning.mjs";
import { openScenario } from "./orchestration-scenario-support.mjs";

// One orchestrated scope end to end, driven through the Kit command line the
// way an orchestrator and its executor subagents would: an installed project
// (real hooks and launcher), Claude-style worktrees under .claude/worktrees,
// parallel executors, the barrier in both directions, failed merged checks,
// a crash after the merge commit, a pending cleanup, DOCS and delivery.
const build = await buildWorkflowModules(
  ["workflow-integration", "workflow-kit"],
  "orchestration-scenario"
);
const sandbox = realpathSync(
  mkdtempSync(path.join(tmpdir(), "orchestration-scenario-"))
);
try {
  const scenario = await openScenario(build, sandbox);
  const { git, plans, root, ok, refused, text, recover, write, input } =
    scenario;
  const { record, task, parents, merges, worktrees, branches } = scenario;
  const { claudeWorktree, local } = scenario;
  const PLAN = ".harness/plans/todo-plan.md";
  const blocked = (next) =>
    next.blocked.map((item) => [item.taskId, item.code, item.blockedBy]);
  const ready = (next) => next.ready.map((item) => item.id);

  // --- 1. Install, the orchestrated scope and QUALITY (planning step). ---
  installAndPlan(scenario, sandbox);

  // --- 2. The scheduler: A and B now; C and D behind the barrier. ---
  let next = ok(root, "assignment:next");
  assert.deepEqual(ready(next), ["A", "B"]);
  assert.deepEqual(blocked(next), [
    // A sequential task waits for every earlier task ...
    ["C", "ASSIGNMENT_BARRIER", ["A", "B"]],
    // ... and a parallel task never overtakes an unfinished sequential one.
    ["D", "ASSIGNMENT_BARRIER", ["C"]],
    ["DOCS-R1", "DEPENDENCY_PENDING", ["A", "B", "C", "D"]],
  ]);
  assert.match(
    text(root, "assignment:next"),
    /next: scripts\/workflow assignment:create --task A/u
  );
  assert.equal(
    refused(root, "assignment:create --task C").code,
    "ASSIGNMENT_BARRIER"
  );
  const early = refused(root, "task:start SHIP --confirmed", "Ship it");
  assert.equal(early.code, "DELIVERY_NOT_READY");
  assert.deepEqual(early.details.pending, ["A", "B", "C", "D", "DOCS-R1"]);
  assert.match(recover(root), /Hand out A, B/u);

  // --- 3. Two executors in parallel, steps interleaved. ---
  const createdA = ok(root, "assignment:create --task A");
  const idA = createdA.assignment.id;
  const idB = ok(root, "assignment:create --task B").assignment.id;
  assert.equal(idA, "orc-1-A-1");
  assert.match(createdA.brief, /assignment:attach orc-1-A-1/u);
  const wtA = claudeWorktree("agent-a");
  const wtB = claudeWorktree("agent-b", "worktree-agent-b");
  assert.match(recover(wtA), /role: executor \(not attached\)/u);
  assert.match(recover(wtA), /assignment:attach <id>/u);
  ok(wtA, `assignment:attach ${idA}`);
  const attachedB = text(wtB, `assignment:attach ${idB}`);
  assert.match(attachedB, /\(worktree-agent-b\)/u);
  assert.match(attachedB, /next: scripts\/workflow task:start B/u);
  assert.equal(record(idA).branch, null);
  assert.equal(record(idA).worktree, wtA);
  assert.match(
    recover(wtA),
    /role: executor \(assignment orc-1-A-1, task A, READY\)/u
  );
  assert.equal(
    refused(wtA, "assignment:next").code,
    "ASSIGNMENT_READ_ONLY",
    "an executor never schedules"
  );
  ok(wtB, "task:start B");
  ok(wtA, "task:start A");
  assert.match(
    recover(root),
    /Waiting for executors: orc-1-A-1 \(A, RUNNING\), orc-1-B-1 \(B, RUNNING\)/u
  );
  write(wtA, "src/a.ts", "export const value = 'a';\n");
  write(wtB, "src/b.ts", "export const value = 'b';\n");
  // The executor scope rule: a file outside the task is refused.
  write(wtB, "src/stray.ts", "export const stray = 1;\n");
  assert.equal(
    refused(wtB, "commit --task B --files src/b.ts,src/stray.ts").code,
    "ASSIGNMENT_SCOPE"
  );
  rmSync(path.join(wtB, "src", "stray.ts"));
  // The installed hooks guard the Claude worktree too: no direct commit.
  git.git.run(wtA, ["add", "--", "src/a.ts"]);
  const direct = git.git.run(wtA, ["commit", "-q", "-m", "by hand"], {
    allowFailure: true,
  });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /MANAGED_COMMIT_REQUIRED/u);
  git.git.run(wtA, ["reset", "-q"]);
  const shaB = ok(wtB, "commit --task B").commit.sha;
  const shaA = ok(wtA, "commit --task A").commit.sha;
  assert.match(recover(wtA), /Task A is committed/u);
  assert.match(text(wtB, "assignment:status"), new RegExp(`source: ${shaB}`));
  for (const id of [idA, idB]) {
    assert.equal(record(id).status, "READY_FOR_INTEGRATION");
  }
  const integrateFirst = recover(root);
  assert.match(integrateFirst, /Integrate first, one at a time:/u);
  assert.ok(
    integrateFirst.includes(
      `integration:start --id ${idA} --source ${shaA.slice(0, 8)}`
    )
  );
  // Main is untouched by both executors.
  assert.deepEqual(git.changes(root).all, []);
  assert.equal(task("A").status, "TODO");

  // --- 4. A integrates; B fails the merged checks, is fixed and continues. ---
  const beforeA = git.head(root);
  const integratedA = text(
    root,
    `integration:start --id ${idA} --source ${shaA.slice(0, 10)}`
  );
  assert.match(integratedA, /integration: orc-1-A-1 INTEGRATED/u);
  assert.match(integratedA, /cleanup: DONE/u);
  const mergeA = git.head(root);
  assert.deepEqual(parents(mergeA), [beforeA, shaA]);
  assert.equal(task("A").status, "DONE");
  assert.equal(existsSync(wtA), false);
  assert.ok(!worktrees().includes(wtA));

  const beforeB = git.head(root);
  const failed = refused(
    root,
    `integration:start --id ${idB} --source ${shaB}`
  );
  assert.equal(failed.code, "INTEGRATION_CHECKS_FAILED");
  assert.match(failed.details.output, /both export value/u);
  assert.equal(git.head(root), beforeB);
  assert.equal(git.mergeHead(root), shaB);
  assert.equal(task("B").status, "TODO");
  assert.match(
    text(root, "integration:status"),
    /integration: orc-1-B-1 CHECKS_FAILED/u
  );
  const checksFailed = recover(root);
  assert.match(checksFailed, /integration: orc-1-B-1 CHECKS_FAILED/u);
  assert.match(
    checksFailed,
    /Integration of orc-1-B-1 failed its checks: fix the cause within the task files/u
  );
  // Other Kit writes wait for the integration.
  assert.equal(
    refused(root, "assignment:create --task C").code,
    "INTEGRATION_ACTIVE"
  );
  write(root, "src/b.ts", "export const b = 'b';\n");
  const continuedB = text(root, `integration:continue --id ${idB}`);
  assert.match(continuedB, /integration: orc-1-B-1 INTEGRATED/u);
  const mergeB = git.head(root);
  assert.deepEqual(parents(mergeB), [beforeB, shaB]);
  assert.equal(git.show(root, mergeB, "src/b.ts"), "export const b = 'b';\n");
  assert.equal(task("B").status, "DONE");
  assert.equal(existsSync(wtB), false);
  assert.ok(!branches().includes("worktree-agent-b"));

  // --- 6 (first half). C becomes ready only after A and B are integrated. ---
  assert.deepEqual(ready(ok(root, "assignment:next")), ["C"]);
  const idC = ok(root, "assignment:create --task C").assignment.id;
  next = ok(root, "assignment:next");
  assert.deepEqual(next.ready, []);
  // A taken sequential task keeps every parallel task out.
  assert.deepEqual(blocked(next), [
    ["D", "ASSIGNMENT_BARRIER", ["C"]],
    ["DOCS-R1", "DEPENDENCY_PENDING", ["C", "D"]],
  ]);
  assert.equal(
    refused(root, "assignment:create --task D").code,
    "ASSIGNMENT_BARRIER"
  );
  const wtC = claudeWorktree("agent-c");
  ok(wtC, `assignment:attach ${idC}`);
  ok(wtC, "task:start C");
  write(wtC, "src/c.ts", "export const c = 'c';\n");
  const shaC = ok(wtC, "commit --task C").commit.sha;

  // --- 5. A crash right after C's merge commit; recovery finishes it. ---
  const beforeC = git.head(root);
  const mergesBefore = merges().length;
  const original = git.git.run;
  git.git.run = (cwd, args, options) => {
    const output = original.call(git.git, cwd, args, options);
    if (args.includes("commit") && args.includes("-F")) {
      git.git.run = original;
      throw new Error("simulated crash after the merge commit");
    }
    return output;
  };
  const crash = scenario.cli(
    root,
    `integration:start --id ${idC} --source ${shaC}`.split(" ")
  );
  git.git.run = original;
  assert.equal(crash.exit, 1);
  assert.match(crash.stdout, /simulated crash/u);
  const crashed = git.head(root);
  assert.deepEqual(parents(crashed), [beforeC, shaC]);
  assert.equal(merges().length, mergesBefore + 1);
  assert.equal(record(idC).status, "READY_FOR_INTEGRATION");
  assert.match(
    text(root, "integration:status"),
    /integration: orc-1-C-1 CHECKING/u
  );
  assert.ok(ok(root, "status"));
  // The orchestrator follows recovery: the unfinished commit first ...
  const crashedRecovery = recover(root);
  assert.match(crashedRecovery, /integration: orc-1-C-1 CHECKING/u);
  assert.match(crashedRecovery, /transaction: .* \(integration C\)/u);
  assert.match(crashedRecovery, /run `scripts\/workflow repair`/u);
  const repairPlan = ok(root, "repair");
  assert.equal(repairPlan.kind, "finish-commit");
  ok(root, `repair --apply ${repairPlan.repairId}`);
  assert.equal(git.transactions.journal(root), null);
  // ... then the integration journal alone names its own step.
  assert.ok(
    recover(root).includes(
      "Integration of orc-1-C-1 is CHECKING: finish it with `scripts/workflow integration:continue --id orc-1-C-1`"
    )
  );
  assert.equal(record(idC).status, "READY_FOR_INTEGRATION");
  const continuedC = ok(root, `integration:continue --id ${idC}`);
  assert.equal(continuedC.status, "INTEGRATED");
  assert.equal(continuedC.integrationCommit, crashed);
  assert.equal(git.head(root), crashed, "no second merge");
  assert.equal(merges().length, mergesBefore + 1);
  assert.equal(git.transactions.journal(root), null);
  assert.equal(existsSync(local("integration.json")), false);
  assert.equal(task("C").status, "DONE");
  assert.deepEqual(ok(root, "validate"), { errors: [], ok: true });

  // --- 6 (second half). D after C; a locked worktree leaves cleanup pending. ---
  assert.deepEqual(ready(ok(root, "assignment:next")), ["D"]);
  const idD = ok(root, "assignment:create --task D").assignment.id;
  const wtD = claudeWorktree("agent-d", "worktree-agent-d");
  ok(wtD, `assignment:attach ${idD}`);
  ok(wtD, "task:start D");
  write(wtD, "src/d.ts", "export const d = 'd';\n");
  const shaD = ok(wtD, "commit --task D").commit.sha;
  git.git.run(root, ["worktree", "lock", "--reason", "agent busy", wtD]);
  const integratedD = text(
    root,
    `integration:start --id ${idD} --source ${shaD}`
  );
  assert.match(integratedD, /integration: orc-1-D-1 INTEGRATED/u);
  assert.match(integratedD, /cleanup: PENDING — git worktree remove/u);
  assert.equal(task("D").status, "DONE");
  assert.equal(record(idD).cleanup.status, "PENDING");
  assert.ok(existsSync(wtD));
  assert.ok(
    recover(root).includes(
      "Finish cleanups: `scripts/workflow assignment:cleanup --id orc-1-D-1`"
    )
  );
  git.git.run(root, ["worktree", "unlock", wtD]);
  assert.equal(text(root, "assignment:cleanup"), "cleanup: orc-1-D-1 DONE\n");
  assert.equal(existsSync(wtD), false);
  assert.ok(!branches().includes("worktree-agent-d"));
  assert.equal(
    text(root, "assignment:cleanup"),
    "cleanup: nothing to clean up.\n"
  );

  // --- 7. DOCS by an executor; delivery in main only afterwards. ---
  next = ok(root, "assignment:next");
  assert.deepEqual(
    next.ready.map((item) => [item.id, item.kind]),
    [["DOCS-R1", "docs"]]
  );
  const idDocs = ok(root, "assignment:create --task DOCS-R1").assignment.id;
  const waiting = refused(root, "task:start SHIP --confirmed", "Ship it");
  assert.equal(waiting.code, "DELIVERY_NOT_READY");
  assert.deepEqual(waiting.details.pending, ["DOCS-R1"]);
  assert.deepEqual(waiting.details.active, [idDocs]);
  const wtDocs = claudeWorktree("agent-docs");
  ok(wtDocs, `assignment:attach ${idDocs}`);
  ok(wtDocs, "task:start DOCS-R1");
  write(wtDocs, "docs/spec.md", "# Spec\n\nFour modules, integrated.\n");
  const digest = {
    contracts: ["Integration commits have two parents"],
    decisions: ["Orchestrated execution"],
    references: ["docs/spec.md"],
    result: "Four modules integrated",
  };
  const digestFile = input("digest.json", digest);
  const shaDocs = ok(wtDocs, `commit --task DOCS-R1 --digest ${digestFile}`)
    .commit.sha;
  const integratedDocs = ok(
    root,
    `integration:start --id ${idDocs} --source ${shaDocs}`
  );
  assert.equal(integratedDocs.status, "INTEGRATED");
  let plan = plans.read(root);
  assert.equal(plan.rounds[0].status, "OPEN", "SHIP still pending");
  assert.deepEqual(plan.rounds[0].digest, digest);
  assert.equal(plan.scope.delivery, "IN_PROGRESS");
  assert.match(recover(root), /Next task SHIP is delivery: ask the user/u);
  ok(root, "task:start SHIP --confirmed", "User confirmed the release");
  ok(root, "commit --task SHIP");
  plan = plans.read(root);
  assert.ok(plan.tasks.every((item) => item.status === "DONE"));
  assert.equal(plan.rounds[0].status, "CLOSED");
  assert.equal(plan.scope.delivery, "READY_FOR_ACCEPTANCE");

  // --- The final state: history, mapping, no worktrees or branches left. ---
  assert.deepEqual(ok(root, "validate"), { errors: [], ok: true });
  const integrations = merges();
  assert.equal(integrations.length, 5);
  for (const sha of integrations) {
    assert.equal(parents(sha).length, 2, sha);
  }
  const references = git.resolveReferences(root, plan, PLAN);
  for (const [id, sha] of [
    ["A", mergeA],
    ["B", mergeB],
    ["C", crashed],
    ["D", record(idD).integrationCommit],
    ["DOCS-R1", integratedDocs.integrationCommit],
  ]) {
    assert.equal(references.get(id).sha, sha, id);
  }
  assert.deepEqual(worktrees(), [root]);
  assert.deepEqual(branches(), [
    git.git.text(root, ["branch", "--show-current"]),
  ]);
  for (const id of [idA, idB, idC, idD, idDocs]) {
    assert.equal(record(id).status, "INTEGRATED", id);
    assert.equal(record(id).cleanup.status, "DONE", id);
  }
  assert.deepEqual(git.changes(root).all, []);
  const final = recover(root);
  assert.match(final, /role: orchestrator/u);
  assert.match(final, /assignments: none/u);
  assert.match(final, /READY_FOR_ACCEPTANCE/u);

  console.log("orchestration scenario test passed");
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
