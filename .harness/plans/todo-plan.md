# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-09T08:07:03.365Z",
    "scopeId": "github-publication"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 366,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "cross-review: CrossReviewDeps.deliver?(key, text, projectId) и findReviewer?; типы в src/contract.ts",
          "cli: deliverToSession — очередь канала и сразу wakeSession Claude",
          "panel-shell: reviewerMatcher(state) в src/reviewers.js"
        ],
        "decisions": [
          "Задание ревьюеру Claude не набирается в терминал: длинный текст набирался, но не отправлялся",
          "Ключ ревьюера Claude ищется сразу после создания (2 с, до 3 минут), а не по первому Stop",
          "Дерево скрывает ревьюера и по reviewerRef для обоих провайдеров"
        ],
        "references": [
          "docs/planning/M4-review-failures.md"
        ],
        "result": "Ревьюер Claude при основной сессии ChatGPT получает задание через очередь и пробуждение, служба находит его ключ по хукам за 3 минуты или завершает ревью видимой ошибкой; дерево скрывает ревьюера по reviewerRef до появления ключа."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Fixes"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Основная сессия ChatGPT с «С ревью» получает ревьюера Claude, который получает задание с планом и отвечает замечаниями без участия пользователя",
      "Сессия ревьюера Claude не показывается в дереве проекта ни во время запуска, ни после",
      "Если ключ ревьюера не найден за 3 минуты, ревью завершается видимой ошибкой с кнопкой «Повторить ревью»",
      "Путь «основная Claude → ревьюер ChatGPT» работает как прежде",
      "Релиз 0.4.7 установлен, wfk doctor --installed — всё в порядке"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-09T08:13:55.083Z",
      "text": "Пользователь: «Разберись, пожалуйста, и сделай все необходимые исправления, чтобы сессии с ChatGPT были абсолютно такие же в плане ревью, как и сессии, начатые с Claude.» | Execution mode chosen by the user: sequential: Выполни самостоятельно последовательно"
    },
    "baselineCommit": "acf223c7daeb8817c175b1f0ba37252b87c7d2a6",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M4-review-failures.md",
        "heading": "13.9. Ревьюер Claude получает задание так же надёжно, как ревьюер ChatGPT",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-09T08:13:55.083Z",
        "text": "Задание ревьюеру Claude идёт через очередь сообщений и пробуждение, а не набором в терминал"
      },
      {
        "at": "2026-11-09T08:13:55.083Z",
        "text": "Ключ ревьюера ищется сразу после создания сессии, не дольше 3 минут"
      },
      {
        "at": "2026-11-09T08:13:55.083Z",
        "text": "Дерево скрывает ревьюера и по reviewerRef, пока ключа нет"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "m4-claude-reviewer",
    "objective": "Ревьюер Claude при основной сессии ChatGPT получает задание, скрыт в дереве и ведёт ревью так же, как ревьюер ChatGPT",
    "spec": "docs/planning/M4-review-failures.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "A Claude reviewer is created without a typed first message; its key is resolved every 2 s up to 3 minutes and bound to the review",
        "The brief with the plan goes through the new dep deliver(key, text, projectId) once the key is known",
        "Without a key after 3 minutes the review fails with a clear reason",
        "The ChatGPT reviewer path is unchanged; tests cover both providers"
      ],
      "checks": [],
      "commitMessage": "fix: deliver the brief of a Claude reviewer through the message queue",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/find-reviewer.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Cross review finds the Claude reviewer and delivers its brief by the queue",
      "why": "The typed brief of a Claude reviewer was never sent and its key was known only after a Stop"
    },
    {
      "acceptance": [
        "deliver queues the text for the session and wakes a Claude session through wakeSession without waiting for its first Stop",
        "A test with fakes checks the queue and the wake"
      ],
      "checks": [],
      "commitMessage": "fix: wake a fresh Claude reviewer to hand over its brief",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "The service wires deliver: queue plus a direct wake of the Claude session",
      "why": "A fresh Claude session has no Stop yet, so the usual wake of an idle session does not fire"
    },
    {
      "acceptance": [
        "A session whose localId or remoteId equals reviewerRef of a project review is not listed and not counted, for both providers",
        "view-model.js stays within 400 lines"
      ],
      "checks": [],
      "commitMessage": "fix: hide a starting reviewer session in the project tree",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/reviewers.js"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "The tree hides a reviewer by its reference before its key is known",
      "why": "The reviewer session was listed while the review had no reviewer key"
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
        "docs/planning/M4-review-failures.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
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
        "wfk doctor --installed reports everything in order with version 0.4.7",
        "Live check ChatGPT main → Claude reviewer on a probe project: the reviewer is hidden, gets the brief and answers; the probe is deleted"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.4.7",
      "confirmation": "Выполни самостоятельно последовательно ... и собери новый релиз",
      "context": [],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M4-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Release 0.4.7",
      "why": "The user checks the fix in the installed app"
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
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "origin/main on GitHub equals the local main with the 0.4.7 release"
      ],
      "checks": [],
      "commitMessage": "chore: record the GitHub publication",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T004",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M4-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Publish to GitHub",
      "why": "The user asked to publish the accepted result on GitHub"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m4-claude-reviewer (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 5/7
- Revision: 366

## Objective

Ревьюер Claude при основной сессии ChatGPT получает задание, скрыт в дереве и ведёт ревью так же, как ревьюер ChatGPT

## Acceptance

- Основная сессия ChatGPT с «С ревью» получает ревьюера Claude, который получает задание с планом и отвечает замечаниями без участия пользователя
- Сессия ревьюера Claude не показывается в дереве проекта ни во время запуска, ни после
- Если ключ ревьюера не найден за 3 минуты, ревью завершается видимой ошибкой с кнопкой «Повторить ревью»
- Путь «основная Claude → ревьюер ChatGPT» работает как прежде
- Релиз 0.4.7 установлен, wfk doctor --installed — всё в порядке

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Cross review finds the Claude reviewer and delivers its brief by the queue (work)
  - Commit: fix: deliver the brief of a Claude reviewer through the message queue
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/find-reviewer.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts
- [DONE] T002 — The service wires deliver: queue plus a direct wake of the Claude session (work)
  - Commit: fix: wake a fresh Claude reviewer to hand over its brief
  - Files: product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001
- [DONE] T003 — The tree hides a reviewer by its reference before its key is known (work, parallel-safe)
  - Commit: fix: hide a starting reviewer session in the project tree
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/reviewers.js
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M4-review-failures.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T001, T002, T003
- [DONE] T004 — Release 0.4.7 (delivery)
  - Commit: chore: release 0.4.7
  - Files: package.json, package-lock.json, docs/evidence/M4-acceptance.md
  - Depends on: T001, T002, T003, DOCS-R1

Digest: Ревьюер Claude при основной сессии ChatGPT получает задание через очередь и пробуждение, служба находит его ключ по хукам за 3 минуты или завершает ревью видимой ошибкой; дерево скрывает ревьюера по reviewerRef до появления ключа.

### R2 — Fixes (fixes, OPEN)

- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md
- [TODO] T005 — Publish to GitHub (delivery)
  - Commit: chore: record the GitHub publication
  - Files: docs/evidence/M4-acceptance.md
  - Depends on: T004, DOCS-R2

State changes only through `scripts/workflow` commands. History lives in Git.
