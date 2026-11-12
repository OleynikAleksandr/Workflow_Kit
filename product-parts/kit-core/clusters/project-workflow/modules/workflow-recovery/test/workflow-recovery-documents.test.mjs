import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  [
    "workflow-platform",
    "workflow-plan",
    "workflow-git",
    "workflow-quality",
    "workflow-recovery",
  ],
  "workflow-recovery-documents"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-recovery-docs-"));
const write = (name, text) => {
  const file = path.join(root, ...name.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
try {
  const { WorkflowGitFacade } = await build.load(
    "workflow-git",
    "workflow-git-facade.js"
  );
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const { WorkflowRecoveryFacade } = await build.load(
    "workflow-recovery",
    "workflow-recovery-facade.js"
  );
  const git = new WorkflowGitFacade(undefined, cleanGitEnvironment());
  const recovery = new WorkflowRecoveryFacade(git);

  // Outside a repository there is nothing to map.
  assert.deepEqual(recovery.documentsMap(root), {
    entries: [],
    shown: 0,
    text: "",
  });

  git.init(root);
  git.setConfig(root, "user.name", "Workflow Test");
  git.setConfig(root, "user.email", "workflow@harness-ai.test");
  write(".gitignore", "ignored.md\n");
  write(
    "README.md",
    "# Readme\n\n## One\n\n```md\n## Not a heading\n```\n\n## Two ##\n"
  );
  write("gone.md", "# Gone\n");
  git.git.run(root, ["add", ".gitignore", "README.md", "gone.md"]);
  git.git.run(root, ["commit", "-q", "-m", "chore: docs"]);
  rmSync(path.join(root, "gone.md"));
  write("ignored.md", "## Ignored\n");
  write("aaa.md", "no headings\n");
  write("docs/zzz.md", "## Last\n");
  write("docs/arch/spec.md", "# Spec\n\n## Goal\n\n## Plan\n");
  write("docs/arch/a.md", "## Alpha\n");
  write("notes/b.markdown", "## Bee\n");
  write("notes/c.txt", "## Not markdown\n");
  write("node_modules/pkg/readme.md", "## Package\n");
  write(".harness/workflow/local/x.md", "## Local\n");
  write(".harness/plans/archive/old.md", "## Old\n");
  write(".harness/plans/todo-plan.md", "## Plan\n");

  // Spec folder first, then the rest in path order; exclusions applied.
  const map = recovery.documentsMap(root, { specPath: "docs/arch/spec.md" });
  assert.deepEqual(
    map.entries.map((entry) => entry.path),
    [
      "docs/arch/a.md",
      "docs/arch/spec.md",
      ".harness/plans/todo-plan.md",
      "README.md",
      "aaa.md",
      "docs/zzz.md",
      "notes/b.markdown",
    ]
  );
  assert.equal(map.shown, map.entries.length);
  assert.equal(
    map.text.split("\n")[1],
    "docs/arch/spec.md (25 bytes): Goal; Plan"
  );
  assert.match(map.text, /\nREADME\.md \(\d+ bytes\): One; Two\n/u);
  assert.match(map.text, /\naaa\.md \(12 bytes\)\n/u);
  assert.doesNotMatch(map.text, /Not a heading|ignored|gone|node_modules/u);

  // Without a scope: alphabetical only.
  assert.equal(
    recovery.documentsMap(root).entries[0].path,
    ".harness/plans/todo-plan.md"
  );

  // Budget: the tail line counts the rest, the text never exceeds it.
  for (const budget of [200, 120, 60, 10]) {
    const small = recovery.documentsMap(root, {
      budget,
      specPath: "docs/arch/spec.md",
    });
    const hidden = small.entries.length - small.shown;
    assert.ok(hidden > 0, `budget ${budget}`);
    const lines = small.text.split("\n");
    assert.equal(
      lines.at(-1),
      `… ${hidden} more documents: \`scripts/workflow context --list\``
    );
    assert.equal(lines.length, small.shown + 1);
    if (budget >= 60) {
      assert.ok(Buffer.byteLength(small.text, "utf8") <= budget);
    }
  }
  assert.equal(
    recovery
      .documentsMap(root, { budget: 200, specPath: "docs/arch/spec.md" })
      .text.split("\n")[0],
    "docs/arch/a.md (9 bytes): Alpha"
  );

  // A folder keeps only its documents; `more` replaces the tail hint.
  const folder = recovery.documentsMap(root, { folder: "docs" });
  assert.deepEqual(
    folder.entries.map((entry) => entry.path),
    ["docs/arch/a.md", "docs/arch/spec.md", "docs/zzz.md"]
  );
  assert.equal(
    recovery.documentsMap(root, { budget: 70, folder: "docs", more: "narrow" })
      .text,
    "docs/arch/a.md (9 bytes): Alpha\n… 2 more documents: narrow"
  );
  assert.equal(
    recovery.documentsMap(root, { folder: "doc" }).entries.length,
    0
  );

  // The packet carries the map as its `documents` section.
  const plans = new WorkflowPlanFacade();
  plans.write(root, plans.createEmpty("p", "Docs"));
  const packet = recovery.packet(root);
  assert.ok(packet.included.includes("documents"));
  assert.match(packet.text, /## documents\n\.harness\/plans\/todo-plan\.md/u);
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
