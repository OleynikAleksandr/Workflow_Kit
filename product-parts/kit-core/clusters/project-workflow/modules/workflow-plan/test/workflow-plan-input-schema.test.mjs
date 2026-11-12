import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// Contract tests: every input descriptor agrees with the real validator.
const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan"],
  "workflow-plan-input-schema"
);
const INDEX_PATTERN = /\[\d+\]/gu;

function segments(name) {
  return name.split(".").map((part) => ({
    key: part.replace("[]", ""),
    list: part.endsWith("[]"),
  }));
}

/** The object holding the last segment of `name`; `[]` steps into entry 0. */
function container(root, name) {
  const parts = segments(name);
  let node = root;
  for (const part of parts.slice(0, -1)) {
    node = node?.[part.key];
    if (part.list) {
      node = node?.[0];
    }
  }
  assert.ok(
    node && typeof node === "object",
    `example lacks the parent of ${name}`
  );
  return { last: parts.at(-1), node };
}

function remove(root, name) {
  const { last, node } = container(root, name);
  delete node[last.key];
}

function set(root, name, value) {
  const { last, node } = container(root, name);
  if (last.list) {
    assert.ok(Array.isArray(node[last.key]), `example lacks ${name}`);
    node[last.key][0] = value;
  } else {
    node[last.key] = value;
  }
}

/** Every key path of the example, with `[]` for lists of objects. */
function examplePaths(value, prefix = "") {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === "object")
      .flatMap((item) => examplePaths(item, `${prefix}[]`));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return [name, ...examplePaths(item, name)];
  });
}

function refusal(run, label) {
  try {
    run();
  } catch (error) {
    return error;
  }
  assert.fail(`expected a refusal: ${label}`);
}

/** Inputs that break each limit, enum or pattern of a field. */
function violations(spec) {
  const limit = spec.limitCode ?? spec.code;
  const cases = [];
  if (spec.maxBytes !== undefined) {
    cases.push(["maxBytes", "x".repeat(spec.maxBytes + 1), limit]);
  }
  if (spec.maxItems !== undefined) {
    const items = Array.from(
      { length: spec.maxItems + 1 },
      (_, index) => `item ${index}`
    );
    cases.push(["maxItems", items, limit]);
  }
  if (spec.minItems !== undefined) {
    cases.push(["minItems", [], limit]);
  }
  if (spec.minLength !== undefined) {
    cases.push(["minLength", "x".repeat(spec.minLength - 1), limit]);
  }
  if (spec.maximum !== undefined) {
    cases.push(["maximum", spec.maximum + 1, limit]);
  }
  if (spec.minimum !== undefined) {
    cases.push(["minimum", spec.minimum - 1, limit]);
  }
  if (spec.enum !== undefined) {
    const bad = "__invalid__";
    cases.push(["enum", spec.type.endsWith("[]") ? [bad] : bad, spec.code]);
  }
  if (spec.pattern !== undefined) {
    cases.push(["pattern", "!bad id", spec.code]);
  }
  return cases;
}

function checkContract(schema, run, fieldOf = (name) => name) {
  const names = new Set(schema.fields.map((spec) => spec.name));
  assert.equal(names.size, schema.fields.length, `${schema.command} names`);
  for (const path of examplePaths(schema.example)) {
    assert.ok(names.has(path), `${schema.command}: undescribed ${path}`);
  }
  run(structuredClone(schema.example));
  const expect = (error, code, spec, label) => {
    assert.equal(error.code, code, `${schema.command} ${spec.name} ${label}`);
    assert.equal(
      String(error.details?.field).replace(INDEX_PATTERN, "[]"),
      fieldOf(spec.name),
      `${schema.command} ${spec.name} ${label} field`
    );
  };
  for (const spec of schema.fields) {
    if (spec.required) {
      const input = structuredClone(schema.example);
      remove(input, spec.name);
      expect(
        refusal(() => run(input), `${spec.name} missing`),
        spec.code,
        spec,
        "missing"
      );
    }
    for (const [label, value, code] of violations(spec)) {
      const input = structuredClone(schema.example);
      set(input, spec.name, value);
      expect(
        refusal(() => run(input), `${spec.name} ${label}`),
        code,
        spec,
        label
      );
    }
  }
}

try {
  const { WorkflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const plans = new WorkflowPlanFacade();
  const context = {
    baselineCommit: "c".repeat(40),
    now: "2026-11-04T12:00:00.000Z",
    qualityConfigured: false,
  };
  const empty = plans.createEmpty("p", "Demo");

  assert.deepEqual(plans.inputSchemaCommands(), [
    "scope:create",
    "scope:propose",
    "plan:extend",
    "task:update",
    "carryover",
    "digest",
  ]);
  assert.equal(plans.inputSchema("close"), null);
  // Descriptors are copies: a caller cannot change the next answer.
  plans.inputSchema("digest").fields.length = 0;
  assert.ok(plans.inputSchema("digest").fields.length > 0);
  const digestLimits = Object.fromEntries(
    plans
      .inputSchema("digest")
      .fields.map((spec) => [spec.name, spec.maxBytes ?? spec.maxItems])
  );
  assert.equal(digestLimits.result, 600);
  assert.equal(digestLimits.decisions, 8);
  assert.equal(digestLimits["decisions[]"], 300);

  const scopeExample = plans.inputSchema("scope:create").example;
  const base = plans.createScope(empty, scopeExample, context);
  assert.ok(base.tasks.some((task) => task.id === "T001"));

  for (const command of ["scope:create", "scope:propose"]) {
    checkContract(plans.inputSchema(command), (input) =>
      plans.createScope(empty, input, context)
    );
  }
  checkContract(plans.inputSchema("plan:extend"), (input) =>
    plans.extend(base, input, context)
  );
  checkContract(
    plans.inputSchema("task:update"),
    (patch) => {
      // The same patch application as `task:update` in workflow-kit.
      const plan = structuredClone(base);
      Object.assign(plans.task(plan, "T001"), patch);
      plans.validate(plan);
    },
    (name) => `tasks.T001.${name}`
  );
  checkContract(plans.inputSchema("carryover"), (input) =>
    plans.carryover(base, input, context)
  );
  checkContract(plans.inputSchema("digest"), (input) =>
    plans.validateDigest(input)
  );

  // A stored digest keeps its plan path in the refusal.
  const stored = structuredClone(base);
  stored.rounds[0].status = "CLOSED";
  const storedError = refusal(() => plans.validate(stored), "stored digest");
  assert.equal(storedError.code, "ROUND_DIGEST_REQUIRED");
  assert.equal(storedError.details.field, "rounds.R1.digest");

  console.log("workflow-plan input schema tests passed");
} finally {
  await build.cleanup();
}
