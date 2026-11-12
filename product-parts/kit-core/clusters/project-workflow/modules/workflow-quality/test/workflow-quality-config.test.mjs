import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-quality"],
  "workflow-quality-config"
);
const root = mkdtempSync(path.join(os.tmpdir(), "workflow-quality-"));
try {
  const { WorkflowQualityFacade } = await build.load(
    "workflow-quality",
    "workflow-quality-facade.js"
  );
  const quality = new WorkflowQualityFacade();
  const codeOf = (action) => {
    try {
      action();
    } catch (error) {
      return error.code;
    }
    return "OK";
  };

  // A missing file yields the default DISCOVERY profile with kit builtins.
  const initial = quality.readConfig(root);
  assert.equal(initial.quality.status, "DISCOVERY");
  assert.equal(initial.budget.recoveryBytes, 32_000);
  assert.equal(initial.budget.documentBytes, 28_000);
  assert.equal(initial.budget.briefBytes, 60_000);
  assert.equal(initial.autopilot.maxContinues, 40);
  assert.deepEqual(
    initial.quality.checks.map((check) => check.builtin),
    [
      "kit:doc-size",
      "kit:md-links",
      "kit:file-lines",
      "kit:docs-contracts",
      "kit:conflict-markers",
    ]
  );

  // Optional check fields receive defaults; invalid checks are rejected.
  const lint = quality.normalizeCheck({
    command: { args: ["check"], executable: "npx" },
    id: "lint",
    role: "lint",
    stage: "commit",
  });
  assert.equal(lint.required, false);
  assert.equal(lint.timeoutMs, 120_000);
  assert.equal(
    codeOf(() => quality.normalizeCheck({ ...lint, builtin: "kit:md-links" })),
    "CONFIG_SCHEMA"
  );
  assert.equal(
    codeOf(() => quality.normalizeCheck({ ...lint, timeoutMs: 700_000 })),
    "CONFIG_SCHEMA"
  );
  assert.equal(
    codeOf(() => quality.normalizeCheck({ ...lint, role: "package" })),
    "CONFIG_SCHEMA"
  );
  assert.equal(
    codeOf(() => quality.normalizeCheck({ ...lint, stage: "delivery" })),
    "CONFIG_SCHEMA"
  );
  assert.equal(
    codeOf(() =>
      quality.normalizeCheck({
        ...lint,
        evidence: "Harness AI.app starts and opens a project",
        id: "package-mac",
        role: "package",
        stage: "delivery",
      })
    ),
    "OK"
  );

  // Configured profiles round-trip through the file and keep validation.
  const configured = {
    ...initial,
    quality: {
      ...initial.quality,
      checks: [...initial.quality.checks, lint],
      packageManager: "npm",
      stacks: ["node"],
      status: "CONFIGURED",
    },
  };
  quality.writeConfig(root, configured);
  assert.deepEqual(quality.readConfig(root), configured);
  assert.equal(
    codeOf(() =>
      quality.validateConfig({
        ...configured,
        quality: { ...configured.quality, stacks: [] },
      })
    ),
    "CONFIG_SCHEMA"
  );
  assert.equal(
    codeOf(() =>
      quality.validateConfig({
        ...configured,
        quality: { ...configured.quality, checks: [lint, lint] },
      })
    ),
    "CONFIG_SCHEMA"
  );
  assert.equal(
    codeOf(() =>
      quality.validateConfig({
        ...configured,
        budget: { ...configured.budget, recoveryBytes: 4000 },
      })
    ),
    "CONFIG_SCHEMA"
  );

  for (const briefBytes of [4000, 200_001, 1.5]) {
    assert.equal(
      codeOf(() =>
        quality.validateConfig({
          ...configured,
          budget: { ...configured.budget, briefBytes },
        })
      ),
      "CONFIG_SCHEMA"
    );
  }
  assert.equal(
    quality.validateConfig({
      ...configured,
      budget: { ...configured.budget, briefBytes: 200_000 },
    }).budget.briefBytes,
    200_000
  );

  // A configuration written before budget.briefBytes reads with the default;
  // the file itself is not rewritten.
  const { briefBytes: _omitted, ...oldBudget } = configured.budget;
  mkdirSync(path.join(root, ".harness", "workflow"), { recursive: true });
  const oldText = `${JSON.stringify({ ...configured, budget: oldBudget }, null, 2)}\n`;
  writeFileSync(quality.configFile(root), oldText);
  assert.equal(quality.readConfig(root).budget.briefBytes, 60_000);
  assert.equal(readFileSync(quality.configFile(root), "utf8"), oldText);

  // The optional host marker round-trips; an empty host is rejected.
  quality.writeConfig(root, { ...configured, host: "harness" });
  assert.equal(quality.readConfig(root).host, "harness");
  assert.equal(
    codeOf(() => quality.validateConfig({ ...configured, host: " " })),
    "CONFIG_SCHEMA"
  );
  mkdirSync(path.join(root, ".harness", "workflow"), { recursive: true });
  writeFileSync(quality.configFile(root), "{broken");
  assert.equal(
    codeOf(() => quality.readConfig(root)),
    "CONFIG_JSON"
  );
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
