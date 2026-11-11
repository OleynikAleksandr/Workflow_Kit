# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-11T10:23:37.224Z",
    "scopeId": "m12-codex-shared-daemon"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 588,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "SharedAccessStateName: + needs-admin-setup",
          "SharedAccessState.admin: SharedAccessAdminStep | null (purpose, file, command, text)",
          "provider-codex: shared-plan.ts buildPlan; shared-windows.ts windowsVerdict, checksText; shared-windows-setup.ts adminScript, adminRollbackScript, adminCommand, openInAppScript",
          "unsupportedReason('win32') = null; open('remote-login') на Windows — not-supported",
          "panel-shell: sharedButtons copy-command/show-script, adminNote, removeConfirm"
        ],
        "decisions": [
          "Kit не повышает права: скрипт администратора пишет Kit, запускает пользователь",
          "Режим на Windows включают проверки (active), а не версия Kit",
          "Администратор определяется по whoami /groups (S-1-5-32-544); его ключ пишет скрипт в administrators_authorized_keys",
          "Скрипт: UTF-8 с BOM, CRLF, только ASCII; откат снимает DefaultShell и ключ, sshd остаётся",
          "Собственный app-server приложения в WindowsApps\\OpenAI.Codex не считается вторым"
        ],
        "references": [
          "docs/planning/M13-windows-shared-daemon.md",
          "docs/evidence/M13-windows-probe.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
          "docs/installation.md#общий-доступ-к-чатам-chatgpt"
        ],
        "result": "Windows: общий доступ ChatGPT через SSH — диагностика, настройка Kit (ключ, ~/.ssh/config, профиль Git Bash, authorized_keys) и скрипт администратора (sshd, DefaultShell = sh.exe Git, ключ администратора), состояние needs-admin-setup, откат скриптом; режим сессий и ссылки с hostId — общий код M12; карточка показывает скрипт и копирует команду; README и руководство описывают Windows."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "На Windows карточка «Общий доступ к чатам» называет точное состояние по каждой проверке (sshd, DefaultShell, файлы Kit, SSH-проверка, подключение приложения)",
      "Kit пишет на Windows ключ, ~/.ssh/config, профиль Git Bash и скрипт администратора после предпросмотра; «Убрать настройку» откатывает всё, включая скрипт отката",
      "После пробы на Windows сессия ChatGPT открывается одновременно в Kit, в ChatGPT на Windows и на iPad; ревьюер ChatGPT виден — либо, если проба не проходит, режим остаётся unsupported с причиной в карточке и документе приёмки",
      "macOS работает как в 0.7.0, Linux — unsupported",
      "README и docs/installation.md описывают настройку на Windows",
      "CI зелёный на macOS, Linux, Windows x64 и ARM64; живая проверка на Windows записана в документе приёмки"
    ],
    "acceptanceNote": {
      "at": "2026-11-11T11:00:35.259Z",
      "text": "Понимаю и залей обновленную версию на GitHub. И закрываем этот скоб. Дальше будем заниматься тестированием и исправлением того, что найдем."
    },
    "approval": {
      "at": "2026-11-11T10:27:38.541Z",
      "text": "Пользователь, 2026-11-11: «нам обязательно нужно выделить скоп для решения проблем Windows. Чтобы работа ChatGPT и там была через SSH.» | Execution mode chosen by the user: sequential: Пользователь в чате на вопрос «Режим выполнения плана M13 для Windows?»: «Последовательно»"
    },
    "baselineCommit": "cc2f406a459b78a8b7a22163f9e5db42917110e1",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M13-windows-shared-daemon.md",
        "required": true
      },
      {
        "path": "docs/planning/M12-codex-shared-daemon.md",
        "required": true,
        "heading": "2. Решение"
      },
      {
        "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-11T10:27:38.541Z",
        "text": "Kit не повышает права: шаги администратора — скрипт PowerShell, который запускает пользователь"
      },
      {
        "at": "2026-11-11T10:27:38.541Z",
        "text": "Оболочка SSH-сеанса на Windows — sh.exe Git for Windows (DefaultShell), потому что удалённая команда ChatGPT POSIX"
      },
      {
        "at": "2026-11-11T10:27:38.541Z",
        "text": "Режим на Windows включается только проверками; без подтверждённой пробы — unsupported с причиной"
      },
      {
        "at": "2026-11-11T10:27:38.541Z",
        "text": "WSL как SSH-цель не рассматривается"
      }
    ],
    "delivery": "ACCEPTED",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "e9c04a9c-cd7c-4f6c-b4f7-f6b07802530e",
      "strategy": "sequential"
    },
    "id": "m13-windows-shared-daemon",
    "objective": "ChatGPT на Windows 11 работает через общий демон Codex по SSH, как на macOS: Kit делает всё без прав администратора, шаги администратора — один скрипт, который запускает пользователь",
    "spec": "docs/planning/M13-windows-shared-daemon.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "На win32 state() проверяет по порядку codex и приложение, службу sshd, DefaultShell Git, файлы Kit, SSH-проверку, подключение и второй app-server по CIM; каждая неудача — своя причина",
        "Без подтверждённой пробы итог на Windows — unsupported с текстом «проверено / не проверено»",
        "wfk doctor на Windows печатает те же строки",
        "docs/evidence/M13-windows-probe.md — шаги для проверяющего по пунктам 2.1 спецификации",
        "Тесты с подставленной платформой win32; macOS и linux без изменений; allowlist обновлён"
      ],
      "checks": [],
      "commitMessage": "feat: diagnose the shared ChatGPT access on Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "tools/platform-guard/allowlist.json",
        "docs/evidence/M13-windows-probe.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-windows.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-access.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/control.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Диагностика общего доступа на Windows и документ пробы",
      "why": "Схему на Windows надо проверить по шагам; проверяющему нужны точные причины"
    },
    {
      "acceptance": [
        "Предпросмотр на win32 перечисляет ключ, ~/.ssh/config, профиль Git Bash, authorized_keys (обычный пользователь) и скрипт администратора",
        "Скрипт администратора ставит и запускает sshd, задаёт DefaultShell на sh.exe Git, для администратора пишет administrators_authorized_keys с правами SYSTEM и Administrators",
        "Состояние needs-admin-setup, когда файлы Kit на месте, а шагов администратора нет",
        "«Убрать настройку» убирает записи Kit и пишет скрипт отката администратора",
        "Тесты с подставленной платформой; module.md обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: set up the shared ChatGPT access on Windows with an administrator script",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "tools/platform-guard/allowlist.json",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-plan.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-windows-setup.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-windows.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-access.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-machine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows-setup.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/shared-access.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Настройка на Windows: файлы Kit и скрипт администратора",
      "why": "Пользователь не должен настраивать SSH на Windows руками"
    },
    {
      "acceptance": [
        "В режиме на win32 — ссылки с hostId, создание без выгрузки, wakeSession, ревьюер первым сообщением (общий код M12)",
        "open-link на Windows передаёт ссылку с hostId пакету OpenAI.Codex без потери параметра",
        "Карточка показывает needs-admin-setup: текст и путь скрипта, команда запуска для копирования, «Перепроверить»",
        "Тесты с подставленной платформой; module.md обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: run ChatGPT sessions through the shared daemon on Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/shared-access-model.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-mode.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-mode.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows-setup.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Сессии и ссылки на Windows; шаг администратора в карточке",
      "why": "Режим общего демона должен работать на Windows так же, как на macOS"
    },
    {
      "acceptance": [
        "README шаг 4, п. 5: блок Windows — Git for Windows, «Настроить», скрипт от имени администратора, подключение в ChatGPT, удаление",
        "docs/installation.md: файлы Windows, скрипт и откат, неполадки, строка матрицы ОС"
      ],
      "checks": [],
      "commitMessage": "docs: describe the shared ChatGPT access setup on Windows",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/installation.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "README и инструкция по установке для Windows",
      "why": "Пользователь Windows должен знать, что делает Kit и что запускает он сам"
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
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M13-windows-shared-daemon.md",
        "docs/evidence/M13-windows-probe.md",
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
        "Версия 0.8.0, CHANGELOG, документ приёмки с итогом пробы на Windows и живыми проверками по ОС",
        "CI зелёный на macOS, Linux, Windows x64 и ARM64 на ветке ci/m13-windows-shared-daemon",
        "Служба переустановлена на macOS; проверяющий на Windows прошёл живую проверку раздела 4"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.8.0",
      "confirmation": "Да, выпускай 0.8.0",
      "context": [],
      "dependencies": [
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M13-acceptance.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Релиз 0.8.0",
      "why": "Релиз 0.8.0"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m13-windows-shared-daemon (ACTIVE)
- Delivery: ACCEPTED
- Execution: sequential
- Current task: none
- Progress: 6/6
- Revision: 588

## Objective

ChatGPT на Windows 11 работает через общий демон Codex по SSH, как на macOS: Kit делает всё без прав администратора, шаги администратора — один скрипт, который запускает пользователь

## Acceptance

- На Windows карточка «Общий доступ к чатам» называет точное состояние по каждой проверке (sshd, DefaultShell, файлы Kit, SSH-проверка, подключение приложения)
- Kit пишет на Windows ключ, ~/.ssh/config, профиль Git Bash и скрипт администратора после предпросмотра; «Убрать настройку» откатывает всё, включая скрипт отката
- После пробы на Windows сессия ChatGPT открывается одновременно в Kit, в ChatGPT на Windows и на iPad; ревьюер ChatGPT виден — либо, если проба не проходит, режим остаётся unsupported с причиной в карточке и документе приёмки
- macOS работает как в 0.7.0, Linux — unsupported
- README и docs/installation.md описывают настройку на Windows
- CI зелёный на macOS, Linux, Windows x64 и ARM64; живая проверка на Windows записана в документе приёмки

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Диагностика общего доступа на Windows и документ пробы (work)
  - Commit: feat: diagnose the shared ChatGPT access on Windows
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/system-service/clusters/deployment/modules/service-installer, tools/platform-guard/allowlist.json, docs/evidence/M13-windows-probe.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-windows.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-access.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/context.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/control.test.ts
- [DONE] T002 — Настройка на Windows: файлы Kit и скрипт администратора (work)
  - Commit: feat: set up the shared ChatGPT access on Windows with an administrator script
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, tools/platform-guard/allowlist.json, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-access.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-plan.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-windows-setup.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-windows.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-access.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-machine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows-setup.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/shared-access.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts
  - Depends on: T001
- [DONE] T003 — Сессии и ссылки на Windows; шаг администратора в карточке (work)
  - Commit: feat: run ChatGPT sessions through the shared daemon on Windows
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/test/open-link.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/shared-access-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/shared-access-model.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/shared-access.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/shared-mode.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-mode.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-windows-setup.test.ts
  - Depends on: T002
- [DONE] T004 — README и инструкция по установке для Windows (work)
  - Commit: docs: describe the shared ChatGPT access setup on Windows
  - Files: README.md, docs/installation.md
  - Depends on: T003
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M13-windows-shared-daemon.md, docs/evidence/M13-windows-probe.md, docs/installation.md
  - Depends on: T001, T002, T003, T004
- [DONE] T005 — Релиз 0.8.0 (delivery)
  - Commit: chore: release 0.8.0
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M13-acceptance.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md
  - Depends on: T004, DOCS-R1

Digest: Windows: общий доступ ChatGPT через SSH — диагностика, настройка Kit (ключ, ~/.ssh/config, профиль Git Bash, authorized_keys) и скрипт администратора (sshd, DefaultShell = sh.exe Git, ключ администратора), состояние needs-admin-setup, откат скриптом; режим сессий и ссылки с hostId — общий код M12; карточка показывает скрипт и копирует команду; README и руководство описывают Windows.

State changes only through `scripts/workflow` commands. History lives in Git.
