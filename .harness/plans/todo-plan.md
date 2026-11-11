# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-11T16:49:08.593Z",
    "scopeId": "m15-claude-promo-dialogs"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 639,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "autopilot: опция owns(projectId, key); все enqueue с projectId",
          "cli: owns автопилота — ownsSession",
          "session-view: reviewComing учитывает только сессии из state.providers.projects[id][client].sessions"
        ],
        "decisions": [
          "Карточку выбора и выбор режима блокируют только сессии, которые провайдер числит за проектом; без списка провайдера или при ошибке сессия считается",
          "Автопилот передаёт projectId во все сообщения канала"
        ],
        "references": [
          "docs/planning/M16-plan-start-after-review.md",
          "docs/architecture/OVERVIEW.md",
          "README.md"
        ],
        "result": "После ревью карточка выбора режима не прячется посторонней сессией канала, которой провайдер не числит за проектом; выбор режима не блокируется такой сессией; команды автопилота (выбор режима, запуск, доработка) передают projectId, поэтому после перезапуска службы агент будится сразу."
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
      "Посторонняя работающая сессия, которой нет среди сессий проекта, не прячет карточку выбора режима",
      "После перезапуска службы выбор режима и «Начать выполнение плана» будят агента",
      "Выпуск 0.8.3; CI зелёный на macOS, Linux, Windows x64 и ARM64"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-11T17:27:19.820Z",
      "text": "Пользователь, 2026-11-11: «Мне важно, чтобы этими тестами мы настроили работающую программу для Windows.» — исправить зависания после ревью, найденные на Windows | Execution mode chosen by the user: sequential: Да, с выпуском"
    },
    "baselineCommit": "590f2497d9549fb540625bad4bf2c2c998b88388",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M16-plan-start-after-review.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-11T17:27:19.820Z",
        "text": "Карточку прячут только сессии из списка сессий проекта у провайдера"
      },
      {
        "at": "2026-11-11T17:27:19.820Z",
        "text": "Автопилот передаёт projectId во все сообщения канала"
      },
      {
        "at": "2026-11-11T17:27:19.820Z",
        "text": "Выпуск 0.8.3"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "e9c04a9c-cd7c-4f6c-b4f7-f6b07802530e",
      "strategy": "sequential"
    },
    "id": "m16-plan-start-after-review",
    "objective": "После ревью карточка выбора режима появляется, даже если в проекте висит посторонняя сессия, а запуск плана доходит до агента и после перезапуска службы",
    "spec": "docs/planning/M16-plan-start-after-review.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Все enqueue автопилота передают projectId",
        "Выбор режима не блокируется работающей сессией, которой нет среди сессий проекта (owns)",
        "Тест: канал без сессии — сообщения выбора и запуска с projectId; посторонняя сессия не блокирует выбор",
        "module.md autopilot и cli обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: wake the agent for plan commands after a service restart",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M16-plan-start-after-review.md",
          "heading": "2.2. Команды автопилота знают проект (`autopilot`)",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/restart.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Команды автопилота знают проект",
      "why": "После перезапуска службы команда запуска плана не будила агента"
    },
    {
      "acceptance": [
        "reviewComing учитывает только сессии из списка проекта; без раздела провайдера — как раньше",
        "Тесты модели",
        "module.md session-view обновлён"
      ],
      "checks": [],
      "commitMessage": "fix: show the mode choice despite a stray session",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M16-plan-start-after-review.md",
          "heading": "2.1. Посторонняя сессия не прячет карточку (`session-view`)",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Посторонняя сессия не прячет карточку выбора",
      "why": "Фоновая сессия ChatGPT вне проекта спрятала карточку выбора режима"
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
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M16-plan-start-after-review.md"
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
        "Версия 0.8.3, CHANGELOG, документ приёмки M16",
        "CI зелёный на macOS, Linux, Windows x64 и ARM64 на ветке ci/m16-plan-start-after-review",
        "Служба переустановлена на macOS"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.8.3",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T002",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M16-acceptance.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Выпуск 0.8.3",
      "why": "Выпустить исправления для проверки на Windows"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m16-plan-start-after-review (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 3/4
- Revision: 639

## Objective

После ревью карточка выбора режима появляется, даже если в проекте висит посторонняя сессия, а запуск плана доходит до агента и после перезапуска службы

## Acceptance

- Посторонняя работающая сессия, которой нет среди сессий проекта, не прячет карточку выбора режима
- После перезапуска службы выбор режима и «Начать выполнение плана» будят агента
- Выпуск 0.8.3; CI зелёный на macOS, Linux, Windows x64 и ARM64

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Команды автопилота знают проект (work)
  - Commit: fix: wake the agent for plan commands after a service restart
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/restart.test.ts
- [DONE] T002 — Посторонняя сессия не прячет карточку выбора (work)
  - Commit: fix: show the mode choice despite a stray session
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts
  - Depends on: T001
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M16-plan-start-after-review.md
  - Depends on: T001, T002
- [TODO] T003 — Выпуск 0.8.3 (delivery)
  - Commit: chore: release 0.8.3
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M16-acceptance.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md
  - Depends on: T002, DOCS-R1

Digest: После ревью карточка выбора режима не прячется посторонней сессией канала, которой провайдер не числит за проектом; выбор режима не блокируется такой сессией; команды автопилота (выбор режима, запуск, доработка) передают projectId, поэтому после перезапуска службы агент будится сразу.

State changes only through `scripts/workflow` commands. History lives in Git.
