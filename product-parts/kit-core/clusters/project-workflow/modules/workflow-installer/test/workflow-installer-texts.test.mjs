import assert from "node:assert/strict";
import { buildWorkflowModules } from "../../workflow-platform/test/workflow-test-build.mjs";

// M40 T004: the managed section of AGENTS.md is generated for the decisions
// mode of the project. `host`: the user's decisions are recorded by Workflow
// Kit, so the section gives the agent no manual form of them. `agent`: the
// text keeps the manual forms of Kit 2.3.3.
const build = await buildWorkflowModules(["workflow-installer"], "workflow-installer-texts");
try {
  const { WorkflowInstallerFacade } = await build.load("workflow-installer", "workflow-installer-facade.js");
  const installer = new WorkflowInstallerFacade();
  const agent = installer.agentRules();
  const host = installer.agentRules("host");
  assert.equal(installer.agentRules("agent"), agent);
  assert.notEqual(host, agent);

  /** Manual forms of user decisions an agent could run or fill in itself. */
  const MANUAL_FORMS = [
    /--confirmed/u,
    /--autopilot-run/u,
    /--note/u,
    /accept --/u,
    /close --/u,
    /`accept`|`close`/u,
    /scripts\/workflow (?:accept|close)/u,
    /task:unblock/u,
    /scope:choose/u,
    /scope:create/u,
    /commits:adopt/u,
    /in `approval`/u,
    /--authorized/u,
  ];
  for (const pattern of MANUAL_FORMS) {
    assert.doesNotMatch(host, pattern, `the host section has no ${pattern}`);
  }
  // The one rule of the host mode: who records the decisions and what the agent does.
  const decisions = host.slice(host.indexOf("### User decisions"), host.indexOf("### One task, one commit, one turn"));
  assert.ok(decisions.length > 0, "the User decisions block exists");
  for (const pattern of [
    /preparing a plan, the execution mode, a delivery,\n {2}acceptance, closing the scope, removing a block, installing tools and\n {2}adopting commits made past the Kit/u,
    /recorded by Workflow Kit itself\n {2}from the panel button or from the user's message, never from your words\./u,
    /refuses with\n {2}`USER_DECISION_REQUIRED`: the decision then waits on a card in the\n {2}Workflow Kit panel\. Tell the user so and end the turn\./u,
    /If the user decided in this chat, run `wfk decision <kind>`/u,
    /choose \(with `--option <mode>`\), confirm-delivery \(with\n {2}`--task <ID>`\), accept, close, unblock, approve-install and\n {2}adopt-commits\./u,
    /Never pass the user's words yourself/u,
    /Acceptance and closing are two\n {2}separate decisions\./u,
  ]) {
    assert.match(decisions, pattern);
  }
  // A development task starts with the plan question the app decides.
  assert.match(host, /starts with `wfk session plan "<one line: what you are going to build>"`/u);
  // A delivery task: started by Workflow Kit, or without flags under a live run.
  assert.match(host, /1\. `scripts\/workflow task:start <ID>`\. A delivery task starts by the\n {3}user's decision: Workflow Kit starts it after the user's confirmation\n {3}and tells you\./u);
  assert.match(host, /start it yourself with the same command, without\n {3}flags\./u);
  assert.match(host, /Installing tools is the user's decision: `quality:apply` with\n {2}`install` waits for it \(see User decisions\)\./u);
  assert.match(host, /removing the block is\n {2}the user's decision \(see User decisions\)\./u);
  assert.match(host, /Never run\n {2}`autopilot:authorize` or `autopilot:revoke`/u);

  // The agent mode keeps every manual form and names no host command.
  for (const pattern of [
    /`scripts\/workflow scope:create --input <file\.json>` without asking again\./u,
    /a delivery task needs\n {3}`--confirmed "<the user's confirmation>"`, or\n {3}`--autopilot-run <run>`/u,
    /Installing tools needs the user's approval in `approval`\./u,
    /Acceptance \(`accept --note "<the user's words>"`\) records the user's\n {2}decision\. Closing the scope \(`close`\) needs a separate direct user command\./u,
    /Never run `autopilot:authorize`,\n {2}`autopilot:revoke`, `accept --autopilot-run` or\n {2}`close --autopilot-run`/u,
    /run `task:unblock`\n {2}after the user resolves the reason\./u,
    /`scripts\/workflow commits:adopt --commits <sha,sha> --note "<the user's words>"`\./u,
  ]) {
    assert.match(agent, pattern);
  }
  assert.doesNotMatch(agent, /wfk |User decisions|USER_DECISION_REQUIRED/u);

  // The rules of the barriers (Kit 2.4.1 and 2.4.2) are the same in both modes.
  for (const rules of [agent, host]) {
    assert.match(rules, /a file elsewhere in the project is refused\n {2}\(`INPUT_LOCATION`\)\./u);
    assert.match(rules, /stops the commit \(`TASK_FILES_OUTSIDE`\):\n {3}revert it or extend the task with\n {3}`scripts\/workflow task:update <ID> --input <patch\.json>` \(`files`\)\./u);
    assert.match(rules, /A commit made past the Kit blocks the scope \(`EXTERNAL_COMMITS`\)/u);
    assert.match(rules, /the plan names the\n {2}task that pushes the CI branch in `automation\.ci\.task`\./u);
    // No line of a section is cut by a stray blank line or a template leftover.
    assert.doesNotMatch(rules, /\$\{|undefined|\n\n\n/u);
    assert.ok(Buffer.byteLength(rules, "utf8") < 9000, "the section stays compact");
  }
  // Everything outside the mode fragments is identical.
  const shared = (rules) => rules.slice(0, rules.indexOf("### When a plan is needed"));
  assert.equal(shared(host), shared(agent));

  // The payload writes the section of the mode; `agent` is the default.
  const section = (decisionsMode) =>
    installer
      .payload({ bundle: "// bundle\n", ...(decisionsMode ? { decisions: decisionsMode } : {}), hooksPath: null, projectName: "Demo" })
      .find((entry) => entry.path === "AGENTS.md").managed;
  assert.ok(section().includes(agent));
  assert.ok(section("agent").includes(agent));
  assert.ok(section("host").includes(host));
  assert.equal(section("host").includes(agent), false);
  console.log("workflow-installer texts tests passed");
} finally {
  await build.cleanup();
}
