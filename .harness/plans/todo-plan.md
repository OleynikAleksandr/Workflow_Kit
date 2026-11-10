# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-10T09:06:20.948Z",
    "scopeId": "m8-kimi-provider"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 521,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-kimi KimiServer: current(), ensure(), own(), app(), owner(), retire(), stop(), startedWith(), startedAt(), foreign(); KimiInstance.startedAt.",
          "provider-kimi KimiHooks: kitKey(), appRestart(); APP_RESTART_NOTE, HOOK_RECORD; KimiRuntime.appRestart().",
          "provider-kimi status details.server app | kit | null; APP_SERVER_NOTE; actions disabled with APP_SERVER_REASON; ProviderError kimi-app-server (409).",
          "session-titles option listedRunning(projectId); cli wires it from listSessions with state running."
        ],
        "decisions": [
          "A Kimi server takes hooks only at its start; GET /api/v1/config is not a proof that hooks run.",
          "The server of the Kimi Code app (any live foreign record of server/instances answering healthz) is the only server Kit talks to while it runs; Kit's own kimi web is started only without it and retired when the app appears and no foreign turn would be cut.",
          "Kit never restarts the Kimi Code app nor changes its Remote Control; it shows APP_RESTART_NOTE instead.",
          "The time Kit last changed its hook blocks is kept in sessions/kimi-hook.json; blocks of earlier versions count from the config.toml mtime at the first check.",
          "wfk session without hooks takes the only project session the providers list as running; several stay session-ambiguous."
        ],
        "references": [
          "docs/planning/M9-kimi-start-fixes.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/server.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md"
        ],
        "result": "Kimi sessions start correctly: while the Kimi Code app runs, Kit creates workspaces, sessions and prompts through its server, so the app shows them at once; the Kit server is restarted when its hooks are stale; a Kimi Code app started before the Kit hook is flagged for a restart; wfk session finds a Kimi turn by its session lock when no hook came."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": {
        "contracts": [
          "provider-kimi: kimiWorkspaceCommand(check, folder) -> KimiLaunch | null; parseHandlerProgram(answer, env)",
          "cli: registerOpenLinkRoute option kimiCommand, AppOptions.kimiCommand; launch first, then the link commands",
          "panel-shell: clickOpensThroughService(link, maxTouchPoints)",
          "process-supervisor: SpawnSpec.renames and ProcessRecord.renames (true only)"
        ],
        "decisions": [
          "kimi-code://open always adds an empty chat, so a project is opened by the start option --workspace of the single-instance app; new=1 still uses the link",
          "A click on a Kimi card on a computer goes through POST /api/open-link; the browser link is the fallback",
          "SpawnSpec.renames: a record of a process that renames itself is matched by pid and start token without the command line",
          "APP_RESTART_NOTE looks only at server.app(); orphan servers lost by 0.6.0/0.6.1 are not recovered"
        ],
        "references": [
          "docs/planning/M9-kimi-start-fixes.md#8",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/links.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/server.md",
          "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md"
        ],
        "result": "Kimi project opens in the Kimi Code app without an empty chat: the service starts the app with --workspace=<folder> (macOS open -n -a, Windows Start-Process of the kimi-code handler), the link is the fallback and stays for Linux and new sessions. The renamed kimi web server stays in the process records, and the app restart note comes only from the server of the app."
      },
      "id": "R2",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Fixes of the 0.6.1 live check"
    },
    {
      "digest": {
        "contracts": [
          "No contract changes in R3"
        ],
        "decisions": [
          "The release round holds only the delivery task; the code and the module documents were reconciled in R2"
        ],
        "references": [
          "docs/planning/M9-kimi-start-fixes.md#8",
          "README.md"
        ],
        "result": "Round R3 delivers release 0.6.2 with the R2 fixes of the 0.6.1 live check; README says that a click on a Kimi session opens its project in the app without a new empty chat (macOS and Windows)."
      },
      "id": "R3",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Fixes"
    },
    {
      "digest": null,
      "id": "R4",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Windows CI fixes of the 0.6.2 tests"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "While the Kimi Code app runs, Kit creates workspaces and sessions through the server of the app and starts no server of its own",
      "Hooks written after the server of Kit started take effect: the server is restarted by the fingerprint of the Kit blocks, not by GET /api/v1/config",
      "When the app was started before the Kit hook was written, the status, the wizard hook step and the sessions say that the app must be restarted",
      "wfk session title|plan finds a Kimi turn by the live session lock when no hook reached the service",
      "0.6.1 is installed locally and CI is green on all four platforms before acceptance"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-10T09:21:06.046Z",
      "text": "User: «Я думаю, что нужно закрыть текущий план приняв его и откроем новый, для замечаний, касающихся в первую очередь, конечно же, провайдера Кими.» and «В общем, прям при старте что-то сильно неправильно работает с провайдером Kimi Code.» | Execution mode chosen by the user: sequential: Да, принимаю этот план, выполняй его и собирай новый релиз для моих тестов"
    },
    "baselineCommit": "f0bb47307ca73db9e4a37ac22c50c796f5c00ef4",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M9-kimi-start-fixes.md",
        "required": true
      },
      {
        "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-10T09:21:06.046Z",
        "text": "When the Kimi Code app runs, its server is the only server Kit uses; Kit starts its own kimi web only without it"
      },
      {
        "at": "2026-11-10T09:21:06.046Z",
        "text": "Kit never restarts the Kimi Code app; it tells the user to restart it when the app started before the Kit hook was written"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "claude:01493504-12b2-440a-84f4-17acf7bc1c61",
      "strategy": "sequential"
    },
    "id": "m9-kimi-start-fixes",
    "objective": "A Kimi session created from the panel is visible in the Kimi Code app with its first message, and the Kit hooks run in it; release 0.6.1",
    "spec": "docs/planning/M9-kimi-start-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "The server of Kit is restarted when the Kit blocks in config.toml differ from those it started with, also when GET /api/v1/config already lists them",
        "approveHooks and remove restart the server at once; requireReady syncs the hooks before a session is created or a message is sent",
        "APP_RESTART_NOTE is on the status, the hook state and the sessions when the server of the app started before the Kit hook was written",
        "Tests cover macOS, Linux and Windows with the platform injected"
      ],
      "checks": [],
      "commitMessage": "fix: restart the Kit server of Kimi for changed hooks and ask to restart the Kimi Code app",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "2.2. Хуки действительно работают",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/session-list.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/shapes.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hook-sync.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hooks.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/paths-program.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Hooks of the Kit server by fingerprint; app restart note",
      "why": "Kimi loads hooks only when its server starts; Kit compared the file with GET /api/v1/config, which shows new hooks without running them"
    },
    {
      "acceptance": [
        "With a live server of the app in server/instances, workspaces, trust, sessions, prompts and lists go to it and no kimi web is started",
        "When the app appears while the server of Kit runs, Kit moves to the server of the app once the turns of its sessions ended; when the app is gone, Kit starts its own server on demand",
        "With the server of the app, the Remote Control and restart actions are disabled with a reason and links.mobile is read from the app server",
        "The status says whose server is used (details.server app | kit | null)",
        "A scenario test: the wizard while the app runs creates the session on the app server with its first message"
      ],
      "checks": [],
      "commitMessage": "fix: use the server of the Kimi Code app for Kimi sessions while it runs",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "2.1. Один сервер: сервер приложения, если оно работает",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/links.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/server.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/locks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/app-server.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/helpers.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "The server of the Kimi Code app as the only server",
      "why": "The app does not see sessions of another server and creates its own workspace for the same folder"
    },
    {
      "acceptance": [
        "With no running turn in the channel, the only project session listed with state running is used",
        "Otherwise the answer stays 409 session-ambiguous with the candidates"
      ],
      "checks": [],
      "commitMessage": "fix: find the running session of wfk session by the session lists of the providers",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "2.3. `wfk session title|plan` без хуков",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/session-running.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "wfk session finds a turn by the lists of the providers",
      "why": "Without hooks the channel knows no running turn although the Kimi session lock lives"
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
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M9-kimi-start-fixes.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Version 0.6.1 in package files and docs; CHANGELOG entry",
        "node bin/wfk.mjs install and wfk doctor --installed pass",
        "CI on ci/m9-kimi-start-fixes is green on macOS, Linux, Windows x64 and ARM64",
        "The acceptance document lists live checks per OS; items not checked live are recorded as unverified"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.6.1",
      "confirmation": "Да, принимаю этот план, выполняй его и собирай новый релиз для моих тестов",
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "4. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M9-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Release 0.6.1 with green CI",
      "why": "Release 0.6.1 with green CI"
    },
    {
      "acceptance": [
        "On macOS the service opens the project with open -n -a <Kimi Code.app> --args --workspace=<folder>; on Windows with Start-Process of Kimi Code.exe from the kimi-code handler; on Linux the link as before",
        "A link with new=1, a missing app path or a failed command falls back to the link",
        "A click on a Kimi session card on a computer goes through POST /api/open-link; the link is the fallback",
        "Tests cover macOS, Linux and Windows with the platform injected"
      ],
      "checks": [],
      "commitMessage": "fix: open a Kimi project in the Kimi Code app with --workspace instead of a link that starts a new chat",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "8.1. Открытие проекта без пустого чата",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "tools/platform-guard/allowlist.json",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/open-link.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/links.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/app-link.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/workspace-launch.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Open the Kimi project without an empty chat",
      "why": "A kimi-code:// link always opens the project with a new empty chat"
    },
    {
      "acceptance": [
        "A record spawned with renames is alive, adopted and stopped by its start token although its command line changed",
        "The Kimi server of Kit is spawned with renames and is adopted after a restart of the service",
        "APP_RESTART_NOTE comes only from the server Kit talks to"
      ],
      "checks": [],
      "commitMessage": "fix: keep the renamed Kimi server in the process records and flag only the server Kit uses",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "8.2. Ложная пометка о перезапуске и потерянный сервер Kit",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/server.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hook-sync.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/src/supervisor.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/test/supervisor.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "No false app restart note; the Kit server stays in the process records",
      "why": "kimi web renames its process, so the records lost the Kit server and its orphan gave a false note"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R2",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T005",
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R3",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "DOCS-R3",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R3",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Version 0.6.2 in package files and docs; CHANGELOG entry",
        "node bin/wfk.mjs install and wfk doctor --installed pass",
        "CI on ci/m9-kimi-start-fixes is green on macOS, Linux, Windows x64 and ARM64",
        "The acceptance document lists the live checks of R2 per OS; items not checked live are recorded as unverified"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.6.2",
      "confirmation": "Да, заканчивай, собирай новый релиз.",
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "8. Раунд исправлений R2 (живая проверка 0.6.1)",
          "required": true
        }
      ],
      "dependencies": [
        "T005",
        "T006",
        "DOCS-R2",
        "DOCS-R3"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M9-acceptance.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R3",
      "status": "DONE",
      "title": "Release 0.6.2 with green CI",
      "why": "The user tests the fixes of the 0.6.1 live check in a new release"
    },
    {
      "acceptance": [
        "The macOS launch test expects the bundle path joined with the macOS separator on every host",
        "The renames test starts its children outside the temporary folder it removes, and the folder is removed with retries",
        "npm test passes locally"
      ],
      "checks": [],
      "commitMessage": "test: make the Kimi launch and renames tests pass on Windows hosts",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": "Only tests change; the contracts stay as documented",
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/workspace-launch.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/test/supervisor.test.ts"
      ],
      "fixes": "T005",
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R4",
      "status": "TODO",
      "title": "Host-independent tests of the Kimi launch and of renames",
      "why": "CI of 0.6.2 failed on Windows x64 and ARM64: a macOS path expected with host separators, and live test children locked their working folder (EBUSY)"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R4",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "DOCS-R4",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R4",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "CI on ci/m9-kimi-start-fixes is green on macOS, Linux, Windows x64 and ARM64 for the pushed commit",
        "The acceptance document records the run and the failed first run of 0.6.2"
      ],
      "checks": [],
      "commitMessage": "docs: record the CI run of 0.6.2",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T008",
        "DOCS-R4"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M9-acceptance.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R4",
      "status": "TODO",
      "title": "Green CI for 0.6.2",
      "why": "The release is done only with CI green on all four platforms"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m9-kimi-start-fixes (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 10/13
- Revision: 521

## Objective

A Kimi session created from the panel is visible in the Kimi Code app with its first message, and the Kit hooks run in it; release 0.6.1

## Acceptance

- While the Kimi Code app runs, Kit creates workspaces and sessions through the server of the app and starts no server of its own
- Hooks written after the server of Kit started take effect: the server is restarted by the fingerprint of the Kit blocks, not by GET /api/v1/config
- When the app was started before the Kit hook was written, the status, the wizard hook step and the sessions say that the app must be restarted
- wfk session title|plan finds a Kimi turn by the live session lock when no hook reached the service
- 0.6.1 is installed locally and CI is green on all four platforms before acceptance

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Hooks of the Kit server by fingerprint; app restart note (work)
  - Commit: fix: restart the Kit server of Kimi for changed hooks and ask to restart the Kimi Code app
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/session-list.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/shapes.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hook-sync.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hooks.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/paths-program.test.ts
- [DONE] T002 — The server of the Kimi Code app as the only server (work)
  - Commit: fix: use the server of the Kimi Code app for Kimi sessions while it runs
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/links.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/server.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/locks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/app-server.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/helpers.ts
  - Depends on: T001
- [DONE] T003 — wfk session finds a turn by the lists of the providers (work)
  - Commit: fix: find the running session of wfk session by the session lists of the providers
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/session-titles, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/session-running.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M9-kimi-start-fixes.md
  - Depends on: T001, T002, T003
- [DONE] T004 — Release 0.6.1 with green CI (delivery)
  - Commit: chore: release 0.6.1
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/evidence/M9-acceptance.md
  - Depends on: T001, T002, T003, DOCS-R1

Digest: Kimi sessions start correctly: while the Kimi Code app runs, Kit creates workspaces, sessions and prompts through its server, so the app shows them at once; the Kit server is restarted when its hooks are stale; a Kimi Code app started before the Kit hook is flagged for a restart; wfk session finds a Kimi turn by its session lock when no hook came.

### R2 — Fixes of the 0.6.1 live check (fixes, CLOSED)

- [DONE] T005 — Open the Kimi project without an empty chat (work)
  - Commit: fix: open a Kimi project in the Kimi Code app with --workspace instead of a link that starts a new chat
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/control-panel/clusters/web-panel/modules/panel-shell, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/open-link.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/links.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/app-link.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/workspace-launch.test.ts
- [DONE] T006 — No false app restart note; the Kit server stays in the process records (work)
  - Commit: fix: keep the renamed Kimi server in the process records and flag only the server Kit uses
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/server.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hook-sync.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/src/supervisor.ts, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/test/supervisor.test.ts
- [DONE] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md
  - Depends on: T005, T006

Digest: Kimi project opens in the Kimi Code app without an empty chat: the service starts the app with --workspace=<folder> (macOS open -n -a, Windows Start-Process of the kimi-code handler), the link is the fallback and stays for Linux and new sessions. The renamed kimi web server stays in the process records, and the app restart note comes only from the server of the app.

### R3 — Fixes (fixes, CLOSED)

- [DONE] DOCS-R3 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R3
  - Files: README.md, docs/architecture/OVERVIEW.md
- [DONE] T007 — Release 0.6.2 with green CI (delivery)
  - Commit: chore: release 0.6.2
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/evidence/M9-acceptance.md
  - Depends on: T005, T006, DOCS-R2, DOCS-R3

Digest: Round R3 delivers release 0.6.2 with the R2 fixes of the 0.6.1 live check; README says that a click on a Kimi session opens its project in the app without a new empty chat (macOS and Windows).

### R4 — Windows CI fixes of the 0.6.2 tests (fixes, OPEN)

- [TODO] T008 — Host-independent tests of the Kimi launch and of renames (work)
  - Commit: test: make the Kimi launch and renames tests pass on Windows hosts
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/workspace-launch.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/test/supervisor.test.ts
  - Fixes: T005
- [TODO] DOCS-R4 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R4
  - Files: README.md, docs/architecture/OVERVIEW.md
  - Depends on: T008
- [TODO] T009 — Green CI for 0.6.2 (delivery)
  - Commit: docs: record the CI run of 0.6.2
  - Files: docs/evidence/M9-acceptance.md
  - Depends on: T008, DOCS-R4

State changes only through `scripts/workflow` commands. History lives in Git.
