import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-platform", "workflow-plan", "workflow-recovery"],
  "workflow-recovery-parts"
);
try {
  const {
    MAX_PARTS,
    PART_LIMIT,
    WorkflowRecoveryFacade,
    packetParts,
    parsePart,
  } = await build.load("workflow-recovery", "workflow-recovery-facade.js");
  const PART_LINE =
    /^# Workflow recovery packet — part (\d+)\/(\d+) · revision (\S+) · head (\S+) · digest ([0-9a-f]{12})\n/u;
  const strip = (part) => part.replace(PART_LINE, "");
  const section = (name, size, fill = "x") =>
    `## ${name}\n${`${fill.repeat(99)}\n`.repeat(Math.ceil(size / 100))}`;
  const packet = (body) =>
    `# Workflow recovery packet\nbytes: 1 / budget: 32000\n\n## state\nscope: S ACTIVE, revision 181\nhead: 7768cc87\n\n${body}`;

  // A short packet is one part with the part line; the meta comes from the packet.
  const short = packet(section("next", 300));
  const one = packetParts(short, 6);
  assert.equal(one.parts.length, 1);
  assert.equal(one.needed, 1);
  const [, index, count, revision, head] = PART_LINE.exec(one.parts[0]);
  assert.deepEqual(
    [index, count, revision, head],
    ["1", "1", "181", "7768cc87"]
  );
  assert.equal(strip(one.parts[0]), short);

  // A long packet: parts within the limit, one digest, they join to the packet.
  const long = packet(
    [
      section("schema", 6000),
      section("documents", 9000, "д"),
      section("recent", 4000),
    ].join("\n")
  );
  const split = packetParts(long, 6);
  assert.ok(split.parts.length > 1);
  assert.equal(split.needed, split.parts.length);
  const digests = new Set();
  split.parts.forEach((part, i) => {
    assert.ok(part.length <= PART_LIMIT, `part ${i + 1} is ${part.length}`);
    const match = PART_LINE.exec(part);
    assert.equal(match[1], String(i + 1));
    assert.equal(match[2], String(split.parts.length));
    digests.add(match[5]);
  });
  assert.equal(digests.size, 1);
  assert.equal(split.parts.map(strip).join(""), long);
  assert.ok(
    split.parts.some((part) => strip(part).startsWith("## documents")),
    "a section that fits starts a part"
  );

  // A line longer than a part is cut by characters, a surrogate pair stays whole.
  const emoji = "😀".repeat(PART_LIMIT);
  const wide = packetParts(packet(`## doc\n${emoji}\n`), MAX_PARTS);
  for (const part of wide.parts) {
    assert.ok(part.length <= PART_LIMIT);
    const body = strip(part);
    assert.doesNotMatch(body, /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
  }
  assert.equal(wide.parts.map(strip).join(""), packet(`## doc\n${emoji}\n`));

  // Too few parts: the last one says the packet is incomplete.
  const cut = packetParts(long, 2);
  assert.equal(cut.parts.length, 2);
  assert.ok(cut.needed > 2);
  assert.ok(cut.parts.every((part) => part.length <= PART_LIMIT));
  assert.match(
    cut.parts[1],
    new RegExp(
      `Packet incomplete: it needs ${cut.needed} parts, 2 delivered\\. Run \`scripts/workflow recover --format text\`\\.\\n$`,
      "u"
    )
  );

  // --part K/N values.
  assert.deepEqual(parsePart("2/6"), { count: 6, index: 2 });
  assert.deepEqual(parsePart("16/16"), { count: 16, index: 16 });
  for (const bad of ["0/6", "7/6", "1/17", "a/b", "1", "", undefined]) {
    assert.equal(parsePart(bad), null, String(bad));
  }

  // The hook answers with the part, without context for a missing part or in host mode.
  const recovery = new WorkflowRecoveryFacade();
  recovery.packet = () => ({ text: long });
  const hook = (part, env = {}) =>
    JSON.parse(
      recovery.sessionStart("/p", { client: "claude", env, part, stdin: "" })
    ).hookSpecificOutput;
  assert.equal(hook({ count: 6, index: 1 }).additionalContext, split.parts[0]);
  assert.equal(hook({ count: 6, index: 2 }).additionalContext, split.parts[1]);
  assert.deepEqual(hook({ count: 6, index: 6 }), {
    hookEventName: "SessionStart",
  });
  assert.equal(hook(null).additionalContext, long);
  assert.deepEqual(
    hook({ count: 6, index: 1 }, { HARNESS_WORKFLOW_RECOVERY: "host" }),
    {
      hookEventName: "SessionStart",
    }
  );
} finally {
  await build.cleanup();
}
