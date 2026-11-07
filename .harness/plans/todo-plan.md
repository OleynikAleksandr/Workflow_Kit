# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-07T18:15:01.786Z",
    "scopeId": "m3-fixes"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 197,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Provider.autostart?(); registry.autostart()",
          "Claude resumeInterrupted поднимает и окружение ('environment')",
          "cli: AUTOSTART_ATTEMPTS, AUTOSTART_PAUSE_MS"
        ],
        "decisions": [
          "Демон Codex запускается при каждом старте службы без подтверждения",
          "Подключённый или подключающийся демон не трогается"
        ],
        "references": [
          "docs/planning/M3-autostart.md"
        ],
        "result": "При старте службы демон Codex запускается сам (3 попытки по 30 с), прерванные окружения Claude поднимаются; остановка службы их не трогает."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Удалённое управление у приложения ChatGPT"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "После перезагрузки Mac ChatGPT активен без кнопки «Запустить демон»",
      "Новый релиз установлен, wfk doctor --installed — всё в порядке"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-07T18:32:59.445Z",
      "text": "Ну, тогда все в порядке. Раз при инсталляции Workflow Kit мы ставим эту службу в автоматический запуск при старте операционной системы, то я проблем не вижу. | Execution mode chosen by the user: sequential: Выбрал последовательный"
    },
    "baselineCommit": "4c1f22b35564a21e0e05bf0dce1450c42e27b126",
    "blockedReason": null,
    "context": [],
    "decisions": [
      {
        "at": "2026-11-07T18:32:59.445Z",
        "text": "Демон Codex запускается при каждом старте службы без согласий; при остановке службы не останавливается"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "m3-autostart",
    "objective": "При старте службы Workflow Kit сам поднимает демон Codex и прерванные окружения Claude; новый релиз",
    "spec": "docs/planning/M3-autostart.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "При старте службы демон Codex запускается, если не работает или не подключён; 3 попытки с паузой",
        "Подключённый или подключающийся демон не трогается",
        "Прерванное окружение Claude поднимается при старте, остановленное намеренно и архивное — нет"
      ],
      "checks": [],
      "commitMessage": "feat: start the Codex daemon and interrupted Claude environments with the service",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/environment.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Автозапуск демона Codex и окружений Claude",
      "why": "Автозапуск демона Codex и окружений Claude"
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
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M3-autostart.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
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
        "Версия 0.3.7",
        "install ставит app/0.3.7, wfk doctor --installed — всё в порядке"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.7",
      "confirmation": "Ну, тогда все в порядке. Раз при инсталляции Workflow Kit мы ставим эту службу в автоматический запуск при старте операционной системы, то я проблем не вижу.",
      "context": [],
      "dependencies": [
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Релиз 0.3.7",
      "why": "Релиз 0.3.7"
    },
    {
      "acceptance": [
        "409 «Remote app server already online» у демона читается как remoteOwner app, а не ошибка входа",
        "Индикатор ChatGPT готов, создание сессий доступно, действия демона нет",
        "Автозапуск в этом состоянии ничего не делает"
      ],
      "checks": [],
      "commitMessage": "fix: treat the remote control held by the ChatGPT app as a working state",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-autostart.md",
          "heading": "4. Раунд 2: удалённое управление держит приложение ChatGPT",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Соединение, занятое приложением ChatGPT, — рабочее состояние",
      "why": "Соединение, занятое приложением ChatGPT, — рабочее состояние"
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
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.3.8",
        "install ставит app/0.3.8, wfk doctor --installed — всё в порядке, ChatGPT готов"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.3.8",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Релиз 0.3.8",
      "why": "Релиз 0.3.8"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m3-autostart (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 4/6
- Revision: 197

## Objective

При старте службы Workflow Kit сам поднимает демон Codex и прерванные окружения Claude; новый релиз

## Acceptance

- После перезагрузки Mac ChatGPT активен без кнопки «Запустить демон»
- Новый релиз установлен, wfk doctor --installed — всё в порядке

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Автозапуск демона Codex и окружений Claude (work)
  - Commit: feat: start the Codex daemon and interrupted Claude environments with the service
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/environment.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M3-autostart.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001
- [DONE] T002 — Релиз 0.3.7 (delivery)
  - Commit: chore: release 0.3.7
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R1

Digest: При старте службы демон Codex запускается сам (3 попытки по 30 с), прерванные окружения Claude поднимаются; остановка службы их не трогает.

### R2 — Удалённое управление у приложения ChatGPT (fixes, OPEN)

- [DONE] T003 — Соединение, занятое приложением ChatGPT, — рабочее состояние (work)
  - Commit: fix: treat the remote control held by the ChatGPT app as a working state
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts
- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
  - Depends on: T003
- [TODO] T004 — Релиз 0.3.8 (delivery)
  - Commit: chore: release 0.3.8
  - Files: package.json, package-lock.json, docs/evidence/M3-acceptance.md
  - Depends on: DOCS-R2

State changes only through `scripts/workflow` commands. History lives in Git.
