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
      "readMessages читает транскрипт по пути из журнала хука инкрементно и отдаёт последние сообщения по правилам раздела 2.2 (реплики строкой и частями; без tool_result, isMeta, isSidechain, служебных тегов, thinking и tool_use)",
      "sendDirect пишет управляющий файл вида text и очищенный текст, идёт по очереди на сессию, возвращает false для сессии не под управлением панели и когда файл не забрали за 5 с",
      "session.exp и pty/host.ts печатают текст вставкой ESC[200~ … ESC[201~, затем Enter и строку MESSAGE_SENT; содержимое wake даёт прежнюю служебную фразу",
      "Тесты покрывают разбор строк, дозапись, разорванную строку, замену файла, предел страницы, очистку текста и host.ts с подставленной платформой win32",
      "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T07:41:57.181Z",
      "text": "Assignment m18-session-chat-T002-1: task T002 of scope m18-session-chat"
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
    "id": "assignment-m18-session-chat-T002-1",
    "objective": "Claude: лента из транскрипта и вставка текста в терминал: Диалог и прямая отправка для сессий Claude",
    "spec": "docs/planning/M18-session-chat.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "readMessages читает транскрипт по пути из журнала хука инкрементно и отдаёт последние сообщения по правилам раздела 2.2 (реплики строкой и частями; без tool_result, isMeta, isSidechain, служебных тегов, thinking и tool_use)",
        "sendDirect пишет управляющий файл вида text и очищенный текст, идёт по очереди на сессию, возвращает false для сессии не под управлением панели и когда файл не забрали за 5 с",
        "session.exp и pty/host.ts печатают текст вставкой ESC[200~ … ESC[201~, затем Enter и строку MESSAGE_SENT; содержимое wake даёт прежнюю служебную фразу",
        "Тесты покрывают разбор строк, дозапись, разорванную строку, замену файла, предел страницы, очистку текста и host.ts с подставленной платформой win32",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: read the Claude transcript as a chat and paste panel messages",
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
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/chat.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Claude: лента из транскрипта и вставка текста в терминал",
      "why": "Диалог и прямая отправка для сессий Claude"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m18-session-chat-T002-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 664

## Objective

Claude: лента из транскрипта и вставка текста в терминал: Диалог и прямая отправка для сессий Claude

## Acceptance

- readMessages читает транскрипт по пути из журнала хука инкрементно и отдаёт последние сообщения по правилам раздела 2.2 (реплики строкой и частями; без tool_result, isMeta, isSidechain, служебных тегов, thinking и tool_use)
- sendDirect пишет управляющий файл вида text и очищенный текст, идёт по очереди на сессию, возвращает false для сессии не под управлением панели и когда файл не забрали за 5 с
- session.exp и pty/host.ts печатают текст вставкой ESC[200~ … ESC[201~, затем Enter и строку MESSAGE_SENT; содержимое wake даёт прежнюю служебную фразу
- Тесты покрывают разбор строк, дозапись, разорванную строку, замену файла, предел страницы, очистку текста и host.ts с подставленной платформой win32
- Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T002 — Claude: лента из транскрипта и вставка текста в терминал (work, parallel-safe)
  - Commit: feat: read the Claude transcript as a chat and paste panel messages
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/chat.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md

State changes only through `scripts/workflow` commands. History lives in Git.
