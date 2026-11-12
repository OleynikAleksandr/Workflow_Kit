import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnvironment } from "../../workflow-git/test/workflow-git-test-repo.mjs";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

const build = await buildWorkflowModules(
  ["workflow-kit"],
  "workflow-kit-schema"
);
// A folder without the Kit: `schema` is a pure read and needs no project.
const root = mkdtempSync(path.join(tmpdir(), "workflow-kit-schema-"));
try {
  const { runCli } = await build.load("workflow-kit", "workflow-kit-cli.js");
  const { WorkflowKitFacade } = await build.load(
    "workflow-kit",
    "workflow-kit-facade.js"
  );
  const { workflowPlanFacade } = await build.load(
    "workflow-plan",
    "workflow-plan-facade.js"
  );
  const { workflowQualityFacade } = await build.load(
    "workflow-quality",
    "workflow-quality-facade.js"
  );
  const env = cleanGitEnvironment();
  const kit = new WorkflowKitFacade({ env });
  const run = (argv) => {
    const out = { stderr: "", stdout: "" };
    const code = runCli(
      argv,
      {
        cwd: root,
        env,
        readStdin: () => "",
        stderr: (text) => {
          out.stderr += text;
        },
        stdout: (text) => {
          out.stdout += text;
        },
      },
      kit
    );
    return { ...out, code };
  };
  const commands = [
    "scope:create",
    "scope:propose",
    "plan:extend",
    "task:update",
    "carryover",
    "digest",
    "quality:apply",
  ];
  const descriptor = (command) =>
    command === "quality:apply"
      ? workflowQualityFacade.inputSchema()
      : workflowPlanFacade.inputSchema(command);

  // Help names the command.
  assert.match(run(["help"]).stdout, /scripts\/workflow schema \[<command>\]/u);

  // Without a command: the list with one-line descriptions.
  const list = run(["schema"]);
  assert.equal(list.code, 0);
  const listed = JSON.parse(list.stdout);
  assert.equal(listed.ok, true);
  assert.equal(listed.command, "schema");
  assert.deepEqual(
    listed.result.commands,
    commands.map((command) => ({
      command,
      description: descriptor(command).description,
    }))
  );
  const listText = run(["schema", "--format", "text"]);
  assert.equal(listText.code, 0);
  assert.match(listText.stdout, /^Commands with an input schema:\n/u);
  for (const command of commands) {
    assert.ok(
      listText.stdout.includes(
        `\n- ${command} — ${descriptor(command).description}\n`
      ),
      command
    );
  }
  assert.match(listText.stdout, /Run `scripts\/workflow schema <command>`/u);

  // Each command: the descriptor as JSON, the compact text with the example.
  for (const command of commands) {
    const expected = descriptor(command);
    const json = run(["schema", command]);
    assert.equal(json.code, 0, command);
    assert.deepEqual(JSON.parse(json.stdout).result, expected, command);
    const text = run(["schema", command, "--format", "text"]);
    assert.equal(text.code, 0, command);
    assert.equal(text.stdout, `${kit.recovery.schemaText(expected)}\n`);
    assert.ok(
      text.stdout.startsWith(`${command}: ${expected.description}\nfields:\n`)
    );
    for (const field of expected.fields) {
      assert.ok(
        text.stdout.includes(
          `\n- ${field.name} ${field.type} ${field.required ? "required" : "optional"} [`
        ),
        `${command} ${field.name}`
      );
    }
    for (const rule of expected.rules) {
      assert.ok(text.stdout.includes(`\n- ${rule}\n`), rule);
    }
    const lines = text.stdout.trimEnd().split("\n");
    assert.equal(lines.at(-2), "example:");
    assert.deepEqual(JSON.parse(lines.at(-1)), expected.example);
  }
  // Limits and refusal codes are named in the text.
  assert.match(
    run(["schema", "digest", "--format", "text"]).stdout,
    /\n- result string required \[maxBytes 600, code PLAN_SCHEMA, limitCode ROUND_DIGEST_TOO_LARGE\] — /u
  );
  assert.match(
    run(["schema", "quality:apply", "--format", "text"]).stdout,
    /\n- approval string optional \[minLength 10, code INSTALL_APPROVAL\] — /u
  );

  // An unknown command: USAGE with the list.
  const unknown = run(["schema", "status"]);
  assert.equal(unknown.code, 1);
  const refusal = JSON.parse(unknown.stdout);
  assert.equal(refusal.code, "USAGE");
  assert.deepEqual(refusal.details.commands, commands);
  assert.match(
    refusal.message,
    /^status has no input schema\. Commands with a schema: scope:create, /u
  );
  const unknownText = run(["schema", "nope", "--format", "text"]);
  assert.equal(unknownText.code, 1);
  assert.match(
    unknownText.stderr,
    /^USAGE: nope has no input schema\..+\nNext: Run `scripts\/workflow schema` for the list\.\n$/u
  );
} finally {
  rmSync(root, { force: true, recursive: true });
  await build.cleanup();
}
