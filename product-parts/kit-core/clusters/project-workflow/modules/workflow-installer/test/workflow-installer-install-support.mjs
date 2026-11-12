import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  cleanGitEnvironment,
  identityTemplate,
} from "../../workflow-git/test/workflow-git-test-repo.mjs";

// Test support for workflow-installer-install.test.mjs and
// workflow-installer-existing.test.mjs: the compiled facades (and their
// classes) with a real global identity, the stand-in bundle the installed
// launcher runs, the install options and small helpers.

export async function openInstallSandbox(build, sandbox) {
  const at = (...parts) => path.join(sandbox, ...parts);
  const write = (target, text) => {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowInstallerFacade } = await build.load(
    "workflow-installer",
    "workflow-installer-facade.js"
  );
  const { WorkflowKitFacade } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const identity = at("gitconfig");
  writeFileSync(
    identity,
    "[user]\n\tname = Workflow Test\n\temail = workflow@harness-ai.test\n"
  );
  writeFileSync(at("empty-gitconfig"), "");
  const env = {
    ...cleanGitEnvironment(),
    GIT_CONFIG_GLOBAL: identity,
    GIT_TEMPLATE_DIR: identityTemplate(sandbox),
  };
  const git = new WorkflowGitFacade(undefined, env);
  const installer = new WorkflowInstallerFacade(git);
  const kit = new WorkflowKitFacade({ env, git });
  // The installed launcher runs this stand-in bundle, which drives the compiled CLI.
  const bundle = `import { readFileSync } from "node:fs";
import { runCli } from ${JSON.stringify(pathToFileURL(path.join(build.directory, "workflow-kit", "src", "workflow-kit-cli.js")).href)};
process.exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  readStdin: () => { try { return readFileSync(0, "utf8"); } catch { return ""; } },
  stderr: (text) => process.stderr.write(text),
  stdout: (text) => process.stdout.write(text),
});
`;
  const options = {
    bundle,
    runtime: { executable: process.execPath, mode: "node" },
  };
  const code = (action) => {
    try {
      action();
    } catch (error) {
      return error.code;
    }
    return "OK";
  };

  return {
    at,
    bundle,
    code,
    env,
    git,
    installer,
    kit,
    options,
    WorkflowGitFacade,
    WorkflowInstallerFacade,
    write,
  };
}
