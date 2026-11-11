# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-11T11:00:43.337Z",
    "scopeId": "m13-windows-shared-daemon"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 604,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "project-registry: allowedRoots, resolveInsideRoots, FolderListing.roots, ошибка outside-roots вместо outside-home",
          "provider-codex: ProviderError daemon-elevated, проверка elevation в diagnoseWindows",
          "git-publish: gitExecOptions с windowsHide",
          "service-installer: windowsLauncherHint, Chrome первым на Windows",
          "panel-shell: folder-roots.js rootState, folder-picker allowDriveRoot, showsAdminStep"
        ],
        "decisions": [
          "Windows: на системном диске разрешена только домашняя папка, другие диски — целиком",
          "macOS: тома /Volumes без загрузочного; Linux: /media/<user>, /run/media/<user>, /mnt",
          "Диск, не ответивший за 1,5 с, пропускается; корни кэшируются на 5 с",
          "Выключенный UAC: вердикт broken и состояние error провайдера, Kit настройку пользователя не меняет",
          "Подключение ChatGPT засчитывается при работающем демоне и ssh.exe старше 15 с"
        ],
        "references": [
          "docs/planning/M14-windows-fixes.md",
          "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
          "docs/installation.md"
        ],
        "result": "Исправлены находки живой проверки 0.8.0 на Windows: git без мелькающих окон, выключенный UAC назван причиной, «Работает» только при работающем демоне, аккуратная карточка общего доступа, панель в Chrome, подсказка про wfk, папка проектов на любом локальном диске."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Пока открыта панель на Windows, окна терминала не мелькают",
      "При выключенном UAC Kit называет причину и что сделать в статусе ChatGPT, карточке и wfk doctor",
      "«Работает» появляется только после настоящего подключения приложения ChatGPT при работающем демоне",
      "Карточка общего доступа: блок администратора только в нужных состояниях, команда не обрезается, текст с точкой, заметка операции не зависает",
      "На Windows панель открывается в Chrome, если он установлен; после установки понятно, как запустить wfk",
      "Папку проектов можно выбрать на другом диске (Windows), томе (macOS) или в /media и /mnt (Linux)",
      "CI зелёный на macOS, Linux, Windows x64 и ARM64; живые проверки записаны в документе приёмки"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-11T15:18:44.384Z",
      "text": "Пользователь, 2026-11-11: «Я открываю скоп и Еще два замечания. Первое. Можно ли Workflow Kit открывать не в Edge, а в Chrome? И второй при выборе диска папки, вернее, в которую писать проекты, присутствует только диск C. А нужно иметь выбор любого диска.» | Execution mode chosen by the user: sequential: Поэтому, выполняя работу последовательно, собери, пожалуйста, новый релиз."
    },
    "baselineCommit": "bc56d12ded8d5a1eae5e3d1b6b42b31ea58aa475",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M14-windows-fixes.md",
        "required": true
      },
      {
        "path": "docs/evidence/M13-acceptance.md",
        "required": false,
        "heading": "Находки живой проверки на Windows (2026-11-11, виртуальная машина Windows 11, администратор)"
      }
    ],
    "decisions": [
      {
        "at": "2026-11-11T15:18:44.384Z",
        "text": "Kit не меняет UAC и терминал по умолчанию сам: называет причину и что сделать"
      },
      {
        "at": "2026-11-11T15:18:44.384Z",
        "text": "На системном диске Windows проекты по-прежнему только внутри домашней папки; другие диски — целиком"
      },
      {
        "at": "2026-11-11T15:18:44.384Z",
        "text": "Подключение ChatGPT засчитывается только при работающем демоне; на Windows — процесс ssh.exe не моложе 15 с"
      },
      {
        "at": "2026-11-11T15:18:44.384Z",
        "text": "Выпуск — 0.8.1"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "e9c04a9c-cd7c-4f6c-b4f7-f6b07802530e",
      "strategy": "sequential"
    },
    "id": "m14-windows-fixes",
    "objective": "Исправить находки живой проверки 0.8.0 на Windows и замечания пользователя: окна git не мелькают, UAC и ложное «Работает» названы верно, карточка общего доступа аккуратна, панель открывается в Chrome, папку проектов можно выбрать на любом диске",
    "spec": "docs/planning/M14-windows-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "runGit запускает git с windowsHide: true; тест проверяет параметры execFile",
        "module.md git-publish обновлён"
      ],
      "checks": [],
      "commitMessage": "fix: hide the console windows of git on Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M14-windows-fixes.md",
          "required": true,
          "heading": "2.1. Мелькающие окна `git` (находка 8)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/git.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/test/publication.test.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/module.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/index.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Окна git скрыты на Windows",
      "why": "Служба раз в 30 с запускает git без windowsHide, Windows Terminal мелькает"
    },
    {
      "acceptance": [
        "browserPlan на win32: chrome.exe раньше msedge.exe; тест с подставленной платформой",
        "Итог установки на Windows напоминает про новое окно терминала и печатает прямую команду wfk.cmd",
        "module.md service-installer обновлён"
      ],
      "checks": [],
      "commitMessage": "fix: open the panel in Chrome on Windows and explain the new wfk command",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M14-windows-fixes.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/open.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/run.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/control.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Chrome первым на Windows; сообщение о wfk после установки",
      "why": "Пользователь хочет панель в Chrome; команда wfk не находилась в открытом Windows Terminal"
    },
    {
      "acceptance": [
        "startDaemon: daemon-elevated с причиной и подсказкой про UAC",
        "Проверка elevation (EnableLUA) и вердикт broken на win32",
        "connectionSeenAt пишется только при работающем демоне; на Windows ssh.exe не моложе 15 с",
        "Тесты с подставленной платформой; module.md и shared-access.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: name a disabled UAC and count only real ChatGPT connections",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M14-windows-fixes.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/elevation.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-windows.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/elevation.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-machine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows-setup.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "UAC и правило подключения ChatGPT",
      "why": "При выключенном UAC демон не поднимается молча; Kit принимал неудачную попытку приложения за подключение"
    },
    {
      "acceptance": [
        "Блок администратора только в needs-admin-setup, broken и not-configured со скриптом отката",
        "Команда переносится по ширине",
        "Причина и подсказка через точку",
        "Заметка операции исчезает после её окончания",
        "Тесты модели; module.md panel-shell обновлён"
      ],
      "checks": [],
      "commitMessage": "fix: tidy the shared access card",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M14-windows-fixes.md",
          "required": true,
          "heading": "2.4. Карточка «Общий доступ к чатам» (находки 3–6)"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/styles.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/shared-access-model.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Карточка общего доступа",
      "why": "Находки 3–6: лишний блок администратора, обрезанная команда, нет точки, зависшая заметка"
    },
    {
      "acceptance": [
        "allowedRoots и resolveInsideRoots для win32, darwin и linux с подставленной файловой системой",
        "GET /api/folders отдаёт roots; выбор папки переключает корни",
        "Создание и открытие проекта и мастер принимают пути других дисков; системный диск Windows — только домашняя папка",
        "module.md project-registry, project-setup, panel-shell обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: choose the projects folder on any local drive",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M14-windows-fixes.md",
          "required": true,
          "heading": "2.7. Папка проектов на любом диске (замечание 2)"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/project-registry",
        "product-parts/backend-core/clusters/projects/modules/project-setup",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/errors.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/folders.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/home-paths.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/registry.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/src/roots.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/test/registry.test.ts",
        "product-parts/backend-core/clusters/projects/modules/project-registry/test/roots.test.ts",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/src/preview.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/controls.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/folder-picker.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/folder-roots.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/settings.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/folder-roots.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Папка проектов на любом диске",
      "why": "Пользователь хочет хранить проекты не только на диске C"
    },
    {
      "acceptance": [
        "README: UAC включён — требование Windows; панель в Chrome; папка проектов на любом диске",
        "docs/installation.md: «Запускатель и PATH» про Windows Terminal, неполадка UAC, матрица ОС"
      ],
      "checks": [],
      "commitMessage": "docs: describe UAC, the panel browser and project drives",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/installation.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "README и руководство",
      "why": "Пользователь Windows должен знать про UAC, Chrome, диски и команду wfk"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R1",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "T004",
        "T005",
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M14-windows-fixes.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/module.md",
        "docs/installation.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Версия 0.8.1, CHANGELOG, документ приёмки M14 с живыми проверками по ОС",
        "CI зелёный на macOS, Linux, Windows x64 и ARM64 на ветке ci/m14-windows-fixes",
        "Служба переустановлена на macOS"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.8.1",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T006",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M14-acceptance.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Релиз 0.8.1",
      "why": "Выпустить исправления для проверки на Windows"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m14-windows-fixes (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 7/8
- Revision: 604

## Objective

Исправить находки живой проверки 0.8.0 на Windows и замечания пользователя: окна git не мелькают, UAC и ложное «Работает» названы верно, карточка общего доступа аккуратна, панель открывается в Chrome, папку проектов можно выбрать на любом диске

## Acceptance

- Пока открыта панель на Windows, окна терминала не мелькают
- При выключенном UAC Kit называет причину и что сделать в статусе ChatGPT, карточке и wfk doctor
- «Работает» появляется только после настоящего подключения приложения ChatGPT при работающем демоне
- Карточка общего доступа: блок администратора только в нужных состояниях, команда не обрезается, текст с точкой, заметка операции не зависает
- На Windows панель открывается в Chrome, если он установлен; после установки понятно, как запустить wfk
- Папку проектов можно выбрать на другом диске (Windows), томе (macOS) или в /media и /mnt (Linux)
- CI зелёный на macOS, Linux, Windows x64 и ARM64; живые проверки записаны в документе приёмки

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Окна git скрыты на Windows (work, parallel-safe)
  - Commit: fix: hide the console windows of git on Windows
  - Files: product-parts/backend-core/clusters/projects/modules/git-publish/src/git.ts, product-parts/backend-core/clusters/projects/modules/git-publish/test/publication.test.ts, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, product-parts/backend-core/clusters/projects/modules/git-publish/src/index.ts
- [DONE] T002 — Chrome первым на Windows; сообщение о wfk после установки (work)
  - Commit: fix: open the panel in Chrome on Windows and explain the new wfk command
  - Files: product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/open.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/run.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/control.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts
- [DONE] T003 — UAC и правило подключения ChatGPT (work)
  - Commit: fix: name a disabled UAC and count only real ChatGPT connections
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/elevation.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-windows.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/elevation.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-machine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows-setup.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows.test.ts
- [DONE] T004 — Карточка общего доступа (work)
  - Commit: fix: tidy the shared access card
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/styles.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/shared-access-model.test.ts
  - Depends on: T003
- [DONE] T005 — Папка проектов на любом диске (work)
  - Commit: feat: choose the projects folder on any local drive
  - Files: product-parts/backend-core/clusters/projects/modules/project-registry, product-parts/backend-core/clusters/projects/modules/project-setup, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/projects/modules/project-registry/module.md, product-parts/backend-core/clusters/projects/modules/project-registry/src/errors.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/folders.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/home-paths.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/index.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/registry.ts, product-parts/backend-core/clusters/projects/modules/project-registry/src/roots.ts, product-parts/backend-core/clusters/projects/modules/project-registry/test/registry.test.ts, product-parts/backend-core/clusters/projects/modules/project-registry/test/roots.test.ts, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/projects/modules/project-setup/src/preview.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/controls.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/folder-picker.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/folder-roots.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/settings.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/folder-roots.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts
  - Depends on: T004
- [DONE] T006 — README и руководство (work)
  - Commit: docs: describe UAC, the panel browser and project drives
  - Files: README.md, docs/installation.md
  - Depends on: T005
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M14-windows-fixes.md, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, docs/installation.md
  - Depends on: T001, T002, T003, T004, T005, T006
- [TODO] T007 — Релиз 0.8.1 (delivery)
  - Commit: chore: release 0.8.1
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M14-acceptance.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md
  - Depends on: T006, DOCS-R1

Digest: Исправлены находки живой проверки 0.8.0 на Windows: git без мелькающих окон, выключенный UAC назван причиной, «Работает» только при работающем демоне, аккуратная карточка общего доступа, панель в Chrome, подсказка про wfk, папка проектов на любом локальном диске.

State changes only through `scripts/workflow` commands. History lives in Git.
