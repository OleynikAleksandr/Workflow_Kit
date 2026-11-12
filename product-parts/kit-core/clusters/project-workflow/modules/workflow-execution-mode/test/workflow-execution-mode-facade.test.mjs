import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-execution-mode"],
  "workflow-execution-mode"
);
const root = mkdtempSync(path.join(tmpdir(), "workflow-execution-mode-"));
try {
  const { WorkflowExecutionModeFacade } = await build.load(
    "workflow-execution-mode",
    "workflow-execution-mode-facade.js"
  );
  const modes = new WorkflowExecutionModeFacade();
  const code = (action) => {
    try {
      action();
    } catch (error) {
      return error.code;
    }
    return "OK";
  };

  // Options: with parallel work the recommendation leads, then the other mode.
  assert.deepEqual(modes.options("orchestrated", true), [
    "orchestrated",
    "sequential",
    "refine",
  ]);
  assert.deepEqual(modes.options("sequential", true), [
    "sequential",
    "orchestrated",
    "refine",
  ]);
  assert.deepEqual(modes.options("sequential", false), [
    "sequential",
    "refine",
  ]);
  assert.equal(
    code(() => modes.options("orchestrated", false)),
    "NO_PARALLEL_WORK"
  );
  assert.equal(
    code(() => modes.options("parallel", true)),
    "PROPOSAL_RECOMMENDATION"
  );

  // The digest is canonical: key order does not matter, content does.
  assert.equal(
    modes.digest({ a: 1, b: [1, 2] }),
    modes.digest({ b: [1, 2], a: 1 })
  );
  assert.notEqual(modes.digest({ a: 1 }), modes.digest({ a: 2 }));

  // Generations grow per proposal of the cycle; the reason is 10..300 chars.
  const request = {
    hasParallelWork: true,
    input: { id: "demo" },
    now: "2026-11-04T10:00:00Z",
    reason: "Two independent modules",
    recommended: "orchestrated",
  };
  assert.equal(modes.readProposal(root), null);
  assert.equal(
    code(() => modes.nextProposal(root, { ...request, reason: "short" })),
    "PROPOSAL_REASON"
  );
  assert.equal(
    code(() =>
      modes.nextProposal(root, { ...request, reason: "x".repeat(301) })
    ),
    "PROPOSAL_REASON"
  );
  const first = modes.nextProposal(root, request);
  assert.equal(first.generation, 1);
  assert.equal(first.planDigest, modes.digest({ id: "demo" }));
  modes.writeProposal(root, first);
  assert.deepEqual(modes.readProposal(root), first);
  const second = modes.nextProposal(root, request);
  assert.equal(second.generation, 2);
  modes.writeProposal(root, second);

  // A choice is verified against generation, digest and offered options.
  const choice = {
    generation: 2,
    note: "User chose",
    now: "2026-11-04T10:00:01Z",
    option: "orchestrated",
    session: "session-1",
  };
  assert.equal(modes.verifyChoice(root, choice).generation, 2);
  assert.equal(
    code(() => modes.verifyChoice(root, { ...choice, generation: 1 })),
    "PROPOSAL_CHANGED"
  );
  assert.equal(
    code(() => modes.verifyChoice(root, { ...choice, option: "other" })),
    "PROPOSAL_OPTION"
  );
  assert.equal(
    code(() => modes.verifyChoice(root, { ...choice, session: " " })),
    "PROPOSAL_SESSION"
  );
  assert.equal(
    code(() => modes.verifyChoice(root, { ...choice, note: "" })),
    "PROPOSAL_NOTE"
  );
  modes.writeProposal(root, { ...second, input: { id: "changed" } });
  assert.equal(
    code(() => modes.verifyChoice(root, choice)),
    "PROPOSAL_CHANGED"
  );
  modes.writeProposal(root, {
    ...second,
    hasParallelWork: false,
    options: ["sequential", "refine"],
  });
  assert.equal(
    code(() => modes.verifyChoice(root, choice)),
    "NO_PARALLEL_WORK"
  );

  // Refine keeps the generation and the cycle, and drops the plan.
  const refined = modes.refine(root, second, { ...choice, option: "refine" });
  assert.equal(refined.input, null);
  assert.equal(refined.refining, true);
  assert.deepEqual(refined.choice, {
    at: "2026-11-04T10:00:01Z",
    generation: 2,
    note: "User chose",
    option: "refine",
    session: "session-1",
  });
  assert.deepEqual(modes.readProposal(root), refined);
  assert.equal(
    code(() => modes.verifyChoice(root, { ...choice, option: "sequential" })),
    "PROPOSAL_CHANGED"
  );
  const next = modes.nextProposal(root, request);
  assert.equal(next.generation, 3);
  assert.equal(next.refining, false);

  // Clear removes the record; an unreadable record reads as none.
  modes.clear(root);
  assert.equal(modes.readProposal(root), null);
  assert.equal(
    code(() => modes.verifyChoice(root, choice)),
    "PROPOSAL_CHANGED"
  );
  mkdirSync(path.dirname(modes.proposalFile(root)), { recursive: true });
  writeFileSync(modes.proposalFile(root), "{broken");
  assert.equal(modes.readProposal(root), null);
  assert.equal(modes.nextProposal(root, request).generation, 1);
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
