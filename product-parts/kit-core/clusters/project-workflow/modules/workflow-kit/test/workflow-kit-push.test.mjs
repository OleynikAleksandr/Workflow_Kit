import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { automatedScope, CI, gitCommit } from "./workflow-kit-autopilot-support.mjs";
import { code, openKit, write } from "./workflow-kit-support.mjs";

// M40 T002: the pre-push hook reads the pushed refs from its stdin and
// checks the TARGET ref of every line: the publication branch while a scope
// is open, the CI branch outside its delivery.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-push");
const roots = [];
const ZERO = "0".repeat(40);
const DIGEST = { contracts: [], decisions: [], references: [], result: "The note exists." };

try {
  const opened = await openKit(build, { clock: "16:00", prefix: "workflow-push-", roots });
  const { env, git, kit, plans, project } = opened;
  const { parsePushRefs } = await build.load("workflow-kit", "kit-push.js");

  /** A project with CI and the specification committed and `input` chosen sequentially. */
  const scoped = (input) => {
    const root = project(null);
    write(root, ".github/workflows/ci.yml", CI);
    write(root, "docs/spec.md", "# Spec\n");
    gitCommit(root, env, [".github/workflows/ci.yml", "docs/spec.md"], "chore: add CI");
    kit.proposeScope(root, input, "sequential", "One note and the release tasks");
    kit.chooseScope(root, { generation: 1, note: "User chose sequential", option: "sequential", session: "s-1" });
    return root;
  };
  const line = (root, local, remote, sha = git.head(root)) => `${local} ${sha} ${remote} ${ZERO}`;
  /** The hook result for the pushed lines (LF unless `eol` says otherwise). */
  const push = (root, lines, eol = "\n") =>
    kit.gitHook(root, "pre-push", ["origin", "https://example.test/repo.git"], `${lines.join(eol)}${eol}`);
  const pushCode = (root, lines, eol) => push(root, lines, eol).code ?? "OK";
  const toMain = (root) => line(root, "refs/heads/main", "refs/heads/main");
  const toCi = (root, branch) => line(root, "HEAD", `refs/heads/${branch}`);
  /** Finishes N and the round DOCS: only the delivery tasks stay. */
  const finishWork = (root) => {
    kit.startTask(root, "N");
    write(root, "docs/note.md", "# Note\n");
    kit.commitTask(root, "N");
    kit.startTask(root, "DOCS-R1");
    write(root, "docs/overview.md", "# Overview\n");
    kit.commitTask(root, "DOCS-R1", { digest: DIGEST, files: ["docs/overview.md"] });
  };
  const deliver = (root, id, file) => {
    kit.startTask(root, id, "User said ship");
    write(root, file, `# ${id}\n`);
  };

  // The stdin lines: LF and CRLF, blank and broken lines are skipped.
  assert.deepEqual(parsePushRefs(`a ${ZERO} refs/heads/b ${ZERO}\r\n\r\nbroken line\n`), [
    { localRef: "a", localSha: ZERO, remoteRef: "refs/heads/b", remoteSha: ZERO },
  ]);
  assert.deepEqual(parsePushRefs(""), []);

  // ── the publication branch of an open scope (automation.publication.branch = main).
  const root = scoped(automatedScope());
  assert.equal(pushCode(root, [toMain(root)]), "PUBLISH_SCOPE_OPEN");
  // The target ref decides: HEAD:main and another local branch into main are pushes of main.
  assert.equal(pushCode(root, [line(root, "HEAD", "refs/heads/main")]), "PUBLISH_SCOPE_OPEN");
  assert.equal(pushCode(root, [line(root, "refs/heads/feature", "refs/heads/main")]), "PUBLISH_SCOPE_OPEN");
  assert.equal(pushCode(root, [toMain(root)], "\r\n"), "PUBLISH_SCOPE_OPEN");
  // One refused ref refuses the whole push; the message names the branch and the scope.
  const mixed = push(root, [line(root, "refs/heads/feature", "refs/heads/feature"), toMain(root)]);
  assert.equal(mixed.exitCode, 1);
  assert.match(mixed.message, /^PUBLISH_SCOPE_OPEN: Branch main is published only after scope auto/u);
  // Other branches, tags, a deletion and a push without refs pass.
  assert.equal(pushCode(root, [line(root, "refs/heads/main", "refs/heads/feature")]), "OK");
  assert.equal(pushCode(root, [line(root, "refs/tags/v1", "refs/tags/v1")]), "OK");
  assert.equal(pushCode(root, [line(root, "(delete)", "refs/heads/main", ZERO)]), "OK");
  assert.equal(pushCode(root, [line(root, "(delete)", "refs/heads/ci/auto", ZERO)]), "OK");
  assert.equal(kit.gitHook(root, "pre-push", ["origin", "url"]).exitCode, 0);

  // ── the CI branch without a declared task: only after every task is DONE.
  assert.equal(pushCode(root, [toCi(root, "ci/auto")]), "CI_PUSH_NOT_ALLOWED");
  finishWork(root);
  deliver(root, "D1", "docs/release.md");
  const early = push(root, [toCi(root, "ci/auto")]);
  assert.equal(early.code, "CI_PUSH_NOT_ALLOWED");
  assert.match(early.message, /automation\.ci\.task/u);
  kit.commitTask(root, "D1");
  assert.equal(pushCode(root, [toCi(root, "ci/auto")]), "OK");
  assert.equal(pushCode(root, [toMain(root)]), "PUBLISH_SCOPE_OPEN");
  // Accepted and closed: the publication passes.
  kit.accept(root, "User accepts");
  assert.equal(pushCode(root, [toMain(root)]), "PUBLISH_SCOPE_OPEN");
  kit.close(root, "auto", "User: close the plan");
  assert.equal(pushCode(root, [toMain(root), toCi(root, "ci/auto")]), "OK");

  // ── a declared CI task: the push waits for that task, not for any delivery.
  const declared = automatedScope();
  declared.automation.ci.task = "D2";
  declared.automation.delivery.push({ effects: ["push the CI branch"], taskId: "D2" });
  declared.tasks.push({
    acceptance: ["CI is green"],
    commitMessage: "chore: record the CI run",
    dependencies: ["D1"],
    files: ["docs/ci.md"],
    id: "D2",
    kind: "delivery",
    title: "CI",
  });
  const wrongTask = structuredClone(declared);
  wrongTask.automation.ci.task = "N";
  assert.equal(code(() => kit.proposeScope(project(null), wrongTask, "sequential", "A work task is not a CI task")), "PLAN_AUTOMATION");
  const ciRoot = scoped(declared);
  assert.deepEqual(plans.read(ciRoot).scope.automation.ci.task, "D2");
  assert.equal(pushCode(ciRoot, [toCi(ciRoot, "ci/auto")]), "CI_PUSH_NOT_ALLOWED");
  finishWork(ciRoot);
  // Another delivery in progress (an installation) does not allow the CI push.
  deliver(ciRoot, "D1", "docs/release.md");
  const foreign = push(ciRoot, [toCi(ciRoot, "ci/auto")]);
  assert.equal(foreign.code, "CI_PUSH_NOT_ALLOWED");
  assert.match(foreign.message, /delivery task D2/u);
  kit.commitTask(ciRoot, "D1");
  assert.equal(pushCode(ciRoot, [toCi(ciRoot, "ci/auto")]), "CI_PUSH_NOT_ALLOWED");
  deliver(ciRoot, "D2", "docs/ci.md");
  assert.equal(pushCode(ciRoot, [toCi(ciRoot, "ci/auto")]), "OK");
  kit.commitTask(ciRoot, "D2");
  assert.equal(pushCode(ciRoot, [toCi(ciRoot, "ci/auto")]), "OK");

  // ── a plan without automation: the publication branch is the checked-out one, CI is ci/<scope>.
  const legacy = automatedScope("plain");
  delete legacy.automation;
  const plain = scoped(legacy);
  assert.equal(pushCode(plain, [toMain(plain)]), "PUBLISH_SCOPE_OPEN");
  assert.equal(pushCode(plain, [toCi(plain, "ci/plain")]), "CI_PUSH_NOT_ALLOWED");
  assert.equal(pushCode(plain, [toCi(plain, "ci/other")]), "OK");
  finishWork(plain);
  assert.equal(pushCode(plain, [toCi(plain, "ci/plain")]), "CI_PUSH_NOT_ALLOWED");
  deliver(plain, "D1", "docs/release.md");
  assert.equal(pushCode(plain, [toCi(plain, "ci/plain")]), "OK");
  kit.commitTask(plain, "D1");
  assert.equal(pushCode(plain, [toCi(plain, "ci/plain")]), "OK");

  // ── real git: the hook runs the compiled CLI and gets the refs on its stdin on every OS.
  const live = scoped(automatedScope());
  const remote = mkdtempSync(path.join(tmpdir(), "workflow-push-remote-"));
  roots.push(remote);
  const run = (args) => execFileSync("git", args, { cwd: live, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
  execFileSync("git", ["init", "-q", "--bare", remote], { env });
  run(["remote", "add", "origin", remote]);
  const hooks = path.join(live, ".test-hooks");
  mkdirSync(hooks);
  const cliFile = path.join(build.directory, "workflow-kit", "src", "workflow-kit-cli.js");
  writeFileSync(
    path.join(hooks, "pre-push"),
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(cliFile)} git-hook pre-push "$@"\n`
  );
  chmodSync(path.join(hooks, "pre-push"), 0o755);
  git.setConfig(live, "core.hooksPath", hooks);
  const refused = (args) => {
    try {
      run(args);
    } catch (error) {
      return String(error.stderr);
    }
    return "";
  };
  assert.match(refused(["push", "-q", "origin", "HEAD:main"]), /PUBLISH_SCOPE_OPEN/u);
  assert.match(refused(["push", "-q", "origin", "HEAD:refs/heads/feature", "main:main"]), /PUBLISH_SCOPE_OPEN/u);
  assert.match(refused(["push", "-q", "origin", "HEAD:ci/auto"]), /CI_PUSH_NOT_ALLOWED/u);
  assert.equal(execFileSync("git", ["for-each-ref"], { cwd: remote, encoding: "utf8", env }), "");
  run(["push", "-q", "origin", "HEAD:refs/heads/feature"]);
  assert.match(execFileSync("git", ["for-each-ref"], { cwd: remote, encoding: "utf8", env }), /refs\/heads\/feature/u);
  console.log("workflow-kit push tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, maxRetries: 5, recursive: true });
  }
  await build.cleanup();
}
