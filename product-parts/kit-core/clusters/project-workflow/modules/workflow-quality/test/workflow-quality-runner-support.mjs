// Fixtures of workflow-quality-runner.test.mjs: a temporary project root,
// the test profile and the files its stages check.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** A temporary project root and a writer of project-relative files. */
export function runnerRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "workflow-runner-"));
  const write = (name, content) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  };
  return { root, write };
}

/** A check command that runs `node -e <script>`. */
const node = (script, extra = []) => ({
  args: ["-e", script, ...extra],
  executable: "node",
});

/**
 * The test profile over `base`: a 3-line limit, a 200-byte document budget,
 * a docs contract and one check per outcome (passing, failing, `{files}`,
 * timing out, missing executable).
 */
export function runnerConfig(quality, base) {
  return {
    ...base,
    budget: { ...base.budget, documentBytes: 200 },
    docs: {
      contracts: [{ code: "src/{module}/**", docs: ["docs/{module}.md"] }],
    },
    policy: { maxFileLines: 3, taskFileSoftLimit: null },
    quality: {
      ...base.quality,
      checks: [
        ...base.quality.checks,
        quality.normalizeCheck({
          command: node("process.exit(0)"),
          id: "ok",
          required: true,
          role: "lint",
          stage: "commit",
        }),
        quality.normalizeCheck({
          command: node("console.error('bad'); process.exit(3)"),
          id: "broken",
          role: "test",
          stage: "commit",
        }),
        quality.normalizeCheck({
          appliesTo: ["src/**/*.ts"],
          command: node("console.log(process.argv.slice(1).join(','))", [
            "{files}",
          ]),
          id: "format",
          required: true,
          role: "format",
          stage: "prepare",
        }),
        quality.normalizeCheck({
          command: node("setTimeout(() => {}, 5000)"),
          id: "slow",
          role: "test",
          stage: "push",
          timeoutMs: 300,
        }),
        quality.normalizeCheck({
          command: { args: [], executable: "workflow-missing-tool" },
          id: "missing",
          role: "audit",
          stage: "push",
        }),
      ],
    },
  };
}

/** Writes the sources and documents the stages check. */
export function writeRunnerFiles(write) {
  write("src/core/a.ts", "one\ntwo\n");
  write("src/core/b.ts", "1\n2\n3\n4\n5\n");
  write("src/core/c.js", "x\n");
  write(
    "docs/core.md",
    "# Core\n\nSee [a](../src/core/a.ts) and [gone](./gone.md) and [web](https://example.com).\n\n```\n[x](nowhere.md)\n```\n"
  );
  write("docs/big.md", "x".repeat(400));
}
