# Workflow Kit Core RPC (`core-runtime-process`)

Detailed contract of the project workflow routes of the Core runtime process
module (`product-parts/core-runtime/clusters/runtime-process/modules/core-runtime-process`).
The module's `module.md` keeps the summary; this document is updated in the
same commit as the routes it describes.

Project workflow RPCs (`core-project-workflow-rpc.ts`,
`CoreProjectWorkflowRpc`): `CoreRuntimeApi.invoke` routes every method
that `CoreProjectWorkflowRpc.handles()` accepts before its own switch.
Workflow Kit commands run through `workflowHostFacade` (module
`workflow-host`) as child processes; results keep the Kit envelope
`{ok: true, command, result} | {ok: false, code, message, nextAction,
details}`:
- `workflow-inspect {path}` — folder classification (absolute path);
- `workflow-prepare-project {mode, path, name?, install?}` — `new`: `path`
  is the parent folder and `name` the new folder (one segment); the target
  must be `MISSING` or `EMPTY` (`PROJECT_EXISTS`). `open`: `path` is the
  folder; a missing one is `FOLDER_MISSING`; an optional `name` is passed
  to the install, and the setup dialog sends none, so the Kit names the
  project after the folder. Workflow Pilot or a folder
  inside another repository is `UNSUPPORTED_FOLDER`. Inspect actions
  `create`, `install` and `install-migrate` install, `update` updates,
  `open` and `doctor` install nothing. With `mode: "open"` and
  `install: false` ("Open Without Kit") nothing is installed and any
  existing folder is registered, as before the Kit. Then the existing
  `add-workspace`
  route registers and selects the folder, the host runtime file is
  written and the status is published. Every install or update passes
  `host: "harness"` (`install --host harness`), so new and installed or
  updated projects carry the Harness marker and the Kit requires the
  mode choice (`scope:propose`); an existing marker is kept. Result
  `{ok: true, inspect, install, status, workspace}`; a failed install
  registers nothing;
- `workflow-identity-set {name, email}` — the one-time global git
  identity (spec section 1 of `ReleaseFixes-2026-11-04-2.md`): non-string
  values are `INVALID_REQUEST`; otherwise Core runs the Kit
  `identity:set --name=<name> --email=<email> --global`
  (`workflowHostFacade.setIdentity`, application bundle, home folder, no
  project needed) and returns its envelope as is: the Kit validates
  (`GIT_IDENTITY_INVALID` / `GIT_IDENTITY_PLACEHOLDER` with
  `details.field`) and writes the global config; success is `{ok: true,
  command: "identity:set", result: {name, email, scope: "global"}}`.
  Core keeps no pending preparation: when `workflow-prepare-project`
  fails with `GIT_IDENTITY_REQUIRED` (nothing was written), the client
  sends `workflow-identity-set` and, after its success, repeats the same
  `workflow-prepare-project` request, which now installs. Tests:
  `test/core-project-workflow-identity.test.mjs` (payload refusals, the
  Kit envelope returned as is, the repeated preparation registering the
  workspace);
- `workflow-status {workspaceId?}` — Kit status of the workspace (the
  active one by default; `UNKNOWN_WORKSPACE` for an unknown id,
  `NO_WORKSPACE` without an id while Core has no active project),
  refreshing the runtime file; the result is the Kit outcome with the
  added `planView` (below);
- `workflow-doctor {workspaceId?, fix?}` — the project doctor, then the
  status (same workspace refusals).
- `workflow-autopilot-get {sessionId}` — the per-session Core autopilot
  (`sessionWorkflowAutopilot` of `session-request-handler`, injectable as
  the `autopilot` dependency); result `{ok: true, autopilot: {sessionId,
  available, enabled, continues, maxContinues, pauseState, running,
  lastDecision}}`. The autopilot is on by default for every eligible
  session (`available`; `enabled` is false otherwise). `pauseState` is
  derived in Core from the last Kit status the session read: `running` —
  no Kit pause; `pausing` — paused while the session's turn runs or work
  is active (the focus task `IN_PROGRESS`, or an orchestrated assignment
  or integration journal); `paused` — paused, idle and nothing active.
- `workflow-autopilot-set {sessionId, enabled}` — internal only (the mode
  card below, tests): neither the Electron bridge nor the preload exposes
  it, and the interface has no autopilot switch. Turning it on for an idle
  session may start the first task at once.
- `workflow-pause-set {sessionId, paused}` (`core-workflow-pause.ts`, the
  plan panel pause button, spec 4.2 of `ReleaseFixes-2026-11-04-3.md`) —
  Core runs the Kit `pause:set --on|--off` in the session's workspace with
  a fixed note (`Paused from the Harness plan panel` / `Continued from the
  Harness plan panel`: the click is the user's action), then
  `refreshPause(sessionId)` of the session autopilot, which re-reads the
  Kit status, publishes `workflow:autopilot` with the new `pauseState` and,
  when the pause is lifted and the session is idle and enabled, resets the
  continue counter and evaluates at once (the plan continues without a
  user message). Pausing never interrupts the current turn: the task in
  progress finishes and the next `task:start` is refused by the Kit.
  Result `{ok: true, autopilot}`; refusals `INVALID_REQUEST` (no
  `sessionId` or a non-boolean `paused`), `UNKNOWN_SESSION`,
  `NO_WORKSPACE` (a session without a project) or the Kit failure
  envelope as is. Tests: `test/core-workflow-pause.test.mjs`.
- the execution mode card (`core-workflow-mode-choice.ts`,
  `CoreWorkflowModeChoice`, spec 4.2 of `WorkflowKitExecutionModes.md`;
  the `sessions` dependency is `{get, send, subscribe}` over the session
  request handler and the session event stream; the `autopilot`
  dependency is the same Core autopilot as `workflow-autopilot-set`):
  - when a primary session (with a workspace, not a subagent or Profile
    Creator) publishes `session:turn-state` `idle` and its workspace has
    a project Kit bundle, Core runs `scope:proposal`
    (`workflowHostFacade.proposal`). An open proposal (`host:
    "harness"`, not `refining`, with a scope id) of a new generation
    becomes the card of that workspace, owned by that session; another
    session of the workspace keeps the owner. No open proposal removes
    the card (`card: null`);
  - the card `{workspaceId, sessionId, generation, scopeId, title
    (objective), options [{id, recommended}] (recommended first),
    reason, state: offered|saving|chosen|dismissed, chosen, error}`.
    `orchestrated` is offered only when the owner session's provider is
    `claude`; when the recommended mode is not offered, no row is
    recommended and `reason` is `null`;
  - `workflow-mode-choice-get {workspaceId}` → `{ok: true, card |
    null}`;
  - `workflow-mode-choose {workspaceId, sessionId, generation, option}`
    — only the owner session of an `offered` card with an offered option
    (`MODE_CHOICE_UNAVAILABLE`, `INVALID_REQUEST`): the card turns
    `saving`, Core runs `scope:choose --generation --option --session
    <owner> --note "the user chose in the Harness mode card: ..."`. A Kit
    refusal (e.g. `PROPOSAL_CHANGED`) is returned and the card is
    `offered` again with `error` and the autopilot is untouched. On
    success the card is `chosen`; for `sequential` and `orchestrated`
    Core first turns on the owner session's autopilot
    (`setEnabled(owner, true, {evaluate: false})`: no immediate
    evaluation, it publishes `workflow:autopilot`; the autopilot is on by
    default, so this re-arms one the session had turned off), so the end
    of the agent's turn continues the plan
    under the autopilot's usual stops (pause, acceptance, block, delivery
    confirmation, waiting for executors or a mode choice); `refine`
    leaves the autopilot as it is. Then Core sends the owner session a
    user message through the
    user-message route (`sessionRequestHandlerFacade.sendMessage`, the
    route the autopilot continue turn follows): `sequential` — execute
    the plan task by task starting with the first task; `orchestrated` —
    act as orchestrator and hand tasks out with `assignment:next` /
    `assignment:create` to Claude subagents with isolation worktree;
    `refine` — refine the specification with the user, then propose
    again. Agent-facing texts are English, like the autopilot's. Result
    `{ok: true, card, choice}`;
  - `CoreRuntimeApi` `send-message` (a message the user typed) calls
    `userMessage(sessionId)` first: an `offered` card of that session
    becomes `dismissed`; the proposal stays without a choice and a later
    turn end of the same generation keeps it dismissed.
- the Kit state watcher (`core-workflow-watch.ts`, `CoreWorkflowWatch`,
  spec 10.1 of `WorkflowKitExecutionModes.md`): `watchWorkspaces()`
  watches every known workspace whose Kit is installed (the plan file
  `.harness/plans/todo-plan.md` exists) and stops watching every other
  one; `close()` stops all watchers. Per workspace it watches the
  directory `.harness/plans` (only `todo-plan.md` counts, so atomic
  renames are seen) and `.harness/workflow/local` recursively (only
  `assignments/**`, `integration.json` and `scope-proposal.json` count;
  locks, receipts and the runtime file do not), with `fs.watch`
  (non-recursive where recursive watching is unavailable). A missing
  directory is replaced by a watch of its nearest existing ancestor inside
  the workspace, which arms the real watch once the directory appears (and
  reports a change); a directory that disappears falls back the same way;
  a watcher error closes it and arms it again after 1 s. Changes are
  debounced per workspace (300 ms; the `watchDebounceMs` dependency for
  tests) and each quiet period publishes `workflow:status` through the
  same route as the RPCs, without any renderer request. `CoreRuntimeApi`
  calls `watchWorkspaces()` after the registry is restored at
  `initialize()`, after every `CoreWorkspaceRpc` method (add, select,
  remove; after the asynchronous remove finishes) and
  `workflow-prepare-project` calls it after registering the project;
  `CoreRuntimeApi.shutdown()` (called by the process entry on the shutdown
  request) closes the watchers. Tests: `test/core-workflow-watch.test.mjs`
  — no watch without the Kit, the local directory created later and
  re-created, a debounced burst, the relevant and ignored entries, a Kit
  installed later, removal and close; through `CoreProjectWorkflowRpc` a
  plan change publishes `workflow:status` with the Kit status and nothing
  after removal; the `CoreRuntimeApi` and process entry hooks.
- the plan view (`core-workflow-plan-view.ts`, `buildPlanView`, spec
  10.2 of `WorkflowKitExecutionModes.md`): Core truth of the active plan
  for the sidebar, built from the Kit status and the Core session records
  (the `sessions.list` dependency returns every record). It is `null`
  when the status failed, the Kit is not installed or the plan has no
  scope (an `ACTIVE` or `BLOCKED` scope shows its plan). Otherwise
  `{scopeId, objective, status (scope status), mode
  (orchestrated|sequential; sequential without an execution block),
  progress {done, total}, ownerSessionId, rows, boundSessionIds}`; one
  row per plan task in plan order: `{taskId, title, kind, status, label,
  current, executorSessionId}`. `label` is `parallel` (`parallelSafe`)
  or `sequential` in orchestrated mode and `null` in sequential mode.
  `current` marks the Kit current task and, in orchestrated mode, every
  task with an assignment that is not `INTEGRATED`. `ownerSessionId` is
  `execution.ownerSession` when it is a Core session of the workspace,
  otherwise the most recently active (latest `updatedAt`) primary session
  of the workspace (not a subagent, no `sessionPurpose`), or `null`.
  Binding: an assignment with a `worktree` is bound to the subagent
  session of the workspace whose `workingDirectory` is the worktree or
  lies inside it, comparing real paths (`realpath`, a missing path keeps
  its resolved form, so trailing slashes and symlinks do not matter);
  several candidates resolve to the latest `updatedAt`, a later
  assignment of the same task wins. `executorSessionId` is that session
  and `boundSessionIds` lists every bound session. The renderer matches
  nothing itself. `PlanViewSessionWatch` follows `session:created` /
  `session:updated`: when a subagent record reports a new working
  directory, the workspace is re-published after a quiet period (300 ms,
  `watchDebounceMs`), only when its Kit plan file exists, so a newly
  started executor binds without a Kit file change; `close()` stops it.
  Tests: `test/core-workflow-plan-view.test.mjs` — null cases, sequential
  rows and the owner fallback, orchestrated labels/current/binding
  through a symlink, a trailing slash, a nested directory, another
  workspace and a prefix sibling, the session watch, and through
  `CoreProjectWorkflowRpc` the status result, the event and the
  re-publish for a new executor (none without a Kit plan).
Every workspace operation publishes `{type: "workflow:status",
workspaceId, path, planView, status}`; the `workflow-status` result is
the Kit outcome plus `planView` (`WorkflowStatusResult`); every autopilot change and decision is
relayed as `{type: "workflow:autopilot", ...snapshot}`; every card change
as `{type: "workflow:mode-choice", workspaceId, sessionId, card}`.
`CoreRuntimeApi.subscribe()` relays them on the same event stream.
