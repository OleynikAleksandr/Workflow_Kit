# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 47,
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
      "Доверие для Remote Control определяется точным ключом папки в ~/.claude.json; если доверена родительская папка (например ~), панель показывает это отдельной пометкой («интерактивный Claude не спросит, Remote Control требует доверия папки»)",
      "grantTrust больше не проходит диалоги под pty: после предпросмотра и подтверждения по токену он атомарно записывает projects[<папка>].hasTrustDialogAccepted=true в ~/.claude.json с копией до записи, перечитывает файл и при потере записи из-за параллельной записи Claude повторяет до 3 раз; trust.exp удалён",
      "Предпросмотр находит внешние импорты CLAUDE.md, которые Claude загрузит для папки, включая CLAUDE.md родительских папок (например ~/CLAUDE.md → ~/AGENTS.md) и .claude/rules; если они есть, предпросмотр содержит обязательный выбор «разрешить / запретить внешние импорты», а запись ставит hasClaudeMdExternalIncludesApproved по выбору пользователя и hasClaudeMdExternalIncludesWarningShown=true",
      "Контракт: TrustPreview.choices (id, title, description, options, required) и grantTrust(project, token, choices); маршрут POST …/trust принимает {token, choices}; карточка провайдера рисует выбор и не отправляет «Доверять» без обязательного ответа — без кода под конкретного провайдера",
      "session.exp и environment.exp никогда не нажимают клавиши в диалогах: известные диалоги (доверие, внешние импорты) распознаются по точному тексту, процесс останавливается, операция завершается ошибкой с текстом диалога и подсказкой «решите это в предпросмотре доверия»; любой другой диалог — то же с кодом unknown-dialog",
      "Тесты на подставном claude: диалог импортов при создании сессии, доверие через запись файла, выбор импортов, доверенная родительская папка, потеря записи и повтор; тесты cli и карточек обновлены",
      "module.md provider-claude, provider-registry, provider-cards и факты раздела 2 в docs/planning/M1-providers.md обновлены (проверено 2026-11-05: доверие ~ подавляет диалог доверия для вложенных папок; диалог внешних импортов)",
      "Ручная проверка пользователем: предпросмотр доверия Claude для проекта под ~ показывает пометку о родительской папке и выбор про внешние импорты; после «Доверять» карточка показывает «доверено», ~/.claude.json содержит ключ проекта"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T17:27:09.822Z",
      "text": "Assignment m1-orchestrator-core-T011-1: task T011 of scope m1-orchestrator-core"
    },
    "baselineCommit": "bddd02807009485d11039a66ef681ff2303dc9e0",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/evidence/M1-acceptance.md",
        "required": true
      },
      {
        "path": "docs/planning/M1-providers.md",
        "required": true,
        "heading": "2. Claude"
      }
    ],
    "decisions": [],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T011-1",
    "objective": "Доверие Claude без подмены решений пользователя: Приёмка: скрипт доверия выбрал «Yes, allow external imports» вместо пользователя и не записал доверие; при доверенной домашней папке Claude не показывает диалог доверия (D2, D3)",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Доверие для Remote Control определяется точным ключом папки в ~/.claude.json; если доверена родительская папка (например ~), панель показывает это отдельной пометкой («интерактивный Claude не спросит, Remote Control требует доверия папки»)",
        "grantTrust больше не проходит диалоги под pty: после предпросмотра и подтверждения по токену он атомарно записывает projects[<папка>].hasTrustDialogAccepted=true в ~/.claude.json с копией до записи, перечитывает файл и при потере записи из-за параллельной записи Claude повторяет до 3 раз; trust.exp удалён",
        "Предпросмотр находит внешние импорты CLAUDE.md, которые Claude загрузит для папки, включая CLAUDE.md родительских папок (например ~/CLAUDE.md → ~/AGENTS.md) и .claude/rules; если они есть, предпросмотр содержит обязательный выбор «разрешить / запретить внешние импорты», а запись ставит hasClaudeMdExternalIncludesApproved по выбору пользователя и hasClaudeMdExternalIncludesWarningShown=true",
        "Контракт: TrustPreview.choices (id, title, description, options, required) и grantTrust(project, token, choices); маршрут POST …/trust принимает {token, choices}; карточка провайдера рисует выбор и не отправляет «Доверять» без обязательного ответа — без кода под конкретного провайдера",
        "session.exp и environment.exp никогда не нажимают клавиши в диалогах: известные диалоги (доверие, внешние импорты) распознаются по точному тексту, процесс останавливается, операция завершается ошибкой с текстом диалога и подсказкой «решите это в предпросмотре доверия»; любой другой диалог — то же с кодом unknown-dialog",
        "Тесты на подставном claude: диалог импортов при создании сессии, доверие через запись файла, выбор импортов, доверенная родительская папка, потеря записи и повтор; тесты cli и карточек обновлены",
        "module.md provider-claude, provider-registry, provider-cards и факты раздела 2 в docs/planning/M1-providers.md обновлены (проверено 2026-11-05: доверие ~ подавляет диалог доверия для вложенных папок; диалог внешних импортов)",
        "Ручная проверка пользователем: предпросмотр доверия Claude для проекта под ~ показывает пометку о родительской папке и выбор про внешние импорты; после «Доверять» карточка показывает «доверено», ~/.claude.json содержит ключ проекта"
      ],
      "checks": [],
      "commitMessage": "fix: grant claude trust explicitly and ask about external imports",
      "confirmation": null,
      "context": [
        {
          "path": "docs/evidence/M1-acceptance.md",
          "required": true
        },
        {
          "path": "docs/planning/M1-providers.md",
          "required": true,
          "heading": "2. Claude"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards",
        "docs/planning/M1-providers.md"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Доверие Claude без подмены решений пользователя",
      "why": "Приёмка: скрипт доверия выбрал «Yes, allow external imports» вместо пользователя и не записал доверие; при доверенной домашней папке Claude не показывает диалог доверия (D2, D3)"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T011-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 47

## Objective

Доверие Claude без подмены решений пользователя: Приёмка: скрипт доверия выбрал «Yes, allow external imports» вместо пользователя и не записал доверие; при доверенной домашней папке Claude не показывает диалог доверия (D2, D3)

## Acceptance

- Доверие для Remote Control определяется точным ключом папки в ~/.claude.json; если доверена родительская папка (например ~), панель показывает это отдельной пометкой («интерактивный Claude не спросит, Remote Control требует доверия папки»)
- grantTrust больше не проходит диалоги под pty: после предпросмотра и подтверждения по токену он атомарно записывает projects[<папка>].hasTrustDialogAccepted=true в ~/.claude.json с копией до записи, перечитывает файл и при потере записи из-за параллельной записи Claude повторяет до 3 раз; trust.exp удалён
- Предпросмотр находит внешние импорты CLAUDE.md, которые Claude загрузит для папки, включая CLAUDE.md родительских папок (например ~/CLAUDE.md → ~/AGENTS.md) и .claude/rules; если они есть, предпросмотр содержит обязательный выбор «разрешить / запретить внешние импорты», а запись ставит hasClaudeMdExternalIncludesApproved по выбору пользователя и hasClaudeMdExternalIncludesWarningShown=true
- Контракт: TrustPreview.choices (id, title, description, options, required) и grantTrust(project, token, choices); маршрут POST …/trust принимает {token, choices}; карточка провайдера рисует выбор и не отправляет «Доверять» без обязательного ответа — без кода под конкретного провайдера
- session.exp и environment.exp никогда не нажимают клавиши в диалогах: известные диалоги (доверие, внешние импорты) распознаются по точному тексту, процесс останавливается, операция завершается ошибкой с текстом диалога и подсказкой «решите это в предпросмотре доверия»; любой другой диалог — то же с кодом unknown-dialog
- Тесты на подставном claude: диалог импортов при создании сессии, доверие через запись файла, выбор импортов, доверенная родительская папка, потеря записи и повтор; тесты cli и карточек обновлены
- module.md provider-claude, provider-registry, provider-cards и факты раздела 2 в docs/planning/M1-providers.md обновлены (проверено 2026-11-05: доверие ~ подавляет диалог доверия для вложенных папок; диалог внешних импортов)
- Ручная проверка пользователем: предпросмотр доверия Claude для проекта под ~ показывает пометку о родительской папке и выбор про внешние импорты; после «Доверять» карточка показывает «доверено», ~/.claude.json содержит ключ проекта

## Rounds

### R2 — Исправления по приёмке вехи 1 (fixes, OPEN)

- [TODO] T011 — Доверие Claude без подмены решений пользователя (work)
  - Commit: fix: grant claude trust explicitly and ask about external imports
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/control-panel/clusters/web-panel/modules/provider-cards, docs/planning/M1-providers.md

State changes only through `scripts/workflow` commands. History lives in Git.
