import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import {
  runnerConfig,
  runnerRoot,
  writeRunnerFiles,
} from "./workflow-quality-runner-support.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-quality"],
  "workflow-quality-runner"
);
const { root, write } = runnerRoot();
try {
  const { WorkflowQualityFacade } = await build.load(
    "workflow-quality",
    "workflow-quality-facade.js"
  );
  const quality = new WorkflowQualityFacade();
  const base = quality.defaultConfig();
  const config = runnerConfig(quality, base);
  writeRunnerFiles(write);

  // Required commit checks plus assigned ones; failures carry exit code and output.
  const commit = quality.runStage({
    assigned: ["broken"],
    config,
    files: ["src/core/a.ts"],
    root,
    stage: "commit",
  });
  const byId = Object.fromEntries(
    commit.results.map((item) => [item.id, item])
  );
  assert.equal(commit.ok, false);
  assert.equal(byId.ok.status, "passed");
  assert.equal(byId.broken.status, "failed");
  assert.equal(byId.broken.exitCode, 3);
  assert.match(byId.broken.output, /bad/u);
  assert.equal(byId["kit:docs-contracts"].status, "failed");
  assert.match(
    byId["kit:docs-contracts"].output,
    /src\/core\/a\.ts -> docs\/core\.md/u
  );
  assert.equal(byId["kit:file-lines"].status, "passed");

  // Waiver passes the contract; including the document satisfies it too.
  const waived = quality.runStage({
    config,
    docsWaiver: "refactor only",
    files: ["src/core/a.ts"],
    only: ["kit:docs-contracts"],
    root,
    stage: "commit",
  });
  assert.equal(waived.ok, true);
  assert.deepEqual(
    quality.missingContracts(config, ["src/core/a.ts", "docs/core.md"]),
    []
  );

  // Builtins: line limit, document size, relative links outside code fences.
  const builtins = quality.runStage({
    config,
    files: ["src/core/b.ts", "docs/core.md", "docs/big.md", "docs/core.md"],
    only: ["kit:file-lines", "kit:doc-size", "kit:md-links"],
    root,
    stage: "commit",
  });
  const builtin = Object.fromEntries(
    builtins.results.map((item) => [item.id, item])
  );
  assert.equal(builtin["kit:file-lines"].status, "failed");
  assert.match(builtin["kit:file-lines"].output, /src\/core\/b\.ts: 5 lines/u);
  assert.equal(builtin["kit:doc-size"].status, "failed");
  assert.match(builtin["kit:doc-size"].output, /docs\/big\.md/u);
  assert.equal(builtin["kit:md-links"].status, "failed");
  assert.match(builtin["kit:md-links"].output, /gone\.md/u);
  assert.doesNotMatch(builtin["kit:md-links"].output, /nowhere|example|a\.ts/u);

  // The size rule of kit:doc-size, shared with the doctor: Markdown only,
  // existing files only, the plan excluded.
  write(".harness/plans/todo-plan.md", "p".repeat(500));
  assert.deepEqual(
    quality.oversizedDocuments(
      root,
      [
        "docs/core.md",
        "docs/big.md",
        "src/core/b.ts",
        "docs/missing.md",
        ".harness/plans/todo-plan.md",
      ],
      config
    ),
    [{ bytes: 400, path: "docs/big.md" }]
  );

  // Conflict markers fail the commit with file and line numbers; a lone
  // separator (a Markdown heading underline) and binary files pass.
  const marker = (char) => char.repeat(7);
  write(
    "src/core/conflict.ts",
    [
      "const a = 1;",
      `${marker("<")} HEAD`,
      "const b = 2;",
      marker("="),
      "const b = 3;",
      `${marker(">")} feature`,
      "",
    ].join("\n")
  );
  write("docs/half.md", ["Text", `${marker(">")} theirs`, ""].join("\n"));
  write(
    "docs/heading.md",
    ["Title", `${marker("=")}\r`, "", "Text", ""].join("\n")
  );
  write("bin.dat", `\u0000\n${marker("<")} HEAD\n`);
  const conflicts = quality.runStage({
    config,
    files: [
      "src/core/conflict.ts",
      "docs/half.md",
      "docs/heading.md",
      "bin.dat",
    ],
    only: ["kit:conflict-markers"],
    root,
    stage: "commit",
  });
  assert.equal(conflicts.ok, false);
  const conflictOutput = conflicts.results[0].output;
  assert.match(conflictOutput, /src\/core\/conflict\.ts: lines 2, 4, 6/u);
  assert.match(conflictOutput, /docs\/half\.md: line 2$/mu);
  assert.doesNotMatch(conflictOutput, /heading|bin\.dat/u);
  const clean = quality.runStage({
    config,
    files: ["docs/heading.md", "bin.dat", "src/core/deleted.ts"],
    only: ["kit:conflict-markers"],
    root,
    stage: "commit",
  });
  assert.equal(clean.ok, true);

  // Paths the commit removes (copies left on disk, e.g. an ignored
  // node_modules) are skipped by the content builtins; without `removed`
  // the same files fail every one of them.
  const vendored = ["node_modules/big/index.js", "node_modules/big/README.md"];
  write(
    vendored[0],
    [
      "1",
      `${marker("<")} HEAD`,
      "2",
      marker("="),
      "3",
      `${marker(">")} x`,
      "",
    ].join("\n")
  );
  write(vendored[1], `[gone](./gone.md)\n${"y".repeat(400)}\n`);
  const contentChecks = [
    "kit:file-lines",
    "kit:doc-size",
    "kit:md-links",
    "kit:conflict-markers",
  ];
  const kept = quality.runStage({
    config,
    files: vendored,
    only: contentChecks,
    root,
    stage: "commit",
  });
  assert.deepEqual(
    kept.results.map((item) => item.status),
    ["failed", "failed", "failed", "failed"]
  );
  const removed = quality.runStage({
    config,
    files: vendored,
    only: contentChecks,
    removed: vendored,
    root,
    stage: "commit",
  });
  assert.equal(removed.ok, true);
  assert.deepEqual(
    removed.results.map((item) => item.status),
    ["passed", "passed", "passed", "passed"]
  );
  // Removing module code is still a change of the module.
  const removedCode = quality.runStage({
    config,
    files: ["src/core/a.ts"],
    only: ["kit:docs-contracts"],
    removed: ["src/core/a.ts"],
    root,
    stage: "commit",
  });
  assert.equal(removedCode.ok, false);

  // A profile written before the guard still runs it at every commit.
  const legacy = {
    ...config,
    quality: {
      ...config.quality,
      checks: config.quality.checks.filter(
        (check) => check.id !== "kit:conflict-markers"
      ),
    },
  };
  for (const service of [false, true]) {
    assert.ok(
      quality
        .selectChecks({ config: legacy, root, service, stage: "commit" })
        .some((check) => check.id === "kit:conflict-markers")
    );
  }
  assert.equal(
    quality.selectChecks({ config: legacy, root, stage: "push" }).length,
    0
  );

  // Prepare stage expands {files} with existing files that match appliesTo.
  const prepare = quality.runStage({
    config,
    files: ["src/core/a.ts", "src/core/c.js", "src/core/deleted.ts"],
    root,
    stage: "prepare",
  });
  assert.equal(prepare.results[0].status, "passed");
  assert.equal(prepare.results[0].output.trim(), "src/core/a.ts");
  // {files} never receives removed paths; appliesTo still sees them.
  const prepareRemoved = quality.runStage({
    config,
    files: ["src/core/a.ts", "src/core/b.ts"],
    removed: ["src/core/b.ts"],
    root,
    stage: "prepare",
  });
  assert.equal(prepareRemoved.results[0].output.trim(), "src/core/a.ts");
  const prepareGone = quality.runStage({
    config,
    files: ["src/core/b.ts"],
    removed: ["src/core/b.ts"],
    root,
    stage: "prepare",
  });
  assert.equal(prepareGone.results[0].status, "skipped");
  assert.equal(prepareGone.results[0].reason, "No existing files to pass.");
  const skipped = quality.runStage({
    config,
    files: ["README.md"],
    root,
    stage: "prepare",
  });
  assert.equal(skipped.results[0].status, "skipped");
  assert.equal(skipped.ok, true);

  // Timeouts and missing executables are reported, not thrown.
  const push = quality.runStage({
    assigned: ["slow", "missing"],
    config,
    root,
    stage: "push",
  });
  assert.deepEqual(
    push.results.map((item) => item.status),
    ["timeout", "error"]
  );

  // Service commits run documentation builtins only.
  const service = quality.selectChecks({
    config,
    root,
    service: true,
    stage: "commit",
  });
  assert.deepEqual(
    service.map((check) => check.id),
    [
      "kit:doc-size",
      "kit:md-links",
      "kit:docs-contracts",
      "kit:conflict-markers",
    ]
  );
  assert.throws(
    () =>
      quality.selectChecks({
        assigned: ["nope"],
        config,
        root,
        stage: "commit",
      }),
    { code: "CHECK_UNKNOWN" }
  );

  // Planned task checks: a CONFIGURED profile knows exactly its checks and
  // the implicit guards; manual text is refused with the input field named.
  const configured = {
    ...config,
    quality: { ...config.quality, status: "CONFIGURED" },
  };
  assert.deepEqual(
    quality.unknownPlannedChecks(configured, [
      "ok",
      "kit:conflict-markers",
      "future",
    ]),
    ["future"]
  );
  assert.throws(
    () =>
      quality.ensurePlannedChecks(configured, [
        { checks: ["ok"], field: "tasks[0].checks", taskId: "T001" },
        {
          checks: ["Open the app and check the hint"],
          field: "tasks[1].checks",
          taskId: "T002",
        },
      ]),
    (error) =>
      error.code === "CHECK_UNKNOWN" &&
      error.details.field === "tasks[1].checks" &&
      error.details.taskId === "T002" &&
      error.details.known.includes("ok") &&
      error.nextAction.includes("acceptance")
  );
  // Before QUALITY: Kit builtins and ids QUALITY will define, by form only.
  assert.equal(base.quality.status, "DISCOVERY");
  assert.deepEqual(
    quality.unknownPlannedChecks(base, [
      "kit:doc-size",
      "package-mac",
      "kit:nope",
      "manual check",
    ]),
    ["kit:nope", "manual check"]
  );
  quality.ensurePlannedChecks(base, [
    { checks: ["package-mac"], field: "checks", taskId: "D1" },
  ]);
  assert.throws(
    () =>
      quality.ensurePlannedChecks(base, [
        { checks: ["kit:nope"], field: "checks", taskId: "D1" },
      ]),
    { code: "CHECK_UNKNOWN" }
  );

  // Evidence is stored as a pending record of the transaction.
  quality.recordEvidence(root, "tx-1", [commit]);
  const evidence = quality.readEvidence(root, "pending-tx-1");
  assert.equal(evidence.transaction, "tx-1");
  assert.equal(evidence.reports[0].stage, "commit");
  assert.equal(quality.readEvidence(root), null);
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
