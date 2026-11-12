import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import {
  code,
  docsScope as docsPlan,
  failure,
  openKit,
  parallelScope as parallelPlan,
  write,
} from "./workflow-kit-support.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-execution-mode"],
  "workflow-kit-execution-mode"
);
const roots = [];
try {
  const { cli, git, kit, plans, project } = await openKit(build, {
    clock: "10:00",
    prefix: "workflow-mode-",
    roots,
  });
  const proposalFile = (root) =>
    path.join(root, ".harness", "workflow", "local", "scope-proposal.json");
  const reason = "Two independent modules with separate files";

  // --- A project without a host: scope:create works as before. ---
  const plain = project(null);
  assert.equal(kit.readProposal(plain), null);

  // Recommending orchestrated without parallel work fails; nothing is stored.
  assert.equal(
    code(() =>
      kit.proposeScope(plain, docsPlan("docs-1"), "orchestrated", reason)
    ),
    "NO_PARALLEL_WORK"
  );
  assert.equal(existsSync(proposalFile(plain)), false);
  // The plan is validated exactly like scope:create.
  assert.equal(
    code(() =>
      kit.proposeScope(
        plain,
        { ...docsPlan("docs-1"), approval: "short" },
        "sequential",
        reason
      )
    ),
    "SCOPE_APPROVAL"
  );
  assert.equal(
    code(() => kit.proposeScope(plain, docsPlan("docs-1"), "sequential", "x")),
    "PROPOSAL_REASON"
  );
  assert.equal(existsSync(proposalFile(plain)), false);

  // A proposal without parallel work offers sequential and refine.
  const headBefore = git.head(plain);
  const first = kit.proposeScope(
    plain,
    docsPlan("docs-1"),
    "sequential",
    "One small documentation task only"
  );
  assert.deepEqual(first, {
    autoChosen: false,
    generation: 1,
    hasParallelWork: false,
    options: ["sequential", "refine"],
    reason: "One small documentation task only",
    recommended: "sequential",
    scope: null,
  });
  assert.equal(git.head(plain), headBefore);
  assert.equal(kit.status(plain).scope, null);
  const stored = kit.readProposal(plain);
  // The card view: no plan input, scope id and objective from the input.
  assert.deepEqual(kit.proposalView(plain), {
    createdAt: stored.createdAt,
    generation: 1,
    hasParallelWork: false,
    host: null,
    objective: "Write one note",
    options: ["sequential", "refine"],
    reason: "One small documentation task only",
    recommended: "sequential",
    refining: false,
    scopeId: "docs-1",
  });
  assert.equal(stored.version, 1);
  assert.equal(stored.generation, 1);
  assert.equal(stored.refining, false);
  assert.equal(stored.choice, null);
  assert.deepEqual(stored.input, docsPlan("docs-1"));
  assert.match(stored.planDigest, /^[0-9a-f]{64}$/u);

  // Orchestrated is refused without parallel work; stale choices write nothing.
  const choose = (root, generation, option, session = "session-1") =>
    kit.chooseScope(root, {
      generation,
      note: `User clicked ${option}`,
      option,
      session,
    });
  assert.equal(
    code(() => choose(plain, 1, "orchestrated")),
    "NO_PARALLEL_WORK"
  );
  const snapshot = readFileSync(proposalFile(plain), "utf8");
  assert.equal(
    code(() => choose(plain, 2, "sequential")),
    "PROPOSAL_CHANGED"
  );
  assert.equal(readFileSync(proposalFile(plain), "utf8"), snapshot);

  // Refine drops the plan and keeps the cycle in refinement.
  const refined = choose(plain, 1, "refine");
  assert.deepEqual(refined, {
    execution: null,
    generation: 1,
    option: "refine",
    refining: true,
    scope: null,
  });
  const afterRefine = kit.readProposal(plain);
  assert.equal(afterRefine.input, null);
  assert.equal(afterRefine.planDigest, null);
  assert.equal(afterRefine.refining, true);
  assert.equal(afterRefine.choice.option, "refine");
  assert.equal(afterRefine.choice.session, "session-1");
  const refiningView = kit.proposalView(plain);
  assert.equal(refiningView.refining, true);
  assert.equal(refiningView.scopeId, null);
  assert.equal(refiningView.objective, null);
  assert.equal(
    code(() => choose(plain, 1, "sequential")),
    "PROPOSAL_CHANGED"
  );

  // Again without parallel work after refine: sequential at once.
  const auto = kit.proposeScope(
    plain,
    docsPlan("docs-1"),
    "sequential",
    "One small documentation task only"
  );
  assert.equal(auto.autoChosen, true);
  assert.equal(auto.generation, 2);
  assert.equal(auto.scope.scopeId, "docs-1");
  assert.equal(existsSync(proposalFile(plain)), false);
  let plan = plans.read(plain);
  assert.deepEqual(plans.execution(plan), {
    maxWorkers: 3,
    ownerSession: null,
    strategy: "sequential",
  });
  assert.match(plan.scope.approval.text, /chosen automatically: sequential/u);

  // A proposal is refused while a scope is open.
  assert.equal(
    code(() =>
      kit.proposeScope(plain, docsPlan("docs-2"), "sequential", reason)
    ),
    "SCOPE_EXISTS"
  );

  // Finish the scope; close clears a proposal record.
  kit.startTask(plain, "N");
  write(plain, "docs/note.md", "# Note\n");
  kit.commitTask(plain, "N");
  kit.startTask(plain, "DOCS-R1");
  write(plain, "README.md", "# Demo\n");
  kit.commitTask(plain, "DOCS-R1", {
    digest: {
      contracts: [],
      decisions: [],
      references: [],
      result: "The note exists.",
    },
  });
  kit.accept(plain, "The user accepted the note");
  writeFileSync(proposalFile(plain), JSON.stringify(afterRefine));
  assert.notEqual(kit.readProposal(plain), null);
  kit.close(plain, "docs-1", "User: close the docs scope");
  assert.equal(existsSync(proposalFile(plain)), false);

  // Parallel work: recommendation first, the other mode, then refine.
  write(plain, "docs/spec.md", "# Spec\n\nTwo modules.\n");
  const parallel = kit.proposeScope(
    plain,
    parallelPlan("par-1", { maxWorkers: 2 }),
    "orchestrated",
    reason
  );
  assert.equal(parallel.generation, 1);
  assert.equal(parallel.hasParallelWork, true);
  assert.deepEqual(parallel.options, ["orchestrated", "sequential", "refine"]);
  const again = kit.proposeScope(
    plain,
    parallelPlan("par-1", { maxWorkers: 2 }),
    "sequential",
    reason
  );
  assert.equal(again.generation, 2);
  assert.deepEqual(again.options, ["sequential", "orchestrated", "refine"]);
  assert.equal(
    code(() => choose(plain, 1, "orchestrated")),
    "PROPOSAL_CHANGED"
  );

  // A stored plan that no longer matches its digest is stale.
  const record = JSON.parse(readFileSync(proposalFile(plain), "utf8"));
  const tampered = structuredClone(record);
  tampered.input.objective = "Something else";
  writeFileSync(proposalFile(plain), JSON.stringify(tampered));
  assert.equal(
    code(() => choose(plain, 2, "orchestrated")),
    "PROPOSAL_CHANGED"
  );
  writeFileSync(proposalFile(plain), JSON.stringify(record));

  // Orchestrated: the scope gets the strategy, maxWorkers and owner session.
  const chosen = choose(plain, 2, "orchestrated", "session-42");
  assert.equal(chosen.option, "orchestrated");
  assert.equal(chosen.scope.scopeId, "par-1");
  assert.deepEqual(chosen.execution, {
    maxWorkers: 2,
    ownerSession: "session-42",
    strategy: "orchestrated",
  });
  plan = plans.read(plain);
  assert.equal(
    plan.scope.approval.text,
    "User approved the parallel scope | Execution mode chosen by the user: orchestrated: User clicked orchestrated"
  );
  assert.ok(
    git.commitPaths(plain, chosen.scope.commit.sha).includes("docs/spec.md")
  );
  assert.equal(existsSync(proposalFile(plain)), false);

  // --- A Harness project: scope:create requires the mode choice. ---
  const hosted = project("harness");
  const created = failure(() =>
    kit.createScope(hosted, docsPlan("docs-h"))
  );
  assert.equal(created.code, "EXECUTION_MODE_REQUIRED");
  assert.match(created.nextAction, /scope:propose/u);
  assert.equal(kit.status(hosted).scope, null);

  // The CLI proposes and the sequential choice creates the scope.
  const run = (argv) => cli(hosted, argv);
  write(hosted, "plan.json", JSON.stringify(docsPlan("docs-h")));
  assert.equal(
    JSON.parse(run(["scope:create", "--input", "plan.json"]).stdout).code,
    "EXECUTION_MODE_REQUIRED"
  );
  assert.equal(
    JSON.parse(
      run([
        "scope:propose",
        "--input",
        "plan.json",
        "--recommended",
        "parallel",
        "--reason",
        reason,
      ]).stdout
    ).code,
    "USAGE"
  );
  const proposedText = run([
    "scope:propose",
    "--input",
    "plan.json",
    "--recommended",
    "sequential",
    "--reason",
    "One small documentation task only",
    "--format",
    "text",
  ]);
  assert.equal(proposedText.exit, 0);
  const viewCli = JSON.parse(run(["scope:proposal"]).stdout);
  assert.equal(viewCli.ok, true);
  assert.equal(viewCli.result.host, "harness");
  assert.equal(viewCli.result.scopeId, "docs-h");
  assert.equal(viewCli.result.generation, 1);
  assert.equal("input" in viewCli.result, false);
  assert.match(
    run(["scope:proposal", "--format", "text"]).stdout,
    /^proposal: generation 1 \(open\), recommended sequential/u
  );
  assert.match(
    proposedText.stdout,
    /^proposal: generation 1, recommended sequential/u
  );
  assert.match(proposedText.stdout, /options: sequential, refine/u);
  assert.equal(
    JSON.parse(
      run([
        "scope:choose",
        "--generation",
        "0",
        "--option",
        "sequential",
        "--session",
        "s-1",
        "--note",
        "go",
      ]).stdout
    ).code,
    "USAGE"
  );
  const chosenCli = JSON.parse(
    run([
      "scope:choose",
      "--generation",
      "1",
      "--option",
      "sequential",
      "--session",
      "s-1",
      "--note",
      "Run it sequentially",
    ]).stdout
  );
  assert.equal(chosenCli.ok, true);
  assert.equal(chosenCli.result.scope.scopeId, "docs-h");
  assert.deepEqual(chosenCli.result.execution, {
    maxWorkers: 3,
    ownerSession: "s-1",
    strategy: "sequential",
  });
  assert.match(
    plans.read(hosted).scope.approval.text,
    /Execution mode chosen by the user: sequential: Run it sequentially$/u
  );
  assert.equal(kit.readProposal(hosted), null);
  assert.equal(JSON.parse(run(["scope:proposal"]).stdout).result, null);
  assert.equal(
    run(["scope:proposal", "--format", "text"]).stdout,
    "proposal: none\n"
  );
  assert.match(run(["help"]).stdout, /scope:choose --generation <N>/u);
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
