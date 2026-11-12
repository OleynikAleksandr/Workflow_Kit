import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  cleanGitEnvironment,
  identityTemplate,
} from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-installer"],
  "workflow-installer-doctor"
);
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-doctor-"));
try {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowInstallerFacade } = await build.load(
    "workflow-installer",
    "workflow-installer-facade.js"
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
  const bundle = `import { readFileSync } from "node:fs";
import { runCli } from ${JSON.stringify(pathToFileURL(path.join(build.directory, "workflow-kit", "src", "workflow-kit-cli.js")).href)};
process.exitCode = runCli(process.argv.slice(2), { cwd: process.cwd(), env: process.env, readStdin: () => { try { return readFileSync(0, "utf8"); } catch { return ""; } }, stderr: (t) => process.stderr.write(t), stdout: (t) => process.stdout.write(t) });
`;
  const runtime = { executable: process.execPath, mode: "node" };
  const root = path.join(sandbox, "project");
  installer.install(root, { bundle, name: "Doctor", runtime });
  writeFileSync(path.join(root, "package.json"), "{}\n");
  const healthy = () => "24.1.0";
  // Windows has no executable bits, so the doctor has no "executable" check there.
  const { workflowPlatformFacade } = await build.load(
    "workflow-platform",
    "workflow-platform-facade.js"
  );
  const posix = workflowPlatformFacade.platform !== "win32";
  const statusOf = (report) =>
    Object.fromEntries(report.checks.map((item) => [item.id, item.status]));

  // A fresh installation is healthy.
  const first = installer.doctor(root, { env, probe: healthy });
  assert.equal(first.ok, true, JSON.stringify(first.checks));
  assert.deepEqual(statusOf(first), {
    "doc-size": "ok",
    ...(posix ? { executable: "ok" } : {}),
    "git-hooks": "ok",
    "git-identity": "ok",
    "managed-files": "ok",
    manifest: "ok",
    plan: "ok",
    "quality-drift": "ok",
    runtime: "ok",
    transaction: "ok",
  });

  // Breakage the doctor can fix: modes, sections, hooks path.
  chmodSync(path.join(root, "scripts", "workflow"), 0o644);
  const gitignore = path.join(root, ".gitignore");
  writeFileSync(
    gitignore,
    readFileSync(gitignore, "utf8").replace(".harness/workflow/local/\n", "")
  );
  const prePush = path.join(root, ".harness", "workflow", "hooks", "pre-push");
  writeFileSync(prePush, "#!/bin/sh\nexit 0\n");
  git.git.run(root, ["config", "--unset", "core.hooksPath"]);
  const broken = installer.doctor(root, { env, probe: healthy });
  assert.equal(broken.ok, false);
  assert.deepEqual(
    broken.checks
      .filter((item) => item.status === "fail")
      .map((item) => [item.id, item.fixable]),
    [
      ["managed-files", true],
      ...(posix ? [["executable", true]] : []),
      ["git-hooks", true],
    ]
  );
  assert.equal(broken.fix, null);
  const planBefore = readFileSync(
    path.join(root, ".harness", "plans", "todo-plan.md"),
    "utf8"
  );
  const fixed = installer.doctor(root, {
    env,
    fix: { bundle, runtime },
    probe: healthy,
  });
  assert.equal(fixed.ok, true, JSON.stringify(fixed.checks));
  assert.deepEqual(fixed.fix.written.sort(), [
    ".gitignore",
    ".harness/workflow/hooks/pre-push",
  ]);
  // The fixed files equal the committed ones again, so nothing is committed.
  assert.equal(fixed.fix.commit, null);
  assert.deepEqual(git.changes(root).all, ["package.json"]);
  assert.equal(git.config(root, "core.hooksPath"), ".harness/workflow/hooks");
  assert.equal(
    readFileSync(path.join(root, ".harness", "plans", "todo-plan.md"), "utf8"),
    planBefore
  );

  // git-identity: the repository config must hold a real identity.
  const identityOf = (report) =>
    report.checks.find((item) => item.id === "git-identity");
  git.git.run(root, ["config", "--local", "user.name", "Your Name"]);
  git.git.run(root, ["config", "--local", "user.email", "you@example.com"]);
  const placeholder = installer.doctor(root, { env, probe: healthy });
  assert.equal(placeholder.ok, false);
  assert.deepEqual(
    [identityOf(placeholder).status, identityOf(placeholder).fixable],
    ["fail", true]
  );
  assert.match(identityOf(placeholder).message, /placeholder/u);
  assert.match(
    identityOf(placeholder).nextAction,
    /doctor --fix.*Workflow Test <workflow@harness-ai\.test>/u
  );
  // Without a real global identity the fix does not guess: it names the commands.
  writeFileSync(path.join(sandbox, "empty-gitconfig"), "");
  const anonymousEnv = {
    ...env,
    GIT_CONFIG_GLOBAL: path.join(sandbox, "empty-gitconfig"),
  };
  const anonymous = new WorkflowInstallerFacade(
    new WorkflowGitFacade(undefined, anonymousEnv)
  );
  git.git.run(root, ["config", "--local", "--unset", "user.name"]);
  // Another fixable finding waits: its update commits and needs the identity.
  chmodSync(path.join(root, "scripts", "workflow"), 0o644);
  const unknown = anonymous.doctor(root, {
    env: anonymousEnv,
    fix: { bundle, runtime },
    probe: healthy,
  });
  assert.deepEqual(
    [
      identityOf(unknown).status,
      identityOf(unknown).fixable,
      identityOf(unknown).message,
    ],
    ["fail", false, "The repository config has no git identity."]
  );
  assert.match(
    identityOf(unknown).nextAction,
    /git config --global user\.name/u
  );
  assert.match(
    identityOf(unknown).nextAction,
    /git config --global user\.email/u
  );
  assert.deepEqual([unknown.identityFix, unknown.fix], [null, null]);
  assert.equal(statusOf(unknown).executable, posix ? "fail" : undefined);
  assert.equal(git.readIdentity(root, "local"), null);
  // With a real global identity the fix copies it into the repository config.
  const copied = installer.doctor(root, {
    env,
    fix: { bundle, runtime },
    probe: healthy,
  });
  assert.equal(copied.ok, true, JSON.stringify(copied.checks));
  assert.deepEqual(copied.identityFix, {
    email: "workflow@harness-ai.test",
    name: "Workflow Test",
  });
  // The fix restored the modes (POSIX); without executable bits nothing was left to fix.
  if (posix) {
    assert.deepEqual(copied.fix.written, []);
    assert.equal(copied.fix.commit, null);
  } else {
    assert.equal(copied.fix, null);
  }
  assert.equal(statusOf(copied).executable, posix ? "ok" : undefined);
  assert.deepEqual(git.readIdentity(root, "local"), copied.identityFix);
  assert.equal(identityOf(copied).status, "ok");

  // Findings the doctor reports but does not fix.
  const noRuntime = installer.doctor(root, {
    env,
    fix: { bundle, runtime: null },
    probe: () => null,
  });
  assert.equal(noRuntime.ok, false);
  assert.equal(noRuntime.fix, null);
  assert.deepEqual(
    noRuntime.checks.find((item) => item.id === "runtime").fixable,
    false
  );
  const configFile = path.join(root, ".harness", "workflow", "config.json");
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  config.quality = {
    ...config.quality,
    stacks: ["python"],
    status: "CONFIGURED",
  };
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  const drift = installer.doctor(root, { env, probe: healthy });
  assert.equal(drift.ok, true);
  assert.equal(statusOf(drift)["quality-drift"], "warn");
  git.git.run(root, ["checkout", "--", ".harness/workflow/config.json"]);

  // Every project document must fit budget.documentBytes: a warning, not a failure.
  const oversized = "x".repeat(28_001);
  for (const relative of [
    "docs/big.md",
    "node_modules/pkg/README.md",
    ".harness/plans/archive/old.md",
    "ignored/huge.md",
  ]) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), oversized);
  }
  writeFileSync(path.join(root, "docs", "small.md"), "# Small\n");
  mkdirSync(path.join(root, ".git", "info"), { recursive: true });
  writeFileSync(path.join(root, ".git", "info", "exclude"), "ignored/\n");
  const sized = installer.doctor(root, { env, probe: healthy });
  const docSize = sized.checks.find((item) => item.id === "doc-size");
  assert.equal(sized.ok, true, JSON.stringify(sized.checks));
  assert.equal(docSize.status, "warn");
  assert.equal(docSize.fixable, false);
  assert.equal(
    docSize.message,
    "Documents over 28000 bytes cannot be read in one Read: docs/big.md (28001 bytes)."
  );
  assert.equal(
    docSize.nextAction,
    "Split each listed document into smaller documents."
  );
  for (const relative of [
    "docs",
    "node_modules",
    ".harness/plans/archive",
    "ignored",
  ]) {
    rmSync(path.join(root, relative), { force: true, recursive: true });
  }
  assert.equal(
    statusOf(installer.doctor(root, { env, probe: healthy }))["doc-size"],
    "ok"
  );
  writeFileSync(
    path.join(root, ".harness", "workflow", "local", "transaction.json"),
    JSON.stringify({ id: "tx", phase: "FAILED" })
  );
  assert.equal(
    statusOf(installer.doctor(root, { env, probe: healthy })).transaction,
    "fail"
  );
  rmSync(path.join(root, ".harness", "workflow", "local", "transaction.json"));
  rmSync(path.join(root, ".harness", "workflow", "manifest.json"));
  assert.equal(
    statusOf(installer.doctor(root, { env, probe: healthy })).manifest,
    "fail"
  );
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
