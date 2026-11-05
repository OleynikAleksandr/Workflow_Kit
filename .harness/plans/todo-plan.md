# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 42,
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
      "status только читает: pid-файл и initialize по сокету демона с кэшем; ошибка токена — с подсказкой «выполните codex login»; запуск демона — особое действие",
      "previewTrust показывает trust_level и чужие хуки; запись через codex app-server с копией ~/.codex/config.toml до и проверкой после",
      "approveHooks одобряет только хук Kit при точном совпадении команды и хеша; чужие хуки не одобряются; тест",
      "createSession: thread/start, thread/name/set, служебный turn/start с безопасными sandbox и approval (параметры проверены на устройстве и записаны в контракт модуля); запись в sessions/codex.json",
      "listSessions: журнал хука + записи панели, названия из session_index.jsonl; неодобренный хук — note «список неполон»; ссылка codex://threads/<id>",
      "Windows — возможности недоступны с причиной; тесты на подставном JSON-RPC сервере и фикстурах",
      "Ручная проверка пользователем: Визуально: статус демона; доверие с предпросмотром; «Одобрить хук» с командой и хешем; «Создать сессию» → открывается в ChatGPT на Mac и на iPad"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T16:56:50.906Z",
      "text": "Assignment m1-orchestrator-core-T007-1: task T007 of scope m1-orchestrator-core"
    },
    "baselineCommit": "d84e1ce4d05ee246880c6829fdc3cfe76ddbf0e4",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-providers.md",
        "required": true,
        "heading": "3. Codex"
      },
      {
        "path": "docs/planning/M1-orchestrator-core.md",
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
    "id": "assignment-m1-orchestrator-core-T007-1",
    "objective": "Провайдер Codex: Демон, доверие, одобрение хука Kit и сессии Codex из панели",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "status только читает: pid-файл и initialize по сокету демона с кэшем; ошибка токена — с подсказкой «выполните codex login»; запуск демона — особое действие",
        "previewTrust показывает trust_level и чужие хуки; запись через codex app-server с копией ~/.codex/config.toml до и проверкой после",
        "approveHooks одобряет только хук Kit при точном совпадении команды и хеша; чужие хуки не одобряются; тест",
        "createSession: thread/start, thread/name/set, служебный turn/start с безопасными sandbox и approval (параметры проверены на устройстве и записаны в контракт модуля); запись в sessions/codex.json",
        "listSessions: журнал хука + записи панели, названия из session_index.jsonl; неодобренный хук — note «список неполон»; ссылка codex://threads/<id>",
        "Windows — возможности недоступны с причиной; тесты на подставном JSON-RPC сервере и фикстурах",
        "Ручная проверка пользователем: Визуально: статус демона; доверие с предпросмотром; «Одобрить хук» с командой и хешем; «Создать сессию» → открывается в ChatGPT на Mac и на iPad"
      ],
      "checks": [],
      "commitMessage": "feat: implement codex provider",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "3. Codex"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/hooks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/rpc.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/stdio.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/trust.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/ws.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/files-hooks.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fixtures/fake-codex.mjs",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/ws-rpc.test.ts"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Провайдер Codex",
      "why": "Демон, доверие, одобрение хука Kit и сессии Codex из панели"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T007-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 42

## Objective

Провайдер Codex: Демон, доверие, одобрение хука Kit и сессии Codex из панели

## Acceptance

- status только читает: pid-файл и initialize по сокету демона с кэшем; ошибка токена — с подсказкой «выполните codex login»; запуск демона — особое действие
- previewTrust показывает trust_level и чужие хуки; запись через codex app-server с копией ~/.codex/config.toml до и проверкой после
- approveHooks одобряет только хук Kit при точном совпадении команды и хеша; чужие хуки не одобряются; тест
- createSession: thread/start, thread/name/set, служебный turn/start с безопасными sandbox и approval (параметры проверены на устройстве и записаны в контракт модуля); запись в sessions/codex.json
- listSessions: журнал хука + записи панели, названия из session_index.jsonl; неодобренный хук — note «список неполон»; ссылка codex://threads/<id>
- Windows — возможности недоступны с причиной; тесты на подставном JSON-RPC сервере и фикстурах
- Ручная проверка пользователем: Визуально: статус демона; доверие с предпросмотром; «Одобрить хук» с командой и хешем; «Создать сессию» → открывается в ChatGPT на Mac и на iPad

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T007 — Провайдер Codex (work, parallel-safe)
  - Commit: feat: implement codex provider
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/codex-files.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/hooks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/rpc.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/stdio.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/trust.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/ws.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/files-hooks.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fixtures/fake-codex.mjs, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/helpers.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/ws-rpc.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
