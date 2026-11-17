import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { grantInput } from "./workflow-kit-autopilot-support.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { openDecisions, PROTOCOL, sameRoot } from "./workflow-kit-decisions-support.mjs";
import { write } from "./workflow-kit-support.mjs";

// M40 T001, second part (see workflow-kit-decisions.test.mjs): the real Node
// IPC, a changed proposal, unblocking, the approval of installs, decisions
// of an autopilot grant and the `agent` mode that behaves as Kit 2.3.3.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-decisions-grant");
const roots = [];

try {
  const { apply, button, chooseArgs, decisionOf, env, envelope, git, hostDigest, hostProject, hosted, kit, plans, project, quality, records, revision, subjectDigest } =
    await openDecisions(build, { clock: "15:00", prefix: "workflow-decisions-", roots });
  // ── a changed proposal: the old choose button is stale.
  const changed = hostProject();
  const stale = decisionOf(changed, chooseArgs());
  write(changed, "docs/spec.md", "# Spec\n\nChanged after the card was shown.\n");
  assert.deepEqual(kit.status(changed).decisions, []);
  assert.equal((await apply(changed, ["scope:choose"], stale.id, button)).envelope.code, "DECISION_STALE");
  assert.equal(kit.status(changed).scope, null);

  // ── real Node IPC: the forked CLI applies the decision with the root it resolved itself.
  const ipc = hostProject();
  const ipcChoice = decisionOf(ipc, chooseArgs());
  const cliFile = path.join(build.directory, "workflow-kit", "src", "workflow-kit-cli.js");
  const forked = (args, check) =>
    new Promise((resolve) => {
      const child = fork(cliFile, args, { cwd: ipc, env, serialization: "json", stdio: ["ignore", "pipe", "pipe", "ipc"] });
      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.resume();
      child.on("message", (message) => {
        const { requestId } = message;
        if (message.type === "wfk-host-hello") {
          child.send({ protocol: PROTOCOL, requestId, ticket: "T-2", type: "wfk-host-ticket" });
        } else if (message.type === "wfk-host-verify") {
          const ok = message.ticket === "T-2" && message.payloadDigest === hostDigest(message.payload) && check(message.payload);
          child.send({ ok, protocol: PROTOCOL, reason: ok ? undefined : "binding", requestId, type: "wfk-host-verdict" });
        }
      });
      let pending = 2;
      const settle = () => {
        pending -= 1;
        if (pending === 0) resolve(JSON.parse(stdout));
      };
      child.on("exit", settle);
      child.stdout.on("end", settle);
    });
  const ipcArgs = ["scope:choose", "--decision", ipcChoice.id, ...button, "--expected-revision", String(revision(ipc))];
  const otherRoot = await forked(ipcArgs, (payload) => sameRoot(payload.root, project(null)));
  assert.equal(otherRoot.code, "HOST_AUTH_INVALID");
  assert.equal(kit.status(ipc).scope, null);
  const viaIpc = await forked(ipcArgs, (payload) => sameRoot(payload.root, ipc) && payload.decisionId === ipcChoice.id);
  assert.equal(viaIpc.ok, true, JSON.stringify(viaIpc));
  assert.equal(kit.status(ipc).scope.id, "auto");
  assert.equal(kit.status(ipc).decisionsMode, "host");

  // ── unblock.
  const blocked = hostProject();
  const blockedChoice = decisionOf(blocked, chooseArgs());
  await apply(blocked, ["scope:choose"], blockedChoice.id, button);
  kit.block(blocked, "Waiting for the user's API key");
  const unblock = decisionOf(blocked, ["task:unblock"]);
  assert.equal(unblock.kind, "unblock");
  assert.equal(unblock.params.reasonDigest, hostDigest("Waiting for the user's API key"));
  assert.equal(plans.read(blocked).scope.status, "BLOCKED");
  // Unblocked and blocked again for another reason: the old card does not unblock it.
  kit.unblock(blocked);
  kit.block(blocked, "Another reason");
  assert.equal((await apply(blocked, ["task:unblock"], unblock.id, button)).envelope.code, "DECISION_STALE");
  const unblock2 = decisionOf(blocked, ["task:unblock"]);
  const freed = await apply(blocked, ["task:unblock"], unblock2.id, button);
  assert.equal(freed.envelope.ok, true, JSON.stringify(freed.envelope));
  assert.equal(plans.read(blocked).scope.status, "ACTIVE");
  assert.equal(records(blocked).at(-1).kind, "unblock");

  // ── approve-install: the stored input is applied, not the file.
  const marker = (name) => ({ args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(name)}, "x")`], executable: "node" });
  const profile = (name) => ({
    checks: [{ command: { args: ["-e", "process.exit(0)"], executable: "node" }, id: "lint", required: true, role: "lint", stage: "commit" }],
    install: [marker(name)],
    stacks: ["node"],
  });
  write(blocked, ".harness/inputs/quality.json", JSON.stringify({ ...profile("tool-a.txt"), approval: "The agent says the user approved" }));
  const qualityArgs = ["quality:apply", "--input", ".harness/inputs/quality.json"];
  const install = decisionOf(blocked, qualityArgs);
  assert.equal(install.kind, "approve-install");
  assert.deepEqual(install.params.install, [marker("tool-a.txt")]);
  assert.equal(quality.readConfig(blocked).quality.status, "DISCOVERY");
  // Editing the file changes nothing: the request and the card stay.
  write(blocked, ".harness/inputs/quality.json", JSON.stringify(profile("tool-evil.txt")));
  assert.deepEqual(kit.status(blocked).decisions.map((item) => [item.id, item.params.install[0].args[1]]), [[install.id, marker("tool-a.txt").args[1]]]);
  // A new call with another input replaces the request; the old button is stale.
  write(blocked, ".harness/inputs/quality.json", JSON.stringify(profile("tool-b.txt")));
  const install2 = decisionOf(blocked, qualityArgs);
  assert.notEqual(install2.id, install.id);
  assert.equal((await apply(blocked, ["quality:apply"], install.id, button)).envelope.code, "DECISION_STALE");
  write(blocked, ".harness/inputs/quality.json", JSON.stringify(profile("tool-evil.txt")));
  const applied = await apply(blocked, ["quality:apply"], install2.id, ["--source", "button", "--note", "Установить инструменты"]);
  assert.equal(applied.envelope.ok, true, JSON.stringify(applied.envelope));
  assert.equal(readFileSync(path.join(blocked, "tool-b.txt"), "utf8"), "x");
  assert.throws(() => readFileSync(path.join(blocked, "tool-evil.txt")));
  assert.throws(() => readFileSync(path.join(blocked, "tool-a.txt")));
  assert.equal(quality.readConfig(blocked).quality.status, "CONFIGURED");
  assert.equal(records(blocked).at(-1).kind, "approve-install");
  // A profile without installs needs no decision.
  write(blocked, ".harness/inputs/plain.json", JSON.stringify({ checks: profile("x").checks, stacks: ["node"] }));
  // (The same profile again: the command runs and finds nothing to commit.)
  assert.equal(envelope(blocked, ["quality:apply", "--input", ".harness/inputs/plain.json"]).code, "NOTHING_TO_COMMIT");

  // ── the live grant of a run starts its delivery task without flags (source grant).
  const run = hostProject();
  const runChoice = decisionOf(run, chooseArgs());
  const byGrant = await apply(run, ["scope:choose"], runChoice.id, ["--source", "grant", "--autopilot-run", "run-1", "--note", "автоматически, по поручению запуска run-1"], (payload) => payload.runId === "run-1" && payload.decisionId === runChoice.id);
  assert.equal(byGrant.envelope.ok, true, JSON.stringify(byGrant.envelope));
  assert.deepEqual(records(run)[0].source, { authorization: null, kind: "grant", messageId: null, runId: "run-1", session: null });
  const runDigest = plans.read(run).scope.proposal.digest;
  kit.authorize(run, grantInput(runDigest), revision(run));
  kit.startTask(run, "N");
  write(run, "docs/note.md", "# Note\n");
  kit.commitTask(run, "N");
  kit.startTask(run, "DOCS-R1");
  write(run, "docs/overview.md", "# Overview\n");
  kit.commitTask(run, "DOCS-R1", {
    digest: { contracts: [], decisions: [], references: [], result: "The note exists." },
    files: ["docs/overview.md"],
  });
  // A revoked grant covers nothing: the delivery asks the user again.
  kit.revoke(run, { note: "Settings: off", reason: "settings-off", runId: "run-1" }, revision(run));
  const paused = decisionOf(run, ["task:start", "D1"]);
  assert.equal((await apply(run, ["task:start", "D1"], paused.id, ["--source", "grant", "--autopilot-run", "run-1", "--note", "run"])).envelope.code, "AUTOPILOT_REVOKED");
  assert.equal(plans.read(run).currentTaskId, null);
  kit.authorize(run, grantInput(runDigest, { source: "panel-resume" }), revision(run));
  assert.deepEqual(kit.status(run).decisions.map((item) => item.id), [paused.id]);
  assert.equal(envelope(run, ["task:start", "D1", "--autopilot-run", "run-x"]).code, "AUTOPILOT_UNAUTHORIZED");
  const auto = envelope(run, ["task:start", "D1"]);
  assert.equal(auto.ok, true, JSON.stringify(auto));
  const grantRecord = plans.read(run).scope.decisions.at(-1);
  assert.equal(grantRecord.kind, "confirm-delivery");
  assert.equal(grantRecord.source.kind, "grant");
  assert.equal(grantRecord.source.runId, "run-1");
  assert.equal(grantRecord.source.authorization, hostDigest(plans.read(run).scope.authorization));
  assert.match(plans.read(run).tasks.find((task) => task.id === "D1").confirmation, /^Autopilot run run-1/u);
  assert.deepEqual(kit.status(run).decisions, []);
  // A repeat of the started task is the same answer, not a new request.
  assert.equal(envelope(run, ["task:start", "D1"]).ok, true);

  // ── the agent mode and a project without the key behave as Kit 2.3.3.
  for (const mode of ["agent", null]) {
    const manual = hostProject(mode);
    assert.equal(kit.decisionsMode(manual), "agent");
    assert.equal(kit.status(manual).decisionsMode, "agent");
    assert.equal(envelope(manual, [...chooseArgs(), "--decision", "dec-000000000000", ...button, "--expected-revision", "1"]).code, "USAGE");
    assert.equal(envelope(manual, chooseArgs()).ok, true);
    assert.deepEqual(kit.status(manual).decisions, []);
    assert.deepEqual(records(manual), []);
    kit.authorize(manual, grantInput(plans.read(manual).scope.proposal.digest), revision(manual));
    kit.startTask(manual, "N");
    write(manual, "docs/note.md", "# Note\n");
    kit.commitTask(manual, "N");
    kit.startTask(manual, "DOCS-R1");
    write(manual, "docs/overview.md", "# Overview\n");
    kit.commitTask(manual, "DOCS-R1", {
      digest: { contracts: [], decisions: [], references: [], result: "The note exists." },
      files: ["docs/overview.md"],
    });
    // Without flags the delivery is still refused; the manual confirmation and the run flag work.
    assert.equal(envelope(manual, ["task:start", "D1"]).code, "DELIVERY_CONFIRMATION");
    assert.equal(envelope(manual, ["task:start", "D1", "--confirmed", "User said ship"]).ok, true);
    write(manual, "docs/release.md", "# Release\n");
    kit.commitTask(manual, "D1");
    assert.equal(envelope(manual, ["accept", "--note", "User accepts"]).ok, true);
    assert.equal(envelope(manual, ["close", "--scope", "auto", "--note", "User: close the plan"]).ok, true);
    assert.equal(plans.read(manual).lastClosed.decision, undefined);
  }
  console.log("workflow-kit-decisions-grant tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, maxRetries: 5, recursive: true });
  }
  await build.cleanup();
}
