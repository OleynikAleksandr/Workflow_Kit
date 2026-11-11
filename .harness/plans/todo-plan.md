# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-11T17:40:50.251Z",
    "scopeId": "m16-plan-start-after-review"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 654,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "service-installer: launcherDir(layout), mergePath; loginPath с каталогом запускателя",
          "cli: withLauncherDir в wfk serve; wfk service restart",
          "kit-structure: пункт о полном пути wfk в AGENTS_SECTION",
          "provider-codex: daemon-record.ts, codex-daemon.json, STALE_ENV_REASON, STALE_ENV_CONFIRM"
        ],
        "decisions": [
          "Kit сам не перезапускает демон Codex: только действие пользователя с подтверждением",
          "Нет записи о запуске демона — демон не считается устаревшим",
          "Kit не переписывает раздел AGENTS.md существующих проектов сам: он лежит в git пользователя"
        ],
        "references": [
          "docs/planning/M17-wfk-on-agent-path.md",
          "docs/architecture/OVERVIEW.md",
          "README.md"
        ],
        "result": "Служба держит каталог wfk в PATH (установка и wfk serve), есть wfk service restart; раздел AGENTS.md называет полный путь wfk на каждой ОС; Kit записывает pid и PATH запущенного им демона Codex и для чужого или устаревшего демона показывает подсказку и действие «Перезапустить демон»."
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
      "PATH службы и запущенных ею программ содержит каталог wfk",
      "Раздел AGENTS.md называет полный путь wfk на каждой ОС",
      "Устаревший демон Codex виден в статусе ChatGPT и перезапускается действием «Перезапустить демон»",
      "wfk service restart работает",
      "Выпуск 0.8.4; CI зелёный на macOS, Linux, Windows x64 и ARM64"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-11T18:11:04.430Z",
      "text": "Пользователь, 2026-11-11: «Да, именно так… А ты начинай. Без остановки. Если нужно будет, я тебя остановлю.» — три слоя исправления и выпуск 0.8.4 | Execution mode chosen by the user: sequential: Пользователь: «А ты начинай. Без остановки.» — последовательно, как в M16"
    },
    "baselineCommit": "8a2cd261282154f40277b8266aac20759d3d4186",
    "blockedReason": null,
    "context": [],
    "decisions": [
      {
        "at": "2026-11-11T18:11:04.430Z",
        "text": "Kit сам не перезапускает демон Codex: только действие пользователя с подтверждением"
      },
      {
        "at": "2026-11-11T18:11:04.430Z",
        "text": "Нет записи о запуске демона — демон не считается устаревшим"
      },
      {
        "at": "2026-11-11T18:11:04.430Z",
        "text": "Выпуск 0.8.4"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "e9c04a9c-cd7c-4f6c-b4f7-f6b07802530e",
      "strategy": "sequential"
    },
    "id": "m17-wfk-on-agent-path",
    "objective": "Агенты находят команду wfk после обновлений Kit без перезагрузки Windows и на всех ОС",
    "spec": "docs/planning/M17-wfk-on-agent-path.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "launcherDir по ОС, null у экземпляра разработки",
        "Установка дописывает каталог в loginPath",
        "wfk serve дописывает каталог в PATH окружения один раз",
        "wfk service restart: stop, затем start",
        "Тесты с подставленной платформой win32 и linux",
        "module.md service-installer и cli обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: keep the wfk directory on the service PATH",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M17-wfk-on-agent-path.md",
          "required": true,
          "heading": "2.1. PATH службы всегда содержит каталог `wfk` (`service-installer`, `cli`)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/service-path.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/system-service/product-part.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/commands.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/service-path.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/layout.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/node-path.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Каталог wfk в PATH службы и wfk service restart",
      "why": "Демон и агенты, запущенные службой, не находили wfk после первой установки"
    },
    {
      "acceptance": [
        "Раздел AGENTS.md называет полный путь wfk для macOS/Linux, PowerShell и Git Bash",
        "Старый раздел в проекте — outdated",
        "module.md kit-structure обновлён"
      ],
      "checks": [],
      "commitMessage": "fix: name the full wfk path in the AGENTS.md section",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M17-wfk-on-agent-path.md",
          "required": true,
          "heading": "2.2. Агент вызывает `wfk` и по полному пути (`kit-structure`)"
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Полный путь wfk в AGENTS.md",
      "why": "Приложения и демоны со старым окружением не находят wfk"
    },
    {
      "acceptance": [
        "Kit пишет codex-daemon.json после запуска демона",
        "Чужой pid или другой PATH — подсказка в статусе и действие «Перезапустить демон» с подтверждением",
        "Действие останавливает и запускает демон",
        "Нет записи — демон не устарел",
        "module.md provider-codex обновлён"
      ],
      "checks": [],
      "commitMessage": "feat: show a stale Codex daemon and restart it on request",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M17-wfk-on-agent-path.md",
          "required": true,
          "heading": "2.3. Устаревший демон Codex виден и перезапускается (`provider-codex`)"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/daemon-record.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/stale-daemon.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Устаревший демон Codex: подсказка и перезапуск",
      "why": "Демон переживает обновления службы и хранит старый PATH"
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
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M17-wfk-on-agent-path.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
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
        "Версия 0.8.4, CHANGELOG, документ приёмки M17",
        "CI зелёный на macOS, Linux, Windows x64 и ARM64 на ветке ci/m17-wfk-on-agent-path",
        "Служба переустановлена на macOS"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.8.4",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M17-acceptance.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Выпуск 0.8.4",
      "why": "Выпустить исправление для проверки на Windows"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m17-wfk-on-agent-path (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 4/5
- Revision: 654

## Objective

Агенты находят команду wfk после обновлений Kit без перезагрузки Windows и на всех ОС

## Acceptance

- PATH службы и запущенных ею программ содержит каталог wfk
- Раздел AGENTS.md называет полный путь wfk на каждой ОС
- Устаревший демон Codex виден в статусе ChatGPT и перезапускается действием «Перезапустить демон»
- wfk service restart работает
- Выпуск 0.8.4; CI зелёный на macOS, Linux, Windows x64 и ARM64

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Каталог wfk в PATH службы и wfk service restart (work)
  - Commit: fix: keep the wfk directory on the service PATH
  - Files: product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/service-path.ts, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/system-service/product-part.md, product-parts/backend-core/clusters/runtime/modules/cli/test/commands.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/service-path.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/index.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/install.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/layout.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/node-path.test.ts
- [DONE] T002 — Полный путь wfk в AGENTS.md (work)
  - Commit: fix: name the full wfk path in the AGENTS.md section
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts
  - Depends on: T001
- [DONE] T003 — Устаревший демон Codex: подсказка и перезапуск (work)
  - Commit: feat: show a stale Codex daemon and restart it on request
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/daemon-record.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/stale-daemon.test.ts
  - Depends on: T002
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M17-wfk-on-agent-path.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001, T002, T003
- [TODO] T004 — Выпуск 0.8.4 (delivery)
  - Commit: chore: release 0.8.4
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M17-acceptance.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md
  - Depends on: T003, DOCS-R1

Digest: Служба держит каталог wfk в PATH (установка и wfk serve), есть wfk service restart; раздел AGENTS.md называет полный путь wfk на каждой ОС; Kit записывает pid и PATH запущенного им демона Codex и для чужого или устаревшего демона показывает подсказку и действие «Перезапустить демон».

State changes only through `scripts/workflow` commands. History lives in Git.
