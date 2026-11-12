import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "./workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform"],
  "workflow-platform-process"
);
const workspace = mkdtempSync(path.join(tmpdir(), "workflow-process-"));
try {
  const { WorkflowPlatformFacade, RUNTIME_FILE } = await build.load(
    "workflow-platform",
    "workflow-platform-facade.js"
  );
  const host = new WorkflowPlatformFacade();
  const windows = new WorkflowPlatformFacade("win32");

  // Direct execution without a shell: shell metacharacters stay literal.
  const echoed = host.run({
    args: ["-e", "process.stdout.write(process.argv[1])", "a & b | c"],
    executable: "node",
  });
  assert.equal(echoed.status, 0);
  assert.equal(echoed.stdout, "a & b | c");
  const missing = host.run({
    args: [],
    executable: "definitely-not-a-workflow-binary",
  });
  assert.equal(missing.status, null);
  assert.match(missing.errorMessage, /not found/u);
  const asyncResult = await host.runAsync({
    args: ["-e", "process.stdout.write('async')"],
    executable: "node",
  });
  assert.equal(asyncResult.stdout, "async");

  // Windows PATHEXT lookup and cmd.exe invocation for batch shims.
  const bin = path.join(workspace, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "npm.cmd"), "@echo off");
  const winEnv = { PATH: bin, PATHEXT: ".EXE;.CMD" };
  assert.equal(
    windows.findExecutable("npm", winEnv),
    path.join(bin, "npm.cmd")
  );
  const shim = windows.describeInvocation("C:/Tools/npm.cmd", ["run", "a b&c"]);
  assert.equal(shim.file, "cmd.exe");
  assert.equal(shim.windowsVerbatimArguments, true);
  assert.deepEqual(shim.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.match(shim.args[3], /\^\^\^"a\^\^\^ b\^\^\^&c\^\^\^"/u);
  const direct = windows.describeInvocation("C:/Tools/node.exe", ["-v"]);
  assert.deepEqual(direct, {
    args: ["-v"],
    file: "C:/Tools/node.exe",
    windowsVerbatimArguments: false,
  });

  // POSIX lookup requires the executable bit.
  writeFileSync(path.join(bin, "tool"), "#!/bin/sh\n");
  assert.equal(host.findExecutable("tool", { PATH: bin }), null);
  chmodSync(path.join(bin, "tool"), 0o755);
  if (process.platform !== "win32") {
    assert.equal(
      host.findExecutable("tool", { PATH: bin }),
      path.join(bin, "tool")
    );
  }

  // Runtime resolution order and the Node 22 minimum.
  const runtimeFile = path.join(workspace, ...RUNTIME_FILE.split("/"));
  mkdirSync(path.dirname(runtimeFile), { recursive: true });
  writeFileSync(
    runtimeFile,
    host.formatRuntimeFile("C:\\Apps\\Harness AI.exe", "electron")
  );
  assert.deepEqual(
    host.parseRuntimeFile("C:/Apps/Harness AI.exe\r\nelectron\r\n"),
    {
      executable: "C:/Apps/Harness AI.exe",
      mode: "electron",
    }
  );
  const seen = [];
  const versions = { env: "20.1.0", "runtime-file": "24.3.0" };
  const resolved = host.resolveRuntime(
    workspace,
    { HARNESS_WORKFLOW_NODE: "/old/node", PATH: "" },
    (candidate) => {
      seen.push(candidate.source);
      return versions[candidate.source] ?? null;
    }
  );
  assert.deepEqual(seen, ["env", "runtime-file"]);
  assert.deepEqual(resolved, {
    executable: "C:/Apps/Harness AI.exe",
    mode: "electron",
    source: "runtime-file",
    version: "24.3.0",
  });
  assert.equal(
    host.resolveRuntime(null, { PATH: "" }, () => null),
    null
  );
  assert.equal(
    host.runtimeEnvironment("electron", {}).ELECTRON_RUN_AS_NODE,
    "1"
  );
  assert.equal(
    "ELECTRON_RUN_AS_NODE" in
      host.runtimeEnvironment("node", { ELECTRON_RUN_AS_NODE: "1" }),
    false
  );
  const real = host.resolveRuntime(null);
  assert.ok(
    real && Number(real.version.split(".")[0]) >= 22,
    "current node is a valid runtime"
  );

  // Launchers point at the bundled kit and fail clearly without a runtime.
  const launchers = host.launchers();
  assert.match(launchers.posix, /^#!\/bin\/sh\n/u);
  assert.match(launchers.posix, /\.harness\/workflow\/runtime\/workflow\.mjs/u);
  assert.match(launchers.powershell, /ELECTRON_RUN_AS_NODE/u);
  assert.match(launchers.cmd, /\r\n/u);
  assert.match(launchers.cmd, /workflow\.ps1/u);
  if (process.platform !== "win32") {
    const project = path.join(workspace, "project");
    mkdirSync(path.join(project, "scripts"), { recursive: true });
    writeFileSync(path.join(project, "scripts", "workflow"), launchers.posix, {
      mode: 0o755,
    });
    mkdirSync(path.join(project, ".harness", "workflow", "runtime"), {
      recursive: true,
    });
    writeFileSync(
      path.join(project, ".harness", "workflow", "runtime", "workflow.mjs"),
      "process.stdout.write(JSON.stringify(process.argv.slice(2)))"
    );
    const launched = host.run({
      args: ["status", "--format", "json"],
      cwd: project,
      executable: path.join(project, "scripts", "workflow"),
    });
    assert.equal(launched.status, 0, launched.stderr);
    assert.deepEqual(JSON.parse(launched.stdout), [
      "status",
      "--format",
      "json",
    ]);
  }
  console.log("workflow-platform process tests passed");
} finally {
  rmSync(workspace, { force: true, recursive: true });
  await build.cleanup();
}
