# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 664,
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
      "POST …/sessions/:sid/message принимает до 20000 знаков; опция direct вернула true — ответ { sent: true } без очереди; false, ошибка или нет опции — { queued }",
      "Служба зовёт sendDirect только для сессии в состоянии waiting или неизвестной каналу, не зовёт для working, holding и провайдера с sendMessage; ошибка sendDirect пишется в журнал и ведёт в очередь",
      "Тесты покрывают маршрут и правило выбора пути; автопилот и ревью получают сообщения прежним путём",
      "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T07:41:56.697Z",
      "text": "Assignment m18-session-chat-T005-1: task T005 of scope m18-session-chat"
    },
    "baselineCommit": "1e61a8025c0eb25019413fcecbf1ad6b052bbf1d",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M18-session-chat.md",
        "required": true
      }
    ],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m18-session-chat-T005-1",
    "objective": "Отправка из панели: прямой путь и предел 20000: Задание из панели должно приходить агенту репликой пользователя, а не служебной фразой",
    "spec": "docs/planning/M18-session-chat.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "POST …/sessions/:sid/message принимает до 20000 знаков; опция direct вернула true — ответ { sent: true } без очереди; false, ошибка или нет опции — { queued }",
        "Служба зовёт sendDirect только для сессии в состоянии waiting или неизвестной каналу, не зовёт для working, holding и провайдера с sendMessage; ошибка sendDirect пишется в журнал и ведёт в очередь",
        "Тесты покрывают маршрут и правило выбора пути; автопилот и ревью получают сообщения прежним путём",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: send panel messages directly when the provider can take them",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/routes.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/direct-message.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Отправка из панели: прямой путь и предел 20000",
      "why": "Задание из панели должно приходить агенту репликой пользователя, а не служебной фразой"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m18-session-chat-T005-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 664

## Objective

Отправка из панели: прямой путь и предел 20000: Задание из панели должно приходить агенту репликой пользователя, а не служебной фразой

## Acceptance

- POST …/sessions/:sid/message принимает до 20000 знаков; опция direct вернула true — ответ { sent: true } без очереди; false, ошибка или нет опции — { queued }
- Служба зовёт sendDirect только для сессии в состоянии waiting или неизвестной каналу, не зовёт для working, holding и провайдера с sendMessage; ошибка sendDirect пишется в журнал и ведёт в очередь
- Тесты покрывают маршрут и правило выбора пути; автопилот и ревью получают сообщения прежним путём
- Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T005 — Отправка из панели: прямой путь и предел 20000 (work, parallel-safe)
  - Commit: feat: send panel messages directly when the provider can take them
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/routes.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/direct-message.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md

State changes only through `scripts/workflow` commands. History lives in Git.
