# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-10T09:06:20.948Z",
    "scopeId": "m8-kimi-provider"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 502,
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
      "While the Kimi Code app runs, Kit creates workspaces and sessions through the server of the app and starts no server of its own",
      "Hooks written after the server of Kit started take effect: the server is restarted by the fingerprint of the Kit blocks, not by GET /api/v1/config",
      "When the app was started before the Kit hook was written, the status, the wizard hook step and the sessions say that the app must be restarted",
      "wfk session title|plan finds a Kimi turn by the live session lock when no hook reached the service",
      "0.6.1 is installed locally and CI is green on all four platforms before acceptance"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-10T09:21:06.046Z",
      "text": "User: «Я думаю, что нужно закрыть текущий план приняв его и откроем новый, для замечаний, касающихся в первую очередь, конечно же, провайдера Кими.» and «В общем, прям при старте что-то сильно неправильно работает с провайдером Kimi Code.» | Execution mode chosen by the user: sequential: Да, принимаю этот план, выполняй его и собирай новый релиз для моих тестов"
    },
    "baselineCommit": "f0bb47307ca73db9e4a37ac22c50c796f5c00ef4",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M9-kimi-start-fixes.md",
        "required": true
      },
      {
        "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-10T09:21:06.046Z",
        "text": "When the Kimi Code app runs, its server is the only server Kit uses; Kit starts its own kimi web only without it"
      },
      {
        "at": "2026-11-10T09:21:06.046Z",
        "text": "Kit never restarts the Kimi Code app; it tells the user to restart it when the app started before the Kit hook was written"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "claude:01493504-12b2-440a-84f4-17acf7bc1c61",
      "strategy": "sequential"
    },
    "id": "m9-kimi-start-fixes",
    "objective": "A Kimi session created from the panel is visible in the Kimi Code app with its first message, and the Kit hooks run in it; release 0.6.1",
    "spec": "docs/planning/M9-kimi-start-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "The server of Kit is restarted when the Kit blocks in config.toml differ from those it started with, also when GET /api/v1/config already lists them",
        "approveHooks and remove restart the server at once; requireReady syncs the hooks before a session is created or a message is sent",
        "APP_RESTART_NOTE is on the status, the hook state and the sessions when the server of the app started before the Kit hook was written",
        "Tests cover macOS, Linux and Windows with the platform injected"
      ],
      "checks": [],
      "commitMessage": "fix: restart the Kit server of Kimi for changed hooks and ask to restart the Kimi Code app",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "2.2. Хуки действительно работают",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/session-list.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/shapes.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hook-sync.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hooks.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/paths-program.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Hooks of the Kit server by fingerprint; app restart note",
      "why": "Kimi loads hooks only when its server starts; Kit compared the file with GET /api/v1/config, which shows new hooks without running them"
    },
    {
      "acceptance": [
        "With a live server of the app in server/instances, workspaces, trust, sessions, prompts and lists go to it and no kimi web is started",
        "When the app appears while the server of Kit runs, Kit moves to the server of the app once the turns of its sessions ended; when the app is gone, Kit starts its own server on demand",
        "With the server of the app, the Remote Control and restart actions are disabled with a reason and links.mobile is read from the app server",
        "The status says whose server is used (details.server app | kit | null)",
        "A scenario test: the wizard while the app runs creates the session on the app server with its first message"
      ],
      "checks": [],
      "commitMessage": "fix: use the server of the Kimi Code app for Kimi sessions while it runs",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "2.1. Один сервер: сервер приложения, если оно работает",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/links.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/server.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/locks.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/app-server.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/helpers.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "The server of the Kimi Code app as the only server",
      "why": "The app does not see sessions of another server and creates its own workspace for the same folder"
    },
    {
      "acceptance": [
        "With no running turn in the channel, the only project session listed with state running is used",
        "Otherwise the answer stays 409 session-ambiguous with the candidates"
      ],
      "checks": [],
      "commitMessage": "fix: find the running session of wfk session by the session lists of the providers",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "2.3. `wfk session title|plan` без хуков",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "wfk session finds a turn by the lists of the providers",
      "why": "Without hooks the channel knows no running turn although the Kimi session lock lives"
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
        "docs/planning/M9-kimi-start-fixes.md"
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
        "Version 0.6.1 in package files and docs; CHANGELOG entry",
        "node bin/wfk.mjs install and wfk doctor --installed pass",
        "CI on ci/m9-kimi-start-fixes is green on macOS, Linux, Windows x64 and ARM64",
        "The acceptance document lists live checks per OS; items not checked live are recorded as unverified"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.6.1",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M9-kimi-start-fixes.md",
          "heading": "4. Проверка",
          "required": true
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
        "docs/evidence/M9-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Release 0.6.1 with green CI",
      "why": "Release 0.6.1 with green CI"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m9-kimi-start-fixes (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 2/5
- Revision: 502

## Objective

A Kimi session created from the panel is visible in the Kimi Code app with its first message, and the Kit hooks run in it; release 0.6.1

## Acceptance

- While the Kimi Code app runs, Kit creates workspaces and sessions through the server of the app and starts no server of its own
- Hooks written after the server of Kit started take effect: the server is restarted by the fingerprint of the Kit blocks, not by GET /api/v1/config
- When the app was started before the Kit hook was written, the status, the wizard hook step and the sessions say that the app must be restarted
- wfk session title|plan finds a Kimi turn by the live session lock when no hook reached the service
- 0.6.1 is installed locally and CI is green on all four platforms before acceptance

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Hooks of the Kit server by fingerprint; app restart note (work)
  - Commit: fix: restart the Kit server of Kimi for changed hooks and ask to restart the Kimi Code app
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/session-list.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/shapes.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hook-sync.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/hooks.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/paths-program.test.ts
- [DONE] T002 — The server of the Kimi Code app as the only server (work)
  - Commit: fix: use the server of the Kimi Code app for Kimi sessions while it runs
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/links.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/server.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/hooks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/locks.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/server.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/app-server.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/helpers.ts
  - Depends on: T001
- [TODO] T003 — wfk session finds a turn by the lists of the providers (work)
  - Commit: fix: find the running session of wfk session by the session lists of the providers
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/session-titles, product-parts/backend-core/clusters/runtime/modules/cli
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M9-kimi-start-fixes.md
  - Depends on: T001, T002, T003
- [TODO] T004 — Release 0.6.1 with green CI (delivery)
  - Commit: chore: release 0.6.1
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/evidence/M9-acceptance.md
  - Depends on: T001, T002, T003, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
