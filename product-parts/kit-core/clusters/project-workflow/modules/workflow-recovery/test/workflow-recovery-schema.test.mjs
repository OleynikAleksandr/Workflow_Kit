import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const SCHEMA_HEADING = /\n## schema\nInput of the next step/u;

const build = await buildWorkflowModules(
  [
    "workflow-platform",
    "workflow-plan",
    "workflow-quality",
    "workflow-recovery",
  ],
  "workflow-recovery-schema"
);
try {
  const { WorkflowRecoveryFacade } = await build.load(
    "workflow-recovery",
    "workflow-recovery-facade.js"
  );
  const { workflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const { workflowQualityFacade } = await build.load(
    "workflow-quality",
    "workflow-quality-facade.js"
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
    roundId: "R1",
    status,
    title: `Task ${id}`,
    why: "because",
    ...extra,
  });
  const scope = (extra = {}) => ({
    acceptance: ["done"],
    acceptanceNote: null,
    approval: { at: "2026-11-04T10:00:00Z", text: "approved" },
    baselineCommit: "a".repeat(40),
    blockedReason: null,
    context: [],
    decisions: [],
    delivery: "IN_PROGRESS",
    id: "scope-1",
    objective: "Ship it",
    spec: null,
    status: "ACTIVE",
    ...extra,
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
        title: "Round 1",
      },
    ],
    schema: "harness-workflow-plan/1",
    scope: scope(),
    tasks: [task("T001", "TODO")],
    ...overrides,
  });
  const facts = (extra = {}) => ({
    assignments: [],
    executor: null,
    harness: false,
    integration: null,
    proposal: null,
    unattachedWorktree: false,
    ...extra,
  });
  const input = (overrides = {}) => ({
    budgetBytes: 32_000,
    changes: [],
    event: "startup",
    head: "b".repeat(40),
    plan: plan(),
    quality: { stacks: ["node"], status: "CONFIGURED" },
    readDocument: () => null,
    taskCommits: {},
    transaction: null,
    verification: null,
    ...overrides,
  });
  const schemaOf = (packet) =>
    packet.sections.find((section) => section.name === "schema")?.text ?? null;
  const expectSchema = (packet, command) => {
    const text = schemaOf(packet);
    assert.ok(text, `schema section for ${command}`);
    const descriptor = recovery.inputSchema(command);
    assert.equal(
      text,
      `Input of the next step (\`scripts/workflow schema ${command}\` prints it again).\n${recovery.schemaText(descriptor)}`
    );
    assert.equal(packet.included.indexOf("schema"), 4, "after the task");
    assert.match(packet.text, SCHEMA_HEADING);
  };

  // The catalog comes from the owner facades.
  assert.deepEqual(recovery.inputSchemaCommands(), [
    ...workflowPlanFacade.inputSchemaCommands(),
    "quality:apply",
  ]);
  assert.deepEqual(
    recovery.inputSchema("scope:create"),
    workflowPlanFacade.inputSchema("scope:create")
  );
  assert.deepEqual(
    recovery.inputSchema("quality:apply"),
    workflowQualityFacade.inputSchema()
  );
  assert.equal(recovery.inputSchema("status"), null);

  // Compact text: one line per field with limits and codes, rules, example.
  const digest = recovery.inputSchema("digest");
  const digestText = recovery.schemaText(digest);
  assert.match(
    digestText,
    /^digest: Round digest of the DOCS task: .+\nfields:\n- result string required \[maxBytes 600, code PLAN_SCHEMA, limitCode ROUND_DIGEST_TOO_LARGE\] — /u
  );
  assert.match(
    digestText,
    /\n- decisions string\[\] required \[maxItems 8, code PLAN_SCHEMA, limitCode ROUND_DIGEST_TOO_LARGE\] — /u
  );
  assert.match(
    digestText,
    /\n- decisions\[\] string optional \[maxBytes 300,/u
  );
  assert.match(digestText, /\nrules:\n- Only the DOCS task of a round/u);
  const exampleLine = digestText.split("\n").at(-1);
  assert.equal(digestText.split("\n").at(-2), "example:");
  assert.deepEqual(JSON.parse(exampleLine), digest.example);
  for (const field of digest.fields) {
    assert.ok(digestText.includes(`\n- ${field.name} ${field.type} `));
  }

  // No scope: scope:create, or scope:propose for a Harness host; nothing
  // while a proposal waits for the user's choice.
  expectSchema(
    recovery.build(input({ plan: plan({ scope: null }) })),
    "scope:create"
  );
  expectSchema(
    recovery.build(
      input({ plan: plan({ scope: null }), roles: facts({ harness: true }) })
    ),
    "scope:propose"
  );
  const waiting = recovery.build(
    input({
      plan: plan({ scope: null }),
      roles: facts({
        harness: true,
        proposal: { generation: 1, recommended: "sequential", refining: false },
      }),
    })
  );
  assert.equal(schemaOf(waiting), null);
  assert.ok(!waiting.included.includes("schema"));
  expectSchema(
    recovery.build(
      input({
        plan: plan({ scope: null }),
        roles: facts({
          harness: true,
          proposal: {
            generation: 2,
            recommended: "sequential",
            refining: true,
          },
        }),
      })
    ),
    "scope:propose"
  );

  // QUALITY and DOCS focus tasks.
  expectSchema(
    recovery.build(
      input({
        plan: plan({ tasks: [task("QUALITY", "TODO", { kind: "quality" })] }),
      })
    ),
    "quality:apply"
  );
  expectSchema(
    recovery.build(
      input({
        plan: plan({
          currentTaskId: "DOCS-R1",
          tasks: [
            task("T001", "DONE"),
            task("DOCS-R1", "IN_PROGRESS", { kind: "docs" }),
          ],
        }),
      })
    ),
    "digest"
  );

  // Acceptance and after: defects become a fixes round through plan:extend.
  for (const delivery of ["READY_FOR_ACCEPTANCE", "ACCEPTED"]) {
    expectSchema(
      recovery.build(
        input({
          plan: plan({
            scope: scope({ delivery }),
            tasks: [task("T001", "DONE")],
          }),
        })
      ),
      "plan:extend"
    );
  }

  // A work task, a pending transaction and a blocked scope need no input.
  assert.equal(schemaOf(recovery.build(input())), null);
  assert.equal(
    schemaOf(
      recovery.build(
        input({
          plan: plan({ tasks: [task("QUALITY", "TODO", { kind: "quality" })] }),
          transaction: {
            error: null,
            id: "tx",
            phase: "FAILED",
            role: "quality",
            taskId: "QUALITY",
          },
        })
      )
    ),
    null
  );
  assert.equal(
    schemaOf(
      recovery.build(
        input({
          plan: plan({
            scope: scope({ blockedReason: "waiting", status: "BLOCKED" }),
            tasks: [task("QUALITY", "TODO", { kind: "quality" })],
          }),
        })
      )
    ),
    null
  );

  // Executor: its own DOCS task; orchestrator main: DOCS goes to an executor.
  const docsPlan = plan({
    scope: scope({
      execution: {
        maxWorkers: 2,
        ownerSession: "s-1",
        strategy: "orchestrated",
      },
    }),
    tasks: [task("T001", "DONE"), task("DOCS-R1", "TODO", { kind: "docs" })],
  });
  expectSchema(
    recovery.build(
      input({
        plan: docsPlan,
        roles: facts({
          executor: { id: "a-1", status: "READY", taskId: "DOCS-R1" },
        }),
      })
    ),
    "digest"
  );
  assert.equal(
    schemaOf(recovery.build(input({ plan: docsPlan, roles: facts() }))),
    null
  );
  assert.equal(
    schemaOf(
      recovery.build(
        input({
          plan: plan({
            tasks: [task("DOCS-R1", "DONE", { kind: "docs" })],
          }),
          roles: facts({
            executor: { id: "a-1", status: "RUNNING", taskId: "DOCS-R1" },
          }),
        })
      )
    ),
    null
  );

  // The section is mandatory: a tight budget never omits it.
  const tight = recovery.build(
    input({ budgetBytes: 1500, plan: plan({ scope: null }) })
  );
  assert.ok(tight.included.includes("schema"));
  assert.ok(!tight.omitted.includes("schema"));
  assert.equal(tight.overBudget, true);
  assert.match(tight.text, /## schema\n/u);
} finally {
  await build.cleanup();
}
