# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 37,
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
      "Возможности учитывают ОС, наличие expect и версию claude; status только читает (кэш по mtime ~/.claude.json)",
      "previewTrust перечисляет ключи и точки автозапуска папки; grantTrust проходит диалог под pty с WFK_SERVICE_SESSION=trust, копией ~/.claude.json до и проверкой после",
      "createSession: session.exp печатает SESSION_URL и pid дочернего claude; debug-файл — запасной источник; запись в sessions/claude.json по D9; имя «<проект> · <время>»",
      "Сессии из хука получают remoteId отложенно по bridge-session в transcript_path; без него — без ссылки с note; служебные сессии скрыты",
      "resumeSession поднимает тот же session id; stopSession останавливает только свой процесс по D9",
      "Особое действие проекта «Окружение папки» (запуск и остановка claude remote-control --spawn=same-dir) по D5 и D9",
      "Ссылки claude://claude.ai/code/session_<id> и https://claude.ai/code/session_<id>; тесты на подставном claude и фикстурах транскриптов",
      "Ручная проверка пользователем: Визуально: предпросмотр → «Доверять» → «доверено»; «Создать сессию» → открывается в Claude Desktop на Mac и в приложении Claude на iPad; после перезапуска serve сессия жива; окружение папки запускается и видно с iPad",
      "Тест cli/test/providers.test.ts не зависит от того, реализован ли провайдер: проверки заглушек и not-implemented идут на внедрённых провайдерах-заглушках (createApp({providers})), а для настоящих claude и codex проверяется только регистрация и раздел состояния — так реализация T007 его не ломает"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T16:51:38.981Z",
      "text": "Assignment m1-orchestrator-core-T006-1: task T006 of scope m1-orchestrator-core"
    },
    "baselineCommit": "903ba55bbe6b2615f6d8f3f480fefc6215152dca",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-providers.md",
        "required": true,
        "heading": "2. Claude"
      },
      {
        "path": "docs/planning/M1-orchestrator-core.md",
        "required": true,
        "heading": "3. Решения"
      }
    ],
    "decisions": [],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T006-1",
    "objective": "Провайдер Claude: Доверие, сессии Remote Control и окружение папки Claude из панели",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Возможности учитывают ОС, наличие expect и версию claude; status только читает (кэш по mtime ~/.claude.json)",
        "previewTrust перечисляет ключи и точки автозапуска папки; grantTrust проходит диалог под pty с WFK_SERVICE_SESSION=trust, копией ~/.claude.json до и проверкой после",
        "createSession: session.exp печатает SESSION_URL и pid дочернего claude; debug-файл — запасной источник; запись в sessions/claude.json по D9; имя «<проект> · <время>»",
        "Сессии из хука получают remoteId отложенно по bridge-session в transcript_path; без него — без ссылки с note; служебные сессии скрыты",
        "resumeSession поднимает тот же session id; stopSession останавливает только свой процесс по D9",
        "Особое действие проекта «Окружение папки» (запуск и остановка claude remote-control --spawn=same-dir) по D5 и D9",
        "Ссылки claude://claude.ai/code/session_<id> и https://claude.ai/code/session_<id>; тесты на подставном claude и фикстурах транскриптов",
        "Ручная проверка пользователем: Визуально: предпросмотр → «Доверять» → «доверено»; «Создать сессию» → открывается в Claude Desktop на Mac и в приложении Claude на iPad; после перезапуска serve сессия жива; окружение папки запускается и видно с iPad",
        "Тест cli/test/providers.test.ts не зависит от того, реализован ли провайдер: проверки заглушек и not-implemented идут на внедрённых провайдерах-заглушках (createApp({providers})), а для настоящих claude и codex проверяется только регистрация и раздел состояния — так реализация T007 его не ломает"
      ],
      "checks": [],
      "commitMessage": "feat: implement claude provider",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "2. Claude"
        },
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "3. Решения"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Провайдер Claude",
      "why": "Доверие, сессии Remote Control и окружение папки Claude из панели"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T006-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 37

## Objective

Провайдер Claude: Доверие, сессии Remote Control и окружение папки Claude из панели

## Acceptance

- Возможности учитывают ОС, наличие expect и версию claude; status только читает (кэш по mtime ~/.claude.json)
- previewTrust перечисляет ключи и точки автозапуска папки; grantTrust проходит диалог под pty с WFK_SERVICE_SESSION=trust, копией ~/.claude.json до и проверкой после
- createSession: session.exp печатает SESSION_URL и pid дочернего claude; debug-файл — запасной источник; запись в sessions/claude.json по D9; имя «<проект> · <время>»
- Сессии из хука получают remoteId отложенно по bridge-session в transcript_path; без него — без ссылки с note; служебные сессии скрыты
- resumeSession поднимает тот же session id; stopSession останавливает только свой процесс по D9
- Особое действие проекта «Окружение папки» (запуск и остановка claude remote-control --spawn=same-dir) по D5 и D9
- Ссылки claude://claude.ai/code/session_<id> и https://claude.ai/code/session_<id>; тесты на подставном claude и фикстурах транскриптов
- Ручная проверка пользователем: Визуально: предпросмотр → «Доверять» → «доверено»; «Создать сессию» → открывается в Claude Desktop на Mac и в приложении Claude на iPad; после перезапуска serve сессия жива; окружение папки запускается и видно с iPad
- Тест cli/test/providers.test.ts не зависит от того, реализован ли провайдер: проверки заглушек и not-implemented идут на внедрённых провайдерах-заглушках (createApp({providers})), а для настоящих claude и codex проверяется только регистрация и раздел состояния — так реализация T007 его не ломает

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T006 — Провайдер Claude (work, parallel-safe)
  - Commit: feat: implement claude provider
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
