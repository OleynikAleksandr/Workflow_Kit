# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 50,
  "rounds": [
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Исправления по приёмке вехи 1"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "После служебного хода (turn/completed или таймаут ожидания) createSession вызывает thread/unsubscribe {threadId} и только потом закрывает соединение; ошибка unsubscribe не ломает создание, но пишется в журнал",
      "Служебный ход не передаёт переопределения sandboxPolicy и approvalPolicy (как в проверенном прототипе), чтобы не менять настройки треда для дальнейшей работы пользователя в ChatGPT",
      "Тест на подставном демоне: после createSession тред отсутствует в thread/loaded/list подставного демона, порядок вызовов thread/start → thread/name/set → turn/start → thread/unsubscribe",
      "module.md provider-codex обновлён",
      "Ручная проверка пользователем: новая сессия Codex из панели сразу открывается в ChatGPT на Mac и iPad без сообщения «Этот чат открыт в другом приложении»"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T17:46:30.639Z",
      "text": "Assignment m1-orchestrator-core-T012-1: task T012 of scope m1-orchestrator-core"
    },
    "baselineCommit": "e9ea2832181b124f6bf80535e5621b475de23178",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/evidence/M1-acceptance.md",
        "required": true
      },
      {
        "path": "docs/planning/M1-providers.md",
        "required": true,
        "heading": "3. Codex"
      }
    ],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T012-1",
    "objective": "Codex отпускает тред после служебного хода: Приёмка: ChatGPT показал «Этот чат открыт в другом приложении» для сессии, созданной панелью (D1)",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "После служебного хода (turn/completed или таймаут ожидания) createSession вызывает thread/unsubscribe {threadId} и только потом закрывает соединение; ошибка unsubscribe не ломает создание, но пишется в журнал",
        "Служебный ход не передаёт переопределения sandboxPolicy и approvalPolicy (как в проверенном прототипе), чтобы не менять настройки треда для дальнейшей работы пользователя в ChatGPT",
        "Тест на подставном демоне: после createSession тред отсутствует в thread/loaded/list подставного демона, порядок вызовов thread/start → thread/name/set → turn/start → thread/unsubscribe",
        "module.md provider-codex обновлён",
        "Ручная проверка пользователем: новая сессия Codex из панели сразу открывается в ChatGPT на Mac и iPad без сообщения «Этот чат открыт в другом приложении»"
      ],
      "checks": [],
      "commitMessage": "fix: release the codex thread after the service turn",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M1-acceptance.md",
          "required": true
        },
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "3. Codex"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts"
      ],
      "fixes": null,
      "id": "T012",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R2",
      "status": "DONE",
      "title": "Codex отпускает тред после служебного хода",
      "why": "Приёмка: ChatGPT показал «Этот чат открыт в другом приложении» для сессии, созданной панелью (D1)"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T012-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 50

## Objective

Codex отпускает тред после служебного хода: Приёмка: ChatGPT показал «Этот чат открыт в другом приложении» для сессии, созданной панелью (D1)

## Acceptance

- После служебного хода (turn/completed или таймаут ожидания) createSession вызывает thread/unsubscribe {threadId} и только потом закрывает соединение; ошибка unsubscribe не ломает создание, но пишется в журнал
- Служебный ход не передаёт переопределения sandboxPolicy и approvalPolicy (как в проверенном прототипе), чтобы не менять настройки треда для дальнейшей работы пользователя в ChatGPT
- Тест на подставном демоне: после createSession тред отсутствует в thread/loaded/list подставного демона, порядок вызовов thread/start → thread/name/set → turn/start → thread/unsubscribe
- module.md provider-codex обновлён
- Ручная проверка пользователем: новая сессия Codex из панели сразу открывается в ChatGPT на Mac и iPad без сообщения «Этот чат открыт в другом приложении»

## Rounds

### R2 — Исправления по приёмке вехи 1 (fixes, OPEN)

- [DONE] T012 — Codex отпускает тред после служебного хода (work, parallel-safe)
  - Commit: fix: release the codex thread after the service turn
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
