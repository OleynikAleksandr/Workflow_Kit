// The OS rules of install and doctor with the platform injected (Workflow Kit M22 2.3): win32 has
// no executable bits, so install sets no mode and doctor has no `executable` check; linux and
// darwin set 0755 and check it. Modes are asserted only where the host file system keeps them.
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cleanGitEnvironment,
  identityTemplate,
} from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-installer"],
  "workflow-installer-platform"
);
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-platform-rules-"));
const posixHost = process.platform !== "win32";
try {
  const { WorkflowGitFacade } = await build.load("workflow-git", "workflow-git-facade.js");
  const { WorkflowInstallerFacade } = await build.load(
    "workflow-installer",
    "workflow-installer-facade.js"
  );
  const { currentWorkflowPlatform } = await build.load(
    "workflow-platform",
    "platform-paths.js"
  );
  const identity = path.join(sandbox, "gitconfig");
  writeFileSync(identity, "[user]\n\tname = Workflow Test\n\temail = workflow@harness-ai.test\n");
  const env = {
    ...cleanGitEnvironment(),
    GIT_CONFIG_GLOBAL: identity,
    GIT_TEMPLATE_DIR: identityTemplate(sandbox),
  };
  const git = new WorkflowGitFacade(undefined, env);
  const installer = new WorkflowInstallerFacade(git);
  const bundle = "// bundle\n";
  const launcher = (root) => path.join(root, "scripts", "workflow");
  const executable = (root) => (statSync(launcher(root)).mode & 0o111) !== 0;
  const checkIds = (report) => report.checks.map((item) => item.id);

  // The Kit platform of a Node platform: every other OS counts as linux.
  assert.equal(currentWorkflowPlatform("win32"), "win32");
  assert.equal(currentWorkflowPlatform("darwin"), "darwin");
  assert.equal(currentWorkflowPlatform("linux"), "linux");
  assert.equal(currentWorkflowPlatform("freebsd"), "linux");
  assert.equal(
    currentWorkflowPlatform(),
    currentWorkflowPlatform(process.platform)
  );

  // win32: install sets no executable mode, doctor has no executable check.
  const windows = path.join(sandbox, "windows");
  installer.install(windows, { bundle, name: "Windows", platform: "win32" });
  if (posixHost) {
    assert.equal(executable(windows), false, "win32 rules leave the launcher mode alone");
  }
  const windowsDoctor = installer.doctor(windows, { env, platform: "win32" });
  assert.equal(checkIds(windowsDoctor).includes("executable"), false);

  // linux: install sets 0755; doctor reports a launcher that lost it.
  const linux = path.join(sandbox, "linux");
  installer.install(linux, { bundle, name: "Linux", platform: "linux" });
  const linuxDoctor = installer.doctor(linux, { env, platform: "linux" });
  assert.equal(checkIds(linuxDoctor).includes("executable"), true);
  if (posixHost) {
    assert.equal(executable(linux), true);
    chmodSync(launcher(linux), 0o644);
    const broken = installer.doctor(linux, { env, platform: "linux" });
    assert.equal(
      broken.checks.find((item) => item.id === "executable")?.status,
      "fail"
    );
  }
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
