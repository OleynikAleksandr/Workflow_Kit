# Workflow Quality Module

## Responsibility

The project quality profile of the Workflow Kit:
- the configuration file `.harness/workflow/config.json`: quality profile,
  documentation contracts, budgets, file policy and autopilot limit;
- validation of every check definition;
- stack detection and the ecosystem catalog that proposes a profile;
- running the checks of a stage, the Kit builtins and the evidence records;
- applying a chosen profile (`quality:apply`) and profile drift;
- the input descriptor of `quality:apply`.

## Public Facade

`WorkflowQualityFacade` (class, singleton `workflowQualityFacade`).

## Contract

- `configPath` — `.harness/workflow/config.json`; `configFile(root)` returns
  the absolute path.
- `defaultConfig()` — schema `harness-workflow-config/1`:
  - `quality.status` `DISCOVERY`, no stacks, no package manager;
  - required commit-stage builtins `kit:doc-size`, `kit:md-links`,
    `kit:file-lines`, `kit:docs-contracts`, `kit:conflict-markers`;
  - `docs.contracts` empty;
  - `budget.recoveryBytes` 32 000 (allowed 8 000–120 000),
    `budget.documentBytes` 28 000, `budget.briefBytes` 60 000 (allowed
    8 000–200 000; the executor brief budget of `workflow-kit`);
  - `policy.maxFileLines` and `policy.taskFileSoftLimit` `null` (off);
  - `autopilot.maxContinues` 40 (1–1000).
- `readConfig(root)` — a missing file yields `defaultConfig()`. A
  configuration without `budget.briefBytes` (written before it existed)
  gets 60 000 in `validateConfig`; the file is not rewritten. Invalid JSON
  fails with `CONFIG_JSON`, an invalid shape with `CONFIG_SCHEMA`.
- `writeConfig(root, config)` validates, then writes atomically (two-space
  JSON with a trailing newline). `renderConfig(config)` returns that text.
- `normalizeCheck(input)` fills `required: false` and `timeoutMs: 120000`,
  then validates the check.
- `validateConfig(config)` rules (error `CONFIG_SCHEMA`):
  - check ids match `[A-Za-z0-9][A-Za-z0-9._:-]*` and are unique;
  - `role` is one of format, lint, typecheck, test, audit, duplication,
    links, architecture, custom, package, installed;
  - `stage` is one of prepare, commit, push, delivery;
  - exactly one of `command {executable, args[], cwd?}` or `builtin`;
  - `timeoutMs` is an integer from 1 to 600 000;
  - `appliesTo`, when present, is a list of non-empty globs;
  - `package` and `installed` checks need a non-empty `evidence`;
  - only `package` and `installed` checks run at the `delivery` stage;
  - a `CONFIGURED` profile names at least one stack;
  - every `docs.contracts` entry maps a code glob to at least one document;
  - `host`, when present, is a non-empty string. It names the host that
    drives the project (`harness`: Harness AI); the default configuration
    has no host, and `applyProfile` keeps the field.
- Refusals name the field in `details.field`: `quality.checks[<n>].role`
  (and `.id`, `.stage`, `.required`, `.timeoutMs`, `.command`,
  `.command.executable`, `.command.args`, `.builtin`, `.appliesTo`,
  `.evidence`), `quality.checks` (duplicate ids),
  `docs.contracts[<n>].code`/`.docs`, `policy.maxFileLines`,
  `policy.taskFileSoftLimit`, `budget.*`, `autopilot.maxContinues`.
  `validateCheck(check, field = "check")` takes the path prefix.

## Detection (`quality-detect.ts`)

- `stacks()` — `node`, `python`, `go`, `rust`, `dotnet`, `swift`, `jvm`.
- `detect(root)` scans the root and its first-level subdirectories. Hidden
  directories and `build`, `dist`, `node_modules`, `out`, `release`,
  `target`, `vendor`, `venv` are skipped. Markers:
  - node — `package.json`, `tsconfig.json`, `deno.json(c)`;
  - python — `pyproject.toml`, `setup.py`, `requirements*.txt`;
  - go — `go.mod`; rust — `Cargo.toml`;
  - dotnet — `global.json`, `*.csproj`, `*.sln`;
  - swift — `Package.swift`, `*.xcodeproj`;
  - jvm — `pom.xml`, `build.gradle(.kts)`.
- Each stack reports `{id, markers, directories, packageManager}`. The
  package manager comes from lock files in the marker directories
  (`package-lock.json` npm, `pnpm-lock.yaml` pnpm, `yarn.lock` yarn,
  `bun.lock(b)` bun, `uv.lock` uv, `poetry.lock` poetry), then from the
  `packageManager` field of `package.json`. Defaults: npm, pip, maven or
  gradle by manifest, and the toolchain name for go, rust, dotnet, swift.

## Catalog And Proposal (`quality-catalog.ts`, `quality-proposal.ts`)

- `propose(root, {stacks?, which?})` never changes the project. `stacks`
  overrides detection (error `UNKNOWN_STACK`); `which(name)` defaults to a
  PATH lookup through the platform module.
- Roles in order: `format` (prepare), `lint`, `typecheck`, `test` (commit,
  600 s timeout), `audit` (push). All proposed checks are `required`.
- Check ids are `format`, `lint`, `typecheck`, `tests`, `audit` for one
  stack and `<stack>-<id>` for several.
- Choice per role: the first catalog candidate that is already installed,
  otherwise the first candidate plus its install command.
  - node: package scripts `lint`, `test` (not the npm placeholder),
    `typecheck`/`type-check` win; binaries run through `npx`, `pnpm exec`,
    `yarn` or `bunx`; `tsc` needs `tsconfig.json` or `typescript`; the
    audit is the package manager's own.
  - python: tools declared in the manifests count as installed; tools run
    through `uv run`, `poetry run` or `python -m`.
  - go, rust, dotnet, swift, jvm: toolchain commands; separate tools
    (`govulncheck`, `cargo-audit`) carry their install command; tools
    without one get a note to install them manually.
- Missing node or python packages are grouped into one install command of
  the package manager.
- Result: `{detected, entries, notes, profile}`. `profile` has the input
  shape of `quality:apply` (`stacks`, `packageManager`, `install`,
  `checks`); `entries` lists each check's stack, role, tool, installed state
  and alternatives. Kit builtins are not part of the proposal; they stay in
  the configuration.

## Check Runner (`quality-runner.ts`)

- `selectChecks(request)` / `runStage(request)`; the request is
  `{root, config, stage, files?, removed?, assigned?, only?, service?, docsWaiver?, env?}`.
- `removed` lists the candidate paths the commit removes (`absentPaths` of
  `workflow-git`: outside the index and missing on disk or ignored, such as
  `node_modules` after `git rm -r --cached`). The content builtins
  (`kit:file-lines`, `kit:doc-size`, `kit:md-links`,
  `kit:conflict-markers`) skip them and `{files}` never receives them, so
  the copies left on disk are never read or passed to a tool.
  `kit:docs-contracts` still counts them (removing module code changes the
  module), and `appliesTo` still sees them (a removed source file still
  triggers, for example, the typecheck).
- Selection works on the configured checks plus the implicit Kit guards a
  profile written before them does not list (`kit:conflict-markers`, a
  required commit-stage builtin appended last when no check has its id or
  builtin), so every commit runs the guard without rewriting the
  configuration:
  - `only` — exactly those ids, any stage;
  - `service` — service commits run only the documentation and guard
    builtins (`kit:doc-size`, `kit:md-links`, `kit:docs-contracts`,
    `kit:conflict-markers`) at `commit`;
  - otherwise the checks of the stage that are `required` or assigned by the
    task (`task.checks`).
  - Unknown ids fail with `CHECK_UNKNOWN`; the next action names
    `quality:status` and `task:update`.
- Planned task checks (`unknownPlannedChecks(config, ids)`,
  `ensurePlannedChecks(config, tasks)`; `workflow-kit` calls them when a
  plan is written): `tasks[].checks` are ids of quality checks, never manual
  checks. With the profile `CONFIGURED` an id must be one of the configured
  checks or an implicit guard (`kit:conflict-markers`). Before QUALITY
  (`DISCOVERY`) an id must have the check id form (`CHECK_ID_PATTERN`, no
  spaces), and a `kit:` id must be a Kit builtin; other ids are accepted as
  checks QUALITY will define and are verified by `selectChecks` at
  `task:start`. `ensurePlannedChecks` takes `{checks, field, taskId}` per
  task and throws `CHECK_UNKNOWN` with `details {taskId, field, checks,
  known}` for the first task with unknown ids; the message says that manual
  checks belong in `acceptance`.
- `appliesTo`: when `files` is given and no file matches, the check is
  `skipped`. Globs support `*`, `**` and `{name}` (one segment).
- An argument exactly `{files}` expands to the matching files that exist and
  are not `removed`; with none the check is `skipped`.
- Commands run without a shell through the platform module. `cwd` and an
  executable with a path separator resolve inside the project root.
- Result per check: `{id, role, stage, status, exitCode, durationMs, output,
  reason, command, evidence}`; status `passed`, `failed`, `skipped`,
  `timeout` or `error` (did not start). Output keeps the last 4000
  characters. The report is `{stage, ok, results, startedAt, finishedAt}`;
  `ok` means every check passed or was skipped.
- The runner does not detect candidate changes made by `commit`-stage
  checks; the git hook compares the index tree.

## Builtins (`quality-builtins.ts`)

- Builtins get `{config, docsWaiver, files, removed, root}`; every check
  except `kit:docs-contracts` reads only the files not in `removed`.
- `kit:file-lines` — non-documentation files of the candidate (outside
  `.harness/`, text only) must not exceed `policy.maxFileLines`; off when it
  is `null`.
- `kit:doc-size` — changed Markdown files (not the plan) must not exceed
  `budget.documentBytes`. `oversizedDocuments(root, files, config)` exposes
  the same rule for any file list: existing Markdown files of `files`
  except the plan, larger than `budget.documentBytes`, as `{path, bytes}`
  in the given order (the doctor `doc-size` check passes every project
  document).
- `kit:md-links` — relative links in changed Markdown files outside code
  fences must point to existing paths inside the project. Links with a
  scheme (`https:`, `mailto:`), `//` and pure anchors are ignored; links
  that start with `/` resolve from the project root.
- `kit:docs-contracts` — for every changed file that matches a
  `docs.contracts` code glob, at least one of its documents (placeholders
  filled from the glob) must be in the candidate. A task `docsWaiver`
  passes the check and reports the waiver. `missingContracts(config,
  files)` exposes the same list.
- `kit:conflict-markers` — every existing text file of the candidate
  (binary files with a NUL byte are skipped) fails when a line starts with
  `<<<<<<< ` or `>>>>>>> `; in such a file a line exactly `=======` (a
  trailing CR ignored) is reported too, while a lone `=======` (a Markdown
  heading underline) passes. The output lists `<file>: line(s) <n, …>`.

## Profile Application (`quality-apply.ts`)

- Input `ProfileInput`: `{stacks, packageManager?, install?, checks,
  approval?, docs?, policy?}` — the `profile` of a proposal plus the user's
  approval and optional documentation contracts and file policy.
- `previewProfile(root, input)` returns the configuration `applyProfile`
  would write: status `CONFIGURED`, the input checks normalized and
  validated, followed by the builtin checks of the current configuration;
  `docs` replaces the contracts when given, `policy` merges into the
  current policy. Each input check is normalized and validated under its
  input path (`checks[0].role`). The `install` commands are checked here,
  before anything runs: each needs `executable` and string `args`
  (`PROFILE_INVALID`, `install[<n>].executable`/`.args`), and a non-empty
  list needs `approval` of at least `MIN_APPROVAL` (10) characters
  (`INSTALL_APPROVAL`, field `approval`). Errors: `PROFILE_INVALID` (no
  stacks — `stacks`, no checks list — `checks`, a check that is not an
  object, an id reserved by a builtin — `checks[<n>].id`),
  `UNKNOWN_STACK` (`stacks[<n>]`), `CONFIG_SCHEMA`.
- `applyProfile(root, input, env)`:
  1. builds and validates the configuration (nothing runs on failure);
  2. runs the `install` commands in order without a shell (15 min each);
     they need `approval` of at least 10 characters (`INSTALL_APPROVAL`,
     checked again before the first command);
     the first failure stops with `INSTALL_FAILED` and the configuration
     stays unchanged;
  3. writes the configuration and returns `{config, installs}`.
  The `quality` commit with the profile, manifests and lock files is made by
  the Workflow Kit facade.
- `drift(root, config?)` returns `{status, added, missing}`: `discovery` for
  an unconfigured profile, otherwise detected stacks absent from the
  profile (`added`) and profile stacks without manifests whose checks need
  one (`missing`). A check needs the manifest when its executable (base
  name, without `.cmd`/`.exe`/`.bat`) is a manifest tool of the stack:
  node — `npm`, `npx`, `pnpm`, `yarn`, `bun`, `bunx`; python — `uv`,
  `poetry`; go — `go`, `govulncheck`; rust — `cargo`, `cargo-audit`;
  dotnet — `dotnet`; swift — `swift`; jvm — `gradle`, `gradlew`, `mvn`,
  `mvnw`. Toolchain commands such as `node --test` or `python -m pytest`
  need none, so a project without `package.json` and a profile running
  `node --test` has no drift. An unknown stack id without manifests is
  always `missing`.

## Input Schema (`quality-input-schema.ts`)

- `inputSchema()` returns a copy of the `quality:apply` descriptor, an
  `InputSchema` of the `workflow-plan` module (`{command, description,
  fields, rules, example}`, same `FieldSpec` semantics). Fields: `stacks`
  (minItems 1, `PROFILE_INVALID`), `stacks[]` (enum of `stacks()`,
  `UNKNOWN_STACK`), `checks[]` (`id` pattern, `role`/`stage` enums,
  `command.executable`, `command.args`, `timeoutMs` 1–600 000, ...;
  `CONFIG_SCHEMA`), `docs.contracts[]`, `install[]` (`PROFILE_INVALID`),
  `approval` (minLength 10, `INSTALL_APPROVAL`), `packageManager`,
  `policy.*`.
- Limits and value sets come from `CHECK_ID_PATTERN`, `CHECK_ROLES`,
  `CHECK_STAGES`, `MAX_TIMEOUT_MS` (`quality-config.ts`), `MIN_APPROVAL`
  (`quality-apply.ts`) and `STACK_ORDER`.

## Evidence

- `recordEvidence(root, transactionId, reports)` writes
  `.harness/workflow/local/verification/pending-<transaction>.json`; the
  git module turns it into `<sha>.json` and `last.json` after the commit
  and removes it after the commit or a rollback.
- `readEvidence(root, reference = "last")` reads a record or returns `null`.

## Dependencies

- `workflow-platform` — atomic files, process runner, `WorkflowError`.
- `workflow-plan` — documentation paths, the plan path and the
  `InputSchema`/`FieldSpec` types.
- `workflow-git` — local state paths for evidence.

Node built-ins only.

## Tests

- `test/workflow-quality-config.test.mjs` — defaults, check normalization
  and rejection, file round trip, `budget.briefBytes` limits and its default
  for an older file, the `host` marker, invalid JSON.
- `test/workflow-quality-detect.test.mjs` — node scripts and installed tools,
  install proposals, several stacks in subdirectories, explicit and unknown
  stacks.
- `test/workflow-quality-runner.test.mjs` (with its support
  `test/workflow-quality-runner-support.mjs`: the temporary root, the test
  profile and its files) — planned task checks (CONFIGURED and DISCOVERY, the refusal details), stage selection, assigned and
  service checks, `{files}` and `appliesTo`, timeout and missing tools,
  every builtin (conflict markers with line numbers, a lone separator and
  binary files passing), `oversizedDocuments` (Markdown only, missing files
  and the plan skipped), `removed` paths (the four content builtins pass on
  files that fail them otherwise, `kit:docs-contracts` still fails,
  `{files}` drops them and skips when none is left), the implicit guard
  for a profile without it, the waiver and evidence records.
- `test/workflow-quality-apply.test.mjs` — approval, validation before
  installs, failed install, builtins kept, policy and contracts, re-apply,
  drift (a stack without manifests is missing only for manifest tools).
- `test/workflow-quality-input-schema.test.mjs` — the descriptor example
  passes `previewProfile` without writing, every example key is described,
  removing each required field and breaking each limit, enum and pattern
  give the descriptor code and `details.field`; reserved ids and stored
  configurations name their paths.
