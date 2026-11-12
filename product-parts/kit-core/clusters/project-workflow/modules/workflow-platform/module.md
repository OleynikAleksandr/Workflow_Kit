# Workflow Platform Module

## Responsibility

OS-neutral foundation of the Workflow Kit on macOS, Windows and Linux:
- canonical POSIX relative paths and safe resolution inside a project root;
- case-aware path comparison;
- atomic file writes, with retry on Windows sharing violations;
- exclusive operation locks that reclaim stale owners.

## Public Facade

`WorkflowPlatformFacade` (class, singleton `workflowPlatformFacade`). The
constructor takes a `WorkflowPlatform` (`darwin`, `linux`, `win32`) so tests
can simulate other operating systems.

## Contract

- `WorkflowError(code, message, details, nextAction)` and `ensure(...)` are
  the shared structured error of every project-workflow module.
  `WorkflowPathError` and `WorkflowLockError` extend it.

- `normalizeRelative(path)` returns the canonical form: forward slashes, no
  leading `./`, no trailing slash. It throws `WorkflowPathError`
  (`UNSAFE_PATH`) for absolute paths, drive letters, empty segments, `.` and
  `..`.
- `resolveInside(root, rel)` and `relativeFromRoot(root, abs)` convert
  between the canonical form and OS paths. Both refuse anything outside the
  root.
- `samePath(a, b)` ignores case on `win32` and `darwin`. `isWithin(rel,
  prefix)` checks prefixes by path segments.
- `writeFileAtomic(path, data, {mode})` writes to a temporary sibling and
  renames it into place. On Windows it retries up to 5 times on `EPERM`,
  `EBUSY` and `EACCES`.
- `withLock(lockPath, fn, {staleMs})` creates the lock with `wx` and records
  the pid and time. It throws `WorkflowLockError` (`LOCKED`) while a live
  owner holds the lock. A lock is reclaimed if its owner process is gone or
  it is older than 10 minutes.

### Processes and runtime

- `findExecutable(name, env)` searches `PATH`. On Windows it also tries
  each `PATHEXT` extension; on POSIX the file must be executable.
- `run(request)` is synchronous and is used by the CLI. `runAsync(request)`
  is asynchronous and is used by Core.
  - Neither uses a shell; arguments are passed as an array.
  - On Windows, `.cmd`/`.bat` shims (`npm`, `npx`) run through
    `cmd.exe /d /s /c` with metacharacters escaped twice.
  - A missing executable returns `status: null` and an `errorMessage`
    instead of throwing.
- `resolveRuntime(projectRoot, env, probe?)` returns the first Node 22+
  runtime found, trying in this order:
  1. `HARNESS_WORKFLOW_NODE`;
  2. the project file `.harness/workflow/local/runtime` (`RUNTIME_FILE`),
     which Harness writes: line 1 is the executable with forward slashes,
     line 2 is the mode `node` or `electron`;
  3. `node` on `PATH`;
  4. standard OS locations.

  `runtimeEnvironment(mode)` sets `ELECTRON_RUN_AS_NODE=1` for the Electron
  mode and removes it for `node`.
- `launchers()` returns the managed `scripts/workflow` (POSIX sh),
  `scripts/workflow.ps1` and `scripts/workflow.cmd` texts. The cmd launcher
  delegates to PowerShell and uses CRLF line endings. All three use the same
  runtime order and run `KIT_BUNDLE_PATH`
  (`.harness/workflow/runtime/workflow.mjs`). Without a runtime they exit
  127 with a clear message.

## Поведение на ОС

Платформа Kit — `WorkflowPlatform` (`darwin`, `linux`, `win32`); её даёт
`currentWorkflowPlatform(platform?)` из `platform ?? process.platform`, любая
другая ОС считается `linux` (правка переноса в Workflow Kit, M22 2.3).

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Сравнение путей | без учёта регистра | с учётом регистра | без учёта регистра |
| Запускатель проекта | `scripts/workflow` (sh) | `scripts/workflow` (sh) | `scripts/workflow.cmd` → `scripts/workflow.ps1` (`powershell`) |
| Запуск `.cmd`/`.bat` | напрямую | напрямую | `cmd.exe /d /s /c` с экранированием |

## Test Support

`test/workflow-test-build.mjs` is shared by the tests of every
project-workflow module. It is not used by production code.

## Owned Paths

- `module.md`
- `src/**`
- `test/**`
