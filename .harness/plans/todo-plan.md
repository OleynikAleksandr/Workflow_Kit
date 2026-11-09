# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-09T16:19:56.826Z",
    "scopeId": "m6-cross-platform"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 454,
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
      "A new Claude session from the wizard opens by itself in the panel",
      "With the ChatGPT app running, the service hands remote control to it when the daemon is idle",
      "No choice card without options while a review is ahead",
      "0.5.2 is installed locally and CI is green on all four platforms before acceptance"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-09T17:04:32.163Z",
      "text": "User: «Исправь то, что мы уже нашли, и собери новый релиз с проверками» (remarks 1–3 of docs/planning/M7-test-fixes.md) | Execution mode chosen by the user: sequential: Пользователь в чате: «Исправь то, что мы уже нашли, и собери новый релиз с проверками»; рекомендованный режим — последовательно"
    },
    "baselineCommit": "916e7701c10b68961f664d4f36d22bd098eb4adb",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M7-test-fixes.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-09T17:04:32.163Z",
        "text": "Remote control is handed to the ChatGPT app automatically only when the daemon has no loaded threads (verified 09.11: the app takes it within a minute)"
      },
      {
        "at": "2026-11-09T17:04:32.163Z",
        "text": "The choice card is hidden while a plan review is still ahead"
      },
      {
        "at": "2026-11-09T17:04:32.163Z",
        "text": "Release 0.5.2; CI on branch ci/m7-test-fixes before acceptance; main is pushed after acceptance and close"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "m7-test-fixes",
    "objective": "Fix the defects found in live testing of 0.5.1 and release 0.5.2",
    "spec": "docs/planning/M7-test-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "The wizard finds the run's session by localId or remoteId and navigates with the listed session key",
        "wizard-model tests cover a Claude session whose localId changed to the Claude UUID, a Codex session and a missing session",
        "module.md is updated"
      ],
      "checks": [],
      "commitMessage": "fix: open the new Claude session after the wizard",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M7-test-fixes.md",
          "required": true,
          "heading": "2. Замечание 1: новая сессия Claude из мастера не открывается сама"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/wizard-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/test/wizard-model.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Wizard opens the new Claude session",
      "why": "Wizard opens the new Claude session"
    },
    {
      "acceptance": [
        "Provider.maintain and registry.maintain exist; the service calls them every 60 s",
        "The Codex provider hands remote control over on macOS and Windows only when the daemon is connected, the ChatGPT app server runs and no thread is loaded; one attempt per daemon and app pid",
        "During a handover createSession is unavailable with HANDOVER_REASON",
        "An errored link without a token error in the first 60 s after the daemon start reads as connecting, not a login error",
        "Tests with fake commands and daemon cover handover, skips and the label",
        "module.md documents the behaviour per OS"
      ],
      "checks": [],
      "commitMessage": "feat: hand Codex remote control to the running ChatGPT app",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M7-test-fixes.md",
          "required": true,
          "heading": "Реализация замечания 2"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "tools/platform-guard/allowlist.json"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Hand remote control to the ChatGPT app",
      "why": "Hand remote control to the ChatGPT app"
    },
    {
      "acceptance": [
        "choiceView returns null while reviewComing; the waiting text is gone",
        "The failed-review card with «Повторить ревью» stays",
        "session-model tests and module.md are updated"
      ],
      "checks": [],
      "commitMessage": "fix: hide the choice card while a plan review is ahead",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M7-test-fixes.md",
          "required": true,
          "heading": "2b. Замечание 3: карточка «Выбор пользователя» без кнопок во время ожидания ревью"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "No choice card while a review is ahead",
      "why": "No choice card while a review is ahead"
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
        "docs/planning/M7-test-fixes.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
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
        "Version 0.5.2 in package.json, package-lock.json and the docs",
        "node bin/wfk.mjs install and wfk doctor --installed report 0.5.2",
        "HEAD is pushed to refs/heads/ci/m7-test-fixes only and CI runs on all four platforms",
        "docs/evidence/M7-acceptance.md records the checks and what the user verifies live"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.5.2",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M6-cross-platform.md",
          "required": true,
          "heading": "5. Выпуск: запуск CI до приёмки"
        }
      ],
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
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M7-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Release 0.5.2",
      "why": "Release 0.5.2"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m7-test-fixes (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 1/5
- Revision: 454

## Objective

Fix the defects found in live testing of 0.5.1 and release 0.5.2

## Acceptance

- A new Claude session from the wizard opens by itself in the panel
- With the ChatGPT app running, the service hands remote control to it when the daemon is idle
- No choice card without options while a review is ahead
- 0.5.2 is installed locally and CI is green on all four platforms before acceptance

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Wizard opens the new Claude session (work)
  - Commit: fix: open the new Claude session after the wizard
  - Files: product-parts/control-panel/clusters/web-panel/modules/project-wizard, product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/wizard-model.js, product-parts/control-panel/clusters/web-panel/modules/project-wizard/test/wizard-model.test.ts
- [TODO] T002 — Hand remote control to the ChatGPT app (work)
  - Commit: feat: hand Codex remote control to the running ChatGPT app
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/backend-core/clusters/runtime/modules/cli/src/provider-lifecycle.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/test, tools/platform-guard/allowlist.json
- [TODO] T003 — No choice card while a review is ahead (work)
  - Commit: fix: hide the choice card while a plan review is ahead
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M7-test-fixes.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001, T002, T003
- [TODO] T004 — Release 0.5.2 (delivery)
  - Commit: chore: release 0.5.2
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/evidence/M7-acceptance.md
  - Depends on: T001, T002, T003, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
