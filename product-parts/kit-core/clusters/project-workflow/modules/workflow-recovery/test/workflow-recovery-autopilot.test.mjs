import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// M39 T004: the `next` section under an autopilot grant. A live run does not
// ask again for what it authorized; the host steps stay with the app; without
// a live run (none, revoked, changed digest) the manual barriers remain.
const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan", "workflow-recovery"],
  "workflow-recovery-autopilot"
);
try {
  const { WorkflowPlanFacade } = await build.load("workflow-plan", "workflow-plan-facade.js");
  const { WorkflowRecoveryFacade } = await build.load("workflow-recovery", "workflow-recovery-facade.js");
  const plans = new WorkflowPlanFacade();
  const recovery = new WorkflowRecoveryFacade();
  const context = { baselineCommit: "a".repeat(40), now: "2026-11-16T10:00:00.000Z", qualityConfigured: true };
  const DIGEST = "d".repeat(64);
  const automation = (manual) => ({
    acceptance: [
      manual
        ? { checks: [], criterion: 0, evidence: [], kind: "manual" }
        : { checks: [], criterion: 0, evidence: ["docs/e.md"], kind: "automatic" },
    ],
    ci: null,
    delivery: [{ effects: ["npm run package"], taskId: "D1" }],
    publication: { branch: "main", upstream: "origin/main" },
  });
  const scope = (manual = false) => {
    const plan = plans.createScope(
      plans.createEmpty("p", "Demo"),
      {
        acceptance: ["Shipped"],
        approval: "User approved the demo scope",
        automation: automation(manual),
        execution: { ownerSession: "s-1", strategy: "sequential" },
        id: "demo",
        objective: "Demo",
        spec: "docs/spec.md",
        tasks: [
          { acceptance: ["w"], commitMessage: "docs: w", files: ["docs/w.md"], id: "W", title: "W" },
          { acceptance: ["p"], commitMessage: "chore: package", dependencies: ["W"], id: "D1", kind: "delivery", title: "Package" },
        ],
      },
      context
    );
    plan.scope.proposal = { digest: DIGEST, generation: 1 };
    return plans.validate(plan);
  };
  const grant = (plan, fields = {}) =>
    plans.authorize(
      plan,
      {
        accept: !fields.manual,
        acceptancePolicy: fields.manual ? "manual" : "automatic",
        ci: null,
        close: true,
        deliveryTaskIds: ["D1"],
        mode: "after-start",
        note: "User started the plan with the after-start autopilot",
        ownerSession: "s-1",
        proposalDigest: DIGEST,
        publication: { branch: "main", upstream: "origin/main" },
        runId: "run-1",
        scopeId: "demo",
        source: "panel-start",
      },
      "2026-11-16T11:00:00.000Z"
    ).plan;
  // W and DOCS-R1 are DONE: D1 is the next task.
  const atDelivery = (plan) => {
    const next = structuredClone(plan);
    for (const task of next.tasks) {
      if (task.id !== "D1") task.status = "DONE";
    }
    next.rounds[0].digest = { contracts: [], decisions: [], references: [], result: "W." };
    return plans.validate(next);
  };
  const withDelivery = (plan, delivery) => {
    const next = structuredClone(plan);
    for (const task of next.tasks) task.status = "DONE";
    next.rounds[0].digest = { contracts: [], decisions: [], references: [], result: "W." };
    next.rounds[0].status = "CLOSED";
    next.scope.delivery = delivery;
    if (delivery === "ACCEPTED") next.scope.acceptanceNote = "User: accepted";
    return next;
  };
  const nextOf = (plan, changes = [], decisions = undefined) => {
    const text = recovery.build({
      budgetBytes: 32_000,
      changes,
      ...(decisions ? { decisions } : {}),
      event: "startup",
      head: "b".repeat(40),
      plan,
      quality: { stacks: [], status: "NONE" },
      readDocument: () => null,
      taskCommits: {},
      transaction: null,
      verification: null,
    }).text;
    return text.slice(text.indexOf("## next\n") + 8, text.indexOf("\n\n## ", text.indexOf("## next\n")));
  };

  // No grant: the user confirms the delivery, accepts and closes; no run rule.
  const manual = nextOf(atDelivery(scope()));
  assert.match(manual, /^Next task D1 is delivery: ask the user to confirm it, then `scripts\/workflow task:start D1 --confirmed "<user confirmation>"`\./u);
  assert.doesNotMatch(manual, /Autopilot run/u);
  assert.equal(nextOf(withDelivery(scope(), "READY_FOR_ACCEPTANCE")).split("\n")[0], "Scope is READY_FOR_ACCEPTANCE: ask the user to accept the result or report defects.");
  assert.equal(nextOf(withDelivery(scope(), "ACCEPTED")).split("\n")[0], "Scope is ACCEPTED: the user decides when to close it.");

  // A live run: the delivery starts with the run, no second question; the run rule follows.
  const live = grant(scope());
  const delivery = nextOf(atDelivery(live));
  assert.match(delivery, /^Next task D1 is delivery, confirmed in advance by autopilot run run-1: `scripts\/workflow task:start D1 --autopilot-run run-1`\. Do not ask the user again/u);
  assert.match(delivery, /\nAutopilot run run-1 \(after-start\): report the result of the turn briefly and end it; the Workflow Kit app continues the run — do not ask whether to continue\./u);
  assert.match(delivery, /never run `autopilot:\*`, `accept --autopilot-run` or `close --autopilot-run`\.$/u);
  const ready = nextOf(withDelivery(live, "READY_FOR_ACCEPTANCE"));
  assert.match(ready, /^Scope is READY_FOR_ACCEPTANCE: end the turn\. Autopilot run run-1 accepts the result automatically from the recorded evidence and closes the scope; the Workflow Kit app runs these steps\. Never run `accept` or `close` yourself\./u);
  const untidy = nextOf(withDelivery(live, "READY_FOR_ACCEPTANCE"), ["notes.txt"]);
  assert.match(untidy, /^Scope is READY_FOR_ACCEPTANCE: first tidy the paths outside commits .+ clean tree\. Then end the turn\./u);
  assert.match(nextOf(withDelivery(live, "ACCEPTED")), /^Scope is ACCEPTED: end the turn\. Autopilot run run-1 closes the scope and then publishes it/u);

  // after-start with a manual criterion: the user accepts, the run closes and publishes.
  const manualRun = grant(scope(true), { manual: true });
  assert.match(nextOf(withDelivery(manualRun, "READY_FOR_ACCEPTANCE")), /^Scope is READY_FOR_ACCEPTANCE: ask the user to accept the result \(it has manual criteria\) or report defects\. After the user's `accept`, autopilot run run-1 closes and publishes the scope\./u);

  // Revoked or a changed reviewed digest: back to the manual barriers.
  const revoked = plans.revoke(live, { note: "Settings: off", reason: "settings-off", runId: "run-1" }, "2026-11-16T12:00:00.000Z").plan;
  assert.match(nextOf(atDelivery(revoked)), /^Next task D1 is delivery: ask the user to confirm it/u);
  const changed = structuredClone(live);
  changed.scope.proposal = { digest: "e".repeat(64), generation: 2 };
  assert.doesNotMatch(nextOf(atDelivery(changed)), /autopilot-run|Autopilot run/u);

  // After a close by the run the publication follows; no "wait for a new task" alone.
  const closed = plans.createEmpty("p", "Demo");
  closed.lastClosed = { autopilotRun: "run-1", closedAt: "2026-11-16T13:00:00.000Z", finalCommit: "c".repeat(40), scopeId: "demo" };
  assert.match(nextOf(closed), /^Scope demo was closed by autopilot run run-1; the Workflow Kit app publishes it to the reviewed upstream\. Do not push yourself\./u);
  // ── M40 T004, the `host` decisions mode: no text gives the agent a manual
  // form of a user decision; each names the decision and where it is taken.
  const hostOf = (plan, changes = []) => nextOf(plan, changes, "host");
  const MANUAL_FORMS = /--confirmed|--autopilot-run|--note|accept --|close --|`accept`|`close`|task:unblock|scripts\/workflow (?:accept|close)/u;
  const blockedPlan = plans.block(atDelivery(scope()), "The licence is unclear");
  const hostTexts = [
    hostOf(atDelivery(scope())),
    hostOf(atDelivery(live)),
    hostOf(withDelivery(scope(), "READY_FOR_ACCEPTANCE")),
    hostOf(withDelivery(scope(), "READY_FOR_ACCEPTANCE"), ["notes.txt"]),
    hostOf(withDelivery(live, "READY_FOR_ACCEPTANCE")),
    hostOf(withDelivery(manualRun, "READY_FOR_ACCEPTANCE")),
    hostOf(withDelivery(scope(), "ACCEPTED")),
    hostOf(withDelivery(scope(), "ACCEPTED"), ["notes.txt"]),
    hostOf(withDelivery(live, "ACCEPTED")),
    hostOf(blockedPlan),
    hostOf(atDelivery(revoked)),
  ];
  for (const text of hostTexts) {
    assert.doesNotMatch(text, MANUAL_FORMS, text);
  }
  // A delivery: the user's decision in the panel, or the chat with `wfk decision`.
  assert.match(hostTexts[0], /^Next task D1 is delivery: starting it is the user's decision\. Tell the user that the delivery waits for the confirmation in the Workflow Kit panel and end the turn; Workflow Kit starts the task after the confirmation and tells you\. If the user confirmed in this chat, run `wfk decision confirm-delivery --task D1`; never pass the user's words yourself\./u);
  assert.match(hostTexts[10], /^Next task D1 is delivery: starting it is the user's decision/u);
  // Under a live run the task starts without flags; the run rule names no manual form.
  assert.match(hostTexts[1], /^Next task D1 is delivery, covered by autopilot run run-1: `scripts\/workflow task:start D1` without flags \(Workflow Kit records the confirmation of the run itself\)\. Do not ask the user again/u);
  assert.match(hostTexts[1], /\nAutopilot run run-1 \(after-start\): report the result of the turn briefly and end it; the Workflow Kit app continues the run — do not ask whether to continue\. Only the app grants and revokes the run, accepts, closes and publishes; never run `autopilot:\*` and never accept or close the scope yourself\.$/u);
  // Acceptance and closing.
  assert.match(hostTexts[2], /^Scope is READY_FOR_ACCEPTANCE: report the result and end the turn\. Acceptance is the user's decision: the user accepts in the Workflow Kit panel or reports defects\. If the user accepts in this chat, run `wfk decision accept`; never pass the user's words yourself\./u);
  assert.match(hostTexts[3], /^Scope is READY_FOR_ACCEPTANCE: first tidy the paths outside commits .+ clean tree\. Then report the result and end the turn\./u);
  assert.match(hostTexts[4], /^Scope is READY_FOR_ACCEPTANCE: end the turn\. Autopilot run run-1 accepts the result automatically from the recorded evidence and closes the scope; the Workflow Kit app runs these steps\. Never accept or close the scope yourself\./u);
  assert.match(hostTexts[5], /The result has manual criteria; after the acceptance autopilot run run-1 closes and publishes the scope\. If the user accepts in this chat, run `wfk decision accept`/u);
  assert.match(hostTexts[6], /^Scope is ACCEPTED: closing it is the user's separate decision in the Workflow Kit panel\. If the user tells you in this chat to close the plan, run `wfk decision close`; never pass the user's words yourself\.\n/u);
  assert.match(hostTexts[7], /Closing needs a clean tree: tidy the paths outside commits \(see changes\)\./u);
  assert.match(hostTexts[8], /^Scope is ACCEPTED: end the turn\. Autopilot run run-1 closes the scope and then publishes it; the Workflow Kit app runs these steps\. Never close the scope or push yourself\./u);
  // A blocked scope.
  assert.match(hostTexts[9], /^BLOCKED: The licence is unclear\. Only discuss and diagnose\. Removing the block is the user's decision: it waits on a card in the Workflow Kit panel\. If the user decides in this chat, run `wfk decision unblock`; never pass the user's words yourself\./u);
  // The `agent` mode is the default and keeps its texts.
  assert.equal(nextOf(atDelivery(scope()), [], "agent"), manual);
  assert.match(nextOf(blockedPlan), /^BLOCKED: The licence is unclear\. Resolve it with the user, then unblock\./u);
  console.log("workflow-recovery autopilot tests passed");
} finally {
  await build.cleanup();
}
