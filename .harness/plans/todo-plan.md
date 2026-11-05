# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 31,
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
      "Контракт раздела 1 документа провайдеров описан типами; реестр по строковому id содержит claude и codex (заглушки со статусом «не реализовано»)",
      "Помощник readHookSessions(project, client) читает журнал хука; итоговый список строит провайдер, сервер не фильтрует",
      "Маршруты раздела 10 (предпросмотр и доверие по токену, одобрение хука по команде и хешу, сессии, особые действия, refresh) работают через контракт; тесты с подставным провайдером",
      "Мьютекс на проект и провайдера; долгие действия — операции с operationId и состоянием в /api/state; повторный запуск того же действия во время операции не создаёт второе",
      "Утилиты процессов по D5 и D9: отдельная группа, вывод в файл, очистка CLAUDE*, запись pid, времени старта, командной строки и boot id; остановка TERM → ожидание → проверка → KILL только после сверки; тесты",
      "Действия провайдеров (доверие, одобрение, создание) пишутся в events.jsonl",
      "Ручная проверка пользователем: Визуально: в «Системе» и в проекте видны провайдеры claude и codex со статусом «не реализовано»; сессии Claude, начатые в Desktop в папке проекта, видны в /api/state по журналу хука"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T16:01:59.684Z",
      "text": "Assignment m1-orchestrator-core-T004-1: task T004 of scope m1-orchestrator-core"
    },
    "baselineCommit": "59abed172cedd264f00f86735aedb6477462c6aa",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-providers.md",
        "required": true,
        "heading": "1. Контракт провайдера"
      },
      {
        "path": "docs/planning/M1-orchestrator-core.md",
        "required": true
      }
    ],
    "decisions": [],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T004-1",
    "objective": "Контракт провайдера, API, операции и утилиты процессов: Общий контракт и общие механизмы позволяют реализовать провайдеров без правок сервера и панели",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Контракт раздела 1 документа провайдеров описан типами; реестр по строковому id содержит claude и codex (заглушки со статусом «не реализовано»)",
        "Помощник readHookSessions(project, client) читает журнал хука; итоговый список строит провайдер, сервер не фильтрует",
        "Маршруты раздела 10 (предпросмотр и доверие по токену, одобрение хука по команде и хешу, сессии, особые действия, refresh) работают через контракт; тесты с подставным провайдером",
        "Мьютекс на проект и провайдера; долгие действия — операции с operationId и состоянием в /api/state; повторный запуск того же действия во время операции не создаёт второе",
        "Утилиты процессов по D5 и D9: отдельная группа, вывод в файл, очистка CLAUDE*, запись pid, времени старта, командной строки и boot id; остановка TERM → ожидание → проверка → KILL только после сверки; тесты",
        "Действия провайдеров (доверие, одобрение, создание) пишутся в events.jsonl",
        "Ручная проверка пользователем: Визуально: в «Системе» и в проекте видны провайдеры claude и codex со статусом «не реализовано»; сессии Claude, начатые в Desktop в папке проекта, видны в /api/state по журналу хука"
      ],
      "checks": [],
      "commitMessage": "feat: add provider contract, registry, operations and process utilities",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "1. Контракт провайдера"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor",
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/backend-core/clusters/http-api/modules/http-server",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Контракт провайдера, API, операции и утилиты процессов",
      "why": "Общий контракт и общие механизмы позволяют реализовать провайдеров без правок сервера и панели"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T004-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 31

## Objective

Контракт провайдера, API, операции и утилиты процессов: Общий контракт и общие механизмы позволяют реализовать провайдеров без правок сервера и панели

## Acceptance

- Контракт раздела 1 документа провайдеров описан типами; реестр по строковому id содержит claude и codex (заглушки со статусом «не реализовано»)
- Помощник readHookSessions(project, client) читает журнал хука; итоговый список строит провайдер, сервер не фильтрует
- Маршруты раздела 10 (предпросмотр и доверие по токену, одобрение хука по команде и хешу, сессии, особые действия, refresh) работают через контракт; тесты с подставным провайдером
- Мьютекс на проект и провайдера; долгие действия — операции с operationId и состоянием в /api/state; повторный запуск того же действия во время операции не создаёт второе
- Утилиты процессов по D5 и D9: отдельная группа, вывод в файл, очистка CLAUDE*, запись pid, времени старта, командной строки и boot id; остановка TERM → ожидание → проверка → KILL только после сверки; тесты
- Действия провайдеров (доверие, одобрение, создание) пишутся в events.jsonl
- Ручная проверка пользователем: Визуально: в «Системе» и в проекте видны провайдеры claude и codex со статусом «не реализовано»; сессии Claude, начатые в Desktop в папке проекта, видны в /api/state по журналу хука

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T004 — Контракт провайдера, API, операции и утилиты процессов (work)
  - Commit: feat: add provider contract, registry, operations and process utilities
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor, product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/backend-core/clusters/http-api/modules/http-server, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, package.json, product-parts/backend-core/clusters/runtime/modules/cli

State changes only through `scripts/workflow` commands. History lives in Git.
