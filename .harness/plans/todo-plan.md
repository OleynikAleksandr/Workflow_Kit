# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-14T12:47:10.799Z",
    "scopeId": "m28-claude-controls-fixes"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 958,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "agent-channel: option release { supports(ref), wake(ref) }; Slot.released; hold answers the hook at once",
          "provider-claude host: <debug>.parameters-wanted (service writes) and <debug>.parameters-catalog; state.wanted statuses; three failures fail a field",
          "provider-claude service: update answers at once; ParameterItem.pending { value, label, note }; SessionParameters.failures for 60 s; catalog cache claude-native-catalog.json in stateDir",
          "session-chat: menus open while Claude answers; pending row polled every 1 s; failure line for 10 s"
        ],
        "decisions": [
          "A hold decision for a session the panel runs and can wake releases the Stop hook at once; the slot shows holding with holdReason",
          "Model and effort keep the native menu with the session-only key s; /model and /effort with an argument would save defaults",
          "The host confirms the Switch model? dialog only for its own target and confirms a model by Claude's 'Set model to <label>' line (plan mode shows the plan model)",
          "A busy host is paced by the Node helper (100 ms); Tcl 8.5 on macOS adds about 150 ms to after"
        ],
        "references": [
          "docs/planning/M29-claude-controls-instant.md",
          "docs/evidence/M29-claude-controls-instant.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
          "docs/architecture/CONTRACTS.md"
        ],
        "result": "A panel-run Claude session is not held by the Stop hook while the autopilot waits; queued messages wake it. Claude model, effort, mode and Ultracode choices answer at once with a pending state and are applied by the host in the background, session-only; a free session confirms in about 1-3 s on macOS. The catalog is read once per CLI version; /fast is never opened."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "While the autopilot waits for the user, a panel-run Claude session is idle: Desktop messages go at once and the panel shows no working spinner",
      "Model, effort, mode and Ultracode menus open at once in a panel-run session, also during a turn; the choice shows immediately and is applied by the host when Claude is free",
      "A free session confirms a change within 3 s on macOS; user defaults (~/.claude/settings.json) never change",
      "No /fast, Cancelled or Fast mode OFF lines appear in the session feed after the catalog is cached",
      "CI is green on macOS, Linux, Windows x64 and Windows ARM64 for the delivery commit"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-14T13:39:10.269Z",
      "text": "Пользователь 14.11.2026: «почему не сделать выбор всего этого внутри Workflow Kit, без всяких фидбэков со стороны терминала? … выбирает. И после этого эта команда уходит с нашего Workflow Kit в терминал, а отображение меню … делать один раз при старте». В панели выбрано: спецификация и план без ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "cc79ab3912198625848bcdb673516fcb7886e1a9",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M29-claude-controls-instant.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-14T13:39:10.269Z",
        "text": "Model and effort keep the native menu with the session-only key s: /model <name> and /effort <level> save user defaults (Claude Code docs, 14.11.2026)"
      },
      {
        "at": "2026-11-14T13:39:10.269Z",
        "text": "A hold decision for a panel-run Claude session releases the Stop hook at once; the host wakes the session for queued messages"
      },
      {
        "at": "2026-11-14T13:39:10.269Z",
        "text": "The native catalog is read once per Claude CLI version and cached; /fast is no longer opened"
      },
      {
        "at": "2026-11-14T13:39:10.269Z",
        "text": "The panel never waits for the terminal: pending value with a note, rollback with a short error after three failed attempts"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 2,
      "ownerSession": "92b77570-773b-4173-8244-c327d009daa3",
      "strategy": "sequential"
    },
    "id": "m29-claude-controls-instant",
    "objective": "Claude parameters change instantly from the panel (choice queued in Kit, applied by the host in the background, session-only) and a session waiting for the user is not held by the Stop hook",
    "spec": "docs/planning/M29-claude-controls-instant.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "With release.supports true a hold decision ends the Stop hook at once; the slot is waiting with holdReason and holdUntil kept",
        "wake(key) of a released slot asks the decider with woken true: continue is queued with source autopilot and release.wake is called",
        "At holdUntil a timeoutAnswer is queued as reminder and wakes the session; without it holdReason is cleared",
        "A user prompt clears the wait; the Stop barrier still holds service messages; without release the old hold is unchanged",
        "cli enables release only for providers with wakeSession, panel-run and not ledOutside sessions; Codex and Kimi keep their paths"
      ],
      "checks": [],
      "commitMessage": "feat: release the Stop hook of panel-run sessions waiting for the user",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M29-claude-controls-instant.md",
          "required": true,
          "heading": "3.1. Ход без удержания (agent-channel, cli)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/release.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/release.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/release-wiring.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/CONTRACTS.md",
        "AGENTS.md",
        "CHANGELOG.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/architecture/OVERVIEW.md",
        "docs/changelog/CHANGELOG-0.7-0.9.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Ход без удержания для сессий панели Claude",
      "why": "The held Stop hook keeps Claude busy: Desktop queues messages and the parameter menus lock"
    },
    {
      "acceptance": [
        "The host applies .parameters-wanted fields in the order model, ultracode, effort, mode when the input is free and writes one result per field id",
        "A newer choice of a field replaces the older one; applied removes the field only if its id did not change",
        "Cancellations by user input or a turn start are retried without counting; three other failures end the field with failed",
        "Model navigation starts at the selected row and moves by the cached index difference, checking the label before s; efforts are read only for a model without cached efforts",
        "A .parameters-catalog of the same CLI version skips discovery; /fast is never opened; the last confirmed mode stays known",
        "Tests on 2.1.325 frames cover both directions, More models, retries, merge and the catalog file; win32 and linux file branches with an injected platform"
      ],
      "checks": [],
      "commitMessage": "feat: apply wanted Claude parameters in the background with a cached catalog",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M29-claude-controls-instant.md",
          "required": true,
          "heading": "3.2. Хост: желаемые параметры и каталог (provider-claude, pty)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-wanted.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Хост: желаемые параметры, каталог и короткий путь",
      "why": "Each change walks whole menus synchronously and fails on any unexpected frame"
    },
    {
      "acceptance": [
        "update() merges the choice into .parameters-wanted and returns read() with pending without waiting for the host; choosing the confirmed value drops the pending change",
        "read() builds the menus from the host catalog or the cached claude-native-catalog.json of the same CLI version; options are not disabled by a turn",
        "pending.note distinguishes free Claude, a running turn and a draft; failed results appear in failures for 60 s",
        "editable is false only without a live 0.13.3+ host, with the reason from the specification; errors only 400 for invalid values and 503 without a host",
        "provider.parameters.changed is recorded when the confirmed value changes; the session start copies the cached catalog next to the debug file"
      ],
      "checks": [],
      "commitMessage": "feat: answer Claude parameter changes at once with pending state",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M29-claude-controls-instant.md",
          "required": true,
          "heading": "3.3. Служба: ответ сразу (provider-claude, provider-registry)"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/native-parameters.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-wanted.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/native-wanted.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameters.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Служба: ответ сразу, pending и failures, кэш каталога",
      "why": "The parameters route waits up to 25 s for the terminal"
    },
    {
      "acceptance": [
        "Menus open whenever editable, also during a turn; no busy footnote",
        "A choice shows at once with the muted pending note and a thin indicator; polling every 1 s while pending",
        "A failure shows one line under the input for 10 s and the row returns to the confirmed value; host-internal reasons are never shown",
        "Browser scenario: light and dark themes, widths 375, 768 and 1280"
      ],
      "checks": [],
      "commitMessage": "feat: show pending Claude parameters in the panel without waiting",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M29-claude-controls-instant.md",
          "required": true,
          "heading": "3.4. Панель (session-chat)"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-menu.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-controls.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/parameters-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m29-pending.browser.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: меню всегда открыто, пометка и откат",
      "why": "The user must never wait for the terminal"
    },
    {
      "acceptance": [
        "Disposable Kit project, Haiku, at most two short model turns: a plan question leaves the session idle and a Desktop-style message goes at once",
        "Model, effort and mode change in a free session within 3 s; a choice during a turn applies after it",
        "The hash of ~/.claude/settings.json is unchanged; results in docs/evidence/M29",
        "Browser regression of M28 composer and menus passes in both themes"
      ],
      "checks": [],
      "commitMessage": "test: record live and browser checks of instant Claude controls",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M29-claude-controls-instant.md",
          "required": true,
          "heading": "5. Проверка"
        }
      ],
      "dependencies": [
        "T001",
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M29-claude-controls-instant.md",
        "docs/evidence/M29",
        "design-qa.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts",
        "docs/architecture/OS-MATRIX.md",
        "docs/evidence/M29/dark-1280-pending.png",
        "docs/evidence/M29/dark-375-failed.png",
        "docs/evidence/M29/light-1280-failed.png",
        "docs/evidence/M29/light-375-pending.png",
        "docs/evidence/M29/menu-answering-dark.png",
        "docs/evidence/M29/menu-answering-light.png",
        "docs/evidence/M29/t005-browser.json",
        "docs/evidence/M29/t005-live.json",
        "docs/evidence/M29/t005-timing.json",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Живая проверка и браузерная регрессия",
      "why": "The behaviour depends on the real Claude terminal"
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
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M29-claude-controls-instant.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/CONTRACTS.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "docs/evidence/M29-claude-controls-instant.md",
        "design-qa.md"
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
        "Version 0.13.3 in package files and CHANGELOG; installed locally, /api/health reports 0.13.3 and doctor passes",
        "Installed panel passes the M29 browser scenario; evidence recorded"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.13.3",
      "confirmation": "И дальше выполняй весь план без паузы, вплоть до заливки нового релиза на GitHub.",
      "context": [
        {
          "path": "README.md",
          "required": true
        },
        {
          "path": "docs/planning/M29-claude-controls-instant.md",
          "required": true,
          "heading": "5. Проверка"
        }
      ],
      "dependencies": [
        "T005",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "README.md",
        "CHANGELOG.md",
        "docs/usage.md",
        "docs/installation.md",
        "docs/setup.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M29-claude-controls-instant.md",
        "docs/evidence/M29",
        "docs/evidence/M29/local-delivery.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поставка 0.13.3 и локальная установка",
      "why": "Поставка 0.13.3 и локальная установка"
    },
    {
      "acceptance": [
        "CI on ci/m29-claude-controls-instant for the delivery SHA is green on macOS ARM64, Linux x64, Windows x64 and Windows ARM64; recorded in the evidence"
      ],
      "checks": [],
      "commitMessage": "docs: record green CI for instant Claude controls",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T006",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M29-claude-controls-instant.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "CI точного SHA поставки на четырёх платформах"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m29-claude-controls-instant (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 7/8
- Revision: 958

## Objective

Claude parameters change instantly from the panel (choice queued in Kit, applied by the host in the background, session-only) and a session waiting for the user is not held by the Stop hook

## Acceptance

- While the autopilot waits for the user, a panel-run Claude session is idle: Desktop messages go at once and the panel shows no working spinner
- Model, effort, mode and Ultracode menus open at once in a panel-run session, also during a turn; the choice shows immediately and is applied by the host when Claude is free
- A free session confirms a change within 3 s on macOS; user defaults (~/.claude/settings.json) never change
- No /fast, Cancelled or Fast mode OFF lines appear in the session feed after the catalog is cached
- CI is green on macOS, Linux, Windows x64 and Windows ARM64 for the delivery commit

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Ход без удержания для сессий панели Claude (work, parallel-safe)
  - Commit: feat: release the Stop hook of panel-run sessions waiting for the user
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/release.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/release.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/release-wiring.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/CONTRACTS.md, AGENTS.md, CHANGELOG.md, docs/architecture/OS-MATRIX.md, docs/architecture/OVERVIEW.md, docs/changelog/CHANGELOG-0.7-0.9.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md
- [DONE] T002 — Хост: желаемые параметры, каталог и короткий путь (work, parallel-safe)
  - Commit: feat: apply wanted Claude parameters in the background with a cached catalog
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, docs/architecture/OS-MATRIX.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-wanted.ts
- [DONE] T003 — Служба: ответ сразу, pending и failures, кэш каталога (work)
  - Commit: feat: answer Claude parameter changes at once with pending state
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/native-parameters.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/native-wanted.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-protocol.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/native-wanted.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/interrupt.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameters.test.ts
  - Depends on: T002
- [DONE] T004 — Панель: меню всегда открыто, пометка и откат (work)
  - Commit: feat: show pending Claude parameters in the panel without waiting
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-menu.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/claude-controls.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/parameters-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m29-pending.browser.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, docs/architecture/OS-MATRIX.md
  - Depends on: T003
- [DONE] T005 — Живая проверка и браузерная регрессия (work)
  - Commit: test: record live and browser checks of instant Claude controls
  - Files: docs/evidence/M29-claude-controls-instant.md, docs/evidence/M29, design-qa.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/interrupt-worker.ts, docs/architecture/OS-MATRIX.md, docs/evidence/M29/dark-1280-pending.png, docs/evidence/M29/dark-375-failed.png, docs/evidence/M29/light-1280-failed.png, docs/evidence/M29/light-375-pending.png, docs/evidence/M29/menu-answering-dark.png, docs/evidence/M29/menu-answering-light.png, docs/evidence/M29/t005-browser.json, docs/evidence/M29/t005-live.json, docs/evidence/M29/t005-timing.json, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts
  - Depends on: T001, T004
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M29-claude-controls-instant.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/CONTRACTS.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, docs/evidence/M29-claude-controls-instant.md, design-qa.md
  - Depends on: T001, T002, T003, T004, T005
- [DONE] T006 — Поставка 0.13.3 и локальная установка (delivery)
  - Commit: chore: release 0.13.3
  - Files: package.json, package-lock.json, README.md, CHANGELOG.md, docs/usage.md, docs/installation.md, docs/setup.md, docs/architecture/OVERVIEW.md, docs/evidence/M29-claude-controls-instant.md, docs/evidence/M29, docs/evidence/M29/local-delivery.md
  - Depends on: T005, DOCS-R1
- [TODO] T007 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record green CI for instant Claude controls
  - Files: docs/evidence/M29-claude-controls-instant.md
  - Depends on: T006, DOCS-R1

Digest: A panel-run Claude session is not held by the Stop hook while the autopilot waits; queued messages wake it. Claude model, effort, mode and Ultracode choices answer at once with a pending state and are applied by the host in the background, session-only; a free session confirms in about 1-3 s on macOS. The catalog is read once per CLI version; /fast is never opened.

State changes only through `scripts/workflow` commands. History lives in Git.
