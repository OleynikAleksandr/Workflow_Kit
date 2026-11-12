import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

// Step 1 of orchestration-scenario.test.mjs: the project installed by
// `install --host harness` with a real local identity, `scope:create`
// refused, `scope:propose` and `scope:choose --option orchestrated` of A, B
// (parallel), C (sequential), D (parallel) and a delivery task, then QUALITY
// in main with a check that fails only on the merged result of A and B.

/** Runs step 1 on the scenario of `openScenario`; `sandbox` holds the project. */
export function installAndPlan(scenario, sandbox) {
  const { git, plans, root, ok, refused, recover, write, input, task } =
    scenario;
  mkdirSync(root);
  git.init(root);
  git.setConfig(root, "user.name", "Scenario Owner");
  git.setConfig(root, "user.email", "owner@harness-ai.test");
  const installed = ok(
    sandbox,
    `install ${root} --host harness --name Scenario --bundle ${scenario.bundle()}`
  );
  assert.equal(installed.hooksPath, ".harness/workflow/hooks");
  assert.equal(
    git.git.text(root, ["log", "-1", "--format=%an <%ae>"]),
    "Scenario Owner <owner@harness-ai.test>"
  );
  assert.match(recover(root), /role: planning/u);
  assert.match(recover(root), /plan with parallelSafe labels/u);

  write(root, "docs/spec.md", "# Spec\n\nFour modules and a release.\n");
  const work = (id, fields = {}) => ({
    acceptance: [`${id} works`],
    commitMessage: `feat: add module ${id}`,
    files: [`src/${id.toLowerCase()}.ts`],
    id,
    title: `Module ${id}`,
    ...fields,
  });
  const scopeInput = input("plan.json", {
    acceptance: ["The modules exist", "The release is built"],
    approval: "User approved the orchestrated scope",
    id: "orc-1",
    objective: "Build four modules and release them",
    spec: "docs/spec.md",
    tasks: [
      work("A", { parallelSafe: true }),
      work("B", { parallelSafe: true }),
      work("C"),
      work("D", { parallelSafe: true }),
      {
        acceptance: ["The release is built"],
        commitMessage: "chore: release",
        files: [],
        id: "SHIP",
        kind: "delivery",
        title: "Release",
      },
    ],
  });
  assert.equal(
    refused(root, `scope:create --input ${scopeInput}`).code,
    "EXECUTION_MODE_REQUIRED"
  );
  const proposal = ok(
    root,
    `scope:propose --input ${scopeInput} --recommended orchestrated --reason`,
    "A, B and D touch separate files"
  );
  assert.equal(proposal.hasParallelWork, true);
  assert.deepEqual(proposal.options, ["orchestrated", "sequential", "refine"]);
  assert.match(
    recover(root),
    /scope proposal \(generation 1, recommended orchestrated\) is waiting/u
  );
  const chosen = ok(
    root,
    `scope:choose --generation ${proposal.generation} --option orchestrated --session orchestrator-session --note`,
    "User clicked orchestrated"
  );
  assert.equal(chosen.execution.strategy, "orchestrated");
  assert.deepEqual(
    plans.read(root).tasks.map((item) => item.id),
    ["QUALITY", "A", "B", "C", "D", "DOCS-R1", "SHIP"]
  );
  assert.match(recover(root), /role: orchestrator/u);
  assert.match(recover(root), /Run QUALITY yourself in main/u);
  assert.equal(
    refused(root, "task:start A").code,
    "ORCHESTRATED_MAIN_READ_ONLY"
  );

  // QUALITY in main: the check fails only when A and B export the same name.
  ok(root, "task:start QUALITY");
  const lint =
    "const fs=require('fs');const read=(f)=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';const both=read('src/a.ts').includes('export const value')&&read('src/b.ts').includes('export const value');if(both)console.error('lint: src/a.ts and src/b.ts both export value');process.exit(both?1:0)";
  const quality = input("quality.json", {
    checks: [
      {
        command: { args: ["-e", lint], executable: process.execPath },
        id: "lint",
        required: true,
        role: "lint",
        stage: "commit",
      },
    ],
    stacks: ["node"],
  });
  ok(root, `quality:apply --input ${quality}`);
  assert.equal(task("QUALITY").status, "DONE");
}
