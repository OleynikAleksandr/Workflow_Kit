import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// M39: the autopilot grant of a scope, its revocation, delivery, acceptance and close.
const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-authorization"
);
try {
  const { WorkflowPlanFacade, authorizationSummary } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const plans = new WorkflowPlanFacade();
  const context = {
    baselineCommit: "a".repeat(40),
    now: "2026-11-16T10:00:00.000Z",
    qualityConfigured: false,
  };
  const DIGEST = "d".repeat(64);
  const automation = (manual = false) => ({
    acceptance: [
      { checks: ["unit"], criterion: 0, evidence: [], kind: "automatic" },
      manual
        ? { checks: [], criterion: 1, evidence: [], kind: "manual" }
        : { checks: [], criterion: 1, evidence: ["docs/e.md"], kind: "automatic" },
    ],
    ci: {
      branch: "ci/demo",
      exactSha: true,
      remote: "origin",
      requiredChecks: ["Linux x64"],
    },
    delivery: [
      { effects: ["npm run package"], taskId: "D1" },
      { effects: ["push ci/demo"], taskId: "D2" },
    ],
    publication: { branch: "main", upstream: "origin/main" },
  });
  const scope = (fields = {}) => {
    const plan = plans.createScope(
      plans.createEmpty("p", "Demo"),
      {
        acceptance: ["Works", "Shipped"],
        approval: "User approved the demo scope",
        automation: automation(),
        execution: { ownerSession: "s-1", strategy: "sequential" },
        id: "demo",
        objective: "Demo",
        spec: "docs/spec.md",
        tasks: [
          {
            acceptance: ["w"],
            commitMessage: "feat: w",
            files: ["src/w.ts"],
            id: "W",
            title: "W",
          },
          {
            acceptance: ["p"],
            commitMessage: "chore: package",
            dependencies: ["W"],
            id: "D1",
            kind: "delivery",
            title: "Package",
          },
          {
            acceptance: ["c"],
            commitMessage: "chore: ci",
            dependencies: ["D1"],
            id: "D2",
            kind: "delivery",
            title: "CI",
          },
        ],
        ...fields,
      },
      context
    );
    plan.scope.proposal = { digest: DIGEST, generation: 1 };
    return plans.validate(plan);
  };
  const input = (fields = {}) => ({
    accept: true,
    acceptancePolicy: "automatic",
    ci: automation().ci,
    close: true,
    deliveryTaskIds: ["D1", "D2"],
    mode: "after-start",
    note: "User started the plan with the after-start autopilot",
    ownerSession: "s-1",
    proposalDigest: DIGEST,
    publication: { branch: "main", upstream: "origin/main" },
    runId: "run-1",
    scopeId: "demo",
    source: "panel-start",
    ...fields,
  });
  const code = (action) => {
    try {
      action();
    } catch (error) {
      return error.code;
    }
    return "OK";
  };
  const at = "2026-11-16T11:00:00.000Z";

  // A grant of the reviewed plan; the plan revision grows.
  const base = scope();
  const first = plans.authorize(base, input(), at);
  assert.equal(first.changed, true);
  assert.equal(first.plan.revision, base.revision + 1);
  assert.equal(first.grant.revision, 1);
  assert.deepEqual(
    first.grant.delivery.map((entry) => entry.taskId),
    ["D1", "D2"]
  );
  assert.deepEqual(first.plan.scope.authorization, first.grant);
  assert.deepEqual(plans.parse(plans.render(first.plan)), first.plan);
  assert.equal(
    authorizationSummary(first.grant),
    "run run-1 (after-start, authorization 1, panel-start): delivery D1, D2; accept automatic; close yes; publication main → origin/main"
  );
  // The same boundaries again change nothing.
  assert.equal(plans.authorize(first.plan, input(), at).changed, false);

  // Refusals before anything changes.
  assert.equal(code(() => plans.authorize(base, input({ scopeId: "x" }), at)), "AUTOPILOT_SCOPE_MISMATCH");
  assert.equal(code(() => plans.authorize(base, input({ ownerSession: "s-2" }), at)), "AUTOPILOT_SCOPE_MISMATCH");
  assert.equal(code(() => plans.authorize(base, input({ proposalDigest: "e".repeat(64) }), at)), "AUTOPILOT_PLAN_CHANGED");
  const weakerCi = { ...automation().ci, requiredChecks: [] };
  assert.equal(code(() => plans.authorize(base, input({ ci: weakerCi }), at)), "AUTOPILOT_PLAN_CHANGED");
  assert.equal(code(() => plans.authorize(base, input({ ci: { ...automation().ci, exactSha: false } }), at)), "AUTOPILOT_PLAN_CHANGED");
  assert.equal(code(() => plans.authorize(base, input({ publication: null }), at)), "AUTOPILOT_PLAN_CHANGED");
  assert.equal(code(() => plans.authorize(base, input({ deliveryTaskIds: ["W"] }), at)), "AUTOPILOT_SCOPE_MISMATCH");
  assert.equal(code(() => plans.authorize(base, input({ deliveryTaskIds: ["D9"] }), at)), "AUTOPILOT_SCOPE_MISMATCH");
  assert.equal(code(() => plans.authorize(base, input({ note: "go" }), at)), "PLAN_SCHEMA");
  assert.equal(code(() => plans.authorize(base, input({ acceptancePolicy: "manual" }), at)), "PLAN_SCHEMA");
  // A legacy plan without automation gets no grant.
  const legacy = structuredClone(base);
  delete legacy.scope.automation;
  assert.equal(code(() => plans.authorize(legacy, input(), at)), "AUTOPILOT_UNAUTHORIZED");
  // A blocked scope gets no grant.
  assert.equal(code(() => plans.authorize(plans.block(base, "waiting"), input(), at)), "AUTOPILOT_SCOPE_MISMATCH");

  // A manual criterion: accept=false with the manual policy, after-start or full (Kit 2.4.6,
  // spec M44: the full run waits for the user's acceptance); accept=true or the automatic
  // policy are refused.
  const manualBase = scope({ automation: automation(true) });
  assert.equal(code(() => plans.authorize(manualBase, input({ acceptancePolicy: "manual" }), at)), "AUTOPILOT_MANUAL_REQUIRED");
  assert.equal(code(() => plans.authorize(manualBase, input({ accept: false }), at)), "AUTOPILOT_MANUAL_REQUIRED");
  assert.equal(
    code(() => plans.authorize(manualBase, input({ accept: true, acceptancePolicy: "manual", mode: "full" }), at)),
    "AUTOPILOT_MANUAL_REQUIRED"
  );
  const full = plans.authorize(manualBase, input({ accept: false, acceptancePolicy: "manual", mode: "full" }), at);
  assert.deepEqual([full.grant.mode, full.grant.accept, full.grant.close, full.grant.acceptancePolicy], ["full", false, true, "manual"]);
  const manual = plans.authorize(manualBase, input({ accept: false, acceptancePolicy: "manual" }), at);
  assert.equal(manual.grant.accept, false);
  assert.equal(manual.grant.close, true);

  // Another run waits until the current one is revoked.
  assert.equal(code(() => plans.authorize(first.plan, input({ runId: "run-2" }), at)), "AUTOPILOT_UNAUTHORIZED");
  // The same run may narrow its delivery tasks, never widen accept or close.
  const narrowed = plans.authorize(first.plan, input({ deliveryTaskIds: ["D1"] }), at);
  assert.equal(narrowed.grant.revision, 2);
  // The same run never widens its mode (after-start to full).
  assert.equal(code(() => plans.authorize(manual.plan, input({ acceptancePolicy: "manual", accept: false, close: true, mode: "full" }), at)), "AUTOPILOT_UNAUTHORIZED");
  const noClose = plans.authorize(base, input({ close: false }), at);
  assert.equal(code(() => plans.authorize(noClose.plan, input(), at)), "AUTOPILOT_UNAUTHORIZED");

  // settings-off is resumable with panel-resume and the same boundaries.
  const off = plans.revoke(first.plan, { note: "Settings: off", reason: "settings-off", runId: "run-1" }, at);
  assert.equal(off.changed, true);
  assert.deepEqual(
    { reason: off.grant.revoked.reason, resumable: off.grant.revoked.resumable },
    { reason: "settings-off", resumable: true }
  );
  assert.equal(plans.revoke(off.plan, { note: "again", reason: "settings-off", runId: "run-1" }, at).changed, false);
  assert.equal(code(() => plans.grant(off.plan, "run-1")), "AUTOPILOT_REVOKED");
  assert.equal(code(() => plans.authorize(off.plan, input(), at)), "AUTOPILOT_REVOKED");
  assert.equal(code(() => plans.authorize(off.plan, input({ deliveryTaskIds: ["D1"], source: "panel-resume" }), at)), "AUTOPILOT_REVOKED");
  const resumed = plans.authorize(off.plan, input({ source: "panel-resume" }), at);
  assert.equal(resumed.grant.revoked, null);
  assert.equal(resumed.grant.revision, 2);
  assert.equal(code(() => plans.authorize(base, input({ source: "panel-resume" }), at)), "AUTOPILOT_UNAUTHORIZED");
  // user-stop is final; settings-off afterwards keeps it final.
  const stopped = plans.revoke(resumed.plan, { note: "User: stop", reason: "user-stop", runId: "run-1" }, at);
  assert.equal(stopped.grant.revoked.resumable, false);
  assert.equal(plans.revoke(stopped.plan, { note: "off", reason: "settings-off", runId: "run-1" }, at).changed, false);
  assert.equal(code(() => plans.authorize(stopped.plan, input({ source: "panel-resume" }), at)), "AUTOPILOT_REVOKED");
  assert.equal(code(() => plans.revoke(stopped.plan, { note: "x", reason: "pause", runId: "run-1" }, at)), "USAGE");
  assert.equal(code(() => plans.revoke(stopped.plan, { note: "x", reason: "user-stop", runId: "run-9" }, at)), "AUTOPILOT_SCOPE_MISMATCH");
  // A new run after the stop starts at revision 1.
  assert.equal(plans.authorize(stopped.plan, input({ runId: "run-2" }), at).grant.revision, 1);

  // Delivery: only granted tasks with the reviewed effects.
  assert.match(
    plans.deliveryConfirmation(first.plan, "run-1", "D1"),
    /^Autopilot run run-1 \(authorization 1, panel-start, .+\): User started the plan .+ \| effects: npm run package$/u
  );
  assert.equal(code(() => plans.deliveryConfirmation(narrowed.plan, "run-1", "D2")), "AUTOPILOT_UNAUTHORIZED");
  assert.equal(code(() => plans.deliveryConfirmation(first.plan, "run-x", "D1")), "AUTOPILOT_UNAUTHORIZED");
  const tampered = structuredClone(first.plan);
  tampered.scope.authorization.delivery[0].effects = ["npm publish"];
  assert.equal(code(() => plans.deliveryConfirmation(plans.validate(tampered), "run-1", "D1")), "AUTOPILOT_PLAN_CHANGED");
  const changed = structuredClone(first.plan);
  changed.scope.proposal.digest = "f".repeat(64);
  assert.equal(code(() => plans.grant(changed, "run-1")), "AUTOPILOT_PLAN_CHANGED");

  // Acceptance by the run: READY_FOR_ACCEPTANCE, accept granted, no manual criterion.
  const ready = structuredClone(first.plan);
  for (const task of ready.tasks) task.status = "DONE";
  ready.rounds[0].digest = { contracts: [], decisions: [], references: [], result: "Done." };
  ready.scope.delivery = "READY_FOR_ACCEPTANCE";
  plans.validate(ready);
  const evidence = {
    ci: { checks: ["Linux x64"], sha: "b".repeat(40) },
    criteria: [{ checks: [{ commit: "c".repeat(40), id: "unit" }], criterion: 0, evidence: [] }],
    head: "b".repeat(40),
    runId: "run-1",
  };
  const accepted = plans.acceptByAutopilot(ready, evidence, at);
  assert.equal(accepted.scope.delivery, "ACCEPTED");
  assert.match(accepted.scope.acceptanceNote.text, /^Accepted automatically by autopilot run run-1 under the user's advance instruction/u);
  assert.equal(accepted.scope.acceptanceEvidence.source, "autopilot");
  assert.equal(accepted.scope.acceptanceEvidence.authorizationRevision, 1);
  assert.deepEqual(plans.parse(plans.render(accepted)), accepted);
  const readyManual = structuredClone(ready);
  readyManual.scope.authorization.accept = false;
  assert.equal(code(() => plans.acceptByAutopilot(readyManual, evidence, at)), "AUTOPILOT_MANUAL_REQUIRED");
  assert.equal(code(() => plans.acceptByAutopilot(first.plan, evidence, at)), "NOT_READY");
  // Evidence belongs only to an ACCEPTED scope.
  const stray = structuredClone(first.plan);
  stray.scope.acceptanceEvidence = accepted.scope.acceptanceEvidence;
  assert.equal(code(() => plans.validate(stray)), "PLAN_SCHEMA");

  // Close by the run keeps the run and the final commit.
  const closed = plans.closeByAutopilot(accepted, { head: "b".repeat(40), runId: "run-1", scopeId: "demo" }, at);
  assert.equal(closed.scope, null);
  assert.deepEqual(closed.lastClosed, {
    autopilotRun: "run-1",
    closedAt: at,
    finalCommit: "b".repeat(40),
    scopeId: "demo",
  });
  assert.deepEqual(plans.parse(plans.render(closed)), closed);
  assert.equal(code(() => plans.closeByAutopilot(ready, { head: "b".repeat(40), runId: "run-1", scopeId: "demo" }, at)), "NOT_ACCEPTED");
  const noCloseAccepted = structuredClone(accepted);
  noCloseAccepted.scope.authorization.close = false;
  assert.equal(code(() => plans.closeByAutopilot(noCloseAccepted, { head: "b".repeat(40), runId: "run-1", scopeId: "demo" }, at)), "AUTOPILOT_UNAUTHORIZED");
  // A manual acceptance with a grant accept=false still lets the run close.
  const manualReady = structuredClone(manual.plan);
  for (const task of manualReady.tasks) task.status = "DONE";
  manualReady.rounds[0].digest = ready.rounds[0].digest;
  manualReady.scope.delivery = "READY_FOR_ACCEPTANCE";
  const userAccepted = plans.accept(manualReady, "User checked it and accepts", at);
  assert.equal(plans.closeByAutopilot(userAccepted, { head: "b".repeat(40), runId: "run-1", scopeId: "demo" }, at).lastClosed.autopilotRun, "run-1");

  // A new round returns the scope to work and drops the acceptance evidence.
  const reopened = plans.extend(accepted, {
    round: "new",
    tasks: [{ acceptance: ["fixed"], commitMessage: "fix: w", files: ["src/w.ts"], fixes: "W", id: "F1", title: "Fix" }],
  }, context).plan;
  assert.equal(reopened.scope.delivery, "IN_PROGRESS");
  assert.equal("acceptanceEvidence" in reopened.scope, false);
  // Carryover drops the grant.
  const carried = plans.carryover(first.plan, { approval: "User: continue in a new scope", id: "demo-2" }, context);
  assert.equal("authorization" in carried.scope, false);
  console.log("workflow-plan authorization tests passed");
} finally {
  build.cleanup();
}
