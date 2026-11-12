import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { openInstallSandbox } from "./workflow-installer-install-support.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-installer"],
  "workflow-installer-install"
);
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-install-"));
try {
  const setup = await openInstallSandbox(build, sandbox);
  const { at, bundle, code, env, git, installer, kit, options, write } = setup;
  const { WorkflowGitFacade, WorkflowInstallerFacade } = setup;

  // New project: missing folder, no identity → nothing is written.
  const fresh = at("fresh");
  assert.equal(installer.inspect(fresh).state, "MISSING");
  assert.equal(installer.inspect(fresh).action, "create");
  const anonymous = new WorkflowInstallerFacade(
    new WorkflowGitFacade(undefined, {
      ...env,
      GIT_CONFIG_GLOBAL: at("empty-gitconfig"),
    })
  );
  assert.equal(
    code(() => anonymous.install(fresh, options)),
    "GIT_IDENTITY_REQUIRED"
  );
  assert.equal(existsSync(fresh), false);
  // A placeholder global identity is refused as well, and nothing is written
  // into an existing folder either.
  writeFileSync(
    at("placeholder-gitconfig"),
    "[user]\n\tname = Your Name\n\temail = you@example.com\n"
  );
  const placeholder = new WorkflowInstallerFacade(
    new WorkflowGitFacade(undefined, {
      ...env,
      GIT_CONFIG_GLOBAL: at("placeholder-gitconfig"),
    })
  );
  const untouched = at("untouched");
  write(path.join(untouched, "notes.txt"), "mine\n");
  let refusal = null;
  try {
    placeholder.install(untouched, options);
  } catch (error) {
    refusal = error;
  }
  assert.equal(refusal.code, "GIT_IDENTITY_REQUIRED");
  // The problem is named once; the terminal commands are only the next action.
  assert.equal(
    refusal.message,
    "The Workflow Kit needs a real git name and email for its commits; the configured one is a placeholder or invalid. Nothing was written."
  );
  assert.match(refusal.nextAction, /git config --global user\.name/u);
  assert.match(refusal.nextAction, /git config --global user\.email/u);
  assert.deepEqual(readdirSync(untouched), ["notes.txt"]);
  // A global email in typographic quotes is invalid and refused the same way.
  writeFileSync(
    at("quoted-gitconfig"),
    "[user]\n\tname = Real Person\n\temail = \u201Creal@harness-ai.test\u201D\n"
  );
  const quoted = new WorkflowInstallerFacade(
    new WorkflowGitFacade(undefined, {
      ...env,
      GIT_CONFIG_GLOBAL: at("quoted-gitconfig"),
    })
  );
  assert.equal(
    code(() => quoted.install(untouched, options)),
    "GIT_IDENTITY_REQUIRED"
  );
  assert.deepEqual(readdirSync(untouched), ["notes.txt"]);

  const installed = installer.install(fresh, { ...options, name: "Fresh App" });
  assert.equal(installed.previousState, "MISSING");
  assert.equal(installed.hooksPath, ".harness/workflow/hooks");
  assert.equal(git.config(fresh, "core.hooksPath"), ".harness/workflow/hooks");
  accessSync(path.join(fresh, "scripts", "workflow"), constants.X_OK);
  accessSync(
    path.join(fresh, ".harness", "workflow", "hooks", "pre-commit"),
    constants.X_OK
  );
  assert.match(
    readFileSync(path.join(fresh, "README.md"), "utf8"),
    /^# Fresh App\n/u
  );
  const [bootstrap] = git.history(fresh, null);
  assert.equal(bootstrap.trailers["Workflow-Role"][0], "bootstrap");
  assert.equal(installer.inspect(fresh).state, "KIT_OK");
  const status = kit.status(fresh);
  assert.equal(status.installed, true);
  assert.deepEqual(status.project, { id: "fresh-app", name: "Fresh App" });
  assert.deepEqual(status.changes, []);
  assert.equal(
    code(() => installer.install(fresh, options)),
    "ALREADY_INSTALLED"
  );

  // Only a real global identity: install copies it into the repository config
  // before the bootstrap commit, including over a placeholder local one.
  mkdirSync(at("empty-template"));
  const globalGit = new WorkflowGitFacade(undefined, {
    ...env,
    GIT_TEMPLATE_DIR: at("empty-template"),
  });
  const globalOnly = new WorkflowInstallerFacade(globalGit);
  const signed = (root) =>
    globalGit.git.text(root, ["log", "-1", "--format=%an <%ae>|%cn <%ce>"]);
  const real = { email: "workflow@harness-ai.test", name: "Workflow Test" };
  const copied = at("copied");
  globalOnly.install(copied, options);
  assert.deepEqual(globalGit.readIdentity(copied, "local"), real);
  assert.equal(
    signed(copied),
    "Workflow Test <workflow@harness-ai.test>|Workflow Test <workflow@harness-ai.test>"
  );
  const replaced = at("replaced");
  mkdirSync(replaced);
  globalGit.init(replaced);
  globalGit.git.run(replaced, ["config", "user.name", "Ваше Имя"]);
  globalGit.git.run(replaced, ["config", "user.email", "me@example.org"]);
  globalOnly.install(replaced, options);
  assert.deepEqual(globalGit.readIdentity(replaced, "local"), real);
  // A real local identity is kept.
  const own = at("own");
  mkdirSync(own);
  globalGit.init(own);
  globalGit.writeLocalIdentity(own, {
    email: "owner@harness-ai.test",
    name: "Project Owner",
  });
  globalOnly.install(own, options);
  assert.equal(
    signed(own),
    "Project Owner <owner@harness-ai.test>|Project Owner <owner@harness-ai.test>"
  );

  // The host marker: written on install, kept by an update without --host,
  // added to an existing configuration by an update with --host.
  const configOf = (root) =>
    JSON.parse(
      readFileSync(
        path.join(root, ".harness", "workflow", "config.json"),
        "utf8"
      )
    );
  const hosted = at("hosted");
  const hostedInstall = installer.install(hosted, {
    ...options,
    host: "harness",
  });
  assert.ok(hostedInstall.written.includes(".harness/workflow/config.json"));
  assert.equal(configOf(hosted).host, "harness");
  assert.equal(kit.validate(hosted).ok, true);
  installer.install(hosted, { ...options, update: true });
  assert.equal(configOf(hosted).host, "harness");
  assert.equal(configOf(copied).host, undefined);
  const marked = globalOnly.install(copied, {
    ...options,
    host: "harness",
    update: true,
  });
  assert.deepEqual(marked.written, [".harness/workflow/config.json"]);
  assert.notEqual(marked.commit, null);
  assert.equal(configOf(copied).host, "harness");
  assert.deepEqual(globalGit.changes(copied).all, []);
  assert.equal(
    code(() =>
      installer.install(at("bad-host"), { ...options, host: "vscode" })
    ),
    "USAGE"
  );
  assert.equal(existsSync(at("bad-host")), false);

  // The installed hooks reject a direct commit through the real launcher.
  write(path.join(fresh, "direct.txt"), "x");
  git.git.run(fresh, ["add", "direct.txt"]);
  const direct = git.git.run(fresh, ["commit", "-q", "-m", "direct"], {
    allowFailure: true,
  });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /MANAGED_COMMIT_REQUIRED/u);
  git.git.run(fresh, ["reset", "-q"]);
  rmSync(path.join(fresh, "direct.txt"));

  // Damage is detected and repaired by an update; an unchanged update commits nothing.
  const agents = path.join(fresh, "AGENTS.md");
  writeFileSync(
    agents,
    readFileSync(agents, "utf8").replace(
      "Never commit with",
      "Feel free to commit with"
    )
  );
  const damaged = installer.inspect(fresh);
  assert.deepEqual(
    [damaged.state, damaged.action, damaged.damaged],
    ["KIT_DAMAGED", "doctor", ["AGENTS.md"]]
  );
  const repaired = installer.install(fresh, { ...options, update: true });
  assert.deepEqual(repaired.written, ["AGENTS.md"]);
  assert.equal(repaired.commit, null);
  assert.equal(installer.inspect(fresh).state, "KIT_OK");

  // An older manifest version is outdated; the update commits with kit-update.
  const manifestFile = path.join(
    fresh,
    ".harness",
    "workflow",
    "manifest.json"
  );
  // An installation of Kit 2.1.0 has the older .gitignore section without
  // .DS_Store and the dependency folders (2.2.1), so its manifest is outdated
  // and the update brings the lines.
  const gitignoreFile = path.join(fresh, ".gitignore");
  const oldGitignore = readFileSync(gitignoreFile, "utf8").replace(
    /\.DS_Store\n# Dependency folders[^\n]*\nnode_modules\/\n\.venv\/\n__pycache__\/\n/u,
    ""
  );
  assert.ok(!oldGitignore.includes("node_modules/"));
  writeFileSync(gitignoreFile, oldGitignore);
  const gitignoreEntry = installer
    .payload({ bundle, hooksPath: null, projectName: "Fresh App" })
    .find((entry) => entry.path === ".gitignore");
  const oldManifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  oldManifest.version = "2.1.0";
  oldManifest.files.find((item) => item.path === ".gitignore").sha256 =
    createHash("sha256")
      .update(gitignoreEntry.read(oldGitignore))
      .digest("hex");
  writeFileSync(manifestFile, installer.renderManifest(oldManifest));
  const doctorOutdated = installer.doctor(fresh, { env });
  assert.deepEqual(
    doctorOutdated.checks
      .filter((item) => item.status === "fail")
      .map((item) => [item.id, item.fixable]),
    [["manifest", true]]
  );
  git.git.run(fresh, ["add", ".gitignore", ".harness/workflow/manifest.json"]);
  git.git.run(fresh, [
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "-q",
    "-m",
    "test: pretend an old kit",
  ]);
  assert.deepEqual(
    [
      installer.inspect(fresh).state,
      installer.inspect(fresh).action,
      installer.inspect(fresh).version,
    ],
    ["KIT_OUTDATED", "update", "2.1.0"]
  );
  const updated = installer.install(fresh, { ...options, update: true });
  assert.deepEqual(updated.written, [
    ".gitignore",
    ".harness/workflow/manifest.json",
  ]);
  assert.match(
    readFileSync(gitignoreFile, "utf8"),
    /\.claude\/worktrees\/\n\.DS_Store\n# Dependency folders[^\n]*\nnode_modules\/\n\.venv\/\n__pycache__\/\n# workflow-kit:end/u
  );
  assert.equal(
    git.history(fresh, null).at(-1).trailers["Workflow-Role"][0],
    "kit-update"
  );
  assert.equal(installer.inspect(fresh).state, "KIT_OK");
  // An older installation is outdated too (2.2.2 changed only the runtime,
  // 2.2.3 the provider hooks), and the update brings it.
  const currentManifest = readFileSync(manifestFile, "utf8");
  writeFileSync(
    manifestFile,
    installer.renderManifest({
      ...JSON.parse(currentManifest),
      version: "2.2.1",
    })
  );
  assert.deepEqual(
    [installer.inspect(fresh).state, installer.inspect(fresh).version],
    ["KIT_OUTDATED", "2.2.1"]
  );
  writeFileSync(manifestFile, currentManifest);
  assert.equal(installer.inspect(fresh).state, "KIT_OK");

  // Workflow Pilot projects and nested folders are refused.
  const pilot = at("pilot");
  write(path.join(pilot, ".harness", "kit-manifest.json"), "{}");
  assert.deepEqual(
    [installer.inspect(pilot).state, installer.inspect(pilot).action],
    ["PILOT_KIT", "unsupported"]
  );
  assert.equal(
    code(() => installer.install(pilot, options)),
    "PILOT_KIT_UNSUPPORTED"
  );
  mkdirSync(path.join(fresh, "nested"));
  assert.equal(
    installer.inspect(path.join(fresh, "nested")).action,
    "unsupported"
  );
  assert.equal(
    code(() => installer.install(path.join(fresh, "nested"), options)),
    "NESTED_REPOSITORY"
  );
  assert.equal(installer.inspect(at("empty-dir-missing")).state, "MISSING");
  mkdirSync(at("empty"));
  assert.deepEqual(
    [
      installer.inspect(at("empty")).state,
      installer.inspect(at("empty")).action,
    ],
    ["EMPTY", "install"]
  );
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
