import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { openInstallSandbox } from "./workflow-installer-install-support.mjs";

// install --update --with (Kit 2.2.7, spec M38 section 2.1): the files of the
// app's managed structure (.workflow-kit/manifest.json and the paths it lists)
// go into the kit-update commit; other paths are refused before any write.
const build = await buildWorkflowModules(
  ["workflow-kit", "workflow-installer"],
  "workflow-installer-with"
);
const sandbox = mkdtempSync(path.join(tmpdir(), "workflow-install-with-"));
try {
  const setup = await openInstallSandbox(build, sandbox);
  const { at, code, git, installer, options, write } = setup;
  const MANIFEST = ".workflow-kit/manifest.json";
  const TEMPLATE = ".workflow-kit/templates/module.md";
  const structure = (version) =>
    `${JSON.stringify(
      {
        fragments: {
          "claude-hook": {
            path: ".claude/settings.json",
            sha256: "0",
            version,
          },
          "template-module": { path: TEMPLATE, sha256: "0", version },
        },
        kit: "workflow-kit",
        version,
      },
      null,
      2
    )}\n`;
  // A plain commit that bypasses the project hooks, as an older app would have left it.
  const pretend = (root, files, message) => {
    git.git.run(root, ["add", ...files]);
    git.git.run(root, [
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-q",
      "-m",
      message,
    ]);
  };
  const head = (root) => git.history(root, null).at(-1);

  const project = at("project");
  installer.install(project, { ...options, name: "With App" });
  write(path.join(project, MANIFEST), structure(3));
  write(path.join(project, TEMPLATE), "# Module v3\n");
  pretend(project, [MANIFEST, TEMPLATE], "test: structure 3");
  assert.equal(installer.inspect(project).state, "KIT_OK");

  // Refusals come before any write: --with without --update, a path the
  // manifest does not list, a path outside the project.
  write(path.join(project, TEMPLATE), "# Module v4\n");
  const before = head(project).sha;
  assert.equal(
    code(() => installer.install(project, { ...options, with: [TEMPLATE] })),
    "USAGE"
  );
  for (const item of ["src/app.ts", "../outside.md", "AGENTS.md"]) {
    assert.equal(
      code(() =>
        installer.install(project, {
          ...options,
          update: true,
          with: [TEMPLATE, item],
        })
      ),
      "WITH_NOT_MANAGED",
      item
    );
  }
  assert.equal(head(project).sha, before);
  assert.deepEqual(git.changes(project).all, [TEMPLATE]);

  // Only the structure changed: one kit-update commit with its own message.
  write(path.join(project, MANIFEST), structure(4));
  write(path.join(project, "notes.txt"), "mine\n");
  const onlyStructure = installer.install(project, {
    ...options,
    update: true,
    with: [`./${TEMPLATE}`, MANIFEST, ".claude/settings.json"],
  });
  assert.deepEqual(onlyStructure.written, []);
  assert.deepEqual(onlyStructure.with, [MANIFEST, TEMPLATE]);
  assert.deepEqual(onlyStructure.excluded, ["notes.txt"]);
  const structureCommit = head(project);
  assert.equal(structureCommit.subject, "chore: update the Workflow Kit structure");
  assert.equal(structureCommit.trailers["Workflow-Role"][0], "kit-update");
  assert.deepEqual(git.changes(project).all, ["notes.txt"]);

  // Nothing to commit: unchanged --with paths drop out, no commit.
  const unchanged = installer.install(project, {
    ...options,
    update: true,
    with: [MANIFEST],
  });
  assert.equal(unchanged.commit, null);
  assert.deepEqual(unchanged.with, []);
  assert.equal(head(project).sha, structureCommit.sha);

  // The Kit and the structure changed: one commit with the Kit's message.
  const gitignore = path.join(project, ".gitignore");
  const fullGitignore = readFileSync(gitignore, "utf8");
  writeFileSync(gitignore, fullGitignore.replace(".DS_Store\n", ""));
  pretend(project, [".gitignore"], "test: older Kit file");
  write(path.join(project, TEMPLATE), "# Module v5\n");
  const both = installer.install(project, {
    ...options,
    update: true,
    with: [TEMPLATE],
  });
  assert.deepEqual(both.written, [".gitignore"]);
  assert.deepEqual(both.with, [TEMPLATE]);
  const bothCommit = head(project);
  assert.equal(
    bothCommit.subject,
    `chore: update workflow kit to ${installer.version}`
  );
  assert.deepEqual(
    git.git
      .text(project, ["show", "--name-only", "--format=", bothCommit.sha])
      .trim()
      .split("\n")
      .sort(),
    [".gitignore", TEMPLATE]
  );
  assert.equal(readFileSync(gitignore, "utf8"), fullGitignore);
  assert.deepEqual(git.changes(project).all, ["notes.txt"]);

  // Without the structure manifest nothing is managed.
  const bare = at("bare");
  installer.install(bare, { ...options, name: "Bare App" });
  write(path.join(bare, TEMPLATE), "# Module\n");
  assert.equal(
    code(() =>
      installer.install(bare, { ...options, update: true, with: [TEMPLATE] })
    ),
    "WITH_NOT_MANAGED"
  );
  write(path.join(bare, MANIFEST), "{ not json");
  assert.equal(
    code(() =>
      installer.install(bare, { ...options, update: true, with: [TEMPLATE] })
    ),
    "WITH_NOT_MANAGED"
  );
} finally {
  rmSync(sandbox, { force: true, recursive: true });
  await build.cleanup();
}
