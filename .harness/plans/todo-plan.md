# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 35,
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
      "Карточка провайдера: статус и версии CLI, доверие с предпросмотром (ключи и точки автозапуска) и подтверждением по токену, хуки Kit и чужие с командой и хешем, кнопка одобрения передаёт команду и хеш, список сессий, особые действия",
      "Недоступное показано с причиной; идущие операции блокируют свою кнопку и показывают ход",
      "Ссылка сессии выбирается по устройству: mobile при navigator.maxTouchPoints > 1, иначе desktop, web — запасная; сессия без ссылки показывает note",
      "Логика выбора ссылки и отображения состояний покрыта тестами node --test",
      "Ручная проверка пользователем: Визуально: на Mac и iPad в проекте две карточки (Claude, ChatGPT) с заглушками; сессии Claude из журнала хука видны в списке; на iPad вёрстка не ломается"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T16:18:46.378Z",
      "text": "Assignment m1-orchestrator-core-T005-1: task T005 of scope m1-orchestrator-core"
    },
    "baselineCommit": "ff1b51a2f934a00d1ebe47daca4f91bee21e6023",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-providers.md",
        "required": true,
        "heading": "1. Контракт провайдера"
      },
      {
        "path": "docs/planning/M1-orchestrator-core.md",
        "required": true,
        "heading": "10. HTTP API"
      }
    ],
    "decisions": [],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T005-1",
    "objective": "Общий интерфейс провайдеров в панели: Панель рисует любого провайдера из контракта, без кода под провайдера",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Карточка провайдера: статус и версии CLI, доверие с предпросмотром (ключи и точки автозапуска) и подтверждением по токену, хуки Kit и чужие с командой и хешем, кнопка одобрения передаёт команду и хеш, список сессий, особые действия",
        "Недоступное показано с причиной; идущие операции блокируют свою кнопку и показывают ход",
        "Ссылка сессии выбирается по устройству: mobile при navigator.maxTouchPoints > 1, иначе desktop, web — запасная; сессия без ссылки показывает note",
        "Логика выбора ссылки и отображения состояний покрыта тестами node --test",
        "Ручная проверка пользователем: Визуально: на Mac и iPad в проекте две карточки (Claude, ChatGPT) с заглушками; сессии Claude из журнала хука видны в списке; на iPad вёрстка не ломается"
      ],
      "checks": [],
      "commitMessage": "feat: add generic provider cards to the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "1. Контракт провайдера"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "10. HTTP API"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Общий интерфейс провайдеров в панели",
      "why": "Панель рисует любого провайдера из контракта, без кода под провайдера"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T005-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 35

## Objective

Общий интерфейс провайдеров в панели: Панель рисует любого провайдера из контракта, без кода под провайдера

## Acceptance

- Карточка провайдера: статус и версии CLI, доверие с предпросмотром (ключи и точки автозапуска) и подтверждением по токену, хуки Kit и чужие с командой и хешем, кнопка одобрения передаёт команду и хеш, список сессий, особые действия
- Недоступное показано с причиной; идущие операции блокируют свою кнопку и показывают ход
- Ссылка сессии выбирается по устройству: mobile при navigator.maxTouchPoints > 1, иначе desktop, web — запасная; сессия без ссылки показывает note
- Логика выбора ссылки и отображения состояний покрыта тестами node --test
- Ручная проверка пользователем: Визуально: на Mac и iPad в проекте две карточки (Claude, ChatGPT) с заглушками; сессии Claude из журнала хука видны в списке; на iPad вёрстка не ломается

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T005 — Общий интерфейс провайдеров в панели (work)
  - Commit: feat: add generic provider cards to the panel
  - Files: product-parts/control-panel/clusters/web-panel/modules/provider-cards, product-parts/control-panel/clusters/web-panel/modules/panel-shell, package.json, product-parts/backend-core/clusters/runtime/modules/cli

State changes only through `scripts/workflow` commands. History lives in Git.
