# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-09T08:29:03.967Z",
    "scopeId": "m4-claude-reviewer"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 376,
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
      "Публикация возможна только без открытого scope, при чистом дереве и с upstream; иначе отказ с понятной причиной",
      "Панель показывает строку «GitHub» с числом неопубликованных коммитов и кнопкой; без upstream строки нет",
      "Агент получает правило: push не входит в задачи scope, публикация — после закрытия и только по просьбе пользователя",
      "CHANGELOG содержит 0.4.6, 0.4.7 и 0.4.8",
      "Релиз 0.4.8 установлен, wfk doctor --installed — всё в порядке; push в релизе не выполняется"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-09T08:37:41.755Z",
      "text": "Пользователь: «Публикация должна быть тогда, когда полностью принят и закрыт какой-то текущий скоп. И это правило нужно в Workflow Kit … интегрировать»; «Да, пиши спецификацию». | Execution mode chosen by the user: sequential: Последовательно"
    },
    "baselineCommit": "135be95817f84fc7bfe18e6e265f98e5bd1d48f9",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/publication-order.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-09T08:37:41.755Z",
        "text": "Публикация на GitHub — вне плана, только при закрытом scope и по просьбе пользователя"
      },
      {
        "at": "2026-11-09T08:37:41.755Z",
        "text": "Только fast-forward push без --force; разошедшаяся история — отказ"
      },
      {
        "at": "2026-11-09T08:37:41.755Z",
        "text": "Изменения Kit (команда publish, хук) — отдельно в harness-ai"
      },
      {
        "at": "2026-11-09T08:37:41.755Z",
        "text": "Живую проверку релиза выполняет пользователь"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "publication-order",
    "objective": "Публикация на GitHub — действие вне плана после закрытия scope: состояние и кнопка в панели, команда wfk project publish, правило для агента",
    "spec": "docs/planning/publication-order.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "/api/state has a publication section per project: none, up-to-date, ready or blocked with a reason",
        "POST /api/projects/:id/publish refuses scope-open, worktree-dirty, no-upstream, nothing-to-publish, remote-ahead with 409 and otherwise pushes without --force and checks the SHA",
        "Tests use temporary git repositories with a local bare upstream"
      ],
      "checks": [],
      "commitMessage": "feat: publish a closed scope to the git upstream",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/git-publish",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/module.md",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/git.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/publication.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/src/routes.ts",
        "product-parts/backend-core/clusters/projects/modules/git-publish/test/publication.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "git-publish module: publication state, publish route and state section",
      "why": "The service must know when a project can be published and publish it safely"
    },
    {
      "acceptance": [
        "The project screen shows «Опубликовано», «Неопубликованных коммитов: N · Опубликовать на GitHub» or the blocking reason; nothing without an upstream",
        "The button shows progress and then the short SHA or the git error"
      ],
      "checks": [],
      "commitMessage": "feat: show the GitHub publication in the panel",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Panel shows the GitHub line and the publish button",
      "why": "The user publishes a closed scope from the panel"
    },
    {
      "acceptance": [
        "AGENTS_SECTION has the GitHub publication rule: no push in scope tasks, publish after close only on the user's request",
        "wfk project publish posts to the publish route for the project of the current folder and prints the result"
      ],
      "checks": [],
      "commitMessage": "feat: teach agents to publish only after the scope is closed",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Agent rule and wfk project publish",
      "why": "Agents must not push inside a scope and must know how to publish after it"
    },
    {
      "acceptance": [
        "CHANGELOG.md has 0.4.6 and 0.4.7 from the M4 acceptance documents, newest first"
      ],
      "checks": [],
      "commitMessage": "docs: add 0.4.6 and 0.4.7 to the changelog",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "CHANGELOG.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "CHANGELOG gets the missing versions",
      "why": "Releases 0.4.6 and 0.4.7 are missing from the changelog"
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
        "docs/planning/publication-order.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "CHANGELOG.md"
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
        "wfk doctor --installed reports everything in order with version 0.4.8",
        "CHANGELOG has 0.4.8; no git push in this task"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.4.8",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/publication-order.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Release 0.4.8 without push",
      "why": "The user checks the publication button in the installed app"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: publication-order (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 1/6
- Revision: 376

## Objective

Публикация на GitHub — действие вне плана после закрытия scope: состояние и кнопка в панели, команда wfk project publish, правило для агента

## Acceptance

- Публикация возможна только без открытого scope, при чистом дереве и с upstream; иначе отказ с понятной причиной
- Панель показывает строку «GitHub» с числом неопубликованных коммитов и кнопкой; без upstream строки нет
- Агент получает правило: push не входит в задачи scope, публикация — после закрытия и только по просьбе пользователя
- CHANGELOG содержит 0.4.6, 0.4.7 и 0.4.8
- Релиз 0.4.8 установлен, wfk doctor --installed — всё в порядке; push в релизе не выполняется

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — git-publish module: publication state, publish route and state section (work)
  - Commit: feat: publish a closed scope to the git upstream
  - Files: product-parts/backend-core/clusters/projects/modules/git-publish, package.json, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/projects/modules/git-publish/module.md, product-parts/backend-core/clusters/projects/modules/git-publish/src/git.ts, product-parts/backend-core/clusters/projects/modules/git-publish/src/index.ts, product-parts/backend-core/clusters/projects/modules/git-publish/src/publication.ts, product-parts/backend-core/clusters/projects/modules/git-publish/src/routes.ts, product-parts/backend-core/clusters/projects/modules/git-publish/test/publication.test.ts
- [TODO] T002 — Panel shows the GitHub line and the publish button (work)
  - Commit: feat: show the GitHub publication in the panel
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell
  - Depends on: T001
- [TODO] T003 — Agent rule and wfk project publish (work)
  - Commit: feat: teach agents to publish only after the scope is closed
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001
- [TODO] T004 — CHANGELOG gets the missing versions (work)
  - Commit: docs: add 0.4.6 and 0.4.7 to the changelog
  - Files: CHANGELOG.md
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/publication-order.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, CHANGELOG.md
  - Depends on: T001, T002, T003, T004
- [TODO] T005 — Release 0.4.8 without push (delivery)
  - Commit: chore: release 0.4.8
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/publication-order.md
  - Depends on: T001, T002, T003, T004, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
