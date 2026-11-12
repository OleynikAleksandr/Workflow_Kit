import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-quality"],
  "workflow-quality-detect"
);
const roots = [];
const project = (files) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workflow-detect-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
};
try {
  const { WorkflowQualityFacade } = await build.load(
    "workflow-quality",
    "workflow-quality-facade.js"
  );
  const quality = new WorkflowQualityFacade();
  const nothing = () => false;

  // Node project with scripts and installed tools: scripts win, no installs.
  const node = project({
    "package-lock.json": "{}",
    "package.json": JSON.stringify({
      devDependencies: { typescript: "5", ultracite: "5" },
      scripts: { lint: "ultracite check", test: "node scripts/test.mjs" },
    }),
    "tsconfig.json": "{}",
    "node_modules/x/package.json": "{}",
  });
  const nodeProposal = quality.propose(node, { which: nothing });
  assert.deepEqual(nodeProposal.profile.stacks, ["node"]);
  assert.equal(nodeProposal.profile.packageManager, "npm");
  assert.deepEqual(
    nodeProposal.profile.checks.map((check) => [
      check.id,
      check.stage,
      check.command.executable,
      check.command.args.join(" "),
    ]),
    [
      ["format", "prepare", "npx", "ultracite fix {files}"],
      ["lint", "commit", "npm", "run -s lint"],
      ["typecheck", "commit", "npx", "tsc --noEmit"],
      ["tests", "commit", "npm", "test"],
      ["audit", "push", "npm", "audit --audit-level=high"],
    ]
  );
  assert.deepEqual(nodeProposal.profile.install, []);
  assert.equal(
    nodeProposal.detected[0].markers.includes("node_modules/x/package.json"),
    false
  );

  // pnpm project without tools: first candidates are proposed for install.
  const bare = project({
    "package.json": JSON.stringify({
      scripts: { test: 'echo "Error: no test specified"' },
    }),
    "pnpm-lock.yaml": "",
  });
  const bareProposal = quality.propose(bare, { which: nothing });
  assert.equal(bareProposal.profile.packageManager, "pnpm");
  assert.deepEqual(bareProposal.profile.install, [
    { args: ["add", "-D", "ultracite"], executable: "pnpm" },
  ]);
  // The node test runner needs no install, so it wins over absent vitest.
  assert.deepEqual(
    bareProposal.profile.checks.find((check) => check.id === "tests").command,
    { args: ["--test"], executable: "node" }
  );
  assert.deepEqual(
    bareProposal.profile.checks.map((check) => check.id),
    ["format", "lint", "tests", "audit"]
  );
  assert.deepEqual(
    bareProposal.entries.find((entry) => entry.id === "lint").alternatives,
    ["ultracite", "biome", "eslint"]
  );

  // Multiple stacks in subdirectories get prefixed ids and their own tools.
  const mixed = project({
    "api/go.mod": "module demo",
    "web/package.json": "{}",
    "web/yarn.lock": "",
    "tools/pyproject.toml":
      "[tool.poetry]\n[tool.poetry.group.dev.dependencies]\nruff = '*'\npytest = '*'",
    "tools/poetry.lock": "",
  });
  const detected = quality.detect(mixed);
  assert.deepEqual(
    detected.map((item) => [
      item.id,
      item.packageManager,
      item.markers.join(","),
    ]),
    [
      ["node", "yarn", "web/package.json"],
      ["python", "poetry", "tools/pyproject.toml"],
      ["go", "go", "api/go.mod"],
    ]
  );
  const mixedProposal = quality.propose(mixed, {
    which: (name) => name === "go" || name === "gofmt",
  });
  const ids = mixedProposal.profile.checks.map((check) => check.id);
  assert.ok(
    ids.includes("python-lint") &&
      ids.includes("go-tests") &&
      ids.includes("node-format")
  );
  const pyLint = mixedProposal.profile.checks.find(
    (check) => check.id === "python-lint"
  );
  assert.deepEqual(pyLint.command, {
    args: ["run", "ruff", "check"],
    executable: "poetry",
  });
  assert.deepEqual(
    mixedProposal.profile.checks.find((check) => check.id === "go-format")
      .appliesTo,
    ["**/*.go"]
  );
  assert.ok(
    mixedProposal.profile.install.some(
      (command) => command.executable === "go" && command.args[0] === "install"
    )
  );
  assert.ok(
    mixedProposal.profile.install.some(
      (command) =>
        command.executable === "poetry" && command.args.includes("pyright")
    )
  );

  // Empty folder: explicit stack works, unknown stacks are rejected.
  const empty = project({});
  assert.deepEqual(
    quality.propose(empty, { which: nothing }).profile.checks,
    []
  );
  const explicit = quality.propose(empty, {
    stacks: ["rust"],
    which: () => true,
  });
  assert.deepEqual(explicit.profile.stacks, ["rust"]);
  assert.equal(explicit.profile.packageManager, "cargo");
  assert.deepEqual(explicit.profile.install, []);
  assert.throws(() => quality.propose(empty, { stacks: ["cobol"] }), {
    code: "UNKNOWN_STACK",
  });
  const swift = quality.propose(empty, { stacks: ["swift"], which: nothing });
  assert.ok(swift.notes.some((note) => note.includes("swiftlint")));
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
