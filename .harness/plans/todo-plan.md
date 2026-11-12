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
      "readMessages берёт userMessage и agentMessage из thread/read с includeTurns, время — startedAtMs элемента; незагруженный чат читается и не загружается; отказ демона — chat-unavailable",
      "sendDirect без общего демона возвращает false; при статусе idle или notLoaded начинает ход самим текстом; при active возвращает false и не зовёт turn/start",
      "Тесты на подставном демоне покрывают чтение, время элемента, все ветки sendDirect и транспорт Windows",
      "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T07:41:59.918Z",
      "text": "Assignment m18-session-chat-T003-1: task T003 of scope m18-session-chat"
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
    "id": "assignment-m18-session-chat-T003-1",
    "objective": "ChatGPT: лента через thread/read и прямой ход: Диалог и прямая отправка для сессий ChatGPT",
    "spec": "docs/planning/M18-session-chat.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "readMessages берёт userMessage и agentMessage из thread/read с includeTurns, время — startedAtMs элемента; незагруженный чат читается и не загружается; отказ демона — chat-unavailable",
        "sendDirect без общего демона возвращает false; при статусе idle или notLoaded начинает ход самим текстом; при active возвращает false и не зовёт turn/start",
        "Тесты на подставном демоне покрывают чтение, время элемента, все ветки sendDirect и транспорт Windows",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: read Codex threads as a chat and start turns with panel messages",
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
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/thread-ops.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/chat.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "ChatGPT: лента через thread/read и прямой ход",
      "why": "Диалог и прямая отправка для сессий ChatGPT"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m18-session-chat-T003-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 664

## Objective

ChatGPT: лента через thread/read и прямой ход: Диалог и прямая отправка для сессий ChatGPT

## Acceptance

- readMessages берёт userMessage и agentMessage из thread/read с includeTurns, время — startedAtMs элемента; незагруженный чат читается и не загружается; отказ демона — chat-unavailable
- sendDirect без общего демона возвращает false; при статусе idle или notLoaded начинает ход самим текстом; при active возвращает false и не зовёт turn/start
- Тесты на подставном демоне покрывают чтение, время элемента, все ветки sendDirect и транспорт Windows
- Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T003 — ChatGPT: лента через thread/read и прямой ход (work, parallel-safe)
  - Commit: feat: read Codex threads as a chat and start turns with panel messages
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/thread-ops.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/chat.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md

State changes only through `scripts/workflow` commands. History lives in Git.
