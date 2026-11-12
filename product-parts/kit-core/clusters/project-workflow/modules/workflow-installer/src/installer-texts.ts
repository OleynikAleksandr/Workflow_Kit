/** English process rules for agents: the managed section of AGENTS.md. */
export function agentRules(): string {
  return `## Workflow Kit (managed section — do not edit by hand)

This project uses the Harness Workflow Kit. The plan lives in
\`.harness/plans/todo-plan.md\` and changes only through \`scripts/workflow\`
commands (Windows: \`scripts\\workflow.cmd\`). Every command prints JSON;
add \`--format text\` for a readable answer.

### Start of every session
1. The recovery packet arrives at session start (Claude: in parts K/N).
   Unless the whole packet is in your context — every part with one digest,
   no \`<persisted-output>\`, no truncation marker — run
   \`scripts/workflow recover --format text\`.
2. Follow the \`next\` line of the packet.

### Inputs and documents
- Before writing a \`--input\` JSON, run \`scripts/workflow schema <command>\`
  for its fields, limits and an example.
- Get documents with \`scripts/workflow context <path>[#Heading]\` (one call,
  marked text) instead of reading large files piecewise;
  \`context --list\` prints the documents map.
- Never read Kit runtime files (\`.harness/workflow/runtime/**\`, the bundle),
  generated code, logs or transcripts: the Kit gives what is needed from them.

### When a plan is needed
- Discussion, research, specifications and documentation-only commits need
  no plan. Commit documents with \`scripts/workflow docs:commit --files <paths>\`.
- Changing functional files is allowed only inside a started task of the
  active scope.
- A clear user instruction to implement allows you to write the
  specification and create the scope with
  \`scripts/workflow scope:create --input <file.json>\` without asking again.
  Record the agreement in \`approval\`. The plan never replaces the user's
  current instruction. In a Harness project (\`"host": "harness"\`) propose
  the scope instead (see Execution modes).

### Execution modes
The recovery packet names your \`role:\`; follow it.
- **planning** (no scope, Harness project): write the specification and a
  plan with \`parallelSafe\` labels, then run
  \`scripts/workflow scope:propose --input <file.json> --recommended <mode> --reason "<why>"\`
  and end the turn; the user chooses the mode on the card.
- **self** (\`sequential\`): run the tasks in order in main. Helper subagents
  may help, but they work in main without their own worktree and never commit.
- **orchestrator** (\`orchestrated\`, main): \`assignment:next\`,
  \`assignment:create --task <ID>\`, a Claude subagent (Agent tool with
  \`isolation: "worktree"\`) gets the returned brief; integrate its SHA with
  \`integration:start --id <id> --source <sha>\` (on CONFLICT or CHECKS_FAILED
  fix within the task files, then \`integration:continue --id <id>\`). Run
  QUALITY and delivery yourself; never implement work or DOCS tasks in main.
- **executor** (assignment worktree): \`assignment:attach <id>\`, then
  \`task:start\`, work only within the task files, \`commit --task\`, reply
  with the SHA. Never touch main, the plan or other tasks; no nested
  executors, no push.
- Never set the git identity (\`git config user.*\`). If a command refuses
  with \`GIT_IDENTITY_REQUIRED\`, report it to the user with the command it
  prints.

### One task, one commit, one turn
1. \`scripts/workflow task:start <ID>\`; a delivery task needs
   \`--confirmed "<the user's confirmation>"\`.
2. Implement the task within its files and acceptance criteria.
3. \`scripts/workflow commit --task <ID>\`. The DOCS task of a round
   reconciles shared documents and needs \`--digest <file.json>\`
   (\`result\`, \`decisions\`, \`contracts\`, \`references\`).
4. If a check fails, fix the cause and repeat the same command; your edits
   are kept.
5. Report the result briefly and end the turn. The user or the Harness
   autopilot starts the next task.
- If the task cannot be finished in this turn, stop at a safe point, name
  the state and end the turn without committing it.
- A new user message does not cancel the accepted instruction; take it into
  account within the current task.

### Rules
- Never commit with \`git commit\` directly and never use \`--no-verify\`.
- Never edit the plan, \`.harness/workflow/**\` or the launchers by hand.
- A finished task never changes. Defects found later become a fixes round:
  \`scripts/workflow plan:extend --input <file.json> --expected-revision <N>\`.
- Before the first functional code, the QUALITY task chooses checks with
  \`quality:detect\` and applies them with \`quality:apply --input <file.json>\`.
  Installing tools needs the user's approval in \`approval\`.
- Update the contract document of a module in the same commit as its code
  (\`docs.contracts\` in \`.harness/workflow/config.json\`).
- Acceptance (\`accept --note "<the user's words>"\`) records the user's
  decision. Closing the scope (\`close\`) needs a separate direct user command.
- Build, packaging, publishing and push happen only in delivery tasks.
- If the scope is BLOCKED, only discuss and diagnose; run \`task:unblock\`
  after the user resolves the reason.
- If a command reports an unfinished transaction, run
  \`scripts/workflow repair\` and follow it.
- Use \`scripts/workflow show-task <ID>\` and \`scripts/workflow history\` for
  details the recovery packet left out.`;
}

export const CLAUDE_IMPORT_LINE = "@AGENTS.md";

export function gitignoreSection(): string {
  return [
    "# Workflow Kit local state",
    ".harness/workflow/local/",
    ".harness/runtime/",
    ".harness/sessions/",
    ".claude/worktrees/",
    ".DS_Store",
    "# Dependency folders: installed by quality:apply, never committed",
    "node_modules/",
    ".venv/",
    "__pycache__/",
  ].join("\n");
}

export function gitattributesSection(): string {
  return [
    "scripts/workflow text eol=lf",
    "scripts/workflow.cmd text eol=crlf",
    "scripts/workflow.ps1 text eol=crlf",
    ".harness/** text eol=lf",
  ].join("\n");
}

/** The managed lines of a git hook: delegate to the Kit and stop on failure. */
export function gitHookSection(name: string): string {
  return `"$(git rev-parse --show-toplevel)/scripts/workflow" git-hook ${name} "$@" || exit $?`;
}

export function readmeSkeleton(projectName: string): string {
  return `# ${projectName}

Project context for people and agents. Describe what the project does, how
to run it and where its architecture is documented
([docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)).

Development follows the Workflow Kit rules in [AGENTS.md](AGENTS.md).
`;
}

export function overviewSkeleton(projectName: string): string {
  return `# ${projectName} — Architecture Overview

Describe the main parts of the system, their responsibilities and the
contracts between them. The DOCS task of every round keeps this document
in line with the code.
`;
}
