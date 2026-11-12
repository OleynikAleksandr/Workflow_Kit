import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-installer"],
  "workflow-installer-payload"
);
try {
  const { WorkflowInstallerFacade } = await build.load(
    "workflow-installer",
    "workflow-installer-facade.js"
  );
  const installer = new WorkflowInstallerFacade();
  const entries = installer.payload({
    bundle: "// bundle\n",
    hooksPath: null,
    projectName: "Demo",
  });
  const byPath = Object.fromEntries(
    entries.map((entry) => [entry.path, entry])
  );
  assert.equal(installer.version, "2.2.3");
  assert.deepEqual(Object.keys(byPath), [
    ".harness/workflow/runtime/workflow.mjs",
    "scripts/workflow",
    "scripts/workflow.cmd",
    "scripts/workflow.ps1",
    ".harness/workflow/hooks/pre-commit",
    ".harness/workflow/hooks/commit-msg",
    ".harness/workflow/hooks/post-commit",
    ".harness/workflow/hooks/pre-push",
    "AGENTS.md",
    "CLAUDE.md",
    ".codex/hooks.json",
    ".claude/settings.json",
    ".gitignore",
    ".gitattributes",
    "README.md",
    "docs/architecture/OVERVIEW.md",
  ]);

  // Every managed part reads back exactly after rendering, from any start.
  for (const entry of entries.filter((item) => item.kind !== "create")) {
    for (const start of [null, "# Existing\n\nuser text\n"]) {
      if (entry.kind === "json" && start !== null) {
        continue;
      }
      const once = entry.render(start);
      assert.equal(
        entry.read(once),
        entry.managed,
        `${entry.path} from ${start}`
      );
      assert.equal(entry.render(once), once, `${entry.path} is idempotent`);
    }
  }

  // Sections keep the user's text byte for byte, CRLF included.
  const agents = byPath["AGENTS.md"];
  const user = "# Project rules\r\n\r\nKeep this.\r\n";
  const merged = agents.render(user);
  assert.ok(merged.startsWith(user));
  assert.match(
    merged,
    /<!-- workflow-kit:begin -->\r\n## Workflow Kit \(managed section/u
  );
  assert.equal(
    agents.render(merged.replace("Never commit with", "Always commit with")),
    merged
  );
  assert.match(
    installer.agentRules(),
    /Never commit with `git commit` directly and never use `--no-verify`/u
  );

  // The execution modes block: four roles, helpers in sequential, identity.
  const rules = installer.agentRules();
  const modes = rules.slice(
    rules.indexOf("### Execution modes"),
    rules.indexOf("### One task, one commit, one turn")
  );
  assert.ok(modes.length > 0, "the Execution modes block exists");
  assert.ok(Buffer.byteLength(modes, "utf8") < 1800, "the block stays compact");
  for (const pattern of [
    /\*\*planning\*\* \(no scope, Harness project\).*parallelSafe.*\n.*scope:propose --input <file\.json> --recommended <mode> --reason "<why>"`\n {2}and end the turn; the user chooses the mode on the card\./su,
    /\*\*self\*\* \(`sequential`\): run the tasks in order in main\. Helper subagents\n {2}may help, but they work in main without their own worktree and never commit\./u,
    /\*\*orchestrator\*\* \(`orchestrated`, main\): `assignment:next`,\n {2}`assignment:create --task <ID>`, a Claude subagent \(Agent tool with\n {2}`isolation: "worktree"`\)/u,
    /`integration:start --id <id> --source <sha>`/u,
    /`integration:continue --id <id>`/u,
    /never implement work or DOCS tasks in main/u,
    /\*\*executor\*\* \(assignment worktree\): `assignment:attach <id>`, then\n {2}`task:start`, work only within the task files, `commit --task`, reply\n {2}with the SHA\. Never touch main, the plan or other tasks; no nested\n {2}executors, no push\./u,
    /Never set the git identity \(`git config user\.\*`\)\. If a command refuses\n {2}with `GIT_IDENTITY_REQUIRED`, report it to the user with the command it\n {2}prints\./u,
  ]) {
    assert.match(modes, pattern);
  }
  // The inputs and documents block: schema, context, files never to read.
  const inputs = rules.slice(
    rules.indexOf("### Inputs and documents"),
    rules.indexOf("### When a plan is needed")
  );
  assert.ok(inputs.length > 0, "the Inputs and documents block exists");
  for (const pattern of [
    /Before writing a `--input` JSON, run `scripts\/workflow schema <command>`/u,
    /`scripts\/workflow context <path>\[#Heading\]` \(one call,\n {2}marked text\) instead of reading large files piecewise/u,
    /`context --list` prints the documents map/u,
    /Never read Kit runtime files \(`\.harness\/workflow\/runtime\/\*\*`, the bundle\),\n {2}generated code, logs or transcripts: the Kit gives what is needed from them\./u,
  ]) {
    assert.match(inputs, pattern);
  }
  assert.match(
    rules,
    /In a Harness project \(`"host": "harness"`\) propose\n {2}the scope instead \(see Execution modes\)\./u
  );

  // CLAUDE.md gets the import line once.
  const claude = byPath["CLAUDE.md"];
  assert.equal(claude.render(null), "@AGENTS.md\n");
  assert.equal(claude.render("# Notes"), "# Notes\n\n@AGENTS.md\n");
  assert.equal(claude.render("@AGENTS.md\n# Notes\n"), "@AGENTS.md\n# Notes\n");

  // Provider settings keep foreign hooks and settings; the Kit entry is unique.
  const settings = byPath[".claude/settings.json"];
  const foreign = JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [{ command: "echo hi", type: "command" }] }],
      Stop: [],
    },
    model: "x",
  });
  const withKit = JSON.parse(settings.render(settings.render(foreign)));
  assert.equal(withKit.model, "x");
  assert.deepEqual(withKit.hooks.Stop, []);
  // Claude: the foreign group, then six Kit groups, one per packet part.
  assert.equal(withKit.hooks.SessionStart.length, 7);
  assert.equal(withKit.hooks.SessionStart[0].hooks[0].command, "echo hi");
  assert.deepEqual(
    withKit.hooks.SessionStart.slice(1).map((group) => group.hooks[0].command),
    [1, 2, 3, 4, 5, 6].map(
      (k) =>
        `"$CLAUDE_PROJECT_DIR/scripts/workflow" hook session-start --client claude --part ${k}/6`
    )
  );
  // A 2.2.2 entry (one group without --part) is replaced, the foreign one stays.
  const old = JSON.stringify({
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              command:
                '"$CLAUDE_PROJECT_DIR/scripts/workflow" hook session-start --client claude',
              type: "command",
            },
          ],
        },
        { hooks: [{ command: "echo hi", type: "command" }] },
      ],
    },
  });
  const migrated = JSON.parse(settings.render(old)).hooks.SessionStart;
  assert.equal(migrated.length, 7);
  assert.equal(migrated[0].hooks[0].command, "echo hi");
  assert.equal(settings.read(old) === settings.managed, false, "2.2.2 differs");
  assert.equal(settings.read(settings.render(old)), settings.managed);
  // A changed part shows as a difference too.
  const edited = settings.render(old).replace("--part 4/6", "--part 4/7");
  assert.notEqual(settings.read(edited), settings.managed);
  // Codex: one entry that takes the whole packet with a raised limit.
  const codex = byPath[".codex/hooks.json"];
  assert.deepEqual(JSON.parse(codex.render(null)).hooks.SessionStart, [
    {
      hooks: [
        {
          additionalContextLimit: 65_536,
          command: "scripts/workflow hook session-start --client codex",
          type: "command",
        },
      ],
    },
  ]);
  assert.equal(codex.read(codex.render(null)), codex.managed);
  assert.throws(() => settings.render("[1]"), { code: "MANAGED_JSON" });

  // Git hooks: own directory, or sections in an existing hooks path.
  assert.match(
    byPath[".harness/workflow/hooks/pre-commit"].render(null),
    /^#!\/bin\/sh\n# Managed by Harness Workflow Kit\. Do not edit\.\n# workflow-kit:begin\n"\$\(git rev-parse --show-toplevel\)\/scripts\/workflow" git-hook pre-commit "\$@" \|\| exit \$\?\n# workflow-kit:end\n$/u
  );
  assert.equal(byPath[".harness/workflow/hooks/pre-push"].executable, true);
  const husky = Object.fromEntries(
    installer
      .payload({ bundle: "", hooksPath: ".husky", projectName: "Demo" })
      .map((entry) => [entry.path, entry])
  );
  const huskyHook = husky[".husky/pre-commit"];
  assert.equal(huskyHook.kind, "section");
  assert.equal(huskyHook.executable, true);
  assert.equal(
    huskyHook.render("#!/usr/bin/env sh\nnpm test\n"),
    '#!/usr/bin/env sh\n# workflow-kit:begin\n"$(git rev-parse --show-toplevel)/scripts/workflow" git-hook pre-commit "$@" || exit $?\n# workflow-kit:end\nnpm test\n'
  );
  assert.match(huskyHook.render(null), /^#!\/bin\/sh\n# workflow-kit:begin\n/u);

  // Created files are never overwritten; gitignore and gitattributes sections.
  assert.equal(byPath["README.md"].render("mine"), "mine");
  assert.match(byPath["README.md"].render(null), /^# Demo\n/u);
  assert.match(
    byPath[".gitignore"].render("node_modules/\n"),
    /^node_modules\/\n\n# workflow-kit:begin\n# Workflow Kit local state\n\.harness\/workflow\/local\//u
  );
  // Session history, Claude worktrees, macOS .DS_Store and dependency folders
  // stay out of the repository.
  assert.deepEqual(
    byPath[".gitignore"].read(byPath[".gitignore"].render(null)).split("\n"),
    [
      "# workflow-kit:begin",
      "# Workflow Kit local state",
      ".harness/workflow/local/",
      ".harness/runtime/",
      ".harness/sessions/",
      ".claude/worktrees/",
      ".DS_Store",
      "# Dependency folders: installed by quality:apply, never committed",
      "node_modules/",
      ".venv/",
      "__pycache__/",
      "# workflow-kit:end",
      "",
    ]
  );
  assert.match(
    byPath[".gitattributes"].render(null),
    /scripts\/workflow\.cmd text eol=crlf/u
  );

  // The manifest records kinds and hashes of the managed parts.
  const manifest = installer.manifest(entries);
  const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
  assert.equal(manifest.schema, "harness-workflow-manifest/1");
  assert.equal(
    manifest.files.find((file) => file.path === "scripts/workflow").sha256,
    sha(byPath["scripts/workflow"].managed)
  );
  assert.equal(
    manifest.files.find((file) => file.path === "README.md").sha256,
    null
  );
  assert.equal(JSON.parse(installer.renderManifest(manifest)).version, "2.2.3");
} finally {
  await build.cleanup();
}
