import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan", "workflow-recovery"],
  "workflow-recovery-roles"
);
try {
  const { WorkflowRecoveryFacade } = await build.load(
    "workflow-recovery",
    "workflow-recovery-facade.js"
  );
  const recovery = new WorkflowRecoveryFacade();
  const task = (id, status, extra = {}) => ({
    acceptance: ["it works"],
    checks: [],
    commitMessage: `feat: ${id}`,
    confirmation: null,
    context: [],
    dependencies: [],
    docsWaiver: null,
    files: [`src/${id}.ts`],
    fixes: null,
    id,
    iteration: 1,
    kind: "work",
    parallelSafe: true,
    roundId: "R1",
    status,
    title: `Task ${id}`,
    why: "because",
    ...extra,
  });
  const scope = (strategy) => ({
    acceptance: ["done"],
    acceptanceNote: null,
    approval: { at: "2026-11-04T10:00:00Z", text: "approved" },
    baselineCommit: "a".repeat(40),
    blockedReason: null,
    context: [],
    decisions: [],
    delivery: "IN_PROGRESS",
    execution: { maxWorkers: 3, ownerSession: "s-1", strategy },
    id: "scope-1",
    objective: "Ship it",
    spec: null,
    status: "ACTIVE",
  });
  const plan = (overrides = {}) => ({
    currentTaskId: null,
    lastClosed: null,
    projectId: "p-1",
    projectName: "Demo",
    revision: 3,
    rounds: [
      {
        digest: null,
        id: "R1",
        kind: "implementation",
        status: "OPEN",
        title: "R1",
      },
    ],
    schema: "harness-workflow-plan/1",
    scope: scope("orchestrated"),
    tasks: [
      task("QUALITY", "DONE", {
        files: [],
        kind: "quality",
        parallelSafe: false,
      }),
      task("A", "TODO", { dependencies: ["QUALITY"] }),
      task("B", "TODO", { dependencies: ["QUALITY"] }),
      task("C", "TODO", { dependencies: ["QUALITY"] }),
      task("DOCS-R1", "TODO", {
        dependencies: ["A", "B", "C"],
        files: ["docs/x.md"],
        kind: "docs",
        parallelSafe: false,
      }),
      task("SHIP", "TODO", {
        dependencies: ["DOCS-R1"],
        files: [],
        kind: "delivery",
        parallelSafe: false,
      }),
    ],
    ...overrides,
  });
  const facts = (overrides = {}) => ({
    assignments: [],
    executor: null,
    harness: true,
    integration: null,
    proposal: null,
    unattachedWorktree: false,
    ...overrides,
  });
  const record = (id, taskId, status, extra = {}) => ({
    cleanupPending: false,
    id,
    scopeId: "scope-1",
    sourceCommit: null,
    status,
    taskId,
    worktree: null,
    ...extra,
  });
  const input = (planValue, roles, overrides = {}) => ({
    budgetBytes: 32_000,
    changes: [],
    event: "startup",
    head: "b".repeat(40),
    plan: planValue,
    quality: { stacks: ["node"], status: "CONFIGURED" },
    readDocument: () => null,
    roles,
    taskCommits: {},
    transaction: null,
    verification: null,
    ...overrides,
  });
  const sectionOf = (packet, name) =>
    packet.sections.find((section) => section.name === name).text;
  const packet = (...args) => recovery.build(input(...args));

  // --- Planning: propose (Harness) or create; waiting; refining. ---
  const planning = packet(plan({ scope: null, tasks: [] }), facts());
  assert.match(sectionOf(planning, "state"), /\nrole: planning$/u);
  assert.match(
    sectionOf(planning, "next"),
    /^No active scope\. .*parallelSafe labels, then `scripts\/workflow scope:propose --input <plan\.json> --recommended sequential\|orchestrated --reason "<why>"`, then end the turn and wait for the user's choice on the card\.\nRole planning: /u
  );
  assert.match(
    sectionOf(
      packet(plan({ scope: null, tasks: [] }), facts({ harness: false })),
      "next"
    ),
    /^No active scope\. .*`scripts\/workflow scope:create --input <plan\.json>`\./u
  );
  const waiting = sectionOf(
    packet(
      plan({ scope: null, tasks: [] }),
      facts({
        proposal: {
          generation: 2,
          recommended: "orchestrated",
          refining: false,
        },
      })
    ),
    "next"
  );
  assert.match(
    waiting,
    /^No active scope: the scope proposal \(generation 2, recommended orchestrated\) is waiting for the user's choice on the card\. End the turn/u
  );
  assert.doesNotMatch(waiting, /scope:propose --input/u);
  assert.match(
    sectionOf(
      packet(
        plan({ scope: null, tasks: [] }),
        facts({
          proposal: {
            generation: 2,
            recommended: "sequential",
            refining: true,
          },
        })
      ),
      "next"
    ),
    /^No active scope: the user chose to refine the specification\. Discuss it, .*propose again: `scripts\/workflow scope:propose/u
  );
  // Without gathered facts (older callers) the plan alone decides the role.
  assert.match(
    sectionOf(packet(plan({ scope: null, tasks: [] }), undefined), "state"),
    /role: planning/u
  );

  // --- Self: sequential scope, helpers stay in main and never commit. ---
  const self = packet(
    plan({ scope: scope("sequential") }),
    facts({ assignments: [record("x", "A", "RUNNING")] })
  );
  assert.match(sectionOf(self, "state"), /\nrole: self$/u);
  assert.doesNotMatch(sectionOf(self, "state"), /assignments:/u);
  assert.match(
    sectionOf(self, "next"),
    /^Start A via `scripts\/workflow task:start A`: Task A\nRole self: .*Helper subagents work in main without their own worktree and never commit; no assignments\./u
  );

  // --- Orchestrator: assignments in state, integrate first, then hand out. ---
  const sha = "f".repeat(40);
  const busy = packet(
    plan(),
    facts({
      assignments: [
        record("scope-1-A-1", "A", "READY_FOR_INTEGRATION", {
          sourceCommit: sha,
          worktree: "/wt/a",
        }),
        record("scope-1-B-1", "B", "ASSIGNED"),
        record("old-X-1", "X", "INTEGRATED", {
          cleanupPending: true,
          scopeId: "old",
          worktree: "/wt/x",
        }),
      ],
    })
  );
  const busyState = sectionOf(busy, "state");
  assert.match(
    busyState,
    /\nrole: orchestrator\nassignments:\n- scope-1-A-1 A READY_FOR_INTEGRATION \/wt\/a\n- scope-1-B-1 B ASSIGNED not attached\n- old-X-1 X INTEGRATED \/wt\/x, cleanup PENDING\nintegration: none$/u
  );
  const busyNext = sectionOf(busy, "next");
  assert.match(
    busyNext,
    /^Integrate first, one at a time:\n- `scripts\/workflow integration:start --id scope-1-A-1 --source ffffffff` \(task A\)\nHand out C: for each, `scripts\/workflow assignment:create --task <ID>`, then launch a Claude subagent \(Agent tool with isolation: "worktree"\) with the returned brief and wait for its SHA/u
  );
  assert.match(
    busyNext,
    /\nFinish cleanups: `scripts\/workflow assignment:cleanup --id old-X-1`\.\nRole orchestrator: .*never implement them in main\. Run QUALITY and delivery yourself in main\./u
  );

  // An integration in progress comes before everything else.
  for (const [phase, pattern] of [
    [
      "CONFLICT",
      /^Integration of scope-1-A-1 stopped on CONFLICT: resolve the conflicts within the task files, then `scripts\/workflow integration:continue --id scope-1-A-1`\./u,
    ],
    [
      "CHECKS_FAILED",
      /^Integration of scope-1-A-1 failed its checks: fix the cause within the task files, then `scripts\/workflow integration:continue --id scope-1-A-1`\./u,
    ],
    [
      "MERGING",
      /^Integration of scope-1-A-1 is MERGING: finish it with `scripts\/workflow integration:continue --id scope-1-A-1`/u,
    ],
  ]) {
    const merging = packet(
      plan(),
      facts({
        assignments: [record("scope-1-A-1", "A", "READY_FOR_INTEGRATION")],
        integration: { assignmentId: "scope-1-A-1", phase },
      })
    );
    assert.match(sectionOf(merging, "next"), pattern, phase);
    assert.match(
      sectionOf(merging, "state"),
      new RegExp(`integration: scope-1-A-1 ${phase}`, "u")
    );
  }

  // Everything handed out: waiting for executors.
  assert.match(
    sectionOf(
      packet(
        plan(),
        facts({
          assignments: ["A", "B", "C"].map((id) =>
            record(`scope-1-${id}-1`, id, "RUNNING", { worktree: `/wt/${id}` })
          ),
        })
      ),
      "next"
    ),
    /^Waiting for executors: scope-1-A-1 \(A, RUNNING\), scope-1-B-1 \(B, RUNNING\), scope-1-C-1 \(C, RUNNING\)\. Integrate each result when its SHA arrives\./u
  );
  // QUALITY first, in main; then a ready delivery once everything is done.
  const fresh = plan();
  fresh.tasks[0] = { ...fresh.tasks[0], status: "TODO" };
  assert.match(
    sectionOf(packet(fresh, facts()), "next"),
    /^Run QUALITY yourself in main via `scripts\/workflow task:start QUALITY`/u
  );
  assert.match(
    sectionOf(
      packet(
        plan({
          currentTaskId: "QUALITY",
          tasks: [
            { ...fresh.tasks[0], status: "IN_PROGRESS" },
            ...fresh.tasks.slice(1),
          ],
        }),
        facts()
      ),
      "next"
    ),
    /^Continue QUALITY in main: Task QUALITY/u
  );
  const finished = plan({
    tasks: plan().tasks.map((item) =>
      item.kind === "delivery" ? item : { ...item, status: "DONE" }
    ),
  });
  assert.match(
    sectionOf(packet(finished, facts()), "next"),
    /^Next task SHIP is delivery: ask the user to confirm it, then `scripts\/workflow task:start SHIP --confirmed "<user confirmation>"`/u
  );

  // --- Executor: only its own task; attach, setup, start, continue, report. ---
  const executorPlan = (status) =>
    plan({
      currentTaskId: status === "IN_PROGRESS" ? "A" : null,
      scope: { ...scope("sequential"), id: "assignment-scope-1-A-1" },
      tasks: [task("A", status)],
    });
  const executor = (status, taskStatus, extra = {}) =>
    packet(
      executorPlan(taskStatus),
      facts({ executor: { id: "scope-1-A-1", status, taskId: "A" } }),
      extra
    );
  const ready = executor("READY", "TODO");
  assert.match(
    sectionOf(ready, "state"),
    /\nrole: executor \(assignment scope-1-A-1, task A, READY\)$/u
  );
  assert.doesNotMatch(sectionOf(ready, "state"), /assignments:/u);
  assert.match(
    sectionOf(ready, "next"),
    /^Start A via `scripts\/workflow task:start A`: Task A\. Then commit with `scripts\/workflow commit --task A` and report the SHA\.\nRole executor: work only in this worktree and only on paths equal to or nested in the task files\. Never touch main, the plan or other tasks; no nested executors; no push\./u
  );
  assert.match(
    sectionOf(executor("NEEDS_SETUP", "TODO"), "next"),
    /^The worktree needs setup: run `scripts\/workflow assignment:setup`, then `scripts\/workflow task:start A`\./u
  );
  assert.match(
    sectionOf(executor("RUNNING", "IN_PROGRESS"), "next"),
    /^Continue A: Task A\. Commit with `scripts\/workflow commit --task A`, then report the SHA\./u
  );
  const reported = executor("READY_FOR_INTEGRATION", "DONE", {
    taskCommits: { A: sha },
  });
  assert.match(
    sectionOf(reported, "next"),
    new RegExp(
      `^Task A is committed \\(${sha}\\): report the SHA to the orchestrator and end the turn\\.`,
      "u"
    )
  );
  // The executor plan reaching READY_FOR_ACCEPTANCE is not the user's acceptance.
  assert.doesNotMatch(
    sectionOf(
      recovery.build({
        ...input(
          {
            ...executorPlan("DONE"),
            scope: {
              ...executorPlan("DONE").scope,
              delivery: "READY_FOR_ACCEPTANCE",
            },
          },
          facts({
            executor: {
              id: "scope-1-A-1",
              status: "READY_FOR_INTEGRATION",
              taskId: "A",
            },
          })
        ),
      }),
      "next"
    ),
    /READY_FOR_ACCEPTANCE/u
  );
  const unattached = packet(plan(), facts({ unattachedWorktree: true }));
  assert.match(
    sectionOf(unattached, "state"),
    /role: executor \(not attached\)/u
  );
  assert.match(
    sectionOf(unattached, "next"),
    /^Executor worktree not attached: run `scripts\/workflow assignment:attach <id>` with the assignment id from your brief first\./u
  );

  // --- Budget: many assignments stay bounded and the packet fits. ---
  const many = facts({
    assignments: Array.from({ length: 25 }, (_, index) =>
      record(`scope-1-T${index}-1`, `T${index}`, "RUNNING", {
        worktree: `/very/long/worktree/path/number/${index}`,
      })
    ),
  });
  const longPlan = plan();
  longPlan.tasks[1] = { ...longPlan.tasks[1], why: "w".repeat(6000) };
  const bounded = recovery.build(input(longPlan, many, { budgetBytes: 3000 }));
  assert.ok(bounded.bytes <= 3000, `packet is ${bounded.bytes} bytes`);
  assert.equal(bounded.overBudget, false);
  assert.equal(bounded.truncated, true);
  assert.match(bounded.text, /role: orchestrator\nassignments:\n/u);
  assert.match(bounded.text, /- … 15 more\n/u);
  assert.equal((bounded.text.match(/^- scope-1-T\d+-1 /gmu) ?? []).length, 10);
} finally {
  await build.cleanup();
}
