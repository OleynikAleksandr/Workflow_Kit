import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  automatedScope,
  CI,
  gitCommit,
} from "./workflow-kit-autopilot-support.mjs";
import { openKit, write } from "./workflow-kit-support.mjs";

// Shared by the M40 decisions tests: the compiled Kit, projects in the host
// decisions mode, the command line with a fake parent that confirms the
// ticket, and the root comparison of the service.

export const PROTOCOL = "wfk-host/1";

// The root comparison of the service (autopilot `root-path.ts`), with the
// platform as a parameter: win32 ignores case, slashes and a trailing
// separator; the other platforms compare the text.
function rootKey(root, platform) {
  let real = root;
  try {
    real = realpathSync.native(root);
  } catch {
    // A path that exists on no host keeps its text.
  }
  if (platform !== "win32") {
    return path.posix.normalize(real).replace(/(.)\/+$/u, "$1");
  }
  return path.win32
    .normalize(real.replace(/^\\\\\?\\(?!UNC\\)/u, ""))
    .replace(/(.)[\\/]+$/u, "$1")
    .toLowerCase();
}
export const sameRoot = (left, right, platform = process.platform) =>
  typeof left === "string" && rootKey(left, platform) === rootKey(right, platform);


/** Opens the Kit of `build` with the helpers of the decisions tests. */
export async function openDecisions(build, options) {
  const opened = await openKit(build, options);
  const { cli, env, git, kit, plans, project, quality, runCli } = opened;
  const { hostDigest } = await build.load("workflow-kit", "kit-host-auth.js");
  const envelope = (root, argv) => JSON.parse(cli(root, argv).stdout);
  const revision = (root) => plans.read(root).revision;

  /** Runs the command with a parent that confirms the ticket when `check(payload)` holds. */
  const hosted = async (root, argv, check = () => true) => {
    const events = new EventEmitter();
    const seen = [];
    let stdout = "";
    const host = {
      off: (event, listener) => events.off(event, listener),
      on: (event, listener) => events.on(event, listener),
      send: (message) => {
        seen.push(message);
        queueMicrotask(() => {
          const { requestId } = message;
          if (message.type === "wfk-host-hello") {
            events.emit("message", { protocol: PROTOCOL, requestId, ticket: "T-1", type: "wfk-host-ticket" });
          } else if (message.type === "wfk-host-verify") {
            const ok = message.payloadDigest === hostDigest(message.payload) && check(message.payload) === true;
            events.emit("message", { ok, protocol: PROTOCOL, reason: ok ? undefined : "binding", requestId, type: "wfk-host-verdict" });
          }
        });
      },
    };
    const exit = await runCli(
      argv,
      { cwd: root, env, host, readStdin: () => "", stderr: () => {}, stdout: (text) => { stdout += text; } },
      kit
    );
    const payload = seen.find((message) => message.type === "wfk-host-verify")?.payload ?? null;
    return { envelope: JSON.parse(stdout), exit, payload };
  };
  const apply = (root, command, id, extra = [], check) =>
    hosted(root, [...command, "--decision", id, "--expected-revision", String(revision(root)), ...extra], check);
  const button = ["--source", "button", "--note", "Кнопка панели"];

  /** A project in the host decisions mode with CI and the specification committed. */
  const hostProject = (decisions = "host") => {
    const root = project(null);
    const config = decisions ? { ...quality.defaultConfig(), decisions } : quality.defaultConfig();
    quality.writeConfig(root, config);
    write(root, ".github/workflows/ci.yml", CI);
    write(root, "docs/spec.md", "# Spec\n");
    gitCommit(root, env, [".harness/workflow/config.json", ".github/workflows/ci.yml", "docs/spec.md"], "chore: add CI");
    kit.proposeScope(root, automatedScope(), "sequential", "One note and one release task");
    return root;
  };
  const chooseArgs = (option = "sequential") =>
    ["scope:choose", "--generation", "1", "--option", option, "--session", "s-1", "--note", "User chose"];
  const decisionOf = (root, argv) => {
    const refused = envelope(root, argv);
    assert.equal(refused.code, "USER_DECISION_REQUIRED", JSON.stringify(refused));
    return refused.details.decision;
  };
  const subjectDigest = ({ kind, params, proposal, scopeId, taskId }) =>
    hostDigest({ kind, params, proposal, scopeId, taskId });
  const records = (root) => plans.read(root).scope?.decisions.filter((item) => item.decisionId) ?? [];

  return {
    ...opened,
    apply,
    button,
    chooseArgs,
    decisionOf,
    envelope,
    hostDigest,
    hostProject,
    hosted,
    records,
    revision,
    subjectDigest,
  };
}
