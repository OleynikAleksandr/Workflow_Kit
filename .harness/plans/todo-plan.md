# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-14T15:25:39.788Z",
    "scopeId": "m29-claude-controls-instant"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 977,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-claude screen: model frame effortLevel, effortDefault; ModelRow.checked; freshAck accepts 'with <level> effort'",
          "provider-claude parameter-menu.ts: seekRow, effortLevels, Step.quiet; catalog efforts values [] for a model without an effort row",
          "provider-claude service: NO_EFFORTS reason for a model known to have no effort choice"
        ],
        "decisions": [
          "Effort is read and changed in the /model effort row and applied with s; /effort only for Ultracode",
          "The /model menu closes with s on the checked current model; Esc only without a checked row or on cancel",
          "Unknown levels of a new model are read by discovery right after the model change to keep it within 3 s"
        ],
        "references": [
          "docs/planning/M30-claude-feed-quiet.md",
          "docs/evidence/M30-claude-feed-quiet.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md"
        ],
        "result": "Claude Desktop no longer shows /effort, Cancelled or 'Kept model as' lines from the Kit host: effort levels are read and changed in the /model effort row, the menu closes with the session-only key s, and /effort opens only for an explicit Ultracode toggle. Changes still confirm in 1-3 s; a model without an effort row says so."
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
      "After the catalog read, an effort change and a model change, the Claude transcript has no /effort command and no 'Kept model as' entry",
      "Effort and model still change only for the session within 3 s on macOS; ~/.claude/settings.json never changes",
      "A model without an effort row shows no effort options and a reason instead of waiting",
      "CI is green on macOS, Linux, Windows x64 and Windows ARM64 for the delivery commit"
    ],
    "acceptanceNote": {
      "at": "2026-11-14T16:25:58.962Z",
      "text": "Пользователь принял план в панели Workflow Kit"
    },
    "approval": {
      "at": "2026-11-14T15:40:21.566Z",
      "text": "Пользователь, 14.11.2026: «Нельзя никак этот нюанс исправить, чтобы в диалоге на десктопе не появлялись эти слэш-команды?» и «Ну да, открывай новый скоп, создавай план и выполняй его.» | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "656cb63915b59704a4f917428fc005851bf67ea4",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M30-claude-feed-quiet.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-14T15:40:21.566Z",
        "text": "Effort is read and changed in the /model effort row and applied with s; /effort opens only for an explicit Ultracode toggle"
      },
      {
        "at": "2026-11-14T15:40:21.566Z",
        "text": "The /model menu closes with s on the current model instead of Esc; Esc stays only for a cancelled transaction"
      }
    ],
    "delivery": "ACCEPTED",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "92b77570-773b-4173-8244-c327d009daa3",
      "strategy": "sequential"
    },
    "id": "m30-claude-feed-quiet",
    "objective": "Claude Desktop shows no service /effort or 'Kept model' lines from the Kit host: effort is read and changed in the /model menu, which closes with the session-only key s",
    "spec": "docs/planning/M30-claude-feed-quiet.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Engine tests on 2.1.325 frames: effort levels read with clamps and (default), level restored and menu closed with s",
        "An effort change uses /model and s, never /effort",
        "A model change reads unknown levels on the target row; a model without an effort row gets values []",
        "Without a checked current row the catalog falls back to Esc"
      ],
      "checks": [],
      "commitMessage": "fix: read and change Claude effort in the model menu without /effort",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M30-claude-feed-quiet.md",
          "heading": "3. Решение (provider-claude)",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-menu.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Хост: усилие и каталог через меню /model",
      "why": "/effort and Esc in /model leave visible lines in Claude Desktop"
    },
    {
      "acceptance": [
        "A model with values [] shows no effort options and the reason «У этой модели нет выбора усилия»"
      ],
      "checks": [],
      "commitMessage": "fix: explain a Claude model without effort choice",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M30-claude-feed-quiet.md",
          "heading": "3.3. Служба (`parameter-controls.ts`)",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Служба: модель без выбора усилия",
      "why": "A known empty effort list must not wait forever"
    },
    {
      "acceptance": [
        "Disposable Kit project, Haiku, at most two short turns: no /effort and no 'Kept model as' entries after catalog, effort and model changes",
        "Changes confirm within 3 s; the hash of ~/.claude/settings.json is unchanged; results in docs/evidence/M30"
      ],
      "checks": [],
      "commitMessage": "test: record a quiet Claude transcript for model and effort changes",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M30-claude-feed-quiet.md",
          "heading": "5. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T001",
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M30-claude-feed-quiet.md",
        "docs/evidence/M30",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "docs/evidence/M30/t003-live.json",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Живая проверка: переписка без /effort и Kept model",
      "why": "The behaviour depends on the real Claude terminal and transcript"
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
        "docs/planning/M30-claude-feed-quiet.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/evidence/M30-claude-feed-quiet.md"
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
        "Version 0.13.4 in package files and CHANGELOG; installed locally, /api/health reports 0.13.4 and doctor passes",
        "Evidence of the local delivery recorded"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.13.4",
      "confirmation": "Ну да, открывай новый скоп, создавай план и выполняй его.",
      "context": [],
      "dependencies": [
        "T003",
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
        "docs/evidence/M30-claude-feed-quiet.md",
        "docs/evidence/M30",
        "docs/evidence/M30/local-delivery.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поставка 0.13.4 и локальная установка",
      "why": "The user tests the fix in the installed panel"
    },
    {
      "acceptance": [
        "CI on ci/m30-claude-feed-quiet for the delivery SHA is green on macOS ARM64, Linux x64, Windows x64 and Windows ARM64; recorded in the evidence"
      ],
      "checks": [],
      "commitMessage": "docs: record green CI for the quiet Claude feed",
      "confirmation": "Ну да, открывай новый скоп, создавай план и выполняй его.",
      "context": [],
      "dependencies": [
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M30-claude-feed-quiet.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "Every change covers macOS, Linux and Windows"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m30-claude-feed-quiet (ACTIVE)
- Delivery: ACCEPTED
- Execution: sequential
- Current task: none
- Progress: 6/6
- Revision: 977

## Objective

Claude Desktop shows no service /effort or 'Kept model' lines from the Kit host: effort is read and changed in the /model menu, which closes with the session-only key s

## Acceptance

- After the catalog read, an effort change and a model change, the Claude transcript has no /effort command and no 'Kept model as' entry
- Effort and model still change only for the session within 3 s on macOS; ~/.claude/settings.json never changes
- A model without an effort row shows no effort options and a reason instead of waiting
- CI is green on macOS, Linux, Windows x64 and Windows ARM64 for the delivery commit

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Хост: усилие и каталог через меню /model (work)
  - Commit: fix: read and change Claude effort in the model menu without /effort
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, docs/architecture/OS-MATRIX.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-menu.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts
- [DONE] T002 — Служба: модель без выбора усилия (work)
  - Commit: fix: explain a Claude model without effort choice
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-controls.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, docs/architecture/OS-MATRIX.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-controls.test.ts
  - Depends on: T001
- [DONE] T003 — Живая проверка: переписка без /effort и Kept model (work)
  - Commit: test: record a quiet Claude transcript for model and effort changes
  - Files: docs/evidence/M30-claude-feed-quiet.md, docs/evidence/M30, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/parameter-engine.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, docs/evidence/M30/t003-live.json, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-engine.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-wanted.test.ts
  - Depends on: T001, T002
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M30-claude-feed-quiet.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/native-parameters.md, docs/architecture/OS-MATRIX.md, docs/evidence/M30-claude-feed-quiet.md
  - Depends on: T001, T002, T003
- [DONE] T004 — Поставка 0.13.4 и локальная установка (delivery)
  - Commit: chore: release 0.13.4
  - Files: package.json, package-lock.json, README.md, CHANGELOG.md, docs/usage.md, docs/installation.md, docs/setup.md, docs/evidence/M30-claude-feed-quiet.md, docs/evidence/M30, docs/evidence/M30/local-delivery.md
  - Depends on: T003, DOCS-R1
- [DONE] T005 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record green CI for the quiet Claude feed
  - Files: docs/evidence/M30-claude-feed-quiet.md
  - Depends on: T004, DOCS-R1

Digest: Claude Desktop no longer shows /effort, Cancelled or 'Kept model as' lines from the Kit host: effort levels are read and changed in the /model effort row, the menu closes with the session-only key s, and /effort opens only for an explicit Ultracode toggle. Changes still confirm in 1-3 s; a model without an effort row says so.

State changes only through `scripts/workflow` commands. History lives in Git.
