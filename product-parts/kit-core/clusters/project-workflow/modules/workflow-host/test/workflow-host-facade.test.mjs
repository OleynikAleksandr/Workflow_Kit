import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import {
  cleanGitEnvironment,
  identityTemplate,
} from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(["workflow-host"], "workflow-host");
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-host-"));
try {
  const { WorkflowHostFacade } = await build.load(
    "workflow-host",
    "workflow-host-facade.js"
  );
  const node = { electron: false, execPath: process.execPath };

  // A fake bundle that echoes its arguments and environment as an envelope.
  const echo = path.join(sandbox, "echo", "workflow.mjs");
  mkdirSync(path.dirname(echo), { recursive: true });
  writeFileSync(
    echo,
    `const args = process.argv.slice(2);
if (args[0] === "fail") { process.stdout.write(JSON.stringify({ ok: false, code: "SCOPE_BLOCKED", message: "blocked", nextAction: "unblock", details: { a: 1 } })); process.exit(1); }
if (args[0] === "noise") { process.stderr.write("boom"); process.stdout.write("not json"); process.exit(2); }
if (args[0] === "sleep") { setTimeout(() => {}, 10000); }
else process.stdout.write(JSON.stringify({ command: args[0], ok: true, result: { args, cwd: process.cwd(), electron: process.env.ELECTRON_RUN_AS_NODE ?? null, gitDir: process.env.GIT_DIR ?? null } }));
`
  );

  // Bundle and runtime resolution.
  const project = path.join(sandbox, "project");
  mkdirSync(path.join(project, ".harness", "workflow", "runtime"), {
    recursive: true,
  });
  const installed = path.join(
    project,
    ".harness",
    "workflow",
    "runtime",
    "workflow.mjs"
  );
  writeFileSync(installed, readFileSync(echo, "utf8"));
  const byDirectory = new WorkflowHostFacade({
    current: node,
    env: { HARNESS_WORKFLOW_KIT_BUNDLE: path.dirname(echo) },
  });
  assert.deepEqual(byDirectory.bundle(null), { file: echo, source: "app" });
  assert.deepEqual(byDirectory.bundle(project), {
    file: installed,
    source: "project",
  });
  assert.deepEqual(byDirectory.bundle(project, true), {
    file: echo,
    source: "app",
  });
  assert.deepEqual(byDirectory.runtime(), {
    executable: process.execPath,
    mode: "node",
  });
  const byFile = new WorkflowHostFacade({
    current: node,
    env: {
      HARNESS_ELECTRON_NODE: "/apps/Harness",
      HARNESS_WORKFLOW_KIT_BUNDLE: echo,
    },
  });
  assert.equal(byFile.bundle(sandbox)?.file, echo);
  assert.deepEqual(byFile.runtime(), {
    executable: "/apps/Harness",
    mode: "electron",
  });
  const missing = new WorkflowHostFacade({
    current: node,
    env: { HARNESS_WORKFLOW_KIT_BUNDLE: path.join(sandbox, "none") },
  });
  assert.equal(missing.bundle(sandbox), null);
  const noBundle = await missing.status(sandbox);
  assert.equal(noBundle.ok, false);
  assert.equal(noBundle.code, "HOST_NO_BUNDLE");

  // Command protocol: arguments, environment, envelopes and failures.
  const host = new WorkflowHostFacade({
    current: { electron: true, execPath: process.execPath },
    env: {
      ...process.env,
      GIT_DIR: "/elsewhere/.git",
      HARNESS_WORKFLOW_KIT_BUNDLE: echo,
    },
    // Room for a slow node start (a loaded machine, Windows CI); the timeout case below sets
    // its own short limit.
    timeoutMs: 30_000,
  });
  const echoed = await host.status(sandbox);
  assert.equal(echoed.ok, true);
  assert.deepEqual(echoed.result.args, [
    "status",
    "--root",
    sandbox,
    "--format",
    "json",
  ]);
  assert.equal(echoed.result.electron, "1");
  assert.equal(echoed.result.gitDir, null);
  // The mode card reads the proposal and records the choice.
  const proposalArgs = await host.proposal(sandbox);
  assert.deepEqual(proposalArgs.result.args.slice(0, 3), [
    "scope:proposal",
    "--root",
    sandbox,
  ]);
  const choiceArgs = await host.chooseScope(sandbox, {
    generation: 2,
    note: "User chose: sequential",
    option: "sequential",
    session: "session-1",
  });
  assert.deepEqual(choiceArgs.result.args.slice(0, 9), [
    "scope:choose",
    "--generation",
    "2",
    "--option",
    "sequential",
    "--session",
    "session-1",
    "--note",
    "User chose: sequential",
  ]);
  // identity:set needs no project: the application bundle in the home folder.
  const identityArgs = await host.setIdentity({
    email: "--real@harness-ai.test",
    name: "Real Person",
  });
  assert.deepEqual(identityArgs.result.args, [
    "identity:set",
    "--name=Real Person",
    "--email=--real@harness-ai.test",
    "--global",
    "--format",
    "json",
  ]);
  assert.equal(realpathSync(identityArgs.result.cwd), realpathSync(homedir()));
  const failed = await host.run(["fail"]);
  assert.deepEqual(failed, {
    code: "SCOPE_BLOCKED",
    details: { a: 1 },
    message: "blocked",
    nextAction: "unblock",
    ok: false,
  });
  const noise = await host.run(["noise"]);
  assert.equal(noise.code, "HOST_OUTPUT");
  assert.equal(noise.details.stderr, "boom");
  const slow = await host.run(["sleep"], { timeoutMs: 400 });
  assert.equal(slow.code, "HOST_TIMEOUT");
  const broken = new WorkflowHostFacade({
    env: {
      HARNESS_ELECTRON_NODE: path.join(sandbox, "no-runtime"),
      HARNESS_WORKFLOW_KIT_BUNDLE: echo,
    },
  });
  assert.equal((await broken.run(["status"])).code, "HOST_SPAWN");
  const fresh = path.join(sandbox, "not", "yet");
  const inspected = await host.inspect(fresh);
  assert.deepEqual(inspected.result.args.slice(0, 2), ["inspect", fresh]);
  assert.equal(realpathSync(inspected.result.cwd), realpathSync(sandbox));

  // End to end with the real bundle: inspect, install, status, doctor and
  // the runtime file.
  // The real single-file bundle, because install copies the running file.
  const bundle = path.join(sandbox, "kit", "workflow.mjs");
  // Workflow Kit builds the bundle with esbuild (tools/kit-build), not with vite as Harness AI.
  await esbuild({
    bundle: true,
    entryPoints: [
      fileURLToPath(
        new URL("../../workflow-kit/src/workflow-kit-cli.ts", import.meta.url)
      ),
    ],
    format: "esm",
    logLevel: "silent",
    outfile: bundle,
    platform: "node",
  });
  const identity = path.join(sandbox, "gitconfig");
  writeFileSync(
    identity,
    "[user]\n\tname = Workflow Test\n\temail = workflow@harness-ai.test\n"
  );
  const kitHost = new WorkflowHostFacade({
    current: node,
    env: {
      ...cleanGitEnvironment(),
      GIT_CONFIG_GLOBAL: identity,
      GIT_TEMPLATE_DIR: identityTemplate(sandbox),
      HARNESS_WORKFLOW_KIT_BUNDLE: bundle,
    },
  });
  // The parent folder exists: the New Project dialog picks it.
  const target = path.join(sandbox, "demo");
  const before = await kitHost.inspect(target);
  assert.equal(before.ok, true, JSON.stringify(before));
  const install = await kitHost.install(target, {
    host: "harness",
    name: "Demo",
  });
  assert.equal(install.ok, true, JSON.stringify(install));
  assert.ok(install.result.commit);
  // `--host harness` marks the project as hosted by Harness.
  assert.equal(
    JSON.parse(
      readFileSync(
        path.join(target, ".harness", "workflow", "config.json"),
        "utf8"
      )
    ).host,
    "harness"
  );
  assert.equal(kitHost.bundle(target)?.source, "project");
  const status = await kitHost.status(target);
  assert.equal(status.ok, true, JSON.stringify(status));
  assert.equal(status.result.installed, true);
  // A fresh project has no scope proposal; the view carries no plan input.
  const noProposal = await kitHost.proposal(target);
  assert.equal(noProposal.ok, true, JSON.stringify(noProposal));
  assert.equal(noProposal.result, null);
  const doctor = await kitHost.doctor(target);
  assert.equal(doctor.ok, true, JSON.stringify(doctor));
  assert.equal(doctor.result.ok, true, JSON.stringify(doctor.result));
  // identity:set validates in the Kit and writes the global config
  // (GIT_CONFIG_GLOBAL of the test, never the real one).
  const quoted = await kitHost.setIdentity({
    email: "\u201Creal@harness-ai.test\u201D",
    name: "Real Person",
  });
  assert.equal(quoted.ok, false);
  assert.equal(quoted.code, "GIT_IDENTITY_INVALID");
  assert.equal(quoted.details.field, "email");
  const saved = await kitHost.setIdentity({
    email: "real@harness-ai.test",
    name: "Real Person",
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.deepEqual(saved.result, {
    email: "real@harness-ai.test",
    name: "Real Person",
    scope: "global",
  });
  assert.match(
    readFileSync(identity, "utf8"),
    /email = real@harness-ai\.test/u
  );
  const notInstalled = await kitHost.validate(sandbox);
  assert.equal(notInstalled.ok, true);
  assert.equal(notInstalled.result.ok, false);

  const electronHost = new WorkflowHostFacade({
    current: node,
    env: {
      HARNESS_ELECTRON_NODE: "/Applications/Harness AI.app/MacOS/Harness AI",
    },
  });
  assert.equal(electronHost.writeRuntimeFile(sandbox), false);
  assert.equal(electronHost.writeRuntimeFile(target), true);
  assert.equal(
    readFileSync(
      path.join(target, ".harness", "workflow", "local", "runtime"),
      "utf8"
    ),
    "/Applications/Harness AI.app/MacOS/Harness AI\nelectron\n"
  );
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
