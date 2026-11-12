# Workflow Host Module

## Responsibility

Lets Core run Workflow Kit commands. It finds the bundle and the runtime,
runs one command as a child process of that bundle and returns the JSON
envelope the command printed. It also records the Harness runtime in a
project so the project launchers work without a system Node. Only Core
uses this module; the Kit itself never imports it.

## Public Facade

`WorkflowHostFacade` (class, singleton `workflowHostFacade`) in
`src/workflow-host-facade.ts`. Options: `env` (default `process.env`),
`current` (`{execPath, electron}` of the running process), `timeoutMs`
(default 120 000).

## Contract

Resolution (`host-resolve.ts`):
- application bundle — `HARNESS_WORKFLOW_KIT_BUNDLE`, a directory with
  `workflow.mjs` or the file itself; null when unset or missing;
- project bundle — `.harness/workflow/runtime/workflow.mjs` of the root;
- `bundle(root, preferApp)` — the project bundle, else the application
  bundle; with `preferApp` always the application bundle; result
  `{file, source: "app" | "project"}` or null;
- `runtime()` — `HARNESS_ELECTRON_NODE` in mode `electron`, else the
  running process (`electron` inside Electron, otherwise `node`).

Running (`host-runner.ts`):
- `run(args, {root?, preferApp?, cwd?, timeoutMs?})` runs
  `<runtime> <bundle> ...args [--root <root>] --format json` without a
  shell (`execFile`, output up to 16 MB). Mode `electron` adds
  `ELECTRON_RUN_AS_NODE=1`; `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_PREFIX` and
  `GIT_WORK_TREE` are removed from the child environment;
- the result is the Kit envelope `{ok: true, command, result}` or
  `{ok: false, code, message, nextAction, details}`; the promise never
  rejects. Host failures use the same shape:
  - `HOST_NO_BUNDLE` — no bundle is available;
  - `HOST_SPAWN` — the runtime cannot be started;
  - `HOST_TIMEOUT` — the command did not finish in time;
  - `HOST_OUTPUT` — stdout is not a Kit envelope (stderr tail in
    `details.stderr`).

Commands:
- `inspect(folder)` and `install(folder, {host?, name?, update?})` use the
  application bundle; the working directory is the nearest existing
  folder of the target; `host: "harness"` passes `--host harness`, which
  writes `config.host`; install has a 600 000 ms timeout because it
  commits;
- `setIdentity({name, email})` runs `identity:set --name=<name>
  --email=<email> --global` with the application bundle in the home
  directory (no project and no `--root`, so it works before a project
  exists; the `--flag=value` form keeps a value that starts with `--` a
  value). The Kit validates and writes the global git config; the result
  type is `GitIdentitySetResult` `{name, email, scope: "global"}`;
- `status(root)`, `validate(root)`, `recover(root, event)`,
  `proposal(root)` (`scope:proposal`, the mode card view or `null`),
  `chooseScope(root, {generation, option, session, note})`
  (`scope:choose --generation --option --session --note`) and
  `doctor(root, fix)` use the project bundle (application bundle when the
  project has none); `doctor` with `fix` has the commit timeout;
- `writeRuntimeFile(root)` writes `.harness/workflow/local/runtime`
  (`<executable>\n<mode>\n`) when the project has `.harness/workflow`;
  returns false otherwise.

Result types come from the cluster facades (`InspectResult`,
`InstallOutcome`, `KitStatus`, `ValidationReport`, `RecoveryPacket`,
`DoctorReport`, `ScopeProposalView`, `ScopeChoiceResult`) as type-only
imports.

## Dependencies

- `workflow-platform` — bundle path, runtime file, runtime environment,
  atomic write;
- type-only: `workflow-installer`, `workflow-kit`, `workflow-recovery`;
- Node built-ins.

## Tests

- `test/workflow-host-facade.test.mjs` — bundle and runtime resolution,
  the command protocol with a fake bundle (arguments, `--root`,
  `ELECTRON_RUN_AS_NODE`, cleared `GIT_DIR`, failure envelope,
  `HOST_OUTPUT`, `HOST_TIMEOUT`, `HOST_SPAWN`, `HOST_NO_BUNDLE`, the
  `scope:proposal`, `scope:choose` and `identity:set` arguments and the
  home working directory of `identity:set`), and an
  end-to-end run of the real bundle built by Vite: inspect, install with
  `host: "harness"` (`config.host`), status, doctor, validate and the
  runtime file; a fresh project has no proposal (`null`); `setIdentity`
  refuses a quoted email (`GIT_IDENTITY_INVALID`, field `email`) and
  writes a real one to the test's `GIT_CONFIG_GLOBAL`.

Test repositories and the projects the bundle installs into get a real
repository-local identity (`workflow@harness-ai.test`, through
`GIT_TEMPLATE_DIR` for install): Kit commits refuse placeholder
identities (`GIT_IDENTITY_REQUIRED`).
