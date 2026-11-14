# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": "DOCS-R1",
  "lastClosed": {
    "closedAt": "2026-11-14T16:26:05.681Z",
    "scopeId": "m30-claude-feed-quiet"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 993,
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
      "A new session of the same project (any provider or model) shows the mode choice card of an open proposal and the ready plan card of a chosen but unstarted plan",
      "Choosing the mode or pressing «Начать выполнение плана» in the new session makes it the owner in Kit (execution.ownerSession) and releases the held Stop of the previous session",
      "A session that did not write the proposal neither asks about its review nor starts a second review of it",
      "A started plan stays with its owner; other sessions show a short card with «Открыть сессию»",
      "CI is green on macOS, Linux, Windows x64 and Windows ARM64 for the delivery commit"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-14T16:45:53.104Z",
      "text": "Пользователь, 14.11.2026: «я начинаю совершенно новую сессию провайдером или с другой моделью неважно сессия возникает а плана нет хотя я ее открываю в том же workspace и это неправильно … это недопустимо, это нужно исправить». После разбора причин пользователь выбрал в панели Workflow Kit «спецификация и план без ревью». | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "8f8fbfa56a11368bd3217e111aa700d7270a1fbc",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M31-plan-in-any-session.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-14T16:45:53.104Z",
        "text": "The owner of an unstarted plan is the session where the user pressed the choice or start button; Kit 2.2.5 records it with scope:owner"
      },
      {
        "at": "2026-11-14T16:45:53.104Z",
        "text": "The proposal author is a session whose turn started no later than the proposal createdAt; only the author asks about or starts the review"
      },
      {
        "at": "2026-11-14T16:45:53.104Z",
        "text": "Moving a started plan to another session is out of scope; other sessions only see it and open the owner"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "c83ecd0b-4b2f-4c45-80c3-1465c615d2aa",
      "strategy": "sequential"
    },
    "id": "m31-plan-in-any-session",
    "objective": "An unstarted plan belongs to the project: its mode choice card and ready plan card show in every main session of the project, and the session where the user presses the button becomes the owner",
    "spec": "docs/planning/M31-plan-in-any-session.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "scope:owner --session <id> --note sets execution.ownerSession, records the decision and bumps the revision without a commit",
        "Same owner answers changed false; no scope gives NO_SCOPE; an IN_PROGRESS task or an open assignment gives OWNER_BUSY; empty flags give USAGE",
        "KIT_VERSION is 2.2.5, the bundle is rebuilt with npm run build:kit and build:kit --check passes",
        "WorkflowKitCommands.md and help describe the command"
      ],
      "checks": [],
      "commitMessage": "feat(kit): move the plan owner with scope:owner",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M31-plan-in-any-session.md",
          "heading": "3.1. Kit 2.2.5: команда `scope:owner` (`workflow-kit`, `workflow-plan`)",
          "required": true
        },
        {
          "path": "tools/kit-build/README.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-execution.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-owner.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-owner.test.mjs",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-owner.ts",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.4.mjs.gz",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.5.mjs.gz"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Kit 2.2.5: команда scope:owner",
      "why": "Kit has no way to move the owner of a plan to another session"
    },
    {
      "acceptance": [
        "StopContext carries turnStartedAt of the ended turn for hook and detached clients",
        "A session whose turn started after the proposal createdAt gets no review question and starts no review; an author behaves as before; unknown times count as author",
        "choiceBlocked does not block the choice because a non-author session is working"
      ],
      "checks": [],
      "commitMessage": "fix(review): review a proposal only from its author session",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M31-plan-in-any-session.md",
          "heading": "3.2. Автор предложения (`agent-channel`, `cross-review`)",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/turn-start.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/author.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/author.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Автор предложения: ревью один раз",
      "why": "A new session asks about or starts a second review of an already reviewed proposal"
    },
    {
      "acceptance": [
        "A choice in another session wakes the session holding waiting-for-mode-choice and the choice message goes only to the choosing session",
        "Start from a non-owner session runs scope:owner, updates the remembered owner, wakes the previous owner and sends the start to the new session",
        "A project Kit older than 2.2.5 gives kit-outdated 409 with the update hint; start in the owner session never runs scope:owner"
      ],
      "checks": [],
      "commitMessage": "fix(autopilot): choose and start the plan from any session of the project",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M31-plan-in-any-session.md",
          "heading": "3.3. Служба (`autopilot`)",
          "required": true
        }
      ],
      "dependencies": [
        "T001",
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/owner.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/owner.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Служба: выбор и старт из любой сессии",
      "why": "The service sends the choice and start only to the session that proposed the plan"
    },
    {
      "acceptance": [
        "choiceView shows the card in any main session; review, question and author-only reviewComing rules stay",
        "planView shows the ready card with «Начать выполнение плана» in any main session",
        "A started plan gives non-owner sessions a short card «План выполняет сессия «…»» with «Открыть сессию» and no plan buttons; needsAttention stays off for it"
      ],
      "checks": [],
      "commitMessage": "fix(session-view): show the unstarted plan in every session of the project",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M31-plan-in-any-session.md",
          "heading": "3.4. Панель (`session-view`)",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "docs/architecture/OS-MATRIX.md",
        "design-qa.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/foreign-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/plan-cards.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: карточки неначатого плана в любой сессии",
      "why": "The sidebar shows the choice and plan cards only in the owner session"
    },
    {
      "acceptance": [
        "Disposable git project with the built Kit 2.2.5: propose, choose for session A, scope:owner to B, status shows owner B; after task:start scope:owner gives OWNER_BUSY",
        "docs/evidence/M31-plan-in-any-session.md lists live checks per OS and who runs them: macOS the user, Windows a Windows tester, Linux CI only"
      ],
      "checks": [],
      "commitMessage": "test: record the plan owner move with the built Kit",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M31-plan-in-any-session.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M31-plan-in-any-session.md",
        "docs/evidence/M31"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Документ приёмки и проба Kit во временном проекте",
      "why": "The owner move must work with the real built Kit and the user needs the live check steps"
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
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M31-plan-in-any-session.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md",
        "product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md",
        "docs/architecture/workflow-kit/WorkflowKitCommands.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "design-qa.md",
        "docs/evidence/M31-plan-in-any-session.md",
        "docs/architecture/CONTRACTS.md",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "IN_PROGRESS",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Version 0.13.5 in package files and CHANGELOG; installed locally, /api/health reports 0.13.5 and doctor passes",
        "Evidence of the local delivery recorded"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.13.5",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T005",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "README.md",
        "CHANGELOG.md",
        "docs/usage.md",
        "docs/installation.md",
        "docs/setup.md",
        "docs/evidence/M31-plan-in-any-session.md",
        "docs/evidence/M31"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.13.5 и локальная установка",
      "why": "The user checks the fix in the installed panel"
    },
    {
      "acceptance": [
        "CI on ci/m31-plan-in-any-session for the delivery SHA is green on macOS ARM64, Linux x64, Windows x64 and Windows ARM64; recorded in the evidence"
      ],
      "checks": [],
      "commitMessage": "docs: record green CI for the plan in any session",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T006",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M31-plan-in-any-session.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "Every change covers macOS, Linux and Windows"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m31-plan-in-any-session (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: DOCS-R1
- Progress: 5/8
- Revision: 993

## Objective

An unstarted plan belongs to the project: its mode choice card and ready plan card show in every main session of the project, and the session where the user presses the button becomes the owner

## Acceptance

- A new session of the same project (any provider or model) shows the mode choice card of an open proposal and the ready plan card of a chosen but unstarted plan
- Choosing the mode or pressing «Начать выполнение плана» in the new session makes it the owner in Kit (execution.ownerSession) and releases the held Stop of the previous session
- A session that did not write the proposal neither asks about its review nor starts a second review of it
- A started plan stays with its owner; other sessions show a short card with «Открыть сессию»
- CI is green on macOS, Linux, Windows x64 and Windows ARM64 for the delivery commit

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Kit 2.2.5: команда scope:owner (work)
  - Commit: feat(kit): move the plan owner with scope:owner
  - Files: product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/src/installer-payload.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/src/bundle-meta.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/test, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/OS-MATRIX.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/tests.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/test/workflow-installer-payload.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-cli-execution.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/kit-scope-owner.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/src/workflow-kit-facade.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/test/workflow-kit-owner.test.mjs, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/plan-owner.ts, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/src/workflow-plan-facade.ts, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/PROVENANCE, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.4.mjs.gz, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/vendor/workflow-kit-2.2.5.mjs.gz
- [DONE] T002 — Автор предложения: ревью один раз (work)
  - Commit: fix(review): review a proposal only from its author session
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, docs/architecture/OS-MATRIX.md, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/turn-start.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/author.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/author.test.ts
  - Depends on: T001
- [DONE] T003 — Служба: выбор и старт из любой сессии (work)
  - Commit: fix(autopilot): choose and start the plan from any session of the project
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/owner.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/owner.test.ts
  - Depends on: T001, T002
- [DONE] T004 — Панель: карточки неначатого плана в любой сессии (work)
  - Commit: fix(session-view): show the unstarted plan in every session of the project
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view/src, product-parts/control-panel/clusters/web-panel/modules/session-view/test, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, docs/architecture/OS-MATRIX.md, design-qa.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/foreign-card.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/plan-cards.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/sidebar-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/plan-cards.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts
  - Depends on: T003
- [DONE] T005 — Документ приёмки и проба Kit во временном проекте (work)
  - Commit: test: record the plan owner move with the built Kit
  - Files: docs/evidence/M31-plan-in-any-session.md, docs/evidence/M31
  - Depends on: T004
- [IN_PROGRESS] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M31-plan-in-any-session.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-kit/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-plan/module.md, product-parts/kit-core/clusters/project-workflow/modules/workflow-installer/module.md, product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md, docs/architecture/workflow-kit/WorkflowKitCommands.md, docs/architecture/OS-MATRIX.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, design-qa.md, docs/evidence/M31-plan-in-any-session.md, docs/architecture/CONTRACTS.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md
  - Depends on: T001, T002, T003, T004, T005
- [TODO] T006 — Поставка 0.13.5 и локальная установка (delivery)
  - Commit: chore: release 0.13.5
  - Files: package.json, package-lock.json, README.md, CHANGELOG.md, docs/usage.md, docs/installation.md, docs/setup.md, docs/evidence/M31-plan-in-any-session.md, docs/evidence/M31
  - Depends on: T005, DOCS-R1
- [TODO] T007 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record green CI for the plan in any session
  - Files: docs/evidence/M31-plan-in-any-session.md
  - Depends on: T006, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
