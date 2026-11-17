import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";
import { grantInput } from "./workflow-kit-autopilot-support.mjs";
import { openDecisions } from "./workflow-kit-decisions-support.mjs";
import { write } from "./workflow-kit-support.mjs";

// M40 T004: a project in the `host` decisions mode gets recovery and
// autopilot texts without manual forms of user decisions, read from its own
// configuration; a block registers the request to remove it at once, so the
// card needs no command of the agent. The `agent` mode keeps its texts.
const build = await buildWorkflowModules(["workflow-kit"], "workflow-kit-host-texts");
const roots = [];
const DIGEST = { contracts: [], decisions: [], references: [], result: "The note exists." };
const MANUAL_FORMS = /--confirmed|--autopilot-run|--note|accept --|close --|`accept`|`close`|task:unblock|scripts\/workflow (?:accept|close)/u;

try {
  const { apply, button, chooseArgs, decisionOf, hostProject, kit, plans, revision } =
    await openDecisions(build, { clock: "19:00", prefix: "workflow-host-texts-", roots });
  /** The `next` section of the recovery packet. */
  const nextOf = (root) => {
    const { text } = kit.recover(root, "startup");
    const start = text.indexOf("## next\n") + 8;
    return text.slice(start, text.indexOf("\n\n## ", start));
  };
  /** Finishes N and the round DOCS: the delivery D1 is next. */
  const toDelivery = (root) => {
    kit.startTask(root, "N");
    write(root, "docs/note.md", "# Note\n");
    kit.commitTask(root, "N");
    kit.startTask(root, "DOCS-R1");
    write(root, "docs/overview.md", "# Overview\n");
    kit.commitTask(root, "DOCS-R1", { digest: DIGEST, files: ["docs/overview.md"] });
  };

  // ── the host mode.
  const host = hostProject();
  await apply(host, ["scope:choose"], decisionOf(host, chooseArgs()).id, button);
  assert.equal(kit.autopilotStatus(host).decisionsMode, "host");
  // A block: the request is in the status without any decision command.
  kit.block(host, "The licence is unclear");
  const pending = kit.status(host).decisions;
  assert.deepEqual(pending.map((item) => item.kind), ["unblock"]);
  const blocked = nextOf(host);
  assert.match(blocked, /^BLOCKED: The licence is unclear\. Only discuss and diagnose\. Removing the block is the user's decision: it waits on a card in the Workflow Kit panel\. If the user decides in this chat, run `wfk decision unblock`/u);
  // The same request applies with the ticket of the button.
  assert.equal((await apply(host, ["task:unblock"], pending[0].id, button)).envelope.ok, true);
  assert.deepEqual(kit.status(host).decisions, []);
  toDelivery(host);
  // The delivery without a run: the user's decision, no manual form.
  const delivery = nextOf(host);
  assert.match(delivery, /^Next task D1 is delivery: starting it is the user's decision\./u);
  assert.match(delivery, /`wfk decision confirm-delivery --task D1`/u);
  // Under a live run the task starts without flags.
  kit.authorize(host, grantInput(plans.read(host).scope.proposal.digest), revision(host));
  const covered = nextOf(host);
  assert.match(covered, /^Next task D1 is delivery, covered by autopilot run run-1: `scripts\/workflow task:start D1` without flags/u);
  assert.match(covered, /never run `autopilot:\*` and never accept or close the scope yourself\.$/u);
  for (const text of [blocked, delivery, covered]) {
    assert.doesNotMatch(text, MANUAL_FORMS, text);
  }
  assert.equal(kit.startTask(host, "D1").task.status, "IN_PROGRESS");

  // ── the agent mode: the manual forms stay, a block registers nothing.
  const agent = hostProject("agent");
  kit.chooseScope(agent, { generation: 1, note: "User chose sequential", option: "sequential", session: "s-1" });
  assert.equal(kit.autopilotStatus(agent).decisionsMode, "agent");
  kit.block(agent, "The licence is unclear");
  assert.deepEqual(kit.status(agent).decisions, []);
  assert.match(nextOf(agent), /^BLOCKED: The licence is unclear\. Resolve it with the user, then unblock\./u);
  kit.unblock(agent);
  toDelivery(agent);
  assert.match(nextOf(agent), /^Next task D1 is delivery: ask the user to confirm it, then `scripts\/workflow task:start D1 --confirmed "<user confirmation>"`\./u);
  kit.authorize(agent, grantInput(plans.read(agent).scope.proposal.digest), revision(agent));
  assert.match(nextOf(agent), /`scripts\/workflow task:start D1 --autopilot-run run-1`/u);
  console.log("workflow-kit host texts tests passed");
} finally {
  for (const root of roots) {
    rmSync(root, { force: true, maxRetries: 5, recursive: true });
  }
  await build.cleanup();
}
