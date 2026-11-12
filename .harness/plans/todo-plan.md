# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": "T004",
  "lastClosed": {
    "closedAt": "2026-11-12T17:11:41.401Z",
    "scopeId": "m22-kit-source"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 739,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Тесты kit-core: заглушка бандла импортирует модули по pathToFileURL(...).href"
        ],
        "decisions": [
          "Исправляются только тесты Kit; код Kit и бандл 2.2.4 не меняются",
          "Версия остаётся 0.9.3: она не опубликована",
          "Короткие имена 8.3 в коде Kit — отдельной работой"
        ],
        "references": [
          "docs/planning/M23-kit-tests-windows.md",
          "product-parts/kit-core/product-part.md"
        ],
        "result": "Тесты Kit исправлены для Windows: заглушки бандла импортируют модули по file://, временные папки тестов — длинные пути, путь git сравнивается с любым разделителем, подставной npm работает на Windows. Код Kit и бандл 2.2.4 не менялись."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": {
        "contracts": [
          "doctor Kit на Windows не делает проверку executable (без изменений, теперь это учитывает тест)"
        ],
        "decisions": [
          "Неудачный прогон CI записан задачей T002, исправления — раундом R2",
          "Платформа в тесте doctor — из workflowPlatformFacade сборки теста, не process.platform"
        ],
        "references": [
          "docs/planning/M23-kit-tests-windows.md",
          "docs/evidence/M22-acceptance.md"
        ],
        "result": "Второй проход тестов Kit для Windows: ещё три временные папки — длинные пути, путь worktree от git сравнивается после path.resolve, npm.cmd печатает аргумент без кавычек cmd.exe, тест doctor ждёт проверку executable только вне Windows. Код Kit не менялся."
      },
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Тесты Kit на Windows, второй проход"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "15 тестов Kit, упавших на Windows в CI 43266183754, проходят на Windows x64 и ARM64",
      "Код Kit и бандл 2.2.4 не меняются",
      "CI ветки ci/m23-kit-tests-windows зелёный на macOS ARM64, Linux x64, Windows x64 и ARM64"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T17:26:01.057Z",
      "text": "Пользователь, 2026-11-12: «Пожалуйста, не останавливайся вплоть до сборки. И выпуска «093».» Выпуск 0.9.3 по правилам проекта готов только при зелёном CI на всех ОС; CI ветки ci/m22-kit-source упал на Windows в тестах Kit. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "30b8663abc8bf26765282f116fc343c1b57104a5",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M23-kit-tests-windows.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-12T17:26:01.057Z",
        "text": "Исправляются только тесты Kit; код Kit и бандл 2.2.4 не меняются"
      },
      {
        "at": "2026-11-12T17:26:01.057Z",
        "text": "Версия остаётся 0.9.3: она не опубликована"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "8ed2f99f-7296-4ad6-ae41-6fec13ee5fdb",
      "strategy": "sequential"
    },
    "id": "m23-kit-tests-windows",
    "objective": "Тесты Kit проходят на Windows: CI выпуска 0.9.3 зелёный на macOS, Linux, Windows x64 и ARM64.",
    "spec": "docs/planning/M23-kit-tests-windows.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Заглушки бандла импортируют модули по file:// URL",
        "Временные папки тестов — длинные пути (realpathSync.native)",
        "Путь git сравнивается с любым разделителем",
        "Подставной npm работает на Windows (npm.cmd, ключ Path)",
        "Тесты Kit проходят на macOS"
      ],
      "checks": [],
      "commitMessage": "test(kit-core): run the Kit tests on Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M23-kit-tests-windows.md",
          "required": true,
          "heading": "2. Причины и исправления (CI 43266183754, Windows x64 и ARM64 одинаково)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-hooks.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-ignored-commit.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-doctor.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-migrate.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-install-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-worktree.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-facade.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-merge-support.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-cancel.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-worktree.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-context-command.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-history.test.mjs",
        "product-parts/kit-core/product-part.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Тесты Kit на Windows",
      "why": "CI выпуска 0.9.3 красный на Windows: 15 тестов Kit"
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
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M23-kit-tests-windows.md",
        "product-parts/kit-core/product-part.md"
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
        "CI ветки ci/m23-kit-tests-windows (запуск 43270655505) записан: macOS ARM64 и Linux x64 зелёные, на Windows x64 и ARM64 осталось 6 тестов Kit — они исправляются раундом R2",
        "Причины шести падений записаны в спецификации M23"
      ],
      "checks": [],
      "commitMessage": "docs: record the green CI of Workflow Kit 0.9.3",
      "confirmation": "Пожалуйста, не останавливайся вплоть до сборки. И выпуска «093».",
      "context": [],
      "dependencies": [
        "T001",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M22-acceptance.md",
        "docs/planning/M23-kit-tests-windows.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "CI выпуска 0.9.3 на всех ОС",
      "why": "Выпуск готов только при зелёном CI на всех ОС"
    },
    {
      "acceptance": [
        "Временные папки ещё трёх тестов — длинные пути (realpathSync.native)",
        "Путь worktree от git сравнивается после path.resolve",
        "Подставной npm.cmd печатает аргумент без кавычек",
        "Тест doctor ждёт проверку executable только вне Windows",
        "Тесты Kit проходят на macOS"
      ],
      "checks": [],
      "commitMessage": "test(kit-core): fix the remaining Kit tests on Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M23-kit-tests-windows.md",
          "required": true,
          "heading": "2.1. Второй проход (CI 43270655505, после T001 `501acca`)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-executor.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-worktree.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-cancel.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-worktree.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-doctor.test.mjs",
        "product-parts/kit-core/product-part.md"
      ],
      "fixes": "T001",
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Тесты Kit на Windows: второй проход",
      "why": "CI 43270655505: 6 тестов Kit ещё падают на Windows"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R2",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/kit-core/product-part.md",
        "docs/planning/M23-kit-tests-windows.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "CI ветки ci/m23-kit-tests-windows (запуск 43272867981) записан: macOS ARM64 и Linux x64 зелёные, на Windows x64 и ARM64 осталось 3 теста Kit — они исправляются раундом R3",
        "Причины трёх падений записаны в спецификации M23"
      ],
      "checks": [],
      "commitMessage": "docs: record the green CI of Workflow Kit 0.9.3",
      "confirmation": "Пожалуйста, не останавливайся вплоть до сборки. И выпуска «093».",
      "context": [],
      "dependencies": [
        "T003",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M22-acceptance.md",
        "docs/planning/M23-kit-tests-windows.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "IN_PROGRESS",
      "title": "CI выпуска 0.9.3 на всех ОС",
      "why": "Выпуск готов только при зелёном CI на всех ОС"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m23-kit-tests-windows (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: T004
- Progress: 5/6
- Revision: 739

## Objective

Тесты Kit проходят на Windows: CI выпуска 0.9.3 зелёный на macOS, Linux, Windows x64 и ARM64.

## Acceptance

- 15 тестов Kit, упавших на Windows в CI 43266183754, проходят на Windows x64 и ARM64
- Код Kit и бандл 2.2.4 не меняются
- CI ветки ci/m23-kit-tests-windows зелёный на macOS ARM64, Linux x64, Windows x64 и ARM64

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Тесты Kit на Windows (work)
  - Commit: test(kit-core): run the Kit tests on Windows
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-hooks.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-ignored-commit.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-doctor.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-migrate.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-install-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-worktree.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-merge-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-cancel.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-worktree.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-context-command.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-history.test.mjs, product-parts/kit-core/product-part.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M23-kit-tests-windows.md, product-parts/kit-core/product-part.md
  - Depends on: T001
- [DONE] T002 — CI выпуска 0.9.3 на всех ОС (delivery)
  - Commit: docs: record the green CI of Workflow Kit 0.9.3
  - Files: docs/evidence/M22-acceptance.md, docs/planning/M23-kit-tests-windows.md
  - Depends on: T001, DOCS-R1

Digest: Тесты Kit исправлены для Windows: заглушки бандла импортируют модули по file://, временные папки тестов — длинные пути, путь git сравнивается с любым разделителем, подставной npm работает на Windows. Код Kit и бандл 2.2.4 не менялись.

### R2 — Тесты Kit на Windows, второй проход (fixes, OPEN)

- [DONE] T003 — Тесты Kit на Windows: второй проход (work)
  - Commit: test(kit-core): fix the remaining Kit tests on Windows
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-executor.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-worktree.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-cancel.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-worktree.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-doctor.test.mjs, product-parts/kit-core/product-part.md
  - Fixes: T001
- [DONE] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/kit-core/product-part.md, docs/planning/M23-kit-tests-windows.md
  - Depends on: T003
- [IN_PROGRESS] T004 — CI выпуска 0.9.3 на всех ОС (delivery)
  - Commit: docs: record the green CI of Workflow Kit 0.9.3
  - Files: docs/evidence/M22-acceptance.md, docs/planning/M23-kit-tests-windows.md
  - Depends on: T003, DOCS-R2

Digest: Второй проход тестов Kit для Windows: ещё три временные папки — длинные пути, путь worktree от git сравнивается после path.resolve, npm.cmd печатает аргумент без кавычек cmd.exe, тест doctor ждёт проверку executable только вне Windows. Код Kit не менялся.

State changes only through `scripts/workflow` commands. History lives in Git.
