<!-- workflow-kit:begin -->
## Workflow Kit (managed section — do not edit by hand)

This project uses the Harness Workflow Kit. The plan lives in
`.harness/plans/todo-plan.md` and changes only through `scripts/workflow`
commands (Windows: `scripts\workflow.cmd`). Every command prints JSON;
add `--format text` for a readable answer.

### Start of every session
1. The recovery packet arrives at session start (Claude: in parts K/N).
   Unless the whole packet is in your context — every part with one digest,
   no `<persisted-output>`, no truncation marker — run
   `scripts/workflow recover --format text`.
2. Follow the `next` line of the packet.

### Inputs and documents
- Before writing a `--input` JSON, run `scripts/workflow schema <command>`
  for its fields, limits and an example.
- Write `--input` and `--digest` JSON files to `.harness/inputs/`
  (git-ignored): a file left elsewhere in the project is an uncommitted
  change and blocks `close`.
- Get documents with `scripts/workflow context <path>[#Heading]` (one call,
  marked text) instead of reading large files piecewise;
  `context --list` prints the documents map.
- Never read Kit runtime files (`.harness/workflow/runtime/**`, the bundle),
  generated code, logs or transcripts: the Kit gives what is needed from them.

### When a plan is needed
- Discussion, research, specifications and documentation-only commits need
  no plan. Commit documents with `scripts/workflow docs:commit --files <paths>`.
- Changing functional files is allowed only inside a started task of the
  active scope.
- A clear user instruction to implement allows you to write the
  specification and create the scope with
  `scripts/workflow scope:create --input <file.json>` without asking again.
  Record the agreement in `approval`. The plan never replaces the user's
  current instruction. In a Harness project (`"host": "harness"`) propose
  the scope instead (see Execution modes).

### Execution modes
The recovery packet names your `role:`; follow it.
- **planning** (no scope, Harness project): write the specification and a
  plan with `parallelSafe` labels, then run
  `scripts/workflow scope:propose --input <file.json> --recommended <mode> --reason "<why>"`
  and end the turn; the user chooses the mode on the card.
- **self** (`sequential`): run the tasks in order in main. Helper subagents
  may help, but they work in main without their own worktree and never commit.
- **orchestrator** (`orchestrated`, main): `assignment:next`,
  `assignment:create --task <ID>`, a Claude subagent (Agent tool with
  `isolation: "worktree"`) gets the returned brief; integrate its SHA with
  `integration:start --id <id> --source <sha>` (on CONFLICT or CHECKS_FAILED
  fix within the task files, then `integration:continue --id <id>`). Run
  QUALITY and delivery yourself; never implement work or DOCS tasks in main.
- **executor** (assignment worktree): `assignment:attach <id>`, then
  `task:start`, work only within the task files, `commit --task`, reply
  with the SHA. Never touch main, the plan or other tasks; no nested
  executors, no push, acceptance, close or publication.
- Never set the git identity (`git config user.*`). If a command refuses
  with `GIT_IDENTITY_REQUIRED`, report it to the user with the command it
  prints.

### One task, one commit, one turn
1. `scripts/workflow task:start <ID>`; a delivery task needs
   `--confirmed "<the user's confirmation>"`, or
   `--autopilot-run <run>` when the `next` line names a live autopilot
   run that confirmed this task in advance.
2. Implement the task within its files and acceptance criteria.
3. `scripts/workflow commit --task <ID>`. The DOCS task of a round
   reconciles shared documents and needs `--digest <file.json>`
   (`result`, `decisions`, `contracts`, `references`).
4. If a check fails, fix the cause and repeat the same command; your edits
   are kept.
5. Report the result briefly and end the turn. The user or the Workflow
   Kit autopilot starts the next task. Under a live autopilot run (the
   `next` section says so) ending the turn hands control to Kit: do not
   ask the user whether to continue.
- If the task cannot be finished in this turn, stop at a safe point, name
  the state and end the turn without committing it.
- A new user message does not cancel the accepted instruction; take it into
  account within the current task.

### Rules
- Never commit with `git commit` directly and never use `--no-verify`.
- Never edit the plan, `.harness/workflow/**` or the launchers by hand.
- A finished task never changes. Defects found later become a fixes round:
  `scripts/workflow plan:extend --input <file.json> --expected-revision <N>`.
- Before the first functional code, the QUALITY task chooses checks with
  `quality:detect` and applies them with `quality:apply --input <file.json>`.
  Installing tools needs the user's approval in `approval`.
- Update the contract document of a module in the same commit as its code
  (`docs.contracts` in `.harness/workflow/config.json`).
- Acceptance (`accept --note "<the user's words>"`) records the user's
  decision. Closing the scope (`close`) needs a separate direct user command.
- Autopilot runs: only the Workflow Kit app grants and revokes a run and
  accepts or closes a scope automatically. Never run `autopilot:authorize`,
  `autopilot:revoke`, `accept --autopilot-run` or
  `close --autopilot-run`; they refuse an agent (`HOST_AUTH_REQUIRED`).
  Without a live run every manual confirmation above stays.
- Release build, packaging and installation, and a push of a CI branch a
  delivery task names, happen only in delivery tasks. Rebuilding a tracked
  file a commit check requires from the sources (for example a vendored
  bundle) belongs to the work task that changes those sources.
- Publishing (`git push` of the main branch to its upstream) is no task:
  it comes only after the scope is accepted and closed, on the user's direct
  request or by the live autopilot run of this scope.
- If the external check of a started delivery task fails (for example a red
  CI), do not fix it inside the task: keep the results outside git, run
  `scripts/workflow task:defer-delivery <ID> --reason "<failure and link>" --expected-revision <N>`
  on a clean tree, then add a fixes round with `plan:extend`.
- If the scope is BLOCKED, only discuss and diagnose; run `task:unblock`
  after the user resolves the reason.
- If a command reports an unfinished transaction, run
  `scripts/workflow repair` and follow it.
- Use `scripts/workflow show-task <ID>` and `scripts/workflow history` for
  details the recovery packet left out.
<!-- workflow-kit:end -->

## Project start materials (local, not in git)

If `docs/start/README.md` exists, read it right after the recovery packet and
before writing any specification. It holds the verified research findings,
decisions, open questions and donor-project links this project starts from
(written in Russian). Take context only from the sources it lists. Do not
reconstruct context from other projects' transcripts, agent memories, chat
history or ad-hoc searches of the disk. If something is missing, ask the user.

## Three operating systems

Workflow Kit runs on macOS, Linux and Windows 11 (x64 and ARM64). Every change
covers all three; a macOS-only change is incomplete. Background:
`docs/planning/M6-cross-platform.md`.

- Every specification has a level-2 section «Поведение на ОС» with macOS, Linux
  and Windows columns; say so explicitly when the behaviour is the same
  everywhere. Start new specifications from `docs/planning/TEMPLATE.md`.
- Code with OS branches takes the platform as a parameter
  (`platform ?? process.platform`); never compare `process.platform` directly.
  Every `win32` and `linux` branch has a test with the platform injected.
- A call of one OS's program (`launchctl`, `systemctl`, `reg`, `taskkill`,
  `expect`, …) goes into `tools/platform-guard/allowlist.json` together with
  what the other two OSes do (or why they need nothing).
- `npm run check:platforms` (the `platform-guard` commit check) enforces these
  rules; see `tools/platform-guard/README.md`.
- In the same commit, update the OS matrix in `docs/architecture/OS-MATRIX.md`
  and the OS section of the module's `module.md`.
- The acceptance document lists live checks per OS and who runs them: macOS —
  the user; Windows — a Windows tester; Linux — CI only for now.
- Use `path` helpers and the injected platform for paths, not `/` joins;
  files are stored with LF (`.gitattributes`).
- CI (`.github/workflows/ci.yml`) runs typecheck, tests and the guard on
  macOS, Linux, Windows x64 and Windows ARM64. A delivery task is not done
  until CI is green on every OS for the pushed commit; before acceptance it
  runs on a `ci/<scope>` branch, `main` is pushed only after the scope is
  accepted and closed.

## Document size

The `kit:doc-size` check limits every document to 28 000 bytes so that an agent
gets it whole with one `scripts/workflow context` call.

- When a document nears the limit, split it by topic into linked documents.
  Never shorten or merge existing text to fit: compression loses facts.
- Move whole sections verbatim and leave a short pointer with a link where they
  were. Examples: the OS matrix lives in `docs/architecture/OS-MATRIX.md`; old
  versions of `CHANGELOG.md` go to `docs/changelog/`; a module keeps topic
  documents next to its `module.md` (`parameters.md`, `native-parameters.md`).
- Do the split as its own documentation commit (`docs:commit`) between tasks,
  before the task that needs the room (Kit refuses `docs:commit` while a task is
  in progress), so no task mixes new content with moved text.

<!-- wfk:begin -->
## Workflow Kit (managed section, do not edit by hand)

Workflow Kit (`wfk`) manages this section, its SessionStart, Stop and
UserPromptSubmit hook entries in `.claude/settings.json` and `.codex/hooks.json`, its
PreToolUse and PermissionRequest entries for AskUserQuestion in `.claude/settings.json`, the `.gitignore` block between
`# wfk:begin` and `# wfk:end` and the files listed in
`.workflow-kit/manifest.json`. Write project instructions outside the
`wfk:begin`/`wfk:end` markers; Kit never changes text outside them.

### Working with the Workflow Kit panel

The user follows this project in the Workflow Kit panel (Mac and iPad), not
only in this chat.

- The `wfk` command: if your shell does not find it, call it by its full
  path: macOS and Linux `"$HOME/.local/bin/wfk"`; Windows PowerShell
  `& "$env:LOCALAPPDATA\Workflow Kit\wfk.cmd"`, Git Bash
  `"$LOCALAPPDATA/Workflow Kit/wfk"`.
- Session title: in the first turn where the user gives you a task, run
  `wfk session title "<short title of that task in the user's language>"`
  once. The first message «Проект «…» создан панелью Workflow Kit…» is a
  service greeting, not a task: do not set the title in that turn. Do not
  rename the session again unless the user asks.
- Plan question: when the user's request is a software development task (a
  new product or a change to this one) that you would answer with a
  specification and a Workflow Kit plan, first run
  `wfk session plan "<one line: what you are going to build>"` and end your
  turn without writing the specification or any files. The user answers in
  the panel: specification and plan with a cross review, without it, or just
  talk; the answer reaches you as a `Workflow Kit:` message. Do not run it
  for discussion, research, explanations or everyday questions, and do not
  run it again for the same task unless the user asks for a plan anew.
- GitHub publication: `git push` of the main branch is not a plan task,
  not even a delivery task. It comes only after the scope is accepted and
  closed: when the user asks (the panel button «Опубликовать на GitHub» or
  `wfk project publish`), or done by the Workflow Kit app itself when the
  live autopilot run of the scope includes the publication. A delivery task
  pushes only a CI branch its plan names. If the user asks while a scope is
  open, say that publishing comes after its acceptance and closing.
- Autopilot (Settings «Автопилотирование»): while the `next` section of
  the recovery packet names a live autopilot run, end each turn with a short
  report and do not ask whether to continue; the app starts the next step,
  confirms the delivery tasks of the run, accepts by the recorded evidence,
  closes and publishes. Only the app does these host steps: never run
  `autopilot:*`, `accept --autopilot-run` or `close --autopilot-run`
  yourself. A status question of the user gets an answer and the run goes
  on; «стоп», «пауза» or switching the mode off stop it. Without a live run
  every manual barrier stays.
- Execution mode and plan start: after `scripts/workflow scope:propose` the
  user chooses the mode and starts the plan with buttons in the panel. End
  your turn and wait; the choice reaches you as a message from Workflow Kit.
- Messages that start with `Workflow Kit:` come from the panel on behalf of
  the user (the Stop and UserPromptSubmit hooks deliver them). Follow them
  as the user's instructions.

### Orchestration with your app's subagents

In the orchestrated mode this session is the orchestrator: it does not
implement work or DOCS tasks itself (QUALITY and delivery tasks it runs in
main). For each ready task run `scripts/workflow assignment:create --task <ID>`
and give the printed brief to a subagent of your app; independent
assignments may run in parallel, up to `maxWorkers` of the plan. Integrate
the SHA the subagent replies with:
`scripts/workflow integration:start --id <assignment id> --source <sha>`
(on CONFLICT or CHECKS_FAILED fix within the task files, then
`integration:continue`).

- Claude: start the subagent with the Agent tool and `isolation: "worktree"`;
  the worktree is made for it.
- ChatGPT (Codex): Kit makes no worktree for a Codex subagent. Make it
  yourself: `git worktree add --detach .workflow-kit/local/worktrees/<assignment id> <baseCommit>`
  (`baseCommit` from the assignment:create output), start the subagent
  with `spawn_agent`, give it the brief and the line "Your worktree is
  <absolute path>; run every command with that workdir", and wait for its
  SHA with `wait_agent`. Kit removes the worktree after the integration.
- Kimi Code: this section explicitly allows the Agent tool in a Kimi Code
  session. Executors: make the worktree yourself as for Codex
  (`git worktree add --detach .workflow-kit/local/worktrees/<assignment id> <baseCommit>`),
  start the subagent with the Agent tool in the foreground (no
  `run_in_background`), give it the brief and the line "Your worktree is
  <absolute path>; pass it as cwd to every Bash call and use absolute paths
  inside it for Read, Edit and Write"; independent assignments go as several
  Agent calls in one message. Do not use AgentSwarm. Kit removes the worktree
  after the integration. In the sequential mode Agent helpers may search,
  read and check for the current task: they work in main, never commit and
  never run `scripts/workflow`.

### Architecture: product-parts

Code is organized as a tree of product parts, clusters and modules:

```text
product-parts/<part>/product-part.md
product-parts/<part>/clusters/<cluster>/cluster.md
product-parts/<part>/clusters/<cluster>/modules/<module>/module.md
product-parts/<part>/clusters/<cluster>/modules/<module>/src/
product-parts/<part>/clusters/<cluster>/modules/<module>/test/
```

- A product part is a large area of the product; `product-part.md` names its
  purpose, clusters and boundaries.
- A cluster groups related modules; `cluster.md` lists them and the rules
  between them.
- A module is the unit of work: `module.md` is its contract (purpose, public
  interface, invariants, dependencies), `src/` holds the code, `test/` the tests.
- Modules talk to each other only through the public entry of a module (for
  example `src/index.ts`); never import another module's internal files.
- A module contract changes in the same commit as the module code.
- Start new parts, clusters and modules from the templates in
  `.workflow-kit/templates/` (`product-part.md`, `cluster.md`, `module.md`).
- Existing code is not moved automatically; move it into modules only as part
  of planned work.

### Local data

`.workflow-kit/local/` holds machine-local data (for example the session journal
`sessions.jsonl` written by the SessionStart hook). It is git-ignored; do not
commit or edit it.
<!-- wfk:end -->
