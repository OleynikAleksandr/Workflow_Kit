# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": "T007",
  "lastClosed": {
    "closedAt": "2026-11-09T08:50:01.775Z",
    "scopeId": "publication-order"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 408,
  "rounds": [
    {
      "digest": null,
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "На ВМ Windows 11 ARM проходят все строки таблицы паритета раздела 9 спецификации M5",
      "Пункты, помеченные П, проверены на ВМ и записаны в docs/evidence/M5-acceptance.md",
      "macOS и Linux не изменились: их тесты проходят, wfk doctor --installed на Mac — всё в порядке",
      "README и docs/installation.md честно описывают поддержку Windows",
      "Релиз 0.5.0 собран; push — только после приёмки и закрытия scope"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-09T09:16:38.216Z",
      "text": "Пользователь: «очень-очень внимательно проверь теоретические решения. Чтобы они были оправданы и, повторяли возможности, которые уже реализованы для Mac OS. Ну, собственно, приступай к реализации, спецификации и плана» | Execution mode chosen by the user: sequential: Последовательно"
    },
    "baselineCommit": "e6dc73364249997e310b53e60f233af1d4cf90a3",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M5-windows.md",
        "required": true
      },
      {
        "path": "docs/planning/M5-windows-vm.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-09T09:16:38.216Z",
        "text": "Псевдотерминал на Windows — node-pty 1.1.0 (ConPTY, N-API) в составе приложения, только win32-x64 и win32-arm64"
      },
      {
        "at": "2026-11-09T09:16:38.216Z",
        "text": "macOS и Linux остаются на expect и прежнем коде"
      },
      {
        "at": "2026-11-09T09:16:38.216Z",
        "text": "Хосты session-host.mjs и environment-host.mjs повторяют контракт session.exp и environment.exp"
      },
      {
        "at": "2026-11-09T09:16:38.216Z",
        "text": "Демон Codex на Windows — через codex app-server proxy"
      },
      {
        "at": "2026-11-09T09:16:38.216Z",
        "text": "Хук Claude на Windows — exec-форма node.exe + wfk.mjs; хук Codex — commandWindows"
      },
      {
        "at": "2026-11-09T09:16:38.216Z",
        "text": "Первая живая проверка — ВМ Windows 11 ARM в UTM, затем пользователь x64"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "m5-windows",
    "objective": "Windows 11 (x64 и ARM64): сессии Claude и ChatGPT/Codex, ревью, выполнение плана и автопилот — как на macOS",
    "spec": "docs/planning/M5-windows.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "prebuilds win32-x64 and win32-arm64 (ConPTY only, no pdb, no winpty) with PROVENANCE SHA-256 and LICENSE",
        "the loader picks the build by process.arch and refuses clearly without one",
        "the wrapper uses conpty dll, handles socket errors, kills once and then taskkill /T /F; tests with a fake pty"
      ],
      "checks": [],
      "commitMessage": "feat: add the ConPTY host for Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host",
        "package.json",
        "product-parts/provider-runtime/clusters/provider-contract/cluster.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/loader.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/terminal.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/test/pty-host.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/LICENSE",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/PROVENANCE",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/conpty_console_list_agent.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/eventEmitter2.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/index.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/interfaces.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/shared/conout.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/terminal.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/types.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/utils.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/windowsConoutConnection.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/windowsPtyAgent.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/windowsTerminal.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/worker/conoutSocketWorker.js",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/package.json",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-arm64/conpty.node",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-arm64/conpty/OpenConsole.exe",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-arm64/conpty/conpty.dll",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-arm64/conpty_console_list.node",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-x64/conpty.node",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-x64/conpty/OpenConsole.exe",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-x64/conpty/conpty.dll",
        "product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-x64/conpty_console_list.node"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "pty-host module: vendored node-pty 1.1.0 for Windows and a safe wrapper",
      "why": "Claude Code needs a real terminal; Windows has no expect"
    },
    {
      "acceptance": [
        "spawn detached with windowsHide; identity and boot id through CIM; stop with taskkill tree then /F after re-check",
        "check no longer returns unverifiable on Windows; macOS behaviour and tests unchanged"
      ],
      "checks": [],
      "commitMessage": "feat: supervise session processes on Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/src/supervisor.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/src/windows.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/test/supervisor.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/test/utils.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Process supervisor on Windows",
      "why": "Session processes are not supported on Windows today"
    },
    {
      "acceptance": [
        "pty/win-host.ts in session and environment mode prints the same markers and honours the same control files as session.exp and environment.exp",
        "claude.exe is found in %USERPROFILE%\\.local\\bin; trust in .claude.json uses forward slashes and case-insensitive matching with retries",
        "capabilities on Windows are available; tests cover the host with a fake pty"
      ],
      "checks": [],
      "commitMessage": "feat: run Claude sessions on Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001",
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/planning/M5-windows.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/claude-config.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/config-writer.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/environment.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/folder-key.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/trust.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Claude on Windows: session and environment hosts, program search, trust",
      "why": "Claude sessions must work on Windows like on macOS"
    },
    {
      "acceptance": [
        "on Windows the Claude hook is the exec form node.exe + wfk.mjs, the Codex hook has commandWindows; Kit recognises both",
        "the installer and wfk link put a sh wfk script next to wfk.cmd for Git Bash; macOS hooks unchanged"
      ],
      "checks": [],
      "commitMessage": "feat: install Kit hooks and the launcher on Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/link.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/autorun.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "docs/planning/M5-windows.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/hook-config.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/hook-host.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/hook-windows.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-link.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/integrate.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/layout.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/templates.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Kit hooks and the wfk launcher on Windows",
      "why": "The POSIX hook command and the launcher path do not work on Windows"
    },
    {
      "acceptance": [
        "only codex.exe is spawned; the daemon is reached through codex app-server proxy on Windows",
        "FILETIME start time, escaped keyPath and case-insensitive trust; hook keys from hooks/list",
        "capabilities on Windows are available with minimum Codex 0.160; tests for each Windows branch"
      ],
      "checks": [],
      "commitMessage": "feat: run Codex sessions on Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/hooks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/proxy.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/trust.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/ws.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/files-hooks.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/windows.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Codex on Windows: program, proxy transport, daemon pid, config keys, hooks",
      "why": "Codex is disabled on Windows today"
    },
    {
      "acceptance": [
        "open-link on Windows: claude:// through rundll32, codex:// through the OpenAI.Codex AppX launch with a rundll32 fallback",
        "POST /api/system/shutdown (loopback) stops the service; the installer uses it on Windows; wfk install warns when elevated"
      ],
      "checks": [],
      "commitMessage": "feat: open chats and stop the service cleanly on Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli/src",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/open-link.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/control.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/run.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Links, graceful shutdown and the elevation warning on Windows",
      "why": "Chats must open and the service must stop cleanly on Windows"
    },
    {
      "acceptance": [
        "README and installation guide describe Windows install and the remaining limits; OVERVIEW stays under 28000 bytes"
      ],
      "checks": [],
      "commitMessage": "docs: describe Windows support",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T003",
        "T005",
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "CHANGELOG.md",
        "docs/planning/M5-windows.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "IN_PROGRESS",
      "title": "Documentation of Windows support",
      "why": "The OS table must tell the truth"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R1",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "T004",
        "T005",
        "T006",
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M5-windows.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/installation.md",
        "CHANGELOG.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "wfk doctor --installed on macOS reports everything in order with 0.5.0",
        "the parity table is checked on the Windows 11 ARM VM together with the user and recorded in docs/evidence/M5-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.5.0",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "T004",
        "T005",
        "T006",
        "T007",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M5-acceptance.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Release 0.5.0 and the live check on the Windows VM",
      "why": "Windows support is accepted only after a live check"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m5-windows (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: T007
- Progress: 6/9
- Revision: 408

## Objective

Windows 11 (x64 и ARM64): сессии Claude и ChatGPT/Codex, ревью, выполнение плана и автопилот — как на macOS

## Acceptance

- На ВМ Windows 11 ARM проходят все строки таблицы паритета раздела 9 спецификации M5
- Пункты, помеченные П, проверены на ВМ и записаны в docs/evidence/M5-acceptance.md
- macOS и Linux не изменились: их тесты проходят, wfk doctor --installed на Mac — всё в порядке
- README и docs/installation.md честно описывают поддержку Windows
- Релиз 0.5.0 собран; push — только после приёмки и закрытия scope

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — pty-host module: vendored node-pty 1.1.0 for Windows and a safe wrapper (work)
  - Commit: feat: add the ConPTY host for Windows
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/pty-host, package.json, product-parts/provider-runtime/clusters/provider-contract/cluster.md, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/loader.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/terminal.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/test/pty-host.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/LICENSE, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/PROVENANCE, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/conpty_console_list_agent.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/eventEmitter2.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/index.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/interfaces.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/shared/conout.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/terminal.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/types.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/utils.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/windowsConoutConnection.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/windowsPtyAgent.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/windowsTerminal.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/lib/worker/conoutSocketWorker.js, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/package.json, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-arm64/conpty.node, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-arm64/conpty/OpenConsole.exe, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-arm64/conpty/conpty.dll, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-arm64/conpty_console_list.node, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-x64/conpty.node, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-x64/conpty/OpenConsole.exe, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-x64/conpty/conpty.dll, product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/vendor/node-pty-1.1.0/prebuilds/win32-x64/conpty_console_list.node
- [DONE] T002 — Process supervisor on Windows (work)
  - Commit: feat: supervise session processes on Windows
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/src/supervisor.ts, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/src/windows.ts, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/test/supervisor.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/test/utils.test.ts
- [DONE] T003 — Claude on Windows: session and environment hosts, program search, trust (work)
  - Commit: feat: run Claude sessions on Windows
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/planning/M5-windows.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/claude-config.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/config-writer.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/environment.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/folder-key.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/trust.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts
  - Depends on: T001, T002
- [DONE] T004 — Kit hooks and the wfk launcher on Windows (work)
  - Commit: feat: install Kit hooks and the launcher on Windows
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/backend-core/clusters/runtime/modules/cli/src/link.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/autorun.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, docs/planning/M5-windows.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/src/hook-config.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/hook-host.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/hook-windows.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-link.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/integrate.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/layout.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/templates.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts
- [DONE] T005 — Codex on Windows: program, proxy transport, daemon pid, config keys, hooks (work)
  - Commit: feat: run Codex sessions on Windows
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/hooks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/proxy.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/trust.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/ws.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/files-hooks.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/windows.test.ts
  - Depends on: T002
- [DONE] T006 — Links, graceful shutdown and the elevation warning on Windows (work)
  - Commit: feat: open chats and stop the service cleanly on Windows
  - Files: product-parts/backend-core/clusters/runtime/modules/cli/src, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/open-link.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/control.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/run.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts
  - Depends on: T004
- [IN_PROGRESS] T007 — Documentation of Windows support (work)
  - Commit: docs: describe Windows support
  - Files: README.md, docs/installation.md, docs/architecture/OVERVIEW.md, CHANGELOG.md, docs/planning/M5-windows.md
  - Depends on: T003, T005, T006
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M5-windows.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/installation.md, CHANGELOG.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007
- [TODO] T008 — Release 0.5.0 and the live check on the Windows VM (delivery)
  - Commit: chore: release 0.5.0
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M5-acceptance.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
