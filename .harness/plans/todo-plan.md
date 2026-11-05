# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 26,
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
      "bin/wfk.mjs проверяет Node >= 24 и загружает модуль cli; команды serve, open, install, uninstall, service, doctor, link, hook маршрутизируются (нереализованные отвечают «не реализовано»; заглушка службы — модуль service-installer)",
      "Каталоги данных выбираются по ОС (macOS, Linux с XDG, Windows %LOCALAPPDATA%) и создаются с правами 0700; WFK_DATA_DIR и WFK_PORT переопределяют их; тесты на три ОС",
      "Помощник атомарной записи JSON (tmp + rename) с тестом",
      "Фильтр доступа по D8: адрес клиента и локальный адрес сокета — loopback или Tailscale (IPv4 и IPv6), Host из списка, Origin изменяющих запросов совпадает с Host, тело JSON; иначе 403; тесты",
      "GET /api/health и GET /api/state (раздел «Система»: версия, ОС, каталог данных, статус службы из заглушки); / отдаёт панель с опросом раз в 3 с",
      "node_modules удалён из индекса git (git rm -r --cached node_modules; он попал туда коммитом QUALITY), .gitignore исключает node_modules/ вне блока Workflow Kit; зависимости ставятся npm ci",
      "Ручная проверка пользователем: Визуально: node bin/wfk.mjs serve; панель на http://127.0.0.1:4747/ и с iPad по адресу Tailscale без правки конфига; карточка «Система» показывает версию, ОС и каталог данных",
      "Создан скелет структуры product-parts: product-part.md каждой части и cluster.md каждого кластера из раздела 4 (назначение, модули, границы); package.json получает поле imports с #-алиасами для src/index.ts модулей, tsconfig.json включает product-parts/** и bin/**"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T15:33:20.054Z",
      "text": "Assignment m1-orchestrator-core-T001-1: task T001 of scope m1-orchestrator-core"
    },
    "baselineCommit": "be08cd817aa9e5ccfd2ea6063c2161c5bcf92cec",
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
    "id": "assignment-m1-orchestrator-core-T001-1",
    "objective": "Каркас бэкенда, фильтр доступа и панель-оболочка: Точка входа, HTTP-сервер с безопасным доступом с Mac и iPad и пустая панель, на которой наращиваются видимые функции",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "bin/wfk.mjs проверяет Node >= 24 и загружает модуль cli; команды serve, open, install, uninstall, service, doctor, link, hook маршрутизируются (нереализованные отвечают «не реализовано»; заглушка службы — модуль service-installer)",
        "Каталоги данных выбираются по ОС (macOS, Linux с XDG, Windows %LOCALAPPDATA%) и создаются с правами 0700; WFK_DATA_DIR и WFK_PORT переопределяют их; тесты на три ОС",
        "Помощник атомарной записи JSON (tmp + rename) с тестом",
        "Фильтр доступа по D8: адрес клиента и локальный адрес сокета — loopback или Tailscale (IPv4 и IPv6), Host из списка, Origin изменяющих запросов совпадает с Host, тело JSON; иначе 403; тесты",
        "GET /api/health и GET /api/state (раздел «Система»: версия, ОС, каталог данных, статус службы из заглушки); / отдаёт панель с опросом раз в 3 с",
        "node_modules удалён из индекса git (git rm -r --cached node_modules; он попал туда коммитом QUALITY), .gitignore исключает node_modules/ вне блока Workflow Kit; зависимости ставятся npm ci",
        "Ручная проверка пользователем: Визуально: node bin/wfk.mjs serve; панель на http://127.0.0.1:4747/ и с iPad по адресу Tailscale без правки конфига; карточка «Система» показывает версию, ОС и каталог данных",
        "Создан скелет структуры product-parts: product-part.md каждой части и cluster.md каждого кластера из раздела 4 (назначение, модули, границы); package.json получает поле imports с #-алиасами для src/index.ts модулей, tsconfig.json включает product-parts/** и bin/**"
      ],
      "checks": [],
      "commitMessage": "feat: add backend skeleton with access filter and panel shell",
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
        "bin",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        ".gitignore",
        "node_modules",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/runtime/modules/data-store",
        "product-parts/backend-core/clusters/http-api/modules/http-server",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/backend-core/product-part.md",
        "product-parts/provider-runtime/product-part.md",
        "product-parts/control-panel/product-part.md",
        "product-parts/system-service/product-part.md",
        "product-parts/backend-core/clusters/runtime/cluster.md",
        "product-parts/backend-core/clusters/http-api/cluster.md",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/provider-runtime/clusters/provider-contract/cluster.md",
        "product-parts/provider-runtime/clusters/provider-adapters/cluster.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/system-service/clusters/deployment/cluster.md",
        "bin/wfk.mjs",
        "product-parts/backend-core/clusters/http-api/modules/http-server/module.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/access.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/address.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/index.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/router.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/server.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/state.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/src/static.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/test/access.test.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/test/router.test.ts",
        "product-parts/backend-core/clusters/http-api/modules/http-server/test/server.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/system-info.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/commands.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/module.md",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/atomic.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/config.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/index.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/src/paths.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/test/atomic.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/test/config.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/data-store/test/paths.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/dom.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/styles.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/system-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Каркас бэкенда, фильтр доступа и панель-оболочка",
      "why": "Точка входа, HTTP-сервер с безопасным доступом с Mac и iPad и пустая панель, на которой наращиваются видимые функции"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T001-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 26

## Objective

Каркас бэкенда, фильтр доступа и панель-оболочка: Точка входа, HTTP-сервер с безопасным доступом с Mac и iPad и пустая панель, на которой наращиваются видимые функции

## Acceptance

- bin/wfk.mjs проверяет Node >= 24 и загружает модуль cli; команды serve, open, install, uninstall, service, doctor, link, hook маршрутизируются (нереализованные отвечают «не реализовано»; заглушка службы — модуль service-installer)
- Каталоги данных выбираются по ОС (macOS, Linux с XDG, Windows %LOCALAPPDATA%) и создаются с правами 0700; WFK_DATA_DIR и WFK_PORT переопределяют их; тесты на три ОС
- Помощник атомарной записи JSON (tmp + rename) с тестом
- Фильтр доступа по D8: адрес клиента и локальный адрес сокета — loopback или Tailscale (IPv4 и IPv6), Host из списка, Origin изменяющих запросов совпадает с Host, тело JSON; иначе 403; тесты
- GET /api/health и GET /api/state (раздел «Система»: версия, ОС, каталог данных, статус службы из заглушки); / отдаёт панель с опросом раз в 3 с
- node_modules удалён из индекса git (git rm -r --cached node_modules; он попал туда коммитом QUALITY), .gitignore исключает node_modules/ вне блока Workflow Kit; зависимости ставятся npm ci
- Ручная проверка пользователем: Визуально: node bin/wfk.mjs serve; панель на http://127.0.0.1:4747/ и с iPad по адресу Tailscale без правки конфига; карточка «Система» показывает версию, ОС и каталог данных
- Создан скелет структуры product-parts: product-part.md каждой части и cluster.md каждого кластера из раздела 4 (назначение, модули, границы); package.json получает поле imports с #-алиасами для src/index.ts модулей, tsconfig.json включает product-parts/** и bin/**

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Каркас бэкенда, фильтр доступа и панель-оболочка (work)
  - Commit: feat: add backend skeleton with access filter and panel shell
  - Files: bin, package.json, package-lock.json, tsconfig.json, .gitignore, node_modules, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/runtime/modules/data-store, product-parts/backend-core/clusters/http-api/modules/http-server, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/backend-core/product-part.md, product-parts/provider-runtime/product-part.md, product-parts/control-panel/product-part.md, product-parts/system-service/product-part.md, product-parts/backend-core/clusters/runtime/cluster.md, product-parts/backend-core/clusters/http-api/cluster.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/provider-runtime/clusters/provider-contract/cluster.md, product-parts/provider-runtime/clusters/provider-adapters/cluster.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/system-service/clusters/deployment/cluster.md, bin/wfk.mjs, product-parts/backend-core/clusters/http-api/modules/http-server/module.md, product-parts/backend-core/clusters/http-api/modules/http-server/src/access.ts, product-parts/backend-core/clusters/http-api/modules/http-server/src/address.ts, product-parts/backend-core/clusters/http-api/modules/http-server/src/index.ts, product-parts/backend-core/clusters/http-api/modules/http-server/src/router.ts, product-parts/backend-core/clusters/http-api/modules/http-server/src/server.ts, product-parts/backend-core/clusters/http-api/modules/http-server/src/state.ts, product-parts/backend-core/clusters/http-api/modules/http-server/src/static.ts, product-parts/backend-core/clusters/http-api/modules/http-server/test/access.test.ts, product-parts/backend-core/clusters/http-api/modules/http-server/test/router.test.ts, product-parts/backend-core/clusters/http-api/modules/http-server/test/server.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/system-info.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/commands.test.ts, product-parts/backend-core/clusters/runtime/modules/data-store/module.md, product-parts/backend-core/clusters/runtime/modules/data-store/src/atomic.ts, product-parts/backend-core/clusters/runtime/modules/data-store/src/config.ts, product-parts/backend-core/clusters/runtime/modules/data-store/src/index.ts, product-parts/backend-core/clusters/runtime/modules/data-store/src/paths.ts, product-parts/backend-core/clusters/runtime/modules/data-store/test/atomic.test.ts, product-parts/backend-core/clusters/runtime/modules/data-store/test/config.test.ts, product-parts/backend-core/clusters/runtime/modules/data-store/test/paths.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/cards.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/dom.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/styles.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/system-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
