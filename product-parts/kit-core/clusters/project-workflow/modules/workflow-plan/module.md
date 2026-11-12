# Workflow Plan Module

## Responsibility

Owns the Workflow Kit plan:
- the model: scope, rounds, tasks, user decisions and round digests;
- full structural validation;
- the Markdown plan document;
- every state transition of the process described in
  `docs/architecture/workflow-kit/WorkflowKitProcess.md`;
- the input descriptors (schemas) of the plan commands.

## Public Facade

`WorkflowPlanFacade` (class, singleton `workflowPlanFacade`). Besides the
transitions below it exposes `inputSchema(command)` and
`inputSchemaCommands()` (see "Input Schemas") and exports the types
`FieldSpec` and `InputSchema`.

## Model (`plan-model.ts`)

- `WorkflowPlan` has these fields:
  - `schema`: `harness-workflow-plan/1`;
  - `revision`: positive integer, incremented by every transition;
  - `projectId`, `projectName`;
  - `scope`: `null` when the status is `NONE`;
  - `rounds`, `tasks`, `currentTaskId`;
  - `lastClosed`: reference to the previously closed scope.
- `WorkflowScope` has these fields:
  - `id`, `objective`, `acceptance`;
  - `approval` and `decisions`: user decisions with timestamps;
  - `spec`, `context`: document references;
  - `baselineCommit`: full SHA;
  - `status`: `ACTIVE` or `BLOCKED`, with `blockedReason`;
  - `delivery`: `IN_PROGRESS`, `READY_FOR_ACCEPTANCE` or `ACCEPTED`, with
    `acceptanceNote`;
  - `execution` (optional): `{strategy, maxWorkers, ownerSession}`, see
    "Execution" below. An absent block means `sequential`.
- `WorkflowRound` has `id` (`R1`, `R2`, `R0-legacy`), `kind`
  (`implementation`, `fixes`, `legacy`), `status` (`OPEN`, `CLOSED`) and
  `digest`.
- `WorkflowTask` has these fields:
  - `id`, `roundId`, `kind` (`work`, `quality`, `docs`, `delivery`),
    `status` (`TODO`, `IN_PROGRESS`, `DONE`), `iteration`;
  - `files`: canonical relative paths. Documentation
    (`isDocumentationPath`) is Markdown (`.md`, `.markdown`) and the product
    tree under `.harness/product-tree/` (`product-tree.json`,
    `product-tree.md`); every other path is functional (`functionalFiles`).
    `isMarkdownPath` matches Markdown only;
  - `dependencies`, `acceptance`, `checks`, `context`;
  - `commitMessage`, `fixes`, `docsWaiver`;
  - `confirmation`: user confirmation of a delivery task;
  - `parallelSafe` (optional): stored only when `true`; absent means
    `false`;
  - `integration` (optional): `{operationId, sourceCommit}` of the
    integration commit that completed an orchestrated task (spec section
    7); absent on every other task.

## Validation Rules (`validatePlan`)

Errors are `WorkflowError` codes: `PLAN_SCHEMA`, `TASK_ORDER`, `DOCS_TASK`,
`DELIVERY_ORDER`, `ROUND_DIGEST_REQUIRED`, `ROUND_DIGEST_TOO_LARGE`,
`UNSAFE_PATH`, `PLAN_EXECUTION`, `PARALLEL_KIND`, `PARALLEL_FILES`.

Field refusals carry `details.field` with the plan path of the field:
`scope.objective`, `scope.spec`, `tasks.<ID>.commitMessage`,
`tasks.<ID>.context[0].path`, `tasks.<ID>.dependencies` (`TASK_ORDER`),
`tasks.<ID>.fixes`, `tasks.<ID>.parallelSafe` (`PARALLEL_KIND`),
`tasks.<ID>.files` (`PARALLEL_FILES`), `execution.strategy`,
`execution.maxWorkers`, `execution.ownerSession`, `rounds.<ID>.digest`.
The shared field checks live in `plan-field-checks.ts`; a document
reference is checked entry by entry (`context[1].required`), then the
paths together (canonical, unique).

- **Without a scope:** there are no rounds, no tasks and no current task.
- **Scope:**
  - identifiers are ASCII (`[A-Za-z0-9][A-Za-z0-9._-]*`);
  - the baseline is a full SHA;
  - a `BLOCKED` scope has a reason and an `ACTIVE` one has none;
  - `acceptanceNote` is present exactly when `ACCEPTED`.
- **Rounds:**
  - at least one;
  - unique ids;
  - only the last round may be `OPEN`;
  - a round has a digest exactly when its `DOCS` task is `DONE`, or when it
    is `CLOSED`;
  - a valid digest has `result` up to 600 bytes (`DIGEST_RESULT_MAX_BYTES`)
    and the lists `decisions`, `contracts`, `references`, each up to 8
    items (`DIGEST_MAX_ITEMS`) of up to 300 bytes (`DIGEST_ITEM_MAX_BYTES`),
    UTF-8. `validateDigest(digest, prefix = "")` names the field of the
    digest input: `result`, `decisions`, `decisions[2]`
    (`ROUND_DIGEST_TOO_LARGE`, a missing or empty field `PLAN_SCHEMA`); a
    missing digest is `ROUND_DIGEST_REQUIRED` with field `digest`. A stored
    digest is checked with the prefix `rounds.<ID>.digest`.
- **Tasks:**
  - unique ids;
  - one-line commit message and non-empty acceptance criteria;
  - canonical paths;
  - dependencies point only backwards;
  - `fixes` points to an earlier task;
  - tasks of a closed round are `DONE`;
  - only delivery tasks carry `confirmation`;
  - `integration` belongs to a `DONE` task, names a full source SHA and an
    identifier `operationId` (`PLAN_SCHEMA`).
- **Execution and parallel labels** (`plan-execution.ts`, checked right
  after the scope and before the task fields):
  - `scope.execution`, when present: `strategy` is `sequential` or
    `orchestrated`, `maxWorkers` is an integer from 1 to 16, `ownerSession`
    is a non-empty string or `null` (`PLAN_EXECUTION`);
  - `parallelSafe`, when present, is boolean (`PLAN_SCHEMA`);
  - only `work` tasks may be `parallelSafe: true` (`PARALLEL_KIND`);
  - a `parallelSafe` task lists at least one file and every file is a
    concrete path: no glob characters (`*?[]{}`), not `.`, no trailing `/`
    (`PARALLEL_FILES`).
- **Service tasks:**
  - a non-legacy round has at most one `DOCS-<round>` task;
  - it holds only documentation files and depends on every `work` and
    `quality` task of its round;
  - only delivery tasks follow it, and they depend on it.
- **Progress:**
  - at most one `IN_PROGRESS` task, which equals `currentTaskId`;
  - `delivery` is `IN_PROGRESS` exactly while some task is not `DONE`.

## Plan Document (`plan-document.ts`)

- `render(plan)` writes the document that lives at `PLAN_PATH`
  (`.harness/plans/todo-plan.md`). It consists of:
  - a title;
  - the JSON state between `<!-- harness-workflow:begin -->` and
    `<!-- harness-workflow:end -->` in one fenced `json` block;
  - a readable projection: state, objective, acceptance, and rounds with
    their tasks and digests;
  - the state shows `- Execution: sequential` or `- Execution: orchestrated
    (max <n> workers, owner <session>)` only when the scope has an
    execution block, and a `parallelSafe` task line reads `(work,
    parallel-safe)`. Plans without these fields render as before, so
    existing plan documents keep their projection.
- `parse(text, {projection})` checks the markers (`PLAN_MARKERS`) and the
  JSON (`PLAN_JSON`), then validates the plan. With `projection` (the
  default) the whole text must equal `render(plan)`. A manual edit fails
  with `PLAN_PROJECTION`, and `repair` rebuilds the text. CRLF line endings
  are accepted.
- `isPlanDocument(text)` distinguishes Workflow Kit plans from legacy plans.
- `read(root)` returns `null` when there is no plan file. `write(root,
  plan)` writes atomically through the platform facade.

## Input Checks (`plan-input-checks.ts`)

The command inputs are checked before normalization, so a refusal names
the input field (`details.field`, list entries by index). The plan
validation then runs on the normalized plan as before.

- `checkScopeInput` (`scope:create`, `scope:propose`), in this order:
  - not an object: `PLAN_SCHEMA` (field `(root)`);
  - `tasks` empty or missing: `PLAN_SCHEMA` (`tasks`);
  - `approval` shorter than `APPROVAL_MIN_LENGTH` (10) after trimming:
    `SCOPE_APPROVAL` (`approval`);
  - several tasks without `spec`: `SPEC_REQUIRED` (`spec`);
  - `id` (identifier), `objective` (text), `acceptance` (non-empty list
    of unique texts), `decisions` (texts), `context` (document
    references): `PLAN_SCHEMA`.
- `checkTaskInput(input, "tasks[<n>]")`, called by `normalizeTaskInput`:
  object, `kind` `work` or `delivery`, `id` identifier when given,
  `title`, `commitMessage`, `acceptance` (non-empty), `dependencies` and
  `checks` (unique texts), `context` (document references); a duplicate
  id names `tasks[<n>].id`. `files` stay with the plan validation so a
  `parallelSafe` task still reports `PARALLEL_FILES`.
- `checkExtendInput` (`plan:extend`): `tasks` non-empty, `round` is
  `current` or `new`, `kind` is `fixes` or `implementation`, `title` text
  when given (`PLAN_SCHEMA`); `before` in a new round names
  `tasks[].before`.
- `checkCarryoverInput`: `approval` (`SCOPE_APPROVAL`), `id` identifier,
  `objective` text when given.

## Input Schemas (`plan-input-schema.ts`, `plan-input-schema-fields.ts`)

Plain data descriptors of the JSON inputs; the Kit prints them (`schema`
command, recovery packet). `inputSchemaCommands()` returns, in this order,
`scope:create`, `scope:propose`, `plan:extend`, `task:update`,
`carryover`, `digest` (the `commit --digest` file). `inputSchema(command)`
returns a copy of the descriptor, or `null` for another command.
The `FieldSpec`/`InputSchema` types and the task and document fields shared
by several descriptors live in `plan-input-schema-fields.ts`;
`plan-input-schema.ts` re-exports the types.

- `InputSchema`: `{command, description, fields, rules, example}`.
  `rules` lists the cross-field and plan-state rules that stay in the
  validators (dependency order, rounds, revision, task status).
  `example` passes the real validator.
- `FieldSpec`: `{name, type, required, description, code, limitCode?,
  maxBytes?, maxItems?, minItems?, minLength?, minimum?, maximum?, enum?,
  pattern?}`. `name` is a dotted path from the input root, `[]` marks every
  list entry (`tasks[].context[].path`); `required` inside an optional
  parent applies when the parent is present. `code` is the refusal when the
  field is missing, has the wrong type or breaks `enum`/`pattern`;
  `limitCode` is the refusal of a size or number limit when it differs
  (digest limits: `ROUND_DIGEST_TOO_LARGE`).
- Limits and value sets come from the validator constants:
  `DIGEST_*` (`plan-model.ts`), `APPROVAL_MIN_LENGTH`, `INPUT_TASK_KINDS`,
  `EXTEND_ROUNDS`, `EXTEND_ROUND_KINDS` (`plan-input-checks.ts`),
  `ID_PATTERN` (`plan-field-checks.ts`), `EXECUTION_STRATEGIES`,
  `MAX_WORKERS_LIMIT`, `DEFAULT_MAX_WORKERS` (`plan-execution.ts`).
- `tasks[].checks` (and the patch `checks`) are described as ids of quality
  checks (`quality.checks`, Kit builtins `kit:*`) that the task runs besides
  the required ones, never manual checks; the rule that `workflow-kit`
  enforces with `workflow-quality` (`CHECK_UNKNOWN`: the profile ids when
  `CONFIGURED`, the id form and Kit builtins before QUALITY, only new tasks
  and changed checks) is listed in `rules` of `scope:create`,
  `scope:propose`, `plan:extend` and `task:update`. The plan validation
  itself checks only that `checks` are unique texts.
- `task:update` describes the patch fields `acceptance`, `checks`,
  `commitMessage`, `context`, `dependencies`, `docsWaiver`, `files`,
  `title`, `why` (a task in progress: `acceptance`, `checks`,
  `docsWaiver`, `files`); the patch is applied by `workflow-kit` and the
  whole plan is validated, so its refusals name `tasks.<ID>.<field>`.
- `scope:propose` has the `scope:create` fields; its rules name the
  `--recommended`/`--reason` flags, and its example carries
  `execution.maxWorkers`.

## Transitions (`plan-transitions.ts`, `plan-service-tasks.ts`)

Every transition copies the plan, increments `revision` and validates the
result. The caller supplies time, the baseline commit and the
quality-profile state.

- **`createScope(plan, input, {baselineCommit, now, qualityConfigured})`**
  - Fails if:
    - a scope is still open (`SCOPE_EXISTS`);
    - there is no baseline commit (`NO_BASELINE`);
    - the approval is shorter than 10 characters (`SCOPE_APPROVAL`);
    - there are several tasks and no `spec` (`SPEC_REQUIRED`).
  - Normalizes input tasks. Ids default to `T001`, `T002` and so on; the
    input `kind` may only be `work` or `delivery`. Input `parallelSafe:
    false` is stored as an absent field; any other given value is kept and
    validated. `plan:extend` normalizes its tasks the same way.
  - Stores `input.execution` with defaults `maxWorkers: 3` and
    `ownerSession: null`; without it the scope has no execution block
    (`sequential`).
  - Arranges round `R1`:
    1. `QUALITY` goes before the first `work` task with functional files,
       unless the quality profile is configured or a pending `QUALITY` task
       exists. That task gets a dependency on it.
    2. Ordinary tasks.
    3. `DOCS-R1`. Its files are `README.md`, `docs/architecture/OVERVIEW.md`,
       the spec and every documentation file of the round. It depends on all
       non-delivery tasks of the round.
    4. Delivery tasks, which depend on `DOCS-R1`.
- **`startTask(plan, id, confirmation)`**
  - Repeating the call for the current task changes nothing.
  - Fails if:
    - the scope is not `ACTIVE` (`SCOPE_NOT_ACTIVE`);
    - another task is in progress (`TASK_ALREADY_ACTIVE`);
    - the task is not `TODO` (`TASK_NOT_TODO`);
    - dependencies are unfinished (`DEPENDENCY_PENDING`);
    - a delivery task has no user confirmation (`DELIVERY_CONFIRMATION`).
- **`completeTask(plan, id, digest)`**
  - Works only on the current task (`TASK_NOT_ACTIVE`).
  - A `DOCS` task needs a valid digest and stores it on its round.
  - A round becomes `CLOSED` when all its tasks are `DONE` and the digest
    exists.
  - When every task is `DONE`, `delivery` becomes `READY_FOR_ACCEPTANCE`.
- **`integrateTask(plan, id, {operationId, sourceCommit, digest})`** — a
  `TODO` task of an orchestrated scope becomes `DONE` through its
  integration commit, as one revision:
  - `NOT_ORCHESTRATED` without an orchestrated scope; `TASK_KIND` for a
    task other than `work` or `DOCS`;
  - then the checks of `startTask` (`SCOPE_NOT_ACTIVE`,
    `TASK_ALREADY_ACTIVE`, `TASK_NOT_TODO`, `DEPENDENCY_PENDING`) and the
    effects of `completeTask` (a DOCS task needs the digest and closes its
    round, delivery becomes `READY_FOR_ACCEPTANCE` when all is `DONE`);
  - records `integration {operationId, sourceCommit}` on the task.
- **`block(plan, reason)` and `unblock(plan)`** switch the scope between
  `ACTIVE` and `BLOCKED`.
- **`nextTask(plan)`** returns the current task, or the first `TODO` task
  whose dependencies are `DONE`. **`task(plan, id)`** throws
  `UNKNOWN_TASK`.

## Execution (`plan-execution.ts`)

Implements sections 2 and 3 of
`docs/architecture/workflow-kit/WorkflowKitExecutionModes.md`. These are pure
functions; the facade exposes them as methods.

- **`execution(plan)`** returns the effective block; a plan without one gets
  `{strategy: "sequential", maxWorkers: 3, ownerSession: null}`.
- **`compatibleTasks(plan, firstId, secondId)`** is true when the two
  tasks are different `parallelSafe` `work` tasks, neither depends on the
  other even transitively (through any task), and no path of one equals
  or is nested in a path of the other by directory segment (`src/lib`
  conflicts with `src/lib/a.ts`, not with `src/libx.ts`). Unknown ids give
  `false`. Task status is not considered.
- **`hasParallelWork(plan)`** is true when at least one pair of tasks of
  the plan is compatible. It accepts any `{tasks}` object.

## Rounds Lifecycle (`plan-rounds.ts`, `plan-scope-completion.ts`)

`extend` and `deferDocs` live in `plan-rounds.ts`; `accept`, `close` and
`carryover` live in `plan-scope-completion.ts`, re-exported by
`plan-rounds.ts`.

- **`extend(plan, {round, kind, title, tasks}, context)`** returns `{plan,
  roundId, deferredDocsTaskId}`. Tasks that are already `DONE` never
  change. The result depends on the state of the last round:
  - **The last round is open and its `DOCS` is not done** (the default, or
    `round: "current"`):
    - new work goes before its `DOCS`, or before a not-yet-started task
      named in `before`, which then depends on the new task (`TASK_STARTED`
      otherwise);
    - delivery tasks are appended after `DOCS`;
    - `DOCS` is recomputed;
    - a `DOCS` that is in progress returns to `TODO`, and its id is
      reported so the caller can hand its uncommitted documents over.
  - **The last round is closed or its `DOCS` is done** (or `round: "new"`):
    - a new round `R<n>` opens, of kind `fixes` unless another kind is
      given;
    - unfinished delivery tasks of the old round move into the new round
      after its `DOCS`, and the old round closes;
    - if the old round still has unfinished work, the call fails with
      `ROUND_OPEN`.
  - **In both cases:**
    - a `QUALITY` task is added if needed;
    - a `READY_FOR_ACCEPTANCE` or `ACCEPTED` scope returns to `IN_PROGRESS`
      and loses its acceptance note;
    - a fix task links its original task through `fixes`.
- **`deferDocs(plan)`** returns the current `DOCS` task to `TODO`. It is the
  `defer-docs` repair action.
- **`accept(plan, note, now)`** works only from `READY_FOR_ACCEPTANCE`
  (`NOT_READY`), needs a note (`ACCEPTANCE_NOTE`) and leaves the scope open.
- **`close(plan, scopeId, note, now)`** checks:
  - the scope id matches (`SCOPE_ID`);
  - the scope is `ACCEPTED` (`NOT_ACCEPTED`);
  - the note holds the user's direct command, at least 10 characters
    (`USER_CLOSE_REQUIRED`).

  It returns an empty plan with `lastClosed` set and the revision
  incremented.
- **`carryover(plan, {id, approval, objective?}, context)`** closes the
  current scope and opens a new one:
  - every unfinished non-`DOCS` task moves into round `R1` and is reset to
    `TODO`, keeping its `parallelSafe` label;
  - the new scope keeps the execution block of the old one;
  - dependencies and `fixes` links that point to finished or dropped tasks
    are removed;
  - `QUALITY` and `DOCS` are rebuilt.

## Tests

- `test/workflow-plan-validation.test.mjs`, `-document`, `-transitions`,
  `-rounds`, `-execution` — validation rules, the document, every
  transition, rounds and the execution block.
- `test/workflow-plan-input-schema.test.mjs` — contract of every
  descriptor: the example passes the real transition (`createScope`,
  `extend`, the `task:update` patch with `validate`, `carryover`,
  `validateDigest`), every example key is described, removing each
  required field and breaking each limit, enum and pattern give the
  descriptor code and `details.field`; descriptors are copies; a stored
  digest keeps its plan path.

## Owned Paths

- `module.md`
- `src/**`
- `test/**`
