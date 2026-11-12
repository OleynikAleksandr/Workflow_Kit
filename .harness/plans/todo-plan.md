# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 678,
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
      "wfk hook stop|prompt|turn-end передаёт panelProcess: true при WFK_PANEL_SESSION=1, иначе false",
      "HookInput.panelProcess и SessionActivity.external (true, когда последний хук сессии пришёл без метки) есть в канале и в /api/state",
      "Для провайдера с marksPanelProcess и внешней сессии createDirectMessage не вызывает sendDirect, wakeIdle и пробуждение для ревью не вызывают wakeSession; сообщение остаётся в очереди",
      "Для провайдера без marksPanelProcess (ChatGPT, Kimi) и для сессии с меткой поведение как в 0.9.0 — проверено тестами",
      "module.md обоих модулей и cli/session-chat.md обновлены"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T10:13:41.284Z",
      "text": "Assignment m19-session-chat-fixes-T002-1: task T002 of scope m19-session-chat-fixes"
    },
    "baselineCommit": "f2305a8d206d3a3459f99907fe475642410abb01",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M19-session-chat-fixes.md",
        "required": true,
        "heading": "2. Решение"
      }
    ],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m19-session-chat-fixes-T002-1",
    "objective": "Хук и канал: внешняя сессия получает сообщения только из очереди: Прямая вставка и пробуждение печатали в копию сессии, а не в чат приложения",
    "spec": "docs/planning/M19-session-chat-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "wfk hook stop|prompt|turn-end передаёт panelProcess: true при WFK_PANEL_SESSION=1, иначе false",
        "HookInput.panelProcess и SessionActivity.external (true, когда последний хук сессии пришёл без метки) есть в канале и в /api/state",
        "Для провайдера с marksPanelProcess и внешней сессии createDirectMessage не вызывает sendDirect, wakeIdle и пробуждение для ревью не вызывают wakeSession; сообщение остаётся в очереди",
        "Для провайдера без marksPanelProcess (ChatGPT, Kimi) и для сессии с меткой поведение как в 0.9.0 — проверено тестами",
        "module.md обоих модулей и cli/session-chat.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: queue panel messages for a session another process runs",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M19-session-chat-fixes.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/routes.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/hook-service.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/direct-message.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-turn-end.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Хук и канал: внешняя сессия получает сообщения только из очереди",
      "why": "Прямая вставка и пробуждение печатали в копию сессии, а не в чат приложения"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m19-session-chat-fixes-T002-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 678

## Objective

Хук и канал: внешняя сессия получает сообщения только из очереди: Прямая вставка и пробуждение печатали в копию сессии, а не в чат приложения

## Acceptance

- wfk hook stop|prompt|turn-end передаёт panelProcess: true при WFK_PANEL_SESSION=1, иначе false
- HookInput.panelProcess и SessionActivity.external (true, когда последний хук сессии пришёл без метки) есть в канале и в /api/state
- Для провайдера с marksPanelProcess и внешней сессии createDirectMessage не вызывает sendDirect, wakeIdle и пробуждение для ревью не вызывают wakeSession; сообщение остаётся в очереди
- Для провайдера без marksPanelProcess (ChatGPT, Kimi) и для сессии с меткой поведение как в 0.9.0 — проверено тестами
- module.md обоих модулей и cli/session-chat.md обновлены

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T002 — Хук и канал: внешняя сессия получает сообщения только из очереди (work, parallel-safe)
  - Commit: fix: queue panel messages for a session another process runs
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/routes.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/hook-service.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/direct-message.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/direct-message.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-turn-end.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md

State changes only through `scripts/workflow` commands. History lives in Git.
