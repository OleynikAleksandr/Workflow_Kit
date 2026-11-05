# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 49,
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
    "delivery": "READY_FOR_ACCEPTANCE",
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
        "docs/planning/M1-providers.md",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards/src/card-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards/src/provider-cards.css",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards/src/provider-cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards/src/render.js",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards/test/card-model.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/claude-config.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/config-writer.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/environment.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/imports.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/dialogs.tcl",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/environment.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/trust.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/trust.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/config.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/fake-claude.mjs",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/trust.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Доверие Claude без подмены решений пользователя",
      "why": "Приёмка: скрипт доверия выбрал «Yes, allow external imports» вместо пользователя и не записал доверие; при доверенной домашней папке Claude не показывает диалог доверия (D2, D3)"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T011-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 49

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

- [DONE] T011 — Доверие Claude без подмены решений пользователя (work)
  - Commit: fix: grant claude trust explicitly and ask about external imports
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/control-panel/clusters/web-panel/modules/provider-cards, docs/planning/M1-providers.md, product-parts/control-panel/clusters/web-panel/modules/provider-cards/module.md, product-parts/control-panel/clusters/web-panel/modules/provider-cards/src/card-model.js, product-parts/control-panel/clusters/web-panel/modules/provider-cards/src/provider-cards.css, product-parts/control-panel/clusters/web-panel/modules/provider-cards/src/provider-cards.js, product-parts/control-panel/clusters/web-panel/modules/provider-cards/src/render.js, product-parts/control-panel/clusters/web-panel/modules/provider-cards/test/card-model.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/claude-config.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/config-writer.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/environment.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/imports.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/dialogs.tcl, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/environment.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/trust.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/trust.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/config.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/fixtures/fake-claude.mjs, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/trust.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/fake-provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
