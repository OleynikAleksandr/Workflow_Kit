# Project Workflow Cluster (Workflow Kit)

## Boundary

Owns the Workflow Kit: the project development process that Harness installs
into any project. It covers the plan with scope, rounds and tasks,
transactional task commits, the bounded recovery packet, the quality
profile, git hooks, installation and the project doctor, the autopilot
decision and the user's pause, the input schemas and document context
given to agents as text, and the execution modes: the scope proposal with the user's mode
choice, executor assignments in git worktrees and their integration into
main. The specification lives in
`docs/architecture/workflow-kit/WorkflowKit.md`; the execution modes in
`docs/architecture/workflow-kit/WorkflowKitExecutionModes.md` and
`docs/architecture/workflow-kit/WorkflowKitOrchestration.md`.

The same TypeScript code runs in two places:
- bundled into one standalone file inside user projects, where git hooks and
  agent terminals call it without Harness running;
- driven by Core through the `workflow-host` module.

All modules except `workflow-host` import nothing outside this cluster and
use no npm packages.

## Cluster Facade

`WorkflowKitFacade` in module `workflow-kit` composes the module facades.
Other clusters use the cluster only through `WorkflowKitFacade` (in-process
pure operations) or `WorkflowHostFacade` (child-process commands from Core).

## Owned Modules

- `workflow-platform` — OS-neutral paths, atomic files, locks, process
  runner, runtime resolution, launcher texts and the shared `WorkflowError`.
- `workflow-plan` — plan model, validation, document, transitions and the
  input descriptors of the plan commands and the round digest.
- `workflow-git` — git queries, history, the git identity (one validator
  `isUsableIdentity`, local and global writes, the shared
  `GIT_IDENTITY_REQUIRED` refusal), transactional commits (including the two-parent integration commit;
  ignored paths outside the index never reach `git add`), first-parent
  references and repair (cancel of a changed preparation).
- `workflow-quality` — project quality profile: configuration, stack
  detection, check catalog, check execution (including the builtin
  `kit:conflict-markers` guard every commit runs, the document size rule),
  profile application, the planned `tasks[].checks` rule and the
  `quality:apply` input descriptor.
- `workflow-recovery` — bounded recovery packet within a byte budget with
  the agent role and its step, required documents inline, the documents
  map and the next step's input schema, the SessionStart hook, `show-task`
  and `history`.
- `workflow-autopilot` — pure continue/stop decision of the Core autopilot
  (on by default, `paused` stop), including the orchestrator steps.
- `workflow-execution-mode` — the scope proposal record, the mode card
  options and the verification of the user's choice.
- `workflow-assignment` — assignment records, the scheduler, the executor
  brief with the marked document text, the executor side (worktree record, one-task plan, contract
  guard), worktree setup, cleanup and cancel.
- `workflow-integration` — the proof of an executor source and its merge
  into main with the integration journal, `continue` and status.
- `workflow-kit` — the cluster facade `WorkflowKitFacade`: status, scope
  (create, propose, choose), task, commit, acceptance, close, carryover,
  repair, quality, pause, assignment and integration operations with the
  context budget and planned checks; the command line adds `identity:set --global`
  (no project needed), `schema` and `context`.
- `workflow-installer` — installation payload and manifest, inspection,
  install (git identity, host marker), doctor (with `doc-size`) and legacy
  plan migration.
- `workflow-host` — Core-only: bundle and runtime resolution, Kit commands
  as child processes with JSON envelopes (`setIdentity` runs the app bundle
  in the home folder), the project runtime file.

## Test Support

- `workflow-platform/test/workflow-test-build.mjs` transpiles the requested
  cluster modules into `.harness/runtime/<label>-test-*` for every module
  test of this cluster.
- `workflow-git/test/workflow-git-test-repo.mjs` gives tests a git
  environment without the hook `GIT_*` variables.

## В Workflow Kit

Кластер перенесён из Harness AI (`core-runtime/clusters/project-workflow`) с теми же
модулями и файлами; правки переноса перечислены в
[product-part.md](../../product-part.md). Служба Workflow Kit код кластера не
импортирует: она запускает собранный бандл отдельным процессом (`kit-host/kit-runner`).
`workflow-host` в приложении не используется (его роль у `kit-runner`); он перенесён ради
синхронизации и проверяется своими тестами. Вход модуля — его
`src/<модуль>-facade.ts`, а не `src/index.ts`.
