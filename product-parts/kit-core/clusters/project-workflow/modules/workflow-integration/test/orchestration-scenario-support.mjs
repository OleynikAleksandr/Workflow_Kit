import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";

// Test support for orchestration-scenario.test.mjs: the compiled Kit, its
// command line as an agent calls it, and git views of the scenario project.

/** Splits "a --b c" into words and appends the verbatim extra arguments. */
const words = (command, extra) => [...command.split(" "), ...extra];

export async function openScenario(build, sandbox) {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const { WorkflowKitFacade } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const { runCli } = await build.load("workflow-kit", "workflow-kit-cli.js");
  // No global identity: the project signs with its real local identity only.
  const emptyGlobal = path.join(sandbox, "empty-gitconfig");
  writeFileSync(emptyGlobal, "");
  // The Kit finds the root and the runtime itself, as in a fresh shell.
  const {
    HARNESS_WORKFLOW_NODE: _node,
    HARNESS_WORKFLOW_ROOT: _root,
    ...base
  } = cleanGitEnvironment();
  const env = { ...base, GIT_CONFIG_GLOBAL: emptyGlobal };
  const git = new WorkflowGitFacade(undefined, env);
  const plans = new WorkflowPlanFacade();
  let tick = 0;
  const kit = new WorkflowKitFacade({
    env,
    git,
    now: () =>
      `2026-11-04T13:${String(Math.floor(tick / 60)).padStart(2, "0")}:${String(tick++ % 60).padStart(2, "0")}Z`,
  });
  const root = path.join(sandbox, "project");

  const cli = (cwd, argv) => {
    const out = { stderr: "", stdout: "" };
    const exit = runCli(
      argv,
      {
        cwd,
        env,
        readStdin: () => "",
        stderr: (chunk) => {
          out.stderr += chunk;
        },
        stdout: (chunk) => {
          out.stdout += chunk;
        },
      },
      kit
    );
    return { ...out, exit };
  };
  /** A command that must succeed; returns its JSON result. */
  const ok = (cwd, command, ...extra) => {
    const out = cli(cwd, words(command, extra));
    assert.equal(out.exit, 0, `${command}: ${out.stdout}${out.stderr}`);
    return JSON.parse(out.stdout).result;
  };
  /** A command that must fail; returns the JSON error envelope. */
  const refused = (cwd, command, ...extra) => {
    const out = cli(cwd, words(command, extra));
    assert.equal(out.exit, 1, `${command} should fail: ${out.stdout}`);
    const envelope = JSON.parse(out.stdout);
    assert.equal(envelope.ok, false);
    return envelope;
  };
  /** A command that must succeed; returns its `--format text` answer. */
  const text = (cwd, command, ...extra) => {
    const out = cli(cwd, [...words(command, extra), "--format", "text"]);
    assert.equal(out.exit, 0, `${command}: ${out.stderr}`);
    return out.stdout;
  };
  const write = (folder, name, content) => {
    const file = path.join(folder, ...name.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  /** An input file outside the project, so main stays clean. */
  const input = (name, value) => {
    const file = path.join(sandbox, "inputs", name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
    return file;
  };
  /** The stand-in bundle the installed launcher runs: the compiled CLI. */
  const bundle = () => {
    const file = path.join(sandbox, "workflow.mjs");
    const entry = path.join(
      build.directory,
      "workflow-kit",
      "src",
      "workflow-kit-cli.js"
    );
    writeFileSync(
      file,
      `import { readFileSync } from "node:fs";
import { runCli } from ${JSON.stringify(pathToFileURL(entry).href)};
process.exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  readStdin: () => { try { return readFileSync(0, "utf8"); } catch { return ""; } },
  stderr: (text) => process.stderr.write(text),
  stdout: (text) => process.stdout.write(text),
});
`
    );
    return file;
  };
  const local = (...parts) =>
    path.join(root, ".harness", "workflow", "local", ...parts);
  const lines = (args) => git.git.text(root, args).split("\n").filter(Boolean);

  return {
    bundle,
    cli,
    git,
    input,
    local,
    ok,
    plans,
    recover: (cwd) => text(cwd, "recover"),
    refused,
    root,
    text,
    write,
    branches: () => lines(["branch", "--format=%(refname:short)"]),
    /** The worktree Claude creates for a subagent with isolation: "worktree". */
    claudeWorktree: (name, branch = null) => {
      const folder = path.join(root, ".claude", "worktrees", name);
      const at = branch ? ["-b", branch] : ["--detach"];
      git.git.run(root, ["worktree", "add", "-q", ...at, folder, "HEAD"]);
      return folder;
    },
    merges: () => lines(["rev-list", "--first-parent", "--merges", "HEAD"]),
    parents: (sha) =>
      git.git
        .text(root, ["rev-list", "--parents", "-n", "1", sha])
        .split(" ")
        .slice(1),
    record: (id) =>
      JSON.parse(readFileSync(local("assignments", `${id}.json`), "utf8")),
    task: (id) => plans.read(root).tasks.find((item) => item.id === id),
    worktrees: () =>
      lines(["worktree", "list", "--porcelain"])
        .filter((line) => line.startsWith("worktree "))
        .map((line) => line.slice("worktree ".length)),
  };
}
