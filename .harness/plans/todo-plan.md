# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 661,
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
      "Контракт провайдера имеет ChatMessage, ChatPage, необязательные readMessages и sendDirect, CHAT_PAGE_LIMIT 100 и CHAT_TEXT_MAX_CHARS 20000, как в разделе 2.1",
      "GET /api/projects/:id/providers/:p/sessions/:sid/messages отвечает supported false без метода, страницей сообщений, 404 unknown-session для чужой сессии и 502 с кодом и текстом ProviderError",
      "Маршрут обрезает тексты длиннее CHAT_TEXT_MAX_CHARS с пометкой; тесты покрывают все ответы маршрута; fake-provider имеет оба метода",
      "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md",
      "Тест публикации git-publish не наследует GIT_DIR, GIT_INDEX_FILE и GIT_WORK_TREE от хука коммита: коммит задачи из worktree не трогает индекс и настройки основного репозитория"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T07:38:07.130Z",
      "text": "Assignment m18-session-chat-T001-1: task T001 of scope m18-session-chat"
    },
    "baselineCommit": "8fa6d613b2c2f3d9c11fd970efaae038cd8346e2",
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
    "id": "assignment-m18-session-chat-T001-1",
    "objective": "Контракт диалога сессии и маршрут чтения: Провайдеры и панель должны опираться на один контракт чтения и прямой отправки",
    "spec": "docs/planning/M18-session-chat.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Контракт провайдера имеет ChatMessage, ChatPage, необязательные readMessages и sendDirect, CHAT_PAGE_LIMIT 100 и CHAT_TEXT_MAX_CHARS 20000, как в разделе 2.1",
        "GET /api/projects/:id/providers/:p/sessions/:sid/messages отвечает supported false без метода, страницей сообщений, 404 unknown-session для чужой сессии и 502 с кодом и текстом ProviderError",
        "Маршрут обрезает тексты длиннее CHAT_TEXT_MAX_CHARS с пометкой; тесты покрывают все ответы маршрута; fake-provider имеет оба метода",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md",
        "Тест публикации git-publish не наследует GIT_DIR, GIT_INDEX_FILE и GIT_WORK_TREE от хука коммита: коммит задачи из worktree не трогает индекс и настройки основного репозитория"
      ],
      "checks": [],
      "commitMessage": "feat: add the session chat contract and the messages route",
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
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/chat-routes.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/test/publication.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Контракт диалога сессии и маршрут чтения",
      "why": "Провайдеры и панель должны опираться на один контракт чтения и прямой отправки"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m18-session-chat-T001-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 661

## Objective

Контракт диалога сессии и маршрут чтения: Провайдеры и панель должны опираться на один контракт чтения и прямой отправки

## Acceptance

- Контракт провайдера имеет ChatMessage, ChatPage, необязательные readMessages и sendDirect, CHAT_PAGE_LIMIT 100 и CHAT_TEXT_MAX_CHARS 20000, как в разделе 2.1
- GET /api/projects/:id/providers/:p/sessions/:sid/messages отвечает supported false без метода, страницей сообщений, 404 unknown-session для чужой сессии и 502 с кодом и текстом ProviderError
- Маршрут обрезает тексты длиннее CHAT_TEXT_MAX_CHARS с пометкой; тесты покрывают все ответы маршрута; fake-provider имеет оба метода
- Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md
- Тест публикации git-publish не наследует GIT_DIR, GIT_INDEX_FILE и GIT_WORK_TREE от хука коммита: коммит задачи из worktree не трогает индекс и настройки основного репозитория

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Контракт диалога сессии и маршрут чтения (work)
  - Commit: feat: add the session chat contract and the messages route
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/chat-routes.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md, product-parts/backend-core/clusters/projects/modules/git-publish/test/publication.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
