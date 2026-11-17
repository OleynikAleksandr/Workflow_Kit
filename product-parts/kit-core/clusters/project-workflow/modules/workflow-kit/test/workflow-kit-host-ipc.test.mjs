import assert from "node:assert/strict";
import { execFileSync, fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { chosenProject, grantInput } from "./workflow-kit-autopilot-support.mjs";
import { openKit, write } from "./workflow-kit-support.mjs";

// M39 T002: host-only operations need the parent's IPC verdict. The fake
// channel checks the protocol edges; a real fork of the compiled CLI checks
// the Node IPC on every OS.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-host-ipc");
const roots = [];

// The root as the service compares it (M39 F004): the native realpath expands the 8.3 names of
// a Windows temporary folder (`RUNNER~1`), which the Kit and git name in the long form, and
// returns the case stored on disk on every OS.
function sameRoot(left, right) {
  return typeof left === "string" && realpathSync.native(left) === realpathSync.native(right);
}
const PROTOCOL = "wfk-host/1";
try {
  const opened = await openKit(build, { clock: "13:00", prefix: "workflow-host-", roots });
  const { cli, git, kit, plans } = opened;
  const { hostDigest, verifyHost } = await build.load("workflow-kit", "kit-host-auth.js");
  const request = {
    expectedRevision: 3,
    inputDigest: "a".repeat(64),
    operation: "autopilot:authorize",
    ownerSession: "s-1",
    root: "/project",
    runId: "run-1",
    scopeId: "auto",
  };

  // A fake parent: `answer(message, channel)` replies to the child's messages.
  const channel = (answer) => {
    const events = new EventEmitter();
    const sent = [];
    return {
      emit: (event, value) => events.emit(event, value),
      off: (event, listener) => events.off(event, listener),
      on: (event, listener) => events.on(event, listener),
      send: (message) => {
        sent.push(message);
        queueMicrotask(() => answer(message, (reply) => events.emit("message", reply), events));
      },
      sent,
    };
  };
  const refusal = async (promise) => {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    assert.fail("expected a refusal");
  };
  const honest = (verdict = { ok: true }) => (message, reply) => {
    if (message.type === "wfk-host-hello") {
      reply({ protocol: PROTOCOL, requestId: message.requestId, ticket: "T-1", type: "wfk-host-ticket" });
    } else if (message.type === "wfk-host-verify") {
      reply({ protocol: PROTOCOL, requestId: message.requestId, type: "wfk-host-verdict", ...verdict });
    }
  };

  // No channel: HOST_AUTH_REQUIRED before anything else.
  assert.throws(() => verifyHost(null, request), (error) => error.code === "HOST_AUTH_REQUIRED");
  // The honest parent: the verify message carries the ticket, the payload and its digest.
  const ok = channel(honest());
  await verifyHost(ok, request, 1000);
  const verify = ok.sent.find((message) => message.type === "wfk-host-verify");
  assert.equal(verify.ticket, "T-1");
  assert.deepEqual(verify.payload, request);
  assert.equal(verify.payloadDigest, hostDigest(request));
  assert.equal(ok.sent[0].requestId, verify.requestId);
  // A refusal, a foreign request id, a disconnect and silence are HOST_AUTH_INVALID.
  assert.equal((await refusal(verifyHost(channel(honest({ ok: false, reason: "ticket expired" })), request, 1000))).code, "HOST_AUTH_INVALID");
  const foreign = channel((message, reply) => {
    reply({ protocol: PROTOCOL, requestId: "other", ticket: "T", type: "wfk-host-ticket" });
    reply({ ok: true, protocol: PROTOCOL, requestId: "other", type: "wfk-host-verdict" });
  });
  const foreignError = await refusal(verifyHost(foreign, request, 50));
  assert.equal(foreignError.code, "HOST_AUTH_INVALID");
  assert.equal(foreignError.details.reason, "no answer in time");
  assert.equal(foreign.sent.some((message) => message.type === "wfk-host-verify"), false);
  const early = channel((message, reply) => {
    // A verdict before the ticket is ignored.
    reply({ ok: true, protocol: PROTOCOL, requestId: message.requestId, type: "wfk-host-verdict" });
  });
  assert.equal((await refusal(verifyHost(early, request, 50))).code, "HOST_AUTH_INVALID");
  const gone = channel((_message, _reply, events) => events.emit("disconnect"));
  assert.equal((await refusal(verifyHost(gone, request, 1000))).details.reason, "the host disconnected");

  // The project and the in-process command line: no channel, nothing written.
  const { digest, root } = chosenProject(opened);
  const revision = () => plans.read(root).revision;
  write(root, ".harness/inputs/grant.json", JSON.stringify(grantInput(digest)));
  const head = git.head(root);
  const before = revision();
  const envelope = (argv) => JSON.parse(cli(root, argv).stdout);
  const authorizeArgs = ["autopilot:authorize", "--input", ".harness/inputs/grant.json", "--expected-revision", String(before)];
  assert.equal(envelope(authorizeArgs).code, "HOST_AUTH_REQUIRED");
  assert.equal(envelope(["autopilot:revoke", "--run", "run-1", "--reason", "user-stop", "--note", "stop", "--expected-revision", String(before)]).code, "HOST_AUTH_REQUIRED");
  write(root, ".harness/inputs/evidence.json", JSON.stringify({ ci: null, criteria: [], head }));
  assert.equal(envelope(["accept", "--autopilot-run", "run-1", "--input", ".harness/inputs/evidence.json", "--expected-revision", String(before)]).code, "HOST_AUTH_REQUIRED");
  assert.equal(envelope(["close", "--scope", "auto", "--autopilot-run", "run-1", "--expected-revision", String(before)]).code, "HOST_AUTH_REQUIRED");
  assert.equal(envelope(["accept", "--note", "User accepts", "--autopilot-run", "run-1", "--input", ".harness/inputs/evidence.json", "--expected-revision", "1"]).code, "USAGE");
  assert.equal(envelope(["close", "--scope", "auto", "--note", "User: close it", "--autopilot-run", "run-1"]).code, "USAGE");
  assert.equal(envelope(["autopilot:authorize", "--input", ".harness/inputs/grant.json"]).code, "USAGE");
  // The manual forms keep their old behaviour.
  assert.equal(envelope(["accept", "--note", "User accepts"]).code, "NOT_READY");
  assert.equal(revision(), before);
  assert.equal(git.head(root), head);

  // Real Node IPC: fork the compiled CLI; the parent answers with its ticket.
  const cliFile = path.join(build.directory, "workflow-kit", "src", "workflow-kit-cli.js");
  const forked = (args, behave, env = opened.env) =>
    new Promise((resolve) => {
      const child = fork(cliFile, args, { cwd: root, env, serialization: "json", stdio: ["ignore", "pipe", "pipe", "ipc"] });
      let stdout = "";
      const seen = [];
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      // Unread stderr would keep "close" from firing.
      child.stderr.resume();
      child.on("message", (message) => {
        seen.push(message);
        behave(message, child);
      });
      // "close" does not follow a disconnect by the parent: wait for the exit and the output end.
      let exit = null;
      let pending = 2;
      const settle = () => {
        pending -= 1;
        if (pending === 0) resolve({ envelope: JSON.parse(stdout), exit, seen });
      };
      child.on("exit", (code) => {
        exit = code;
        settle();
      });
      child.stdout.on("end", settle);
    });
  const ticket = "ticket-secret-1";
  const parent = (check) => (message, child) => {
    if (message.type === "wfk-host-hello") {
      child.send({ protocol: PROTOCOL, requestId: message.requestId, ticket, type: "wfk-host-ticket" });
    } else if (message.type === "wfk-host-verify") {
      const ok = message.ticket === ticket && message.payloadDigest === hostDigest(message.payload) && check(message.payload);
      child.send({ ok, protocol: PROTOCOL, reason: ok ? undefined : "binding", requestId: message.requestId, type: "wfk-host-verdict" });
    }
  };
  // A binding the parent refuses: nothing is written.
  const wrong = await forked(authorizeArgs, parent((payload) => payload.expectedRevision === before + 7));
  assert.equal(wrong.envelope.code, "HOST_AUTH_INVALID");
  assert.equal(wrong.exit, 1);
  assert.equal(revision(), before);
  // The parent disconnects after the hello: refused without a write.
  const dropped = await forked(authorizeArgs, (message, child) => child.disconnect());
  assert.equal(dropped.envelope.code, "HOST_AUTH_INVALID");
  assert.equal(revision(), before);
  // A process without the channel: HOST_AUTH_REQUIRED, whatever the environment says.
  let plain;
  try {
    execFileSync(process.execPath, [cliFile, ...authorizeArgs], {
      cwd: root,
      encoding: "utf8",
      env: { ...opened.env, HARNESS_HOST_TICKET: ticket, WFK_HOST: "1" },
    });
  } catch (error) {
    plain = JSON.parse(error.stdout);
  }
  assert.equal(plain.code, "HOST_AUTH_REQUIRED");
  // The honest parent: the payload is bound to this project, run, scope and input.
  const done = await forked(authorizeArgs, parent((payload) =>
    payload.operation === "autopilot:authorize" &&
    sameRoot(payload.root, root) &&
    payload.runId === "run-1" &&
    payload.scopeId === "auto" &&
    payload.ownerSession === "s-1" &&
    payload.expectedRevision === before &&
    payload.inputDigest === hostDigest(grantInput(digest))
  ));
  assert.equal(done.envelope.ok, true, JSON.stringify(done.envelope));
  assert.equal(done.exit, 0);
  assert.equal(done.envelope.result.grant.runId, "run-1");
  assert.equal(plans.read(root).scope.authorization.runId, "run-1");
  assert.deepEqual(done.seen.map((message) => message.type), ["wfk-host-hello", "wfk-host-verify"]);
  assert.doesNotMatch(JSON.stringify(done.envelope), new RegExp(ticket, "u"));
  // The same revision again is stale after the write.
  const stale = await forked(authorizeArgs, parent(() => true));
  assert.equal(stale.envelope.code, "REVISION_MISMATCH");
  assert.ok(kit.status(root).scope);
  console.log("workflow-kit host ipc tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, recursive: true });
  }
  await build.cleanup();
}
