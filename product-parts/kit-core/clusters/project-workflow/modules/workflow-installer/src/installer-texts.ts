/** Who records the user's decisions: `host` — only the app (M40). */
export type DecisionsMode = "agent" | "host";

/** The mode-specific fragments of the agent rules. */
interface RuleTexts {
  /** The rule of an adopted commit made past the Kit. */
  adopt: string;
  /** The autopilot rule. */
  autopilot: string;
  /** The BLOCKED rule. */
  blocked: string;
  /** Acceptance and close; empty in the `host` mode (see `decisions`). */
  completion: string;
  /** The section «User decisions» of the `host` mode; empty otherwise. */
  decisions: string;
  /** How a clear instruction to implement becomes a plan. */
  plan: string;
  /** Step 1 of a task: how a delivery task starts. */
  start: string;
  /** Who approves the installation of tools. */
  tools: string;
}

const AGENT_TEXTS: RuleTexts = {
  adopt: `ask the user, then
  \`scripts/workflow commits:adopt --commits <sha,sha> --note "<the user's words>"\`.`,
  autopilot: `- Autopilot runs: only the Workflow Kit app grants and revokes a run and
  accepts or closes a scope automatically. Never run \`autopilot:authorize\`,
  \`autopilot:revoke\`, \`accept --autopilot-run\` or
  \`close --autopilot-run\`; they refuse an agent (\`HOST_AUTH_REQUIRED\`).
  Without a live run every manual confirmation above stays.`,
  blocked: `- If the scope is BLOCKED, only discuss and diagnose; run \`task:unblock\`
  after the user resolves the reason.`,
  completion: `- Acceptance (\`accept --note "<the user's words>"\`) records the user's
  decision. Closing the scope (\`close\`) needs a separate direct user command.
`,
  decisions: "",
  plan: `- A clear user instruction to implement allows you to write the
  specification and create the scope with
  \`scripts/workflow scope:create --input <file.json>\` without asking again.
  Record the agreement in \`approval\`. The plan never replaces the user's
  current instruction. In a Harness project (\`"host": "harness"\`) propose
  the scope instead (see Execution modes).`,
  start: `1. \`scripts/workflow task:start <ID>\`; a delivery task needs
   \`--confirmed "<the user's confirmation>"\`, or
   \`--autopilot-run <run>\` when the \`next\` line names a live autopilot
   run that confirmed this task in advance.`,
  tools: "Installing tools needs the user's approval in `approval`.",
};

const HOST_TEXTS: RuleTexts = {
  adopt: "the user adopts it (see User decisions).",
  autopilot: `- Autopilot runs: only the Workflow Kit app grants and revokes a run and
  accepts, closes and publishes automatically. Never run
  \`autopilot:authorize\` or \`autopilot:revoke\`; they refuse an agent
  (\`HOST_AUTH_REQUIRED\`). Without a live run every decision of the user
  stays with the user.`,
  blocked: `- If the scope is BLOCKED, only discuss and diagnose; removing the block is
  the user's decision (see User decisions).`,
  completion: "",
  decisions: `
### User decisions
- The user's decisions — preparing a plan, the execution mode, a delivery,
  acceptance, closing the scope, removing a block, installing tools and
  adopting commits made past the Kit — are recorded by Workflow Kit itself
  from the panel button or from the user's message, never from your words.
- A command that needs such a decision changes nothing and refuses with
  \`USER_DECISION_REQUIRED\`: the decision then waits on a card in the
  Workflow Kit panel. Tell the user so and end the turn.
- If the user decided in this chat, run \`wfk decision <kind>\`; the kinds
  are choose (with \`--option <mode>\`), confirm-delivery (with
  \`--task <ID>\`), accept, close, unblock, approve-install and
  adopt-commits. Never pass the user's words yourself: Workflow Kit takes
  them from the message it received. Acceptance and closing are two
  separate decisions.
`,
  plan: `- A software development task (a new product or a change to this one)
  starts with \`wfk session plan "<one line: what you are going to build>"\`:
  Workflow Kit decides from the user's settings and message whether to
  prepare the plan at once or to ask the user. End the turn and follow its
  answer; then write the specification and propose the scope (see Execution
  modes). The plan never replaces the user's current instruction.`,
  start: `1. \`scripts/workflow task:start <ID>\`. A delivery task starts by the
   user's decision: Workflow Kit starts it after the user's confirmation
   and tells you. Under a live autopilot run that covers the task (the
   \`next\` line says so) start it yourself with the same command, without
   flags.`,
  tools: `Installing tools is the user's decision: \`quality:apply\` with
  \`install\` waits for it (see User decisions).`,
};

/**
 * English process rules for agents: the managed section of AGENTS.md. In
 * the `host` decisions mode the section gives the agent no manual form of
 * a user decision (spec M40, section 4).
 */
export function agentRules(mode: DecisionsMode = "agent"): string {
  const texts = mode === "host" ? HOST_TEXTS : AGENT_TEXTS;
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
- Write \`--input\` and \`--digest\` JSON files to \`.harness/inputs/\`
  (git-ignored): a file elsewhere in the project is refused
  (\`INPUT_LOCATION\`).
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
${texts.plan}

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
  executors, no push, acceptance, close or publication.
- Never set the git identity (\`git config user.*\`). If a command refuses
  with \`GIT_IDENTITY_REQUIRED\`, report it to the user with the command it
  prints.
${texts.decisions}
### One task, one commit, one turn
${texts.start}
2. Implement the task within its files and acceptance criteria. A changed
   path outside the task files stops the commit (\`TASK_FILES_OUTSIDE\`):
   revert it or extend the task with
   \`scripts/workflow task:update <ID> --input <patch.json>\` (\`files\`).
3. \`scripts/workflow commit --task <ID>\`. The DOCS task of a round
   reconciles shared documents and needs \`--digest <file.json>\`
   (\`result\`, \`decisions\`, \`contracts\`, \`references\`).
4. If a check fails, fix the cause and repeat the same command; your edits
   are kept.
5. Report the result briefly and end the turn. The user or the Workflow
   Kit autopilot starts the next task. Under a live autopilot run (the
   \`next\` section says so) ending the turn hands control to Kit: do not
   ask the user whether to continue.
- If the task cannot be finished in this turn, stop at a safe point, name
  the state and end the turn without committing it.
- A new user message does not cancel the accepted instruction; take it into
  account within the current task.

### Rules
- Never commit with \`git commit\` directly and never use \`--no-verify\`.
  A commit made past the Kit blocks the scope (\`EXTERNAL_COMMITS\`) until
  ${texts.adopt}
- Never edit the plan, \`.harness/workflow/**\` or the launchers by hand.
- A finished task never changes. Defects found later become a fixes round:
  \`scripts/workflow plan:extend --input <file.json> --expected-revision <N>\`.
- Before the first functional code, the QUALITY task chooses checks with
  \`quality:detect\` and applies them with \`quality:apply --input <file.json>\`.
  ${texts.tools}
- Update the contract document of a module in the same commit as its code
  (\`docs.contracts\` in \`.harness/workflow/config.json\`).
${texts.completion}${texts.autopilot}
- Release build, packaging and installation, and a push of a CI branch a
  delivery task names, happen only in delivery tasks; the plan names the
  task that pushes the CI branch in \`automation.ci.task\`. Rebuilding a
  tracked file a commit check requires from the sources (for example a
  vendored bundle) belongs to the work task that changes those sources.
- Publishing (\`git push\` of the main branch to its upstream) is no task:
  it comes only after the scope is accepted and closed, on the user's direct
  request or by the live autopilot run of this scope.
- If the external check of a started delivery task fails (for example a red
  CI), do not fix it inside the task: keep the results outside git, run
  \`scripts/workflow task:defer-delivery <ID> --reason "<failure and link>" --expected-revision <N>\`
  on a clean tree, then add a fixes round with \`plan:extend\`.
${texts.blocked}
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
    ".harness/inputs/",
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
