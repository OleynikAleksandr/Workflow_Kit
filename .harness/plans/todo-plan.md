# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 44,
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
      "cli передаёт install, uninstall, service start/stop/status, open и doctor [--installed] в service-installer с контекстом (env, homedir, платформа, исполнитель); тесты cli используют подставные эффекты и никогда не трогают настоящий HOME, LaunchAgents и автозапуск",
      "Карточка «Система» показывает установленную версию, экземпляр (установка или разработка), способ и состояние автозапуска, запускатель, значок и найденные пути программ",
      "Путь к node для службы устойчив к обновлению Homebrew: вместо версионного пути Cellar берётся node из login PATH с тем же realpath (например /opt/homebrew/opt/node@24/bin/node или /opt/homebrew/bin/node); тест",
      "module.md модулей cli, panel-shell и service-installer обновлены; product-part.md и cluster.md части system-service больше не называют установщик заглушкой",
      "Ручная проверка пользователем: WFK_DATA_DIR=<временный каталог> WFK_PORT=<порт> node bin/wfk.mjs install, затем open — панель в окне без вкладок, «Система» показывает службу и пути программ",
      "node_modules удалён из индекса git (git rm -r --cached node_modules; Kit 2.2.1 это коммитит); дублирующая строка node_modules/ вне блока Workflow Kit в .gitignore убрана (блок Kit уже её содержит); файлы на диске остаются"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T16:58:03.669Z",
      "text": "Assignment m1-orchestrator-core-T010-1: task T010 of scope m1-orchestrator-core"
    },
    "baselineCommit": "3e8b8817fd4b99b66f6df3b0ed8e87693818ca79",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M1-orchestrator-core.md",
        "required": true,
        "heading": "9. Установщик, запуск и автозапуск"
      }
    ],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T010-1",
    "objective": "Подключение установщика к cli и панели: T008 не мог менять cli и панель: команды install, uninstall, service, open, doctor пока отвечают заглушкой, а «Система» не показывает автозапуск и программы",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "cli передаёт install, uninstall, service start/stop/status, open и doctor [--installed] в service-installer с контекстом (env, homedir, платформа, исполнитель); тесты cli используют подставные эффекты и никогда не трогают настоящий HOME, LaunchAgents и автозапуск",
        "Карточка «Система» показывает установленную версию, экземпляр (установка или разработка), способ и состояние автозапуска, запускатель, значок и найденные пути программ",
        "Путь к node для службы устойчив к обновлению Homebrew: вместо версионного пути Cellar берётся node из login PATH с тем же realpath (например /opt/homebrew/opt/node@24/bin/node или /opt/homebrew/bin/node); тест",
        "module.md модулей cli, panel-shell и service-installer обновлены; product-part.md и cluster.md части system-service больше не называют установщик заглушкой",
        "Ручная проверка пользователем: WFK_DATA_DIR=<временный каталог> WFK_PORT=<порт> node bin/wfk.mjs install, затем open — панель в окне без вкладок, «Система» показывает службу и пути программ",
        "node_modules удалён из индекса git (git rm -r --cached node_modules; Kit 2.2.1 это коммитит); дублирующая строка node_modules/ вне блока Workflow Kit в .gitignore убрана (блок Kit уже её содержит); файлы на диске остаются"
      ],
      "checks": [],
      "commitMessage": "fix: wire the service installer into the cli and panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M1-orchestrator-core.md",
          "required": true,
          "heading": "9. Установщик, запуск и автозапуск"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/system-service/product-part.md",
        "product-parts/system-service/clusters/deployment/cluster.md",
        "node_modules",
        ".gitignore",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/commands.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/system-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/fs.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/programs.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/node-path.test.ts"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Подключение установщика к cli и панели",
      "why": "T008 не мог менять cli и панель: команды install, uninstall, service, open, doctor пока отвечают заглушкой, а «Система» не показывает автозапуск и программы"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T010-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 44

## Objective

Подключение установщика к cli и панели: T008 не мог менять cli и панель: команды install, uninstall, service, open, doctor пока отвечают заглушкой, а «Система» не показывает автозапуск и программы

## Acceptance

- cli передаёт install, uninstall, service start/stop/status, open и doctor [--installed] в service-installer с контекстом (env, homedir, платформа, исполнитель); тесты cli используют подставные эффекты и никогда не трогают настоящий HOME, LaunchAgents и автозапуск
- Карточка «Система» показывает установленную версию, экземпляр (установка или разработка), способ и состояние автозапуска, запускатель, значок и найденные пути программ
- Путь к node для службы устойчив к обновлению Homebrew: вместо версионного пути Cellar берётся node из login PATH с тем же realpath (например /opt/homebrew/opt/node@24/bin/node или /opt/homebrew/bin/node); тест
- module.md модулей cli, panel-shell и service-installer обновлены; product-part.md и cluster.md части system-service больше не называют установщик заглушкой
- Ручная проверка пользователем: WFK_DATA_DIR=<временный каталог> WFK_PORT=<порт> node bin/wfk.mjs install, затем open — панель в окне без вкладок, «Система» показывает службу и пути программ
- node_modules удалён из индекса git (git rm -r --cached node_modules; Kit 2.2.1 это коммитит); дублирующая строка node_modules/ вне блока Workflow Kit в .gitignore убрана (блок Kit уже её содержит); файлы на диске остаются

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T010 — Подключение установщика к cli и панели (work)
  - Commit: fix: wire the service installer into the cli and panel
  - Files: product-parts/backend-core/clusters/runtime/modules/cli, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/system-service/product-part.md, product-parts/system-service/clusters/deployment/cluster.md, node_modules, .gitignore, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/commands.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/system-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/fs.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/programs.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/fakes.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/node-path.test.ts

State changes only through `scripts/workflow` commands. History lives in Git.
