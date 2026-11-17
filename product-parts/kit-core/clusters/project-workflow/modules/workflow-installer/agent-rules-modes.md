# Workflow Installer: agent rules by decisions mode (Kit 2.4.3, spec M40)

Part of the [module contract](module.md#agent-rules-installer-textsts).
Specification:
[M40, section 4](../../../../../../docs/planning/M40-user-decisions.md#4-инструкции-и-тексты).

`agentRules(mode = "agent")` builds the managed `AGENTS.md` section for the
decisions mode of the project (`DecisionsMode`: `"agent" | "host"`,
`config.decisions`). `buildPayload` takes the mode in
`PayloadOptions.decisions`; `install` passes `decisionsOf(root, markers)`
(`installer-config.ts`): the `--decisions host` marker, else the mode of the
existing configuration, else `agent`. So `install --update` keeps the
section of a `host` project, and an update that turns the mode on rewrites
`AGENTS.md` together with the configuration.

The two texts share everything except the fragments below (`RuleTexts`:
`plan`, `decisions`, `start`, `tools`, `completion`, `autopilot`, `blocked`,
`adopt`).

## `host`

The user's decisions are recorded by Workflow Kit, so the section gives the
agent no manual form of them: no `--confirmed`, `--autopilot-run`,
`accept --note`, `close`, `task:unblock`, `scope:create`, `commits:adopt`
and no `approval` for tools.

- **When a plan is needed.** A software development task starts with
  `wfk session plan "<one line: what you are going to build>"`: Workflow Kit
  decides from the user's settings and message whether to prepare the plan
  at once or to ask; the agent ends the turn, follows the answer, then
  writes the specification and proposes the scope.
- **User decisions** (a block of its own after Execution modes):
  - preparing a plan, the execution mode, a delivery, acceptance, closing
    the scope, removing a block, installing tools and adopting commits made
    past the Kit are recorded by Workflow Kit from the panel button or from
    the user's message, never from the agent's words;
  - a command that needs such a decision changes nothing and refuses with
    `USER_DECISION_REQUIRED`; the decision waits on a card in the panel, the
    agent tells the user and ends the turn;
  - if the user decided in the chat, the agent runs `wfk decision <kind>`
    (choose with `--option <mode>`, confirm-delivery with `--task <ID>`,
    accept, close, unblock, approve-install, adopt-commits) and never
    passes the user's words; acceptance and closing are two decisions.
- **Task start.** `scripts/workflow task:start <ID>`; a delivery task is
  started by Workflow Kit after the user's confirmation, or by the agent
  with the same command without flags under a live run that covers it.
- **Rules.** Installing tools, removing a block and adopting a commit made
  past the Kit point to the User decisions block; the autopilot rule names
  only `autopilot:authorize` and `autopilot:revoke`; there is no rule of
  acceptance and closing with command forms.

## `agent`

The text of Kit 2.3.3 with its manual forms: `scope:create` on a clear
instruction, `task:start --confirmed` or `--autopilot-run`, `approval` for
tools, `accept --note`, `close`, the four host-only autopilot commands,
`task:unblock`. It names no `wfk` command and has no User decisions block.

## Both modes (the barriers of Kit 2.4.1 and 2.4.2)

- input files: a file elsewhere in the project is refused
  (`INPUT_LOCATION`), instead of the earlier "is an uncommitted change and
  blocks `close`";
- step 2 of a task: a changed path outside the task files stops the commit
  (`TASK_FILES_OUTSIDE`); revert it or extend the task with `task:update`;
- a commit made past the Kit blocks the scope (`EXTERNAL_COMMITS`) until the
  user adopts it (`agent`: `commits:adopt --commits <sha,sha> --note`);
- the plan names the task that pushes the CI branch in
  `automation.ci.task`.

## OS behaviour

The same on macOS, Linux and Windows (x64 and ARM64): the section is text,
written with the line endings of the existing `AGENTS.md` as before.

## Tests

`test/workflow-installer-texts.test.mjs` compares the generated texts of
both modes: the `host` section has none of the manual forms and has the
User decisions block; the `agent` section keeps every manual form and names
no `wfk` command; the barrier rules are in both; the payload writes the
section of its mode. `test/workflow-installer-install.test.mjs` checks the
section of an installed `host` project, of an update that keeps the mode and
of an update that turns it on.
