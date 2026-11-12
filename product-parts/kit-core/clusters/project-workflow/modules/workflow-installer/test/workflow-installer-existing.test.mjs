import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { openInstallSandbox } from "./workflow-installer-install-support.mjs";

// Install into existing projects: files without git, a configured hooks path
// (husky) and a legacy Harness plan.
const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-installer"],
  "workflow-installer-existing"
);
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-install-existing-"));
try {
  const setup = await openInstallSandbox(build, sandbox);
  const { at, git, installer, options, write } = setup;

  // Existing files without git: kept as they are and left out of the commit.
  const existing = at("existing");
  write(path.join(existing, "README.md"), "# Mine\n");
  write(path.join(existing, "src", "main.ts"), "export {};\n");
  assert.equal(installer.inspect(existing).state, "NOT_GIT");
  const adopted = installer.install(existing, options);
  assert.equal(
    readFileSync(path.join(existing, "README.md"), "utf8"),
    "# Mine\n"
  );
  assert.deepEqual(adopted.excluded, ["README.md", "src/main.ts"]);
  assert.equal(installer.inspect(existing).state, "KIT_OK");

  // A configured hooks path (husky) gets managed sections after the shebang.
  const husky = at("husky");
  mkdirSync(husky);
  git.init(husky);
  git.setConfig(husky, "core.hooksPath", ".husky");
  write(
    path.join(husky, ".husky", "pre-commit"),
    "#!/usr/bin/env sh\necho husky\n"
  );
  write(path.join(husky, "package.json"), "{}\n");
  assert.equal(installer.inspect(husky).state, "GIT_NO_KIT");
  assert.deepEqual(installer.inspect(husky).stacks, ["node"]);
  const huskyInstall = installer.install(husky, options);
  assert.equal(huskyInstall.hooksPath, ".husky");
  assert.equal(git.config(husky, "core.hooksPath"), ".husky");
  assert.match(
    readFileSync(path.join(husky, ".husky", "pre-commit"), "utf8"),
    /^#!\/usr\/bin\/env sh\n# workflow-kit:begin\n.*git-hook pre-commit.*\n# workflow-kit:end\necho husky\n$/u
  );
  assert.equal(
    existsSync(path.join(husky, ".harness", "workflow", "hooks")),
    false
  );

  // A legacy Harness plan is detected and kept for migration.
  const legacy = at("legacy");
  mkdirSync(legacy);
  git.init(legacy);
  const legacyPlan =
    "# Plan\n\nSchema: harness-ai-plan-v1\nExecution Scope Status: NONE\n";
  write(path.join(legacy, ".harness", "plans", "todo-plan.md"), legacyPlan);
  git.git.run(legacy, ["add", "-A"]);
  git.git.run(legacy, ["commit", "-q", "-m", "legacy"]);
  assert.deepEqual(
    [installer.inspect(legacy).state, installer.inspect(legacy).action],
    ["LEGACY_HARNESS_PLAN", "install-migrate"]
  );
  const legacyInstall = installer.install(legacy, options);
  assert.equal(legacyInstall.migrationRequired, true);
  assert.equal(
    readFileSync(
      path.join(legacy, ".harness", "plans", "todo-plan.md"),
      "utf8"
    ),
    legacyPlan
  );
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
