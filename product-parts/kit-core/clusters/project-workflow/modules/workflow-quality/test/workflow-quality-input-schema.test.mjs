import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// Contract test: the quality:apply descriptor agrees with configuredProfile.
const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-quality"],
  "workflow-quality-input-schema"
);
const root = mkdtempSync(path.join(os.tmpdir(), "workflow-quality-schema-"));
const INDEX_PATTERN = /\[\d+\]/gu;

/** The object holding the last segment of `name`; `[]` steps into entry 0. */
function container(input, name) {
  const parts = name.split(".");
  let node = input;
  for (const part of parts.slice(0, -1)) {
    node = node?.[part.replace("[]", "")];
    if (part.endsWith("[]")) {
      node = node?.[0];
    }
  }
  assert.ok(node && typeof node === "object", `no parent of ${name}`);
  const last = parts.at(-1);
  return { key: last.replace("[]", ""), list: last.endsWith("[]"), node };
}

function changed(example, name, value) {
  const input = structuredClone(example);
  const { key, list, node } = container(input, name);
  if (value === undefined) {
    delete node[key];
  } else if (list) {
    node[key][0] = value;
  } else {
    node[key] = value;
  }
  return input;
}

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

function cases(spec) {
  const limit = spec.limitCode ?? spec.code;
  const list = [];
  if (spec.required) {
    list.push(["missing", undefined, spec.code]);
  }
  if (spec.minItems !== undefined) {
    list.push(["minItems", [], limit]);
  }
  if (spec.minLength !== undefined) {
    list.push(["minLength", "x".repeat(spec.minLength - 1), limit]);
  }
  if (spec.maximum !== undefined) {
    list.push(["maximum", spec.maximum + 1, limit]);
  }
  if (spec.minimum !== undefined) {
    list.push(["minimum", spec.minimum - 1, limit]);
  }
  if (spec.enum !== undefined) {
    list.push(["enum", "__invalid__", spec.code]);
  }
  if (spec.pattern !== undefined) {
    list.push(["pattern", "!bad id", spec.code]);
  }
  assert.equal(spec.maxBytes, undefined, "add a maxBytes case");
  assert.equal(spec.maxItems, undefined, "add a maxItems case");
  return list;
}

try {
  const { WorkflowQualityFacade } = await build.load(
    "workflow-quality",
    "workflow-quality-facade.js"
  );
  const quality = new WorkflowQualityFacade();
  const schema = quality.inputSchema();
  assert.equal(schema.command, "quality:apply");
  const names = new Set(schema.fields.map((spec) => spec.name));
  assert.equal(names.size, schema.fields.length);
  for (const name of examplePaths(schema.example)) {
    assert.ok(names.has(name), `undescribed example field ${name}`);
  }

  // The example passes the real validator; nothing is installed or written.
  const config = quality.previewProfile(root, schema.example);
  assert.equal(config.quality.status, "CONFIGURED");
  assert.equal(existsSync(quality.configFile(root)), false);

  for (const spec of schema.fields) {
    for (const [label, value, code] of cases(spec)) {
      let error = null;
      try {
        quality.previewProfile(root, changed(schema.example, spec.name, value));
      } catch (caught) {
        error = caught;
      }
      assert.ok(error, `${spec.name} ${label}: expected a refusal`);
      assert.equal(error.code, code, `${spec.name} ${label}`);
      assert.equal(
        String(error.details?.field).replace(INDEX_PATTERN, "[]"),
        spec.name,
        `${spec.name} ${label} field`
      );
    }
  }

  // A reserved builtin id names the entry.
  const reserved = changed(schema.example, "checks[].id", "kit:md-links");
  assert.throws(
    () => quality.previewProfile(root, reserved),
    (error) =>
      error.code === "PROFILE_INVALID" && error.details.field === "checks[0].id"
  );
  // A stored configuration names its own path.
  const stored = quality.defaultConfig();
  stored.quality.checks[0].timeoutMs = 0;
  assert.throws(
    () => quality.validateConfig(stored),
    (error) => error.details.field === "quality.checks[0].timeoutMs"
  );
  console.log("workflow-quality input schema tests passed");
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
