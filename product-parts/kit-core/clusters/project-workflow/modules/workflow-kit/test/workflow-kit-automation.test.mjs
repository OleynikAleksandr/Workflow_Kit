import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { code, docsScope, failure, openKit, write } from "./workflow-kit-support.mjs";

// M39 T001: the automation block, the proposal digest and the reviewed choice.
const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-execution-mode"],
  "workflow-kit-automation"
);
const roots = [];
const CI = `name: CI
on:
  push:
jobs:
  test:
    name: \${{ matrix.name }}
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        include:
          - name: macOS ARM64 # the Mac runner
            os: macos-latest
          - name: "Linux x64"
            os: ubuntu-latest
    steps:
      - name: Not a check
        run: npm test
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint
  docs:
    name: Docs build
    runs-on: ubuntu-latest
    steps:
      - run: npm run docs
`;
try {
  const { cli, git, kit, plans, project } = await openKit(build, {
    clock: "11:00",
    prefix: "workflow-automation-",
    roots,
  });
  const proposalFile = (root) =>
    path.join(root, ".harness", "workflow", "local", "scope-proposal.json");
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  const reason = "One work task and one delivery";
  const scope = (fields = {}) => ({
    acceptance: ["The feature works", "The user sees the release"],
    approval: "User approved the automated scope",
    automation: {
      acceptance: [
        { checks: [], criterion: 1, evidence: [], kind: "manual" },
        {
          checks: ["unit"],
          criterion: 0,
          evidence: ["docs/evidence/feature.md"],
          kind: "automatic",
        },
      ],
      ci: {
        branch: "ci/auto",
        exactSha: true,
        remote: "origin",
        requiredChecks: ["macOS ARM64", "Linux x64"],
      },
      delivery: [{ effects: ["npm run package"], taskId: "D" }],
      publication: { branch: "main", upstream: "origin/main" },
    },
    context: [{ path: "docs/context.md", required: true }],
    id: "auto-1",
    objective: "Ship the feature automatically",
    spec: "docs/spec.md",
    tasks: [
      {
        acceptance: ["feature works"],
        commitMessage: "feat: add the feature",
        context: [{ path: "docs/module.md", required: false }],
        files: ["src/feature.ts"],
        id: "F",
        title: "Feature",
      },
      {
        acceptance: ["packaged"],
        commitMessage: "chore: package",
        dependencies: ["F"],
        id: "D",
        kind: "delivery",
        title: "Package",
      },
    ],
    ...fields,
  });

  const root = project(null);
  // No proposal: NO_PROPOSAL from the facade and the command line.
  assert.equal(code(() => kit.proposalDigest(root)), "NO_PROPOSAL");
  assert.equal(
    JSON.parse(cli(root, ["scope:proposal", "--digest"]).stdout).code,
    "NO_PROPOSAL"
  );

  // CI checks come from the project CI configuration.
  write(root, "docs/spec.md", "# Spec\n");
  write(root, "docs/context.md", "# Context\n");
  write(root, "docs/module.md", "# Module\n");
  assert.equal(
    code(() => kit.proposeScope(root, scope(), "sequential", reason)),
    "CI_CHECK_UNKNOWN"
  );
  write(root, ".github/workflows/ci.yml", CI);
  const unknownJob = scope();
  unknownJob.automation.ci.requiredChecks = ["Windows x64", "Not a check"];
  const ciRefusal = failure(() =>
    kit.proposeScope(root, unknownJob, "sequential", reason)
  );
  assert.equal(ciRefusal.code, "CI_CHECK_UNKNOWN");
  assert.deepEqual(ciRefusal.details.unknown, ["Windows x64", "Not a check"]);
  assert.deepEqual(ciRefusal.details.known, [
    "test",
    "macOS ARM64",
    "Linux x64",
    "lint",
    "docs",
    "Docs build",
  ]);
  // Acceptance checks are quality check ids; structure errors are PLAN_AUTOMATION.
  const badCheck = scope();
  badCheck.automation.acceptance[1].checks = ["unit tests"];
  const checkRefusal = failure(() =>
    kit.proposeScope(root, badCheck, "sequential", reason)
  );
  assert.equal(checkRefusal.code, "CHECK_UNKNOWN");
  assert.equal(checkRefusal.details.field, "automation.acceptance[1].checks");
  const foreign = scope();
  foreign.automation.delivery[0].taskId = "F";
  assert.equal(
    code(() => kit.proposeScope(root, foreign, "sequential", reason)),
    "PLAN_AUTOMATION"
  );
  assert.equal(existsSync(proposalFile(root)), false);

  // The digest covers the body and the documents; times and generations do not.
  const first = kit.proposeScope(root, scope(), "sequential", reason);
  assert.equal(first.generation, 1);
  const digest1 = kit.proposalDigest(root);
  assert.equal(digest1.generation, 1);
  assert.equal(digest1.scopeId, "auto-1");
  assert.match(digest1.proposalDigest, /^[0-9a-f]{64}$/u);
  assert.deepEqual(digest1.documentDigests, {
    "docs/context.md": sha("# Context\n"),
    "docs/module.md": sha("# Module\n"),
    "docs/spec.md": sha("# Spec\n"),
  });
  kit.proposeScope(root, scope(), "sequential", reason);
  const digest2 = kit.proposalDigest(root);
  assert.equal(digest2.generation, 2);
  assert.equal(digest2.proposalDigest, digest1.proposalDigest);
  const changedBy = (mutate) => {
    const input = scope();
    mutate(input);
    kit.proposeScope(root, input, "sequential", reason);
    return kit.proposalDigest(root).proposalDigest;
  };
  const taskDigest = changedBy((input) => {
    input.tasks[0].acceptance = ["feature works well"];
  });
  const ciDigest = changedBy((input) => {
    input.automation.ci.requiredChecks = ["macOS ARM64"];
  });
  const same = changedBy(() => {});
  assert.equal(same, digest1.proposalDigest);
  assert.notEqual(taskDigest, digest1.proposalDigest);
  assert.notEqual(ciDigest, digest1.proposalDigest);
  assert.notEqual(ciDigest, taskDigest);
  // Document bytes: the spec, the scope context and a task context.
  for (const file of ["docs/spec.md", "docs/context.md", "docs/module.md"]) {
    const before = readFileSync(path.join(root, file), "utf8");
    write(root, file, `${before}More.\n`);
    assert.notEqual(
      kit.proposalDigest(root).proposalDigest,
      digest1.proposalDigest,
      file
    );
    write(root, file, before);
    assert.equal(kit.proposalDigest(root).proposalDigest, digest1.proposalDigest);
  }
  rmSync(path.join(root, "docs", "module.md"));
  const missing = kit.proposalDigest(root);
  assert.equal(missing.documentDigests["docs/module.md"], null);
  assert.notEqual(missing.proposalDigest, digest1.proposalDigest);
  write(root, "docs/module.md", "# Module\n");

  // The command line: JSON and text.
  const viaCli = JSON.parse(cli(root, ["scope:proposal", "--digest"]).stdout);
  assert.equal(viaCli.ok, true);
  assert.equal(viaCli.result.proposalDigest, digest1.proposalDigest);
  const text = cli(root, ["scope:proposal", "--format", "text", "--digest"]);
  assert.equal(text.exit, 0);
  assert.equal(
    text.stdout,
    [
      `proposal: generation ${viaCli.result.generation}, scope auto-1`,
      `digest: ${digest1.proposalDigest}`,
      "documents:",
      `- docs/context.md: ${sha("# Context\n")}`,
      `- docs/module.md: ${sha("# Module\n")}`,
      `- docs/spec.md: ${sha("# Spec\n")}`,
      "",
    ].join("\n")
  );
  // Without --digest the card view stays as before.
  assert.equal(
    JSON.parse(cli(root, ["scope:proposal"]).stdout).result.scopeId,
    "auto-1"
  );

  // A stale reviewed digest refuses the choice before anything is written.
  const generation = viaCli.result.generation;
  const record = readFileSync(proposalFile(root), "utf8");
  const head = git.head(root);
  write(root, "docs/spec.md", "# Spec\n\nChanged after the review.\n");
  const stale = failure(() =>
    kit.chooseScope(root, {
      expectedDigest: digest1.proposalDigest,
      generation,
      note: "User chose sequential",
      option: "sequential",
      session: "s-1",
    })
  );
  assert.equal(stale.code, "PROPOSAL_CHANGED");
  assert.equal(stale.details.expected, digest1.proposalDigest);
  assert.notEqual(stale.details.current, digest1.proposalDigest);
  assert.equal(readFileSync(proposalFile(root), "utf8"), record);
  assert.equal(git.head(root), head);
  assert.equal(kit.status(root).scope, null);
  const usage = JSON.parse(
    cli(root, [
      "scope:choose",
      "--generation",
      String(generation),
      "--option",
      "sequential",
      "--session",
      "s-1",
      "--note",
      "go",
      "--expected-digest",
      "abc",
    ]).stdout
  );
  assert.equal(usage.code, "USAGE");

  // The current digest creates the scope and records the reviewed proposal.
  const current = kit.proposalDigest(root).proposalDigest;
  const chosen = JSON.parse(
    cli(root, [
      "scope:choose",
      "--generation",
      String(generation),
      "--option",
      "sequential",
      "--session",
      "s-1",
      "--note",
      "User chose sequential",
      "--expected-digest",
      current,
    ]).stdout
  );
  assert.equal(chosen.ok, true);
  assert.equal(chosen.result.proposalDigest, current);
  const plan = plans.read(root);
  assert.deepEqual(plan.scope.proposal, { digest: current, generation });
  assert.equal(plan.scope.automation.acceptance[0].kind, "automatic");
  assert.equal(plan.scope.automation.acceptance[1].kind, "manual");
  const status = kit.status(root);
  assert.deepEqual(status.scope.proposal, { digest: current, generation });
  assert.deepEqual(status.scope.automation, plan.scope.automation);
  assert.equal(existsSync(proposalFile(root)), false);
  assert.equal(code(() => kit.proposalDigest(root)), "NO_PROPOSAL");

  // Recovery names the automation, the criterion kinds and the reviewed digest.
  const packet = cli(root, ["recover", "--format", "text"]).stdout;
  assert.match(packet, /- The feature works \[automatic\]/u);
  assert.match(packet, /- The user sees the release \[manual\]/u);
  assert.match(packet, /Automation:\n- acceptance: 1 automatic, 1 manual \(manual: 2\)/u);
  assert.match(packet, /- ci: origin ci\/auto, checks macOS ARM64, Linux x64, exact SHA/u);
  assert.match(packet, /- publication: main → origin\/main/u);
  assert.match(
    packet,
    new RegExp(`Reviewed proposal: generation ${generation}, digest ${current}`, "u")
  );

  // A legacy scope without automation keeps the old answers.
  const legacy = project(null);
  kit.createScope(legacy, docsScope("docs-1"));
  assert.equal(kit.status(legacy).scope.automation, null);
  assert.equal(kit.status(legacy).scope.proposal, null);
  const legacyPacket = cli(legacy, ["recover", "--format", "text"]).stdout;
  assert.doesNotMatch(legacyPacket, /Automation:|Reviewed proposal|\[manual\]/u);
  console.log("workflow-kit automation tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
