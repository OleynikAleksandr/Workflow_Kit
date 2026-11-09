<!-- workflow-kit:begin -->
## Workflow Kit (managed section — do not edit by hand)

This project uses the Harness Workflow Kit. The plan lives in
`.harness/plans/todo-plan.md` and changes only through `scripts/workflow`
commands (Windows: `scripts\workflow.cmd`). Every command prints JSON;
add `--format text` for a readable answer.

### Start of every session
1. Unless a workflow recovery packet is already in your context, run
   `scripts/workflow recover --format text`.
2. Follow the `next` line of the packet.

### Inputs and documents
- Before writing a `--input` JSON, run `scripts/workflow schema <command>`
  for its fields, limits and an example.
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
  executors, no push.
- Never set the git identity (`git config user.*`). If a command refuses
  with `GIT_IDENTITY_REQUIRED`, report it to the user with the command it
  prints.

### One task, one commit, one turn
1. `scripts/workflow task:start <ID>`; a delivery task needs
   `--confirmed "<the user's confirmation>"`.
2. Implement the task within its files and acceptance criteria.
3. `scripts/workflow commit --task <ID>`. The DOCS task of a round
   reconciles shared documents and needs `--digest <file.json>`
   (`result`, `decisions`, `contracts`, `references`).
4. If a check fails, fix the cause and repeat the same command; your edits
   are kept.
5. Report the result briefly and end the turn. The user or the Harness
   autopilot starts the next task.
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
- Build, packaging, publishing and push happen only in delivery tasks.
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
- In the same commit, update the OS matrix in `docs/architecture/OVERVIEW.md`
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
