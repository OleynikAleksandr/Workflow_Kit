import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit"],
  "workflow-kit-context-command"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-kit-context-cmd-"));
const outside = mkdtempSync(path.join(tmpdir(), "workflow-kit-outside-"));
const write = (name, text) => {
  const file = path.join(root, ...name.split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
try {
  const { runCli } = await build.load("workflow-kit", "workflow-kit-cli.js");
  const { WorkflowKitFacade } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const env = cleanGitEnvironment();
  const kit = new WorkflowKitFacade({ env });
  // `context` is a pure read: a git folder without the Kit is enough.
  kit.git.init(root);
  const run = (argv) => {
    const out = { stderr: "", stdout: "" };
    const code = runCli(
      argv,
      {
        cwd: root,
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
    return { ...out, code };
  };
  const json = (argv) => {
    const result = run([...argv, "--format", "json"]);
    return { ...JSON.parse(result.stdout), exit: result.code };
  };
  const bytes = (text) => Buffer.byteLength(text, "utf8");
  const section = (name, size) => `## ${name}\n\n${"s".repeat(size)}\n\n`;

  write("docs/a.md", "# A\n\nAlpha text.\n");
  write("docs/b.md", "# B\n\n## Storage notes\n\nStorage.\n\n## Other\n\nO.\n");
  write("docs/mid1.md", `# Mid1\n\n${"m".repeat(15_000)}\n`);
  write("docs/mid2.md", `# Mid2\n\n${"n".repeat(15_000)}\n`);
  write(
    "docs/big.md",
    `# Big\n\nIntro.\n\n${["S1", "S2", "S3", "S4", "S5"].map((name) => section(name, 8000)).join("")}`
  );
  write("docs/flat.md", `# Flat\n\n${"f".repeat(30_000)}\n`);
  write("docs/sub/c.md", "# C\n\n## Gamma\n");
  write("docs/image.png", "PNG\0binary");
  write(".harness/workflow/config.json", "{}\n");
  writeFileSync(path.join(outside, "secret.md"), "# Secret\n");
  symlinkSync(path.join(outside, "secret.md"), path.join(root, "docs/link.md"));

  assert.match(
    run(["help"]).stdout,
    /scripts\/workflow context <path>\[#Heading\] … \| context --list \[<folder>\]/u
  );

  // Text by default: marked documents in request order.
  const two = run(["context", "docs/b.md", "docs/a.md"]);
  assert.equal(two.code, 0);
  assert.equal(
    two.stdout,
    [
      `<document path="docs/b.md" bytes="${bytes("# B\n\n## Storage notes\n\nStorage.\n\n## Other\n\nO.")}">`,
      "# B\n\n## Storage notes\n\nStorage.\n\n## Other\n\nO.",
      "</document>",
      "",
      '<document path="docs/a.md" bytes="16">',
      "# A\n\nAlpha text.",
      "</document>",
      "",
    ].join("\n")
  );
  // An absolute path inside the project is the same document.
  assert.equal(
    json(["context", path.join(root, "docs", "a.md")]).result.documents[0].path,
    "docs/a.md"
  );

  // JSON: documents and the left-out list; the order rule stops at the
  // first document that does not fit.
  const budget = json([
    "context",
    "docs/a.md",
    "docs/mid1.md",
    "docs/mid2.md",
    "docs/b.md",
  ]);
  assert.equal(budget.exit, 0);
  assert.deepEqual(
    budget.result.documents.map((item) => item.path),
    ["docs/a.md", "docs/mid1.md"]
  );
  assert.deepEqual(budget.result.notIncluded, [
    { bytes: bytes(`# Mid2\n\n${"n".repeat(15_000)}`), path: "docs/mid2.md" },
    { bytes: 45, path: "docs/b.md" },
  ]);
  const budgetText = run([
    "context",
    "docs/a.md",
    "docs/mid1.md",
    "docs/mid2.md",
    "docs/b.md",
  ]).stdout;
  assert.ok(bytes(budgetText) <= 28_000);
  assert.ok(
    /<\/document>\n\nnot included \(ask again\): docs\/mid2\.md \(15008 bytes\)\nnot included \(ask again\): docs\/b\.md \(45 bytes\)\n$/u.test(
      budgetText
    )
  );

  // A document over the budget: whole `##` sections, the rest by heading.
  const big = json(["context", "docs/big.md"]);
  assert.deepEqual(
    big.result.documents.map((item) => item.heading),
    ["S1", "S2", "S3"]
  );
  assert.match(big.result.documents[0].text, /^# Big\n\nIntro\.\n\n## S1\n/u);
  assert.match(big.result.documents[1].text, /^## S2\n/u);
  assert.deepEqual(
    big.result.notIncluded.map((item) => [item.heading, item.path]),
    [
      ["S4", "docs/big.md"],
      ["S5", "docs/big.md"],
    ]
  );
  const bigText = run(["context", "docs/big.md"]).stdout;
  assert.ok(bytes(bigText) <= 28_000);
  assert.ok(
    /^<document path="docs\/big\.md" heading="S1" bytes="\d+">\n/u.test(bigText)
  );
  assert.ok(
    /\nnot included \(ask again\): docs\/big\.md#S4 \(8007 bytes\)\n/u.test(
      bigText
    )
  );
  // After a small document the sections use the rest of the budget.
  assert.deepEqual(
    json(["context", "docs/mid1.md", "docs/big.md"]).result.documents.map(
      (item) => item.heading ?? item.path
    ),
    ["docs/mid1.md", "S1"]
  );
  // Without `##` sections: listed as too large.
  assert.deepEqual(json(["context", "docs/flat.md"]).result, {
    documents: [],
    notIncluded: [{ bytes: 30_008, path: "docs/flat.md", tooLarge: true }],
  });
  assert.match(
    run(["context", "docs/flat.md"]).stdout,
    /^not included \(larger than the 28000-byte budget, no ## sections\): docs\/flat\.md \(30008 bytes\)\n$/u
  );

  // #Heading by text or slug.
  assert.deepEqual(json(["context", "docs/big.md#S4"]).result.documents[0], {
    bytes: 8007,
    heading: "S4",
    path: "docs/big.md",
    text: `## S4\n\n${"s".repeat(8000)}`,
  });
  assert.equal(
    run(["context", "docs/b.md#storage-notes"]).stdout,
    '<document path="docs/b.md" heading="storage-notes" bytes="26">\n## Storage notes\n\nStorage.\n</document>\n'
  );

  // Refusals: nothing is printed but the error envelope.
  for (const [request, code] of [
    ["../outside.md", "CONTEXT_FORBIDDEN"],
    [path.join(outside, "secret.md"), "CONTEXT_FORBIDDEN"],
    ["docs/link.md", "CONTEXT_FORBIDDEN"],
    [".harness/workflow/config.json", "CONTEXT_FORBIDDEN"],
    ["docs", "CONTEXT_FORBIDDEN"],
    ["docs/image.png", "CONTEXT_FORBIDDEN"],
    ["docs/absent.md", "CONTEXT_MISSING"],
    ["docs/b.md#Missing", "CONTEXT_MISSING"],
  ]) {
    const refused = json(["context", "docs/a.md", request]);
    assert.equal(refused.exit, 1, request);
    assert.equal(refused.ok, false, request);
    assert.equal(refused.code, code, request);
  }
  assert.deepEqual(json(["context", "docs/b.md#Missing"]).details, {
    heading: "Missing",
    path: "docs/b.md",
  });
  const textRefusal = run(["context", "docs/absent.md"]);
  assert.equal(textRefusal.stdout, "");
  assert.match(textRefusal.stderr, /^CONTEXT_MISSING: docs\/absent\.md/u);
  assert.equal(json(["context"]).code, "USAGE");

  // --list: the whole map, or one folder, within the output budget.
  const list = json(["context", "--list"]);
  assert.equal(list.exit, 0);
  assert.equal(list.result.folder, null);
  assert.deepEqual(
    list.result.entries.map((entry) => entry.path),
    [
      "docs/a.md",
      "docs/b.md",
      "docs/big.md",
      "docs/flat.md",
      "docs/link.md",
      "docs/mid1.md",
      "docs/mid2.md",
      "docs/sub/c.md",
    ]
  );
  const sub = run(["context", "--list", "docs/sub"]);
  assert.equal(sub.stdout, "docs/sub/c.md (14 bytes): Gamma\n");
  assert.match(
    run(["context", "--list", "docs"]).stdout,
    /^docs\/a\.md \(17 bytes\)\ndocs\/b\.md \(\d+ bytes\): Storage notes; Other\n/u
  );
  assert.equal(
    run(["context", "--list", "notes"]).stderr.split(":")[0],
    "CONTEXT_MISSING"
  );
  assert.equal(
    json(["context", "--list", "docs/a.md"]).code,
    "CONTEXT_FORBIDDEN"
  );
  assert.equal(json(["context", "--list", ".."]).code, "CONTEXT_FORBIDDEN");
  assert.equal(
    json(["context", "--list", ".harness/workflow"]).code,
    "CONTEXT_FORBIDDEN"
  );
  assert.equal(json(["context", "--list", "a", "b"]).code, "USAGE");
  // Many documents: the tail line asks for a narrower folder.
  for (let index = 0; index < 600; index += 1) {
    write(
      `many/doc-${String(index).padStart(3, "0")}.md`,
      `# Doc\n\n## Section with a long heading ${index}\n`
    );
  }
  const many = run(["context", "--list", "many"]).stdout;
  assert.ok(bytes(many) <= 28_001);
  assert.ok(
    /\n… \d+ more documents: narrow with `scripts\/workflow context --list <folder>` \(a subfolder\)\n$/u.test(
      many
    )
  );

  console.log("workflow-kit context command tests passed");
} finally {
  rmSync(root, { force: true, recursive: true });
  rmSync(outside, { force: true, recursive: true });
  await build.cleanup();
}
