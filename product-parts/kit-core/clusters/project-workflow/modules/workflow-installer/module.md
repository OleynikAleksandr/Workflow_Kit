# Workflow Installer Module

## Responsibility

Everything the Workflow Kit writes into a project and keeps healthy there:
- the installation payload — the bundle, launchers, git hooks, agent rules,
  provider hooks, ignore and attribute sections, skeleton documents — and
  the manifest that records it;
- folder inspection, install and update;
- the project doctor and its safe fixes;
- the migration of legacy Harness plans (`harness-ai-plan-v1`).

## Public Facade

`WorkflowInstallerFacade` (class, singleton `workflowInstallerFacade`). The
constructor takes a `WorkflowGitFacade`.

## Payload (`installer-payload.ts`)

`payload({projectName, bundle, hooksPath})` returns one entry per file:
`{path, kind, executable, managed, render(current), read(current)}`.
`render` turns the current text (`null` when the file is absent) into the
new text; `read` returns the managed part of a text, so the doctor can
compare it with `managed`.

| Path | Kind | Content |
|---|---|---|
| `.harness/workflow/runtime/workflow.mjs` | owned | the Kit bundle |
| `scripts/workflow` (executable), `scripts/workflow.cmd`, `scripts/workflow.ps1` | owned | launchers of `workflow-platform` |
| `.harness/workflow/hooks/<hook>` (executable) | owned | when `core.hooksPath` is not set |
| `<hooksPath>/<hook>` (executable) | section, after the shebang | when `core.hooksPath` is set (Harness: `.husky`) |
| `AGENTS.md` | section | English process rules, including the Execution modes block |
| `CLAUDE.md` | line | `@AGENTS.md`, appended once |
| `.codex/hooks.json` | json | SessionStart → `scripts/workflow hook session-start --client codex` with `"additionalContextLimit": 65536` (`CODEX_CONTEXT_LIMIT`) |
| `.claude/settings.json` | json | SessionStart → six groups (`CLAUDE_PARTS`) `"$CLAUDE_PROJECT_DIR/scripts/workflow" hook session-start --client claude --part K/6` |
| `.gitignore` | section | `.harness/workflow/local/`, `.harness/runtime/`, `.harness/sessions/`, `.claude/worktrees/`, `.DS_Store`, dependency folders `node_modules/`, `.venv/`, `__pycache__/` |
| `.gitattributes` | section | `eol=lf` for the POSIX launcher and `.harness/**`, `eol=crlf` for `.cmd` and `.ps1` |
| `README.md`, `docs/architecture/OVERVIEW.md` | create | skeletons, only when absent |

Hooks are `pre-commit`, `commit-msg`, `post-commit`, `pre-push`; each
managed block runs
`"$(git rev-parse --show-toplevel)/scripts/workflow" git-hook <name> "$@" || exit $?`.

Writing rules:
- **section** — the block between `workflow-kit:begin` and
  `workflow-kit:end` (`<!-- … -->` in Markdown, `# …` elsewhere) is
  replaced or added; the rest of the file stays byte for byte, CRLF files
  keep CRLF. New blocks go to the end, git hook blocks after the shebang
  (a missing hook file starts with `#!/bin/sh`).
- **json** — every SessionStart group whose command runs
  `scripts/workflow … hook session-start` is removed and the Kit groups are
  appended in order (Claude: six, one per recovery packet part, because
  Claude Code keeps at most 10 000 characters of one hook's output; Codex:
  one with the raised output limit); other hooks and settings stay. The
  managed part read back is the JSON array of all Kit groups in order, so
  inspect and doctor see a change in any of them. A file that is not a JSON
  object fails with `MANAGED_JSON`.
- **line** — `@AGENTS.md` is appended when no line equals it.
- **create** — an existing file is never touched.
- Rendering is idempotent.

## Manifest

`manifest(entries)` → `{schema "harness-workflow-manifest/1", version,
files: [{path, kind, executable, sha256}]}`; `sha256` hashes the managed
part (`null` for `create`). `version` is `KIT_VERSION` (`2.2.3`; Kit 1.x
was Workflow Pilot). A change of a managed text or of the runtime raises the version, so
older installations read as `KIT_OUTDATED` and the update rewrites them
(2.1.0 added `.harness/sessions/` and `.claude/worktrees/` to `.gitignore`
and the Execution modes block to `AGENTS.md`; 2.1.1 added `.DS_Store` to
`.gitignore`; 2.2.0 added the Inputs and documents block to `AGENTS.md`;
2.2.1 added the dependency folders `node_modules/`, `.venv/` and
`__pycache__/` to `.gitignore`, so dependencies installed by `quality:apply`
are never selected for a commit; 2.2.2 changed only the runtime: content
checks skip the paths a commit removes from the index; 2.2.3 writes the
recovery packet hooks in parts for Claude, the Codex output limit and the
session-start rule about an incomplete packet in `AGENTS.md`, spec
`docs/architecture/KitRecoveryParts-2026-11-12.md`). The manifest lives at `.harness/workflow/manifest.json`
(`manifestPath`).

## Agent Rules (`installer-texts.ts`)

`agentRules()` is the managed `AGENTS.md` section: the plan and commands,
session start (the packet arrives at session start, for Claude in parts
K/N; unless every part with one digest is in the context, without
`<persisted-output>` or a truncation marker, the agent runs `recover`), the
Inputs and documents block, when a plan is needed (in a Harness project the scope is
proposed instead of created), the Execution modes block, one task per
commit and turn, and the rules. The Execution modes block tells the agent
to follow the `role:` of the recovery packet:
- planning (no scope, Harness project) — spec and plan with `parallelSafe`
  labels, `scope:propose --input <file.json> --recommended <mode> --reason
  "<why>"`, end the turn until the user chooses on the card;
- self (`sequential`) — tasks in order in main; helper subagents work in
  main without their own worktree and never commit;
- orchestrator (`orchestrated`, main) — `assignment:next`,
  `assignment:create --task <ID>`, a Claude subagent (Agent tool with
  `isolation: "worktree"`) with the brief, `integration:start --id <id>
  --source <sha>`, on CONFLICT or CHECKS_FAILED a fix within the task files
  and `integration:continue --id <id>`; QUALITY and delivery in main, never
  work or DOCS tasks;
- executor (assignment worktree) — `assignment:attach <id>`, `task:start`,
  work within the task files, `commit --task`, reply with the SHA; never
  main, the plan or other tasks, no nested executors, no push;
- agents never set the git identity (`git config user.*`); a
  `GIT_IDENTITY_REQUIRED` refusal goes to the user with the command it
  prints.

The Inputs and documents block (after session start) tells the agent to
run `scripts/workflow schema <command>` before writing a `--input` JSON, to
get documents with `scripts/workflow context <path>[#Heading]` (one call,
marked text; `context --list` prints the documents map) instead of reading
large files piecewise, and never to read Kit runtime files
(`.harness/workflow/runtime/**`, the bundle), generated code, logs or
transcripts.

## Inspection (`installer-inspect.ts`)

`inspect(path)` changes nothing and returns `{path, state, action, git
{repository, identity, head}, stacks, transactionPending, version, damaged,
nestedIn}`. States in order of detection:

| State | Condition | Action |
|---|---|---|
| `MISSING` | the folder does not exist | `create` |
| `EMPTY` | no entries | `install` |
| `PILOT_KIT` | `.harness/kit-manifest.json` (Workflow Pilot) | `unsupported` |
| `KIT_OUTDATED` | manifest version older than `KIT_VERSION` | `update` |
| `KIT_DAMAGED` | a managed part differs from its manifest hash (`damaged`) | `doctor` |
| `KIT_OK` | manifest current and every managed part intact | `open` |
| `LEGACY_HARNESS_PLAN` | the plan file is `harness-ai-plan-v1` | `install-migrate` |
| `GIT_NO_KIT` | repository top level without the Kit | `install` |
| `NOT_GIT` | files without a repository | `install` |

A folder inside another repository (not its top level, compared by real
path) reports `nestedIn` and action `unsupported`.

## Install And Update (`installer-install.ts`)

`install(path, {bundle, name?, update?, runtime?, host?, platform?})` (CLI
`install [<path>] [--name] [--update] [--host harness] [--bundle]`):
1. refuses `NESTED_REPOSITORY`, `PILOT_KIT_UNSUPPORTED`,
   `TRANSACTION_PENDING`, `ALREADY_INSTALLED` (without `update`),
   `NOT_INSTALLED` (with `update`) and `USAGE` for a `host` other than
   `harness`;
2. resolves the git identity before writing anything: the real
   repository-local one of an existing repository, else the real global one
   (`isUsableIdentity` of `workflow-git` skips placeholders and invalid
   identities, such as an email in quotes; the global config is read even
   when the folder does not exist yet). None fails with the `workflow-git`
   `identityRequired` refusal `GIT_IDENTITY_REQUIRED`: the message names the
   problem once (`The Workflow Kit needs a real git name and email for its
   commits; none is set.` or `...; the configured one is a placeholder or
   invalid.`, then `Nothing was written.`), `details.placeholder`, and only
   `nextAction` holds the `identityFix` text with the two `git config
   --global` commands. Nothing is created or written;
3. creates the folder and runs `git init` (branch `main`) when needed, then
   writes the resolved identity into the repository-local config unless
   that config already holds a usable one (a placeholder or invalid one is
   replaced). Every
   worktree reads that config, and the bootstrap commit is signed with it;
4. reads the local `core.hooksPath`: a path inside the project gets hook
   sections; none means own hooks in `.harness/workflow/hooks` and
   `core.hooksPath` set to it; a path outside fails with
   `HOOKS_PATH_OUTSIDE`;
5. writes every payload entry whose text changes (executable entries get
   mode 755 on POSIX), an empty plan (`projectId` is the slug of `name`,
   default the folder name) and the default configuration when they are
   absent, and the manifest. `host: "harness"` adds `"host": "harness"` to
   the new configuration, or to an existing one that lacks it (the only
   change made to an existing configuration); without `host` an existing
   marker is kept;
6. records `runtime` (`.harness/workflow/local/runtime`) so the launchers
   and hooks find Node or Electron;
7. commits the written files through a Kit transaction: role `bootstrap`
   (`chore: install workflow kit <version>`) or `kit-update`
   (`chore: update workflow kit to <version>`). The installed hooks already
   run for this commit. Nothing to commit gives `commit: null`.

The result is `{root, previousState, version, hooksPath, written, excluded,
migrationRequired, commit}`; `excluded` lists earlier changes left out of
the commit. A legacy Harness plan is kept unchanged with
`migrationRequired: true`. Plan and configuration of an installed project
are never overwritten.

## Doctor (`installer-doctor.ts`, `installer-doctor-checks.ts`)

`installer-doctor-checks.ts` holds the check type and the installation
checks (`manifest`, `managed-files`, `executable`, `git-hooks`, `plan`,
`transaction`); `installer-doctor.ts` the other checks, the options and
the fix, and re-exports `DoctorCheck` and `DoctorStatus`.

`doctor(path, {env?, probe?, fix?, platform?})` returns `{root, ok, checks, fix,
identityFix}`.
Each check is `{id, status ok|warn|fail, message, fixable, nextAction}`:

| Id | Fails when | Fixable |
|---|---|---|
| `manifest` | the manifest is missing, or older than `KIT_VERSION` | when older |
| `managed-files` | a managed part differs from its manifest hash or is missing | yes |
| `executable` | an executable launcher or hook lost its mode (POSIX only) | yes |
| `git-hooks` | the local `core.hooksPath` is unset, or a hook there lacks the Kit section | yes |
| `plan` | the plan is missing, unreadable or disagrees with the history | no (`repair`) |
| `transaction` | a commit transaction is unfinished | no (`repair`) |
| `runtime` | no Node.js 22+ runtime for the launchers (`probe` injectable) | no |
| `git-identity` | the repository-local identity is missing, a placeholder or invalid (`isUsableIdentity`) | when the global identity is real (usable) |
| `quality-drift` | `warn` when detected stacks and the profile differ | no |
| `doc-size` | `warn` when a project Markdown file exceeds `budget.documentBytes` | no |

`doc-size` scans every project Markdown file, not only changed ones:
`git ls-files -z --cached --others --exclude-standard -- '*.md'
'*.markdown'` (tracked plus untracked files git does not ignore; outside a
git repository nothing), without paths having a `node_modules` or `.git`
segment and without `.harness/workflow/**` and `.harness/plans/archive/**`.
The size rule is `workflow-quality` `oversizedDocuments` (the `kit:doc-size`
rule: the plan excluded). The warning message `Documents over <limit> bytes
cannot be read in one Read: <path> (<bytes> bytes), …` lists every such
file; `nextAction` asks to split them. A warning never makes `ok` false.

`git-identity` reads only the repository-local config, because Kit commits
sign with it. When it fails, `nextAction` names `doctor --fix` and the real
global identity it would copy, or — with no real global identity — the
`workflow-git` `identityFix` commands; the fix never guesses an identity.

`ok` is true when no check fails. With `fix: {bundle, runtime}`, a fixable
`git-identity` failure first copies the real global identity into the
repository-local config (`identityFix` returns it, otherwise `null`).
Other fixable failures then run `install --update`, but only once the
repository identity is real, because the update commits (otherwise `fix`
stays `null`): it rewrites owned
files and sections, restores `core.hooksPath` and modes, and commits with
role `kit-update` when the files differ from HEAD (otherwise
`fix.commit` is `null`). Plan, configuration and user text are never
changed. The checks then run again after any fix.

## Legacy Plan Migration (`installer-legacy-plan.ts`, `installer-migrate.ts`)

`migrateHarnessPlan(path, {now, message?, objective?, acceptance?, spec?,
name?})` needs an installed Kit (`NOT_INSTALLED`) and a plan with the
`harness-ai-plan-v1` state block (`NOT_LEGACY_PLAN`).

Parsing:
- the JSON state block gives `planId`, `executionScopeStatus` and
  `currentTaskId`;
- task rows are `N. [STATUS] \`<id>\` <text> (scope: …; expected commit:
  \`…\`[; completion: …])`, with indented continuation lines joined;
  `Git Commit:` rows are skipped; `(kind: quality|docs|delivery)` marks
  the kind; the title is the text before the first `(scope:`, `(kind:` or
  `(completion:`; the phase heading is kept;
- backtick `.md`/`.json` paths of the `## Context Pack` section.

The new plan:
- a row is finished when it is `DONE` or when its expected commit equals
  the migration commit message (the row the migration itself closes);
- finished rows become the digest of the closed round `R0-legacy` (kind
  `legacy`): count and first and last ids in `result`, and
  `git show <baseline>:.harness/plans/todo-plan.md` in `references`;
- the remaining rows become round `R1` in their order: work tasks
  (`kind: quality` keeps `quality`), then `DOCS-R1` depending on all of
  them, then delivery tasks depending on `DOCS-R1`. A `kind: docs` row
  becomes `DOCS-R1` (its title and commit message); a
  `completion: user-acceptance` row is dropped because acceptance is the
  `accept` command. Both conversions are recorded as scope decisions;
- tasks keep their ids and expected commit messages; `why` names the phase
  and the legacy scope; `files` start empty;
- scope id is the legacy `planId`, baseline is HEAD before the migration,
  context lists existing context-pack paths (not required);
- a legacy plan without an active scope, or without remaining work,
  becomes an empty Kit plan.

The plan is validated and committed with role `kit-update` and the given
message (default `chore: migrate the plan into the workflow kit`). The old
plan stays readable in the parent commit. The result is `{scopeId,
legacyDone, migrated, converted, commit}`.

## Поведение на ОС

`install` и `doctor` принимают `platform` (`WorkflowPlatform`, по умолчанию —
платформа процесса; правка переноса в Workflow Kit, M22 2.3).

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Режим запускателей и хуков | `install` ставит 0755 | `install` ставит 0755 | битов исполнения нет: режим не ставится |
| Проверка `executable` доктора | есть | есть | нет |

## Dependencies

- `workflow-platform` — launchers, bundle and runtime paths, files.
- `workflow-git` — repository, identity, hooks path, transaction.
- `workflow-plan` — the empty plan and plan path.
- `workflow-quality` — the default configuration, stack detection, drift
  and the document size rule (`oversizedDocuments`).

Node built-ins only.

## Tests

- `test/workflow-installer-platform.test.mjs` — `install` и `doctor` с
  подставленной платформой: `win32` без режима и без проверки `executable`,
  `linux` с 0755 и отказом доктора для запускателя без него (режимы
  проверяются там, где их хранит файловая система);
  `currentWorkflowPlatform` для `win32`, `darwin`, `linux` и прочих ОС.

- `test/workflow-installer-payload.test.mjs` — the file list, read-back and
  idempotence of every managed part, byte-exact sections with CRLF, the
  CLAUDE line, foreign provider hooks kept, invalid JSON, own and husky git
  hooks, created files, the gitignore lines (with the dependency folders) and gitattributes, manifest
  hashes; the Execution modes block (four roles, helpers in sequential,
  integration commands, the identity rule, under 1800 bytes), the Inputs and
  documents block (`schema`, `context`, files never to read), the Harness
  note on proposing the scope and `KIT_VERSION` 2.2.3; the six Claude
  groups with `--part K/6`, the replaced 2.2.2 group, a changed part read
  as a difference, the Codex entry with `additionalContextLimit`.
- `test/workflow-installer-install.test.mjs` (with
  `test/workflow-installer-install-support.mjs`: the compiled facades, the
  identity, the stand-in bundle and the install options, shared with the
  existing-project test) — the new, missing, empty, Pilot and nested
  folder states; a missing or placeholder identity refused with `GIT_IDENTITY_REQUIRED` and nothing
  written; a global-only identity copied into the repository config (also
  over a placeholder) and signing the bootstrap commit; a real local
  identity kept; the host marker written, kept by an update and added by
  `--update --host harness`; an invalid host; a new project with the
  installed hooks rejecting a direct commit; damage detection; a 2.1.0
  installation with the old `.gitignore` section (no `.DS_Store`, no dependency folders) reported
  outdated by inspect and doctor and updated, and a 2.2.1 manifest read as
  outdated; Workflow Pilot and nested folders refused.
- `test/workflow-installer-existing.test.mjs` — existing projects:
  files without git kept and left out of the commit (`NOT_GIT`), a husky
  hooks path (`GIT_NO_KIT`) getting managed sections after the shebang, a
  legacy Harness plan (`LEGACY_HARNESS_PLAN`) kept for migration.
- `test/workflow-installer-doctor.test.mjs` — a healthy installation, fixable
  breakage (mode, section, hook, hooks path) repaired without touching the
  plan; `git-identity` with a placeholder (fixable), without any real
  identity (the commands, no fix, the update held back) and the fix copying
  the global identity before the update; a missing runtime, quality drift,
  `doc-size` (an oversized document warned with its size while `ok` stays
  true; oversized files in `node_modules`, the plan archive and git-ignored
  paths skipped; `ok` again once removed), a pending transaction, a missing
  manifest.
- `test/workflow-installer-migrate.test.mjs` — a legacy fixture with done,
  in-progress, wrapped, quality, docs, delivery and acceptance rows: the
  migration commit, rounds, task mapping, digest, decisions, context, a
  working Kit plan afterwards, and an idle legacy plan.

Test repositories get a real identity (`workflow@harness-ai.test`) through
`GIT_CONFIG_GLOBAL` and, for repositories git creates, `GIT_TEMPLATE_DIR`;
the global-only cases use an empty template, because Kit commits refuse
placeholder identities (`GIT_IDENTITY_REQUIRED`).
