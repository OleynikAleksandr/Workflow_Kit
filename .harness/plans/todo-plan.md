# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 31,
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
      "Проект создаётся в корне проектов из config.json; имя проверяется по разделу 6 (без /, \\, .., ведущего -, зарезервированных имён Windows; NFC); тесты",
      "Открыть можно только папку внутри домашней по realpath (на Windows без учёта регистра); выход через .. и симлинки отклоняется; тесты",
      "GET /api/folders отдаёт подкаталоги; ошибка доступа (macOS TCC) показывается с подсказкой; поля ввода с autocapitalize=off и autocorrect=off",
      "DELETE убирает проект только из списка, папка остаётся",
      "projects.json пишется атомарно; события пишутся в events.jsonl с ротацией по 5 МБ",
      "Ручная проверка пользователем: Визуально: создать проект и открыть существующую папку выбором из списка на Mac и iPad; после перезапуска serve проекты на месте"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T15:36:39.681Z",
      "text": "Assignment m1-orchestrator-core-T002-1: task T002 of scope m1-orchestrator-core"
    },
    "baselineCommit": "8cd1c080e49e46415ed06908dec377653afe20e3",
    "blockedReason": null,
    "context": [
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
    "id": "assignment-m1-orchestrator-core-T002-1",
    "objective": "Реестр проектов и выбор папки: Проект — основная единица навигации панели",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Проект создаётся в корне проектов из config.json; имя проверяется по разделу 6 (без /, \\, .., ведущего -, зарезервированных имён Windows; NFC); тесты",
        "Открыть можно только папку внутри домашней по realpath (на Windows без учёта регистра); выход через .. и симлинки отклоняется; тесты",
        "GET /api/folders отдаёт подкаталоги; ошибка доступа (macOS TCC) показывается с подсказкой; поля ввода с autocapitalize=off и autocorrect=off",
        "DELETE убирает проект только из списка, папка остаётся",
        "projects.json пишется атомарно; события пишутся в events.jsonl с ротацией по 5 МБ",
        "Ручная проверка пользователем: Визуально: создать проект и открыть существующую папку выбором из списка на Mac и iPad; после перезапуска serve проекты на месте"
      ],
      "checks": [],
      "commitMessage": "feat: add project registry and folder picker",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/backend-core/clusters/http-api/modules/http-server",
        "product-parts/backend-core/clusters/projects/modules/project-registry",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/http-api/modules/http-server/module.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/router.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/server.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/test/server.test.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/errors.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/folders.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/home-paths.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/names.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/registry.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/routes.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/test/names.test.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/test/registry.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/module.md",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/events.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/index.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/mutex.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/test/events.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/api.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/controls.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/dom.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/folder-picker.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/projects-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Реестр проектов и выбор папки",
      "why": "Проект — основная единица навигации панели"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T002-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 31

## Objective

Реестр проектов и выбор папки: Проект — основная единица навигации панели

## Acceptance

- Проект создаётся в корне проектов из config.json; имя проверяется по разделу 6 (без /, \, .., ведущего -, зарезервированных имён Windows; NFC); тесты
- Открыть можно только папку внутри домашней по realpath (на Windows без учёта регистра); выход через .. и симлинки отклоняется; тесты
- GET /api/folders отдаёт подкаталоги; ошибка доступа (macOS TCC) показывается с подсказкой; поля ввода с autocapitalize=off и autocorrect=off
- DELETE убирает проект только из списка, папка остаётся
- projects.json пишется атомарно; события пишутся в events.jsonl с ротацией по 5 МБ
- Ручная проверка пользователем: Визуально: создать проект и открыть существующую папку выбором из списка на Mac и iPad; после перезапуска serve проекты на месте

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T002 — Реестр проектов и выбор папки (work)
  - Commit: feat: add project registry and folder picker
  - Files: product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/backend-core/clusters/http-api/modules/http-server, product-parts/backend-core/clusters/projects/modules/project-registry, product-parts/control-panel/clusters/web-panel/modules/panel-shell, package.json, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/http-api/modules/http-server/module.md, product-parts/backend-core/clusters/http-api/modules/http-server/src/router.ts, product-parts/backend-core/clusters/http-api/modules/http-server/src/server.ts, product-parts/backend-core/clusters/http-api/modules/http-server/test/server.test.ts, product-parts/backend-core/clusters/projects/modules/project-registry/module.md, product-parts/backend-core/clusters/projects/modules/project-registry/src/errors.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/folders.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/home-paths.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/index.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/names.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/registry.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/routes.ts, product-parts/backend-core/clusters/projects/modules/project-registry/test/names.test.ts, product-parts/backend-core/clusters/projects/modules/project-registry/test/registry.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts, product-parts/backend-core/clusters/runtime/modules/data-store/module.md, product-parts/backend-core/clusters/runtime/modules/data-store/src/events.ts, product-parts/backend-core/clusters/runtime/modules/data-store/src/index.ts, product-parts/backend-core/clusters/runtime/modules/data-store/src/mutex.ts, product-parts/backend-core/clusters/runtime/modules/data-store/test/events.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/api.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/cards.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/controls.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/dom.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/folder-picker.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/projects-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
