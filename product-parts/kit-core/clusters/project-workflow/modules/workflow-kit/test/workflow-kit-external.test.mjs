import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { gitCommit, grantInput } from "./workflow-kit-autopilot-support.mjs";
import { openDecisions } from "./workflow-kit-decisions-support.mjs";
import { failure, write } from "./workflow-kit-support.mjs";

// M40 T002: a commit made past the Kit after the scope baseline (no
// `Workflow-Transaction` trailer, as `git commit --no-verify` leaves it)
// blocks task:start, commit, accept and close until the user adopts the
// exact list of such commits.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-external");
const roots = [];

try {
  const { apply, button, chooseArgs, decisionOf, env, envelope, hostProject, kit, plans, records, revision } =
    await openDecisions(build, { clock: "17:00", prefix: "workflow-external-", roots });
  /** A plain git commit of one new file: the test projects have no hooks. */
  const external = (root, name) => {
    write(root, name, "made past the Kit\n");
    return gitCommit(root, env, [name], `chore: ${name}`);
  };
  const refusal = (action) => {
    const error = failure(action);
    return { code: error?.code ?? "OK", commits: error?.details?.commits ?? null, decision: error?.details?.decision ?? null };
  };

  // ── the agent mode: `commits:adopt --commits --note`.
  const root = hostProject("agent");
  kit.chooseScope(root, { generation: 1, note: "User chose sequential", option: "sequential", session: "s-1" });
  // Kit commits (the scope plan, documents) are not external.
  write(root, "docs/extra.md", "# Extra\n");
  kit.commitDocs(root, ["docs/extra.md"]);
  assert.equal(envelope(root, ["commits:adopt", "--commits", "a".repeat(40), "--note", "User: fine"]).code, "NO_EXTERNAL_COMMITS");
  const first = external(root, "past-1.txt");
  const blocked = refusal(() => kit.startTask(root, "N"));
  assert.deepEqual(blocked, { code: "EXTERNAL_COMMITS", commits: [first], decision: null });
  assert.equal(plans.read(root).currentTaskId, null);
  assert.equal(refusal(() => kit.accept(root, "User accepts")).code, "EXTERNAL_COMMITS");
  assert.equal(refusal(() => kit.close(root, "auto", "User: close the plan")).code, "EXTERNAL_COMMITS");
  const text = envelope(root, ["task:start", "N"]);
  assert.equal(text.code, "EXTERNAL_COMMITS");
  assert.match(text.message, new RegExp(first.slice(0, 12), "u"));
  assert.match(text.nextAction, /commits:adopt --commits/u);
  // Only the exact current list with the user's words adopts.
  assert.equal(envelope(root, ["commits:adopt", "--note", "User: fine"]).code, "USAGE");
  assert.equal(envelope(root, ["commits:adopt", "--commits", first]).code, "USAGE");
  const wrong = envelope(root, ["commits:adopt", "--commits", "a".repeat(40), "--note", "User: fine"]);
  assert.equal(wrong.code, "EXTERNAL_COMMITS");
  assert.deepEqual(wrong.details.commits, [first]);
  const before = revision(root);
  const adopted = envelope(root, ["commits:adopt", "--commits", first, "--note", "User: I committed it myself"]);
  assert.equal(adopted.ok, true, JSON.stringify(adopted));
  assert.equal(revision(root), before + 1);
  assert.deepEqual(plans.read(root).scope.adoptedCommits, [first]);
  const record = plans.read(root).scope.decisions.at(-1);
  assert.equal(record.kind, "adopt-commits");
  assert.match(record.text, /User: I committed it myself/u);
  // The adopted commit no longer blocks; a new one blocks the task commit with its SHA only.
  kit.startTask(root, "N");
  write(root, "docs/note.md", "# Note\n");
  const second = external(root, "past-2.txt");
  const third = external(root, "past-3.txt");
  assert.deepEqual(refusal(() => kit.commitTask(root, "N")).commits, [second, third]);
  assert.equal(envelope(root, ["commits:adopt", "--commits", `${third},${second}`, "--note", "User: fine"]).code, "EXTERNAL_COMMITS");
  assert.equal(envelope(root, ["commits:adopt", "--commits", JSON.stringify([second, third]), "--note", "User: fine"]).ok, true);
  assert.deepEqual(plans.read(root).scope.adoptedCommits, [first, second, third]);
  kit.commitTask(root, "N");
  assert.equal(plans.read(root).tasks.find((task) => task.id === "N").status, "DONE");
  // The automatic acceptance and close of a run stop at the same barrier.
  kit.authorize(root, grantInput(plans.read(root).scope.proposal.digest), revision(root));
  const fourth = external(root, "past-4.txt");
  assert.deepEqual(refusal(() => kit.acceptRun(root, "run-1", { ci: null, criteria: [], head: fourth }, revision(root))).commits, [fourth]);
  assert.deepEqual(refusal(() => kit.closeRun(root, "auto", "run-1", revision(root))).commits, [fourth]);

  // ── the host mode: the refusal registers the adopt-commits request itself.
  const host = hostProject();
  const choice = decisionOf(host, chooseArgs());
  await apply(host, ["scope:choose"], choice.id, button);
  assert.equal(envelope(host, ["commits:adopt"]).code, "NO_EXTERNAL_COMMITS");
  const one = external(host, "past-1.txt");
  const stopped = envelope(host, ["task:start", "N"]);
  assert.equal(stopped.code, "EXTERNAL_COMMITS");
  const request = stopped.details.decision;
  assert.equal(request.kind, "adopt-commits");
  assert.deepEqual(request.params, { commits: [one] });
  assert.equal(request.scopeId, "auto");
  assert.match(stopped.nextAction, /Workflow Kit panel/u);
  assert.deepEqual(kit.status(host).decisions.map((item) => item.id), [request.id]);
  // The manual form is the same request, never an adoption; the agent's flags change nothing.
  assert.equal(decisionOf(host, ["commits:adopt", "--commits", one, "--note", "The agent says the user agreed"]).id, request.id);
  assert.equal(plans.read(host).scope.adoptedCommits, undefined);
  // A decision command of another kind is refused before its own request appears.
  assert.equal(envelope(host, ["accept", "--note", "User accepts"]).code, "EXTERNAL_COMMITS");
  assert.equal(envelope(host, ["close", "--scope", "auto", "--note", "User: close the plan"]).code, "EXTERNAL_COMMITS");
  assert.deepEqual(kit.status(host).decisions.map((item) => item.kind), ["adopt-commits"]);
  // A new external commit after the card was shown: the old button adopts nothing.
  const two = external(host, "past-2.txt");
  assert.deepEqual(kit.status(host).decisions, []);
  assert.equal((await apply(host, ["commits:adopt"], request.id, button)).envelope.code, "DECISION_STALE");
  assert.equal(plans.read(host).scope.adoptedCommits, undefined);
  const renewed = decisionOf(host, ["commits:adopt"]);
  assert.notEqual(renewed.id, request.id);
  assert.deepEqual(renewed.params, { commits: [one, two] });
  assert.equal(envelope(host, ["commits:adopt", "--decision", renewed.id, ...button, "--expected-revision", String(revision(host))]).code, "HOST_AUTH_REQUIRED");
  const done = await apply(host, ["commits:adopt"], renewed.id, ["--source", "button", "--note", "Принять коммиты"], (payload) =>
    payload.operation === "commits:adopt" && payload.decisionId === renewed.id);
  assert.equal(done.envelope.ok, true, JSON.stringify(done.envelope));
  assert.deepEqual(plans.read(host).scope.adoptedCommits, [one, two]);
  assert.equal(records(host).at(-1).decisionId, renewed.id);
  assert.equal(records(host).at(-1).kind, "adopt-commits");
  assert.equal(records(host).at(-1).source.kind, "button");
  assert.equal((await apply(host, ["commits:adopt"], renewed.id, button)).envelope.result.already, true);
  assert.equal(envelope(host, ["task:start", "N"]).ok, true);
  console.log("workflow-kit external commits tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, maxRetries: 5, recursive: true });
  }
  await build.cleanup();
}
