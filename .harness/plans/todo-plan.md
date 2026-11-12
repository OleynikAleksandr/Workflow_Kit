# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 663,
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
      "Модуль session-chat имеет index.ts с sessionChatMount, чистую модель chat-model.js, расширение session-chat.js со слотом sessionChat и стили, как в разделе 2.6",
      "Карточка «Диалог» показывает ленту, строку об обрезке, состояние supported false и ошибку чтения, поле ввода с кнопкой «Отправить» и отправкой по Ctrl+Enter и ⌘+Enter; текст в DOM — только через textContent",
      "Опрос идёт при открытии экрана сессии и раз в 3 с, пока экран открыт и вкладка видима, не больше одного запроса на сессию; введённый текст и прокрутка переживают опрос",
      "Тесты покрывают mergePage, sendOutcome, адреса запросов и подписи; module.md описывает модуль и раздел «Поведение на ОС»"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T07:46:37.516Z",
      "text": "Assignment m18-session-chat-T006-1: task T006 of scope m18-session-chat"
    },
    "baselineCommit": "97cfa33bf3ec711061f231e119854ca458d0b378",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M18-session-chat.md",
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
    "id": "assignment-m18-session-chat-T006-1",
    "objective": "Модуль панели session-chat: лента и поле ввода: Экрану сессии нужна карточка диалога",
    "spec": "docs/planning/M18-session-chat.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Модуль session-chat имеет index.ts с sessionChatMount, чистую модель chat-model.js, расширение session-chat.js со слотом sessionChat и стили, как в разделе 2.6",
        "Карточка «Диалог» показывает ленту, строку об обрезке, состояние supported false и ошибку чтения, поле ввода с кнопкой «Отправить» и отправкой по Ctrl+Enter и ⌘+Enter; текст в DOM — только через textContent",
        "Опрос идёт при открытии экрана сессии и раз в 3 с, пока экран открыт и вкладка видима, не больше одного запроса на сессию; введённый текст и прокрутка переживают опрос",
        "Тесты покрывают mergePage, sendOutcome, адреса запросов и подписи; module.md описывает модуль и раздел «Поведение на ОС»"
      ],
      "checks": [],
      "commitMessage": "feat: add the session chat panel module",
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
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/index.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/chat-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Модуль панели session-chat: лента и поле ввода",
      "why": "Экрану сессии нужна карточка диалога"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m18-session-chat-T006-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 663

## Objective

Модуль панели session-chat: лента и поле ввода: Экрану сессии нужна карточка диалога

## Acceptance

- Модуль session-chat имеет index.ts с sessionChatMount, чистую модель chat-model.js, расширение session-chat.js со слотом sessionChat и стили, как в разделе 2.6
- Карточка «Диалог» показывает ленту, строку об обрезке, состояние supported false и ошибку чтения, поле ввода с кнопкой «Отправить» и отправкой по Ctrl+Enter и ⌘+Enter; текст в DOM — только через textContent
- Опрос идёт при открытии экрана сессии и раз в 3 с, пока экран открыт и вкладка видима, не больше одного запроса на сессию; введённый текст и прокрутка переживают опрос
- Тесты покрывают mergePage, sendOutcome, адреса запросов и подписи; module.md описывает модуль и раздел «Поведение на ОС»

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T006 — Модуль панели session-chat: лента и поле ввода (work, parallel-safe)
  - Commit: feat: add the session chat panel module
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat/src/index.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/chat-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/chat-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md

State changes only through `scripts/workflow` commands. History lives in Git.
