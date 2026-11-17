import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { openDecisions, sameRoot } from "./workflow-kit-decisions-support.mjs";
import { local, write } from "./workflow-kit-support.mjs";

// M40 T001: in a project with `decisions: host` a user decision is written
// only by a host operation with a ticket. The manual forms register a typed
// decision request and change nothing; the host applies the request by id.
// This file: the mode choice, delivery, acceptance and close.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-decisions");
const roots = [];

try {
  const { apply, button, chooseArgs, decisionOf, env, envelope, git, hostDigest, hostProject, hosted, kit, plans, project, quality, records, revision, subjectDigest } =
    await openDecisions(build, { clock: "14:00", prefix: "workflow-decisions-", roots });
  // The injected-platform root comparison a ticket is bound with: paths that exist on no host.
  assert.equal(sameRoot("C:\\WFK-NO-SUCH\\Proj\\", "c:/wfk-no-such/proj", "win32"), true);
  assert.equal(sameRoot("C:\\WFK-NO-SUCH\\Proj", "C:\\WFK-NO-SUCH\\Other", "win32"), false);
  assert.equal(sameRoot("/wfk-no-such/Proj", "/wfk-no-such/proj", "linux"), false);
  assert.equal(sameRoot("/wfk-no-such/proj/", "/wfk-no-such/proj", "linux"), true);

  // The config key: host or agent, nothing else; the installer option writes it.
  assert.throws(
    () => quality.writeConfig(project(null), { ...quality.defaultConfig(), decisions: "panel" }),
    (error) => /decisions/u.test(error.message)
  );
  assert.equal(kit.decisionsMode(project(null)), "agent");

  // ── choose: the request is bound to the proposal before the scope exists.
  const root = hostProject();
  const digest = kit.proposalDigest(root).proposalDigest;
  const before = revision(root);
  const choose = decisionOf(root, chooseArgs());
  assert.match(choose.id, /^dec-[0-9a-f]{12}$/u);
  assert.equal(choose.kind, "choose");
  assert.equal(choose.state, "pending");
  assert.equal(choose.scopeId, null);
  assert.equal(choose.taskId, null);
  assert.deepEqual(choose.proposal, { digest, generation: 1 });
  assert.deepEqual(choose.params, { option: "sequential", session: "s-1" });
  assert.equal(choose.inputDigest, subjectDigest(choose));
  assert.equal(choose.revision, before);
  assert.equal(choose.choice, undefined);
  assert.equal(kit.status(root).scope, null);
  assert.equal(revision(root), before);
  // The same input keeps the id; another input replaces the request.
  assert.equal(decisionOf(root, chooseArgs()).id, choose.id);
  const refine = decisionOf(root, chooseArgs("refine"));
  assert.notEqual(refine.id, choose.id);
  assert.deepEqual(kit.status(root).decisions.map((item) => item.id), [refine.id]);
  const replaced = await apply(root, ["scope:choose"], choose.id, button);
  assert.equal(replaced.envelope.code, "DECISION_STALE");
  assert.equal(kit.status(root).scope, null);
  // A digest the user did not see, and a stale generation, are refused at once.
  assert.equal(envelope(root, [...chooseArgs(), "--expected-digest", "a".repeat(64)]).code, "PROPOSAL_CHANGED");
  assert.equal(envelope(root, ["scope:choose", "--generation", "7", "--option", "sequential", "--session", "s-1"]).code, "PROPOSAL_CHANGED");
  const chosen = decisionOf(root, [...chooseArgs(), "--expected-digest", digest]);
  assert.deepEqual(kit.status(root).decisions.map((item) => item.id), [chosen.id]);

  // A planted record and a record with edited params are not shown as they were written.
  const registryFile = local(root, "decisions.json");
  const registry = JSON.parse(readFileSync(registryFile, "utf8"));
  registry.requests.push({
    choice: { kind: "accept" },
    createdAt: "2026-11-04T14:00:00Z",
    id: "dec-000000000000",
    inputDigest: "b".repeat(64),
    kind: "accept",
    params: { head: "0".repeat(40), result: "DONE" },
    proposal: null,
    revision: before,
    scopeId: "auto",
    state: "pending",
    taskId: null,
  });
  registry.requests.find((item) => item.id === chosen.id).params = { option: "orchestrated", session: "evil" };
  writeFileSync(registryFile, JSON.stringify(registry));
  const shown = kit.status(root).decisions;
  assert.deepEqual(shown.map((item) => item.id), [chosen.id]);
  assert.deepEqual(shown[0].params, { option: "sequential", session: "s-1" });
  const planted = await apply(root, ["accept"], "dec-000000000000", button);
  assert.equal(planted.envelope.code, "DECISION_STALE");

  // The host form: no channel — HOST_AUTH_REQUIRED; a binding the parent refuses — nothing written.
  const hostArgs = ["scope:choose", "--decision", chosen.id, ...button, "--expected-revision", String(before)];
  assert.equal(envelope(root, hostArgs).code, "HOST_AUTH_REQUIRED");
  assert.equal(envelope(root, ["scope:choose", "--decision", chosen.id, ...button]).code, "USAGE");
  assert.equal(envelope(root, ["scope:choose", "--decision", "dec-ffffffffffff", ...button, "--expected-revision", "1"]).code, "DECISION_UNKNOWN");
  assert.equal(envelope(root, ["accept", "--decision", chosen.id, ...button, "--expected-revision", "1"]).code, "USAGE");
  assert.equal(envelope(root, ["scope:choose", "--decision", chosen.id, "--source", "agent", "--note", "x", "--expected-revision", "1"]).code, "USAGE");
  for (const platform of ["win32", "linux"]) {
    const foreign = platform === "win32" ? "C:\\WFK-NO-SUCH\\Other" : "/wfk-no-such/other";
    const refusedRoot = await hosted(root, hostArgs, (payload) => sameRoot(payload.root, foreign, platform));
    assert.equal(refusedRoot.envelope.code, "HOST_AUTH_INVALID");
  }
  for (const wrong of [
    (payload) => payload.decisionId === refine.id,
    (payload) => payload.inputDigest === chosen.inputDigest,
    (payload) => payload.expectedRevision === before + 1,
  ]) {
    assert.equal((await hosted(root, hostArgs, wrong)).envelope.code, "HOST_AUTH_INVALID");
  }
  assert.equal(kit.status(root).scope, null);
  assert.equal(revision(root), before);
  // The honest parent: the ticket is bound to the request, its note and source, the revision and the root.
  const source = { kind: "button", messageId: null, runId: null, session: null };
  const done = await hosted(root, hostArgs, (payload) =>
    payload.operation === "scope:choose" &&
    payload.decisionId === chosen.id &&
    payload.runId === null &&
    payload.expectedRevision === before &&
    sameRoot(payload.root, root) &&
    payload.inputDigest === hostDigest({ decision: chosen.inputDigest, note: "Кнопка панели", source })
  );
  assert.equal(done.envelope.ok, true, JSON.stringify(done.envelope));
  assert.equal(done.envelope.result.already, false);
  assert.equal(done.envelope.result.decisionId, chosen.id);
  assert.equal(done.envelope.result.result.option, "sequential");
  assert.equal(kit.status(root).scope.id, "auto");
  assert.deepEqual(plans.read(root).scope.proposal, { digest, generation: 1 });
  const [choice] = records(root);
  assert.equal(choice.decisionId, chosen.id);
  assert.equal(choice.kind, "choose");
  assert.deepEqual(choice.source, source);
  assert.match(choice.text, /Кнопка панели/u);
  assert.deepEqual(kit.status(root).decisions, []);
  // A repeat of the applied decision: `already`, no second record, no new revision.
  const afterChoice = revision(root);
  const again = await apply(root, ["scope:choose"], chosen.id, button);
  assert.equal(again.envelope.result.already, true);
  assert.equal(again.envelope.result.result.option, "sequential");
  assert.equal(records(root).length, 1);
  assert.equal(revision(root), afterChoice);
  // A lost registry: the plan history still answers `already`.
  writeFileSync(registryFile, JSON.stringify({ requests: [{ ...registry.requests.find((item) => item.id === chosen.id), state: "pending" }], version: 1 }));
  const recovered = await apply(root, ["scope:choose"], chosen.id, button);
  assert.equal(recovered.envelope.result.already, true);
  assert.equal(records(root).length, 1);

  // ── work tasks start without a decision; a delivery task asks for one.
  assert.equal(envelope(root, ["task:start", "N"]).ok, true);
  write(root, "docs/note.md", "# Note\n");
  kit.commitTask(root, "N");
  kit.startTask(root, "DOCS-R1");
  write(root, "docs/overview.md", "# Overview\n");
  kit.commitTask(root, "DOCS-R1", {
    digest: { contracts: [], decisions: [], references: [], result: "The note exists." },
    files: ["docs/overview.md"],
  });
  const deliveryRevision = revision(root);
  const delivery = decisionOf(root, ["task:start", "D1", "--confirmed", "User said ship"]);
  assert.equal(delivery.kind, "confirm-delivery");
  assert.equal(delivery.taskId, "D1");
  assert.equal(delivery.scopeId, "auto");
  assert.match(delivery.params.taskDigest, /^[0-9a-f]{64}$/u);
  assert.equal(decisionOf(root, ["task:start", "D1"]).id, delivery.id);
  assert.equal(plans.read(root).currentTaskId, null);
  assert.equal(revision(root), deliveryRevision);
  // The task changed after the card was shown: the old button is stale, a new request appears.
  kit.updateTask(root, "D1", { title: "Release, second edition" });
  assert.deepEqual(kit.status(root).decisions, []);
  assert.equal((await apply(root, ["task:start", "D1"], delivery.id, button)).envelope.code, "DECISION_STALE");
  assert.equal(plans.read(root).currentTaskId, null);
  const delivery2 = decisionOf(root, ["task:start", "D1"]);
  assert.notEqual(delivery2.id, delivery.id);
  // A run that has no grant does not cover the delivery; the user's message does.
  const byRun = await apply(root, ["task:start", "D1"], delivery2.id, ["--source", "grant", "--autopilot-run", "run-x", "--note", "run"]);
  assert.equal(byRun.envelope.code, "AUTOPILOT_UNAUTHORIZED");
  assert.equal((await apply(root, ["task:start", "D1"], delivery2.id, ["--source", "message", "--autopilot-run", "run-x", "--note", "run"])).envelope.code, "USAGE");
  const message = ["--source", "message", "--message-id", "m-17", "--decision-session", "s-1", "--note", "да, выпускай"];
  const startedBy = await apply(root, ["task:start", "D1"], delivery2.id, message);
  assert.equal(startedBy.envelope.ok, true, JSON.stringify(startedBy.envelope));
  assert.equal(plans.read(root).currentTaskId, "D1");
  assert.match(plans.read(root).tasks.find((task) => task.id === "D1").confirmation, /да, выпускай/u);
  assert.deepEqual(records(root).at(-1).source, { kind: "message", messageId: "m-17", runId: null, session: "s-1" });
  assert.equal(records(root).at(-1).decisionId, delivery2.id);
  write(root, "docs/release.md", "# Release\n");
  kit.commitTask(root, "D1");

  // ── accept: bound to HEAD; a new commit makes the request stale.
  const accept = decisionOf(root, ["accept", "--note", "User accepts"]);
  assert.equal(accept.kind, "accept");
  assert.equal(accept.params.head, git.head(root));
  assert.equal(plans.read(root).scope.delivery, "READY_FOR_ACCEPTANCE");
  // The M39 run form keeps its own refusal; the manual close is not ready yet.
  assert.equal(envelope(root, ["close", "--scope", "auto", "--note", "User: close the plan"]).code, "NOT_ACCEPTED");
  write(root, "docs/late.md", "# Late\n");
  kit.commitDocs(root, ["docs/late.md"]);
  assert.equal((await apply(root, ["accept"], accept.id, button)).envelope.code, "DECISION_STALE");
  assert.equal(plans.read(root).scope.delivery, "READY_FOR_ACCEPTANCE");
  const accept2 = decisionOf(root, ["accept", "--note", "User accepts"]);
  // The advance instruction of a run does not accept through a decision: acceptance needs its evidence.
  assert.equal((await apply(root, ["accept"], accept2.id, ["--source", "grant", "--autopilot-run", "run-1", "--note", "auto"])).envelope.code, "AUTOPILOT_UNAUTHORIZED");
  const accepted = await apply(root, ["accept"], accept2.id, ["--source", "button", "--note", "ok"]);
  assert.equal(accepted.envelope.ok, true, JSON.stringify(accepted.envelope));
  assert.equal(plans.read(root).scope.delivery, "ACCEPTED");
  assert.match(plans.read(root).scope.acceptanceNote.text, /^ok \(decision dec-/u);
  assert.equal(records(root).at(-1).kind, "accept");

  // ── close: the decision stays in `lastClosed`.
  const close = decisionOf(root, ["close", "--scope", "auto", "--note", "User: close the plan"]);
  assert.equal(close.kind, "close");
  const closed = await apply(root, ["close", "--scope", "auto"], close.id, button);
  assert.equal(closed.envelope.ok, true, JSON.stringify(closed.envelope));
  assert.equal(plans.read(root).scope, null);
  assert.equal(plans.read(root).lastClosed.decision.decisionId, close.id);
  assert.equal(plans.read(root).lastClosed.decision.source.kind, "button");
  const closedAgain = await apply(root, ["close", "--scope", "auto"], close.id, button);
  assert.equal(closedAgain.envelope.result.already, true);

  console.log("workflow-kit-decisions tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, maxRetries: 5, recursive: true });
  }
  await build.cleanup();
}
