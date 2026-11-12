import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";

// Test support for the workflow-kit tests: the compiled Kit with a clean git
// environment and a deterministic clock, temporary projects with a bootstrap
// commit, the command line with captured output, and shared plan fixtures.

export const PLAN = ".harness/plans/todo-plan.md";

/** Runs `action`; returns the error it throws, or null. */
export const failure = (action) => {
  try {
    action();
  } catch (error) {
    return error;
  }
  return null;
};

/** The code of the error `action` throws, or "OK". */
export const code = (action) => failure(action)?.code ?? "OK";

export const write = (root, name, text) => {
  const file = path.join(root, ...name.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

export const local = (root, ...parts) =>
  path.join(root, ".harness", "workflow", "local", ...parts);

/** A work task `<id>` with its own source file. */
export const work = (id, fields = {}) => ({
  acceptance: [`${id} works`],
  commitMessage: `feat: add ${id}`,
  files: [`src/${id.toLowerCase()}.ts`],
  id,
  title: `Module ${id}`,
  why: `The product needs ${id}`,
  ...fields,
});

/** The docs-only scope `<id>` with one note task. */
export const docsScope = (id) => ({
  acceptance: ["The note exists"],
  approval: "User approved the docs-only scope",
  id,
  objective: "Write one note",
  tasks: [
    {
      acceptance: ["note written"],
      commitMessage: "docs: write the note",
      files: ["docs/note.md"],
      id: "N",
      title: "Note",
    },
  ],
});

/** Two parallel-safe modules A and B with the specification `docs/spec.md`. */
export const parallelScope = (id, execution) => ({
  acceptance: ["Both modules exist"],
  approval: "User approved the parallel scope",
  ...(execution ? { execution } : {}),
  id,
  objective: "Build two independent modules",
  spec: "docs/spec.md",
  tasks: [
    {
      acceptance: ["a works"],
      commitMessage: "feat: add module a",
      files: ["src/a.ts"],
      id: "A",
      parallelSafe: true,
      title: "Module A",
    },
    {
      acceptance: ["b works"],
      commitMessage: "feat: add module b",
      files: ["src/b.ts"],
      id: "B",
      parallelSafe: true,
      title: "Module B",
    },
  ],
});

/** The `quality:apply` input: one required commit check that passes. */
export const lintProfile = () => ({
  checks: [
    {
      command: { args: ["-e", "process.exit(0)"], executable: "node" },
      id: "lint",
      required: true,
      role: "lint",
      stage: "commit",
    },
  ],
  stacks: ["node"],
});

/**
 * Loads the compiled Kit of `build`. Timestamps are
 * `2026-11-04T<clock>:<tick>Z`; `project(host?)` creates a temporary project
 * (folder prefix `prefix`, pushed to `roots`) with its bootstrap commit.
 */
export async function openKit(
  build,
  { clock, prefix = "workflow-kit-", roots = [] }
) {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const { WorkflowQualityFacade } = await build.load(
    "workflow-quality",
    "workflow-quality-facade.js"
  );
  const { GIT_HOOKS, WorkflowKitFacade } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const { runCli } = await build.load("workflow-kit", "workflow-kit-cli.js");
  const env = cleanGitEnvironment();
  const git = new WorkflowGitFacade(undefined, env);
  const plans = new WorkflowPlanFacade();
  const quality = new WorkflowQualityFacade();
  let tick = 0;
  const kit = new WorkflowKitFacade({
    env,
    git,
    now: () => `2026-11-04T${clock}:${String(tick++).padStart(2, "0")}Z`,
  });
  /** Git repository, local identity and the bootstrap commit in `root`. */
  const bootstrap = (root, host = null) => {
    git.init(root);
    git.setConfig(root, "user.name", "Workflow Test");
    git.setConfig(root, "user.email", "workflow@harness-ai.test");
    writeFileSync(
      path.join(root, ".gitignore"),
      ".harness/workflow/local/\n.harness/runtime/\n"
    );
    const files = [".gitignore"];
    if (host) {
      quality.writeConfig(root, { ...quality.defaultConfig(), host });
      files.push(".harness/workflow/config.json");
    }
    git.transactions.commit(root, {
      files,
      message: "chore: bootstrap",
      planPath: PLAN,
      planText: plans.render(plans.createEmpty("demo", "Demo")),
      role: "bootstrap",
      scopeId: null,
      taskId: null,
    });
    return root;
  };
  const project = (host = null) => {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    roots.push(root);
    return bootstrap(root, host);
  };
  /** Runs the command line in `cwd`; returns `{exit, stderr, stdout}`. */
  const cli = (cwd, argv) => {
    const out = { stderr: "", stdout: "" };
    const exit = runCli(
      argv,
      {
        cwd,
        env,
        readStdin: () => "",
        stderr: (text) => {
          out.stderr += text;
        },
        stdout: (text) => {
          out.stdout += text;
        },
      },
      kit
    );
    return { ...out, exit };
  };
  /**
   * Real hooks in `folder` that run the compiled Kit; `core.hooksPath` lives
   * in the shared repository config, so worktrees use them too.
   */
  const installHooks = (root, folder) => {
    const runner = path.join(build.directory, "hook-runner.mjs");
    writeFileSync(
      runner,
      `import { WorkflowKitFacade } from ${JSON.stringify(pathToFileURL(path.join(build.directory, "workflow-kit", "src", "workflow-kit-facade.js")).href)};
const [name, ...args] = process.argv.slice(2);
const result = new WorkflowKitFacade().gitHook(process.cwd(), name, args);
if (result.message) process.stderr.write(result.message + "\\n");
process.exit(result.exitCode);
`
    );
    mkdirSync(folder);
    for (const name of GIT_HOOKS) {
      writeFileSync(
        path.join(folder, name),
        `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(runner)} ${name} "$@"\n`
      );
      chmodSync(path.join(folder, name), 0o755);
    }
    git.setConfig(root, "core.hooksPath", folder);
  };
  /** Proposes `input` as orchestrated and the user chooses it (session-1). */
  const orchestrate = (root, input) => {
    kit.proposeScope(
      root,
      input,
      "orchestrated",
      "Independent modules with separate files"
    );
    kit.chooseScope(root, {
      generation: 1,
      note: "User clicked orchestrated",
      option: "orchestrated",
      session: "session-1",
    });
  };
  return {
    bootstrap,
    cli,
    env,
    git,
    installHooks,
    kit,
    orchestrate,
    plans,
    project,
    quality,
    runCli,
  };
}
