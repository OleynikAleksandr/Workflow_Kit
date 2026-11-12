# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-12T17:11:41.401Z",
    "scopeId": "m22-kit-source"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 725,
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
      "status": "TODO",
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
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "CI ветки ci/m23-kit-tests-windows зелёный на macOS ARM64, Linux x64, Windows x64 и ARM64",
        "Запуск CI записан в docs/evidence/M22-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "docs: record the green CI of Workflow Kit 0.9.3",
      "confirmation": null,
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
      "status": "TODO",
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
- Current task: none
- Progress: 0/3
- Revision: 725

## Objective

Тесты Kit проходят на Windows: CI выпуска 0.9.3 зелёный на macOS, Linux, Windows x64 и ARM64.

## Acceptance

- 15 тестов Kit, упавших на Windows в CI 43266183754, проходят на Windows x64 и ARM64
- Код Kit и бандл 2.2.4 не меняются
- CI ветки ci/m23-kit-tests-windows зелёный на macOS ARM64, Linux x64, Windows x64 и ARM64

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Тесты Kit на Windows (work)
  - Commit: test(kit-core): run the Kit tests on Windows
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-hooks.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-ignored-commit.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-doctor.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-migrate.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-install-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-recovery/test/workflow-recovery-worktree.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/orchestration-scenario-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-facade.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-integration/test/workflow-integration-merge-support.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-assignment/test/workflow-assignment-cancel.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-worktree.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-context-command.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-git/test/workflow-git-history.test.mjs, product-parts/kit-core/product-part.md
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M23-kit-tests-windows.md, product-parts/kit-core/product-part.md
  - Depends on: T001
- [TODO] T002 — CI выпуска 0.9.3 на всех ОС (delivery)
  - Commit: docs: record the green CI of Workflow Kit 0.9.3
  - Files: docs/evidence/M22-acceptance.md, docs/planning/M23-kit-tests-windows.md
  - Depends on: T001, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
