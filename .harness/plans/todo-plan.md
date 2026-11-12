# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 670,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-registry: ChatMessage, ChatPage, CHAT_PAGE_LIMIT 100, CHAT_TEXT_MAX_CHARS 20000; Provider.readMessages?(project, sid, { limit }) и Provider.sendDirect?(project, sid, text) → boolean.",
          "GET /api/projects/:id/providers/:p/sessions/:sid/messages → { supported, messages, truncated }; чужая сессия 404 unknown-session, ProviderError 502.",
          "POST /api/projects/:id/sessions/:sid/message { text } до 20000 → { sent: true } (опция direct) или { queued: <id> }.",
          "panel-shell: слот sessionChat под sessionBody (session-screen.js); cli монтирует /session-chat/, алиас #session-chat.",
          "Claude <debug>.message: «text» и текст — вставка ESC[200~…ESC[201~, Enter, MESSAGE_SENT; иначе WAKE_TEXT и WOKEN."
        ],
        "decisions": [
          "Пользователь: диалог любой сессии в панели с полем ввода; родные приложения не меняются; интерфейс — рабочий минимум.",
          "Пользователь: план выполняют субагенты на Opus 5.5 с усилием medium, спецификация и план без ревью.",
          "Прямая отправка — только ждущему агенту или сессии, не виденной каналом с запуска; working, holding и Kimi — очередь канала.",
          "ChatGPT: turn/steer не используется; при active turn/start не зовётся — текст в очередь, ответом хука Stop.",
          "Обрезку текстов (20 000) и предел страницы (100) делает маршрут provider-registry, не провайдер.",
          "Исполнители: типы в chat.ts, маршрут в chat-routes.ts, экран в session-screen.js, прямой путь в cli/direct-message.ts, лента Kimi в provider-kimi/chat.ts.",
          "Исполнители (Claude): файл пишется атомарно, очистка убирает и C1, wakeSession не перезаписывает ждущий файл, без транскрипта — пустая страница.",
          "Известные ограничения: редкий повтор у Claude при тайм-ауте; панель без авторизации отдаёт переписку целиком."
        ],
        "references": [
          "docs/planning/M18-session-chat.md",
          "docs/architecture/OVERVIEW.md",
          "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/chat.md",
          "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
          "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md"
        ],
        "result": "Экран любой сессии получил карточку «Диалог»: лента реплик от провайдера (Claude — транскрипт, ChatGPT — thread/read, Kimi — сервер) и поле до 20 000 знаков; ждущему агенту текст уходит сразу, иначе — в очередь канала. Модуль session-chat, слот sessionChat; тест git-publish больше не портит репозиторий."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Project-wide documents describe the round result",
      "The round digest records result, decisions, contracts and references"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T07:58:16.644Z",
      "text": "Assignment m18-session-chat-DOCS-R1-1: task DOCS-R1 of scope m18-session-chat"
    },
    "baselineCommit": "cd65096dc53f9db2cf2d6eb1445e47b989e7c458",
    "blockedReason": null,
    "context": [],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m18-session-chat-DOCS-R1-1",
    "objective": "Reconcile project documentation and write the round digest: Keep the project context current for the next agent and close the round.",
    "spec": "docs/planning/M18-session-chat.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R1",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M18-session-chat.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/chat.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/control-panel/product-part.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m18-session-chat-DOCS-R1-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 670

## Objective

Reconcile project documentation and write the round digest: Keep the project context current for the next agent and close the round.

## Acceptance

- Project-wide documents describe the round result
- The round digest records result, decisions, contracts and references

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M18-session-chat.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/chat.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/control-panel/product-part.md

Digest: Экран любой сессии получил карточку «Диалог»: лента реплик от провайдера (Claude — транскрипт, ChatGPT — thread/read, Kimi — сервер) и поле до 20 000 знаков; ждущему агенту текст уходит сразу, иначе — в очередь канала. Модуль session-chat, слот sessionChat; тест git-publish больше не портит репозиторий.

State changes only through `scripts/workflow` commands. History lives in Git.
