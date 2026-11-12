import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-quality"],
  "workflow-quality-apply"
);
const root = mkdtempSync(path.join(os.tmpdir(), "workflow-apply-"));
try {
  const { WorkflowQualityFacade } = await build.load(
    "workflow-quality",
    "workflow-quality-facade.js"
  );
  const quality = new WorkflowQualityFacade();
  writeFileSync(path.join(root, "package.json"), "{}");
  const lint = {
    command: { args: ["-e", "process.exit(0)"], executable: "node" },
    id: "lint",
    required: true,
    role: "lint",
    stage: "commit",
  };
  const marker = path.join(root, "installed.txt");
  const install = {
    args: ["-e", "require('node:fs').writeFileSync('installed.txt', 'yes')"],
    executable: "node",
  };

  // DISCOVERY has no drift report.
  assert.equal(quality.drift(root).status, "discovery");

  // Installs need an approval; nothing is written without it.
  assert.throws(
    () =>
      quality.applyProfile(root, {
        checks: [lint],
        install: [install],
        stacks: ["node"],
      }),
    { code: "INSTALL_APPROVAL" }
  );
  assert.equal(existsSync(quality.configFile(root)), false);
  assert.equal(existsSync(marker), false);

  // Invalid profiles fail before any install runs.
  assert.throws(
    () =>
      quality.applyProfile(root, {
        approval: "User approved the tools",
        checks: [{ ...lint, id: "kit:md-links" }],
        install: [install],
        stacks: ["node"],
      }),
    { code: "PROFILE_INVALID" }
  );
  assert.throws(
    () => quality.previewProfile(root, { checks: [], stacks: ["cobol"] }),
    { code: "UNKNOWN_STACK" }
  );
  assert.throws(
    () => quality.previewProfile(root, { checks: [], stacks: [] }),
    { code: "PROFILE_INVALID" }
  );
  assert.equal(existsSync(marker), false);

  // A failing install stops apply and leaves the configuration unchanged.
  assert.throws(
    () =>
      quality.applyProfile(root, {
        approval: "User approved the tools",
        checks: [lint],
        install: [{ args: ["-e", "process.exit(4)"], executable: "node" }],
        stacks: ["node"],
      }),
    { code: "INSTALL_FAILED" }
  );
  assert.equal(existsSync(quality.configFile(root)), false);

  // Approved apply installs, keeps builtins, sets policy and contracts.
  const applied = quality.applyProfile(root, {
    approval: "User approved the tools",
    checks: [lint],
    docs: {
      contracts: [{ code: "src/{module}/**", docs: ["docs/{module}.md"] }],
    },
    install: [install],
    packageManager: "npm",
    policy: { maxFileLines: 500 },
    stacks: ["node"],
  });
  assert.equal(existsSync(marker), true);
  assert.equal(applied.installs.length, 1);
  const stored = quality.readConfig(root);
  assert.equal(stored.quality.status, "CONFIGURED");
  assert.deepEqual(stored.quality.stacks, ["node"]);
  assert.equal(stored.policy.maxFileLines, 500);
  assert.equal(stored.policy.taskFileSoftLimit, null);
  assert.deepEqual(
    stored.quality.checks.map((check) => check.id),
    [
      "lint",
      "kit:doc-size",
      "kit:md-links",
      "kit:file-lines",
      "kit:docs-contracts",
      "kit:conflict-markers",
    ]
  );
  assert.equal(stored.quality.checks[0].timeoutMs, 120_000);

  // Re-applying without installs needs no approval and replaces checks.
  quality.applyProfile(root, {
    checks: [{ ...lint, id: "lint2" }],
    stacks: ["node"],
  });
  assert.deepEqual(
    quality.readConfig(root).quality.checks.map((check) => check.id)[0],
    "lint2"
  );
  assert.deepEqual(quality.readConfig(root).docs.contracts.length, 1);

  // Drift: a new ecosystem; a stack without manifests whose checks run the
  // toolchain only (`node -e`) is not missing.
  assert.equal(quality.drift(root).status, "ok");
  writeFileSync(path.join(root, "pyproject.toml"), "[project]\n");
  rmSync(path.join(root, "package.json"));
  assert.deepEqual(quality.drift(root), {
    added: ["python"],
    missing: [],
    status: "drift",
  });
  rmSync(path.join(root, "pyproject.toml"));

  // A project without package.json and a node profile running `node --test`
  // (the profile of a plain node project) reports no drift.
  const nodeTest = {
    command: { args: ["--test"], executable: "node" },
    id: "tests",
    required: true,
    role: "test",
    stage: "commit",
  };
  quality.applyProfile(root, {
    checks: [nodeTest],
    packageManager: null,
    stacks: ["node"],
  });
  assert.deepEqual(quality.drift(root), {
    added: [],
    missing: [],
    status: "ok",
  });

  // A check that runs the package manager needs the manifest: missing node.
  const npmTest = {
    command: { args: ["test"], executable: "npm.cmd" },
    id: "npm-tests",
    required: true,
    role: "test",
    stage: "commit",
  };
  quality.applyProfile(root, {
    checks: [nodeTest, npmTest],
    stacks: ["node"],
  });
  assert.deepEqual(quality.drift(root), {
    added: [],
    missing: ["node"],
    status: "drift",
  });
  writeFileSync(path.join(root, "package.json"), "{}");
  assert.equal(quality.drift(root).status, "ok");
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
