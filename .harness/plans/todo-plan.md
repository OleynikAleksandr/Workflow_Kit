# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-06T17:23:09.352Z",
    "scopeId": "m2-interface-and-process"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 105,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-codex: renameSession всегда thread/name/set; RENAME_LATER_NOTE удалён",
          "agent-channel: HookInput.sessionTitle из session_title",
          "session-titles: appTitle(key, current), CLAUDE_NEXT_NOTE, synced для Claude",
          "cli: ответ prompt сессии Claude несёт hookSpecificOutput.sessionTitle"
        ],
        "decisions": [
          "Codex: проверка «тред загружен» перед thread/name/set убрана (проверено на демоне: тред не загружается)",
          "Claude: имя передаёт хук Kit, а не агент (/rename — команда пользователя); одно имя отправляется один раз за работу службы, чтобы не перебивать переименование в приложении"
        ],
        "references": [
          "docs/planning/M3-fixes.md"
        ],
        "result": "Имена сессий Workflow Kit уходят в приложения: Codex — thread/name/set демона для любого треда без загрузки; Claude — hookSpecificOutput.sessionTitle в ответе хука UserPromptSubmit, один раз на имя."
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
      "Имя сессии, заданное в Workflow Kit, видно в ChatGPT и в Claude",
      "Новый релиз установлен, wfk doctor --installed — всё в порядке"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-06T17:27:53.577Z",
      "text": "Пользователь: «И открыть следующий по дальнейшим исправлениям, корректировкам, дополнениям. … возможность переименования в самих десктопах. Сессий. … разберись, сделай, и собери новый релиз.» | Execution mode chosen by the user: sequential: Последовательно"
    },
    "baselineCommit": "ae5d1e7f4368c673e6dc54e75c8b4d4f661e83ba",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M3-fixes.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-06T17:27:53.577Z",
        "text": "Codex: thread/name/set без проверки загрузки треда"
      },
      {
        "at": "2026-11-06T17:27:53.577Z",
        "text": "Claude: имя передаёт хук UserPromptSubmit полем hookSpecificOutput.sessionTitle"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cfa00ffe-c414-4ae6-9953-e3d2906b3705",
      "strategy": "sequential"
    },
    "id": "m3-fixes",
    "objective": "Исправления и дополнения после вехи 2; раунд 1 — имена сессий Workflow Kit видны в приложениях Claude и ChatGPT, новый релиз",
    "spec": "docs/planning/M3-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "renameSession вызывает thread/name/set для незагруженного треда и возвращает synced: true",
        "Отказ демона — synced: false с причиной и повтор при следующем ходе",
        "Тред не загружается ради имени (нет thread/resume)"
      ],
      "checks": [],
      "commitMessage": "fix: rename Codex threads that the daemon does not hold",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "4. Раунд 1: имена сессий в приложениях",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Имя сессии Codex в ChatGPT",
      "why": "Имя не доходило до ChatGPT: служба отказывалась, пока тред не загружен"
    },
    {
      "acceptance": [
        "Вход хука читает session_title",
        "Ответ на UserPromptSubmit сессии Claude несёт hookSpecificOutput.sessionTitle, пока имя в Claude отличается от имени Kit",
        "После совпадения имени поле не отправляется и synced: true",
        "additionalContext очереди сообщений сохраняется в том же ответе"
      ],
      "checks": [],
      "commitMessage": "feat: send the Kit session name to Claude through the prompt hook",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "4. Раунд 1: имена сессий в приложениях",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Имя сессии Claude через хук",
      "why": "Агент не может переименовать сессию Claude; хук Kit может"
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
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M3-fixes.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
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
        "node bin/wfk.mjs install и wfk doctor --installed — всё в порядке",
        "Имя из панели видно в ChatGPT и в Claude; результат записан в docs/evidence/M3-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "chore: install the M3 round 1 release",
      "confirmation": "разберись, сделай, и собери новый релиз",
      "context": [],
      "dependencies": [
        "T001",
        "T002",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Релиз раунда 1",
      "why": "Релиз раунда 1"
    },
    {
      "acceptance": [
        "load() отправляет имена Codex с synced: false (ручное имя или тема) через rename",
        "Имя с synced: true повторно не отправляется"
      ],
      "checks": [],
      "commitMessage": "fix: retry unsynced Codex names when the service starts",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M3-fixes.md",
          "heading": "4. Раунд 1: имена сессий в приложениях",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md"
      ],
      "fixes": "T001",
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Повтор неотправленных имён Codex при запуске службы",
      "why": "После перезапуска службы имя со synced: false ждало хода в этой сессии и не доходило до ChatGPT"
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
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md"
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
        "node bin/wfk.mjs install и wfk doctor --installed — всё в порядке",
        "Имена сессий видны в ChatGPT и в Claude; результат записан в docs/evidence/M3-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "chore: install the M3 round 2 release",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T004",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M3-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Релиз раунда 2",
      "why": "Релиз раунда 2"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m3-fixes (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 5/7
- Revision: 105

## Objective

Исправления и дополнения после вехи 2; раунд 1 — имена сессий Workflow Kit видны в приложениях Claude и ChatGPT, новый релиз

## Acceptance

- Имя сессии, заданное в Workflow Kit, видно в ChatGPT и в Claude
- Новый релиз установлен, wfk doctor --installed — всё в порядке

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Имя сессии Codex в ChatGPT (work, parallel-safe)
  - Commit: fix: rename Codex threads that the daemon does not hold
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
- [DONE] T002 — Имя сессии Claude через хук (work, parallel-safe)
  - Commit: feat: send the Kit session name to Claude through the prompt hook
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M3-fixes.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001, T002
- [DONE] T003 — Релиз раунда 1 (delivery)
  - Commit: chore: install the M3 round 1 release
  - Files: docs/evidence/M3-acceptance.md
  - Depends on: T001, T002, DOCS-R1

Digest: Имена сессий Workflow Kit уходят в приложения: Codex — thread/name/set демона для любого треда без загрузки; Claude — hookSpecificOutput.sessionTitle в ответе хука UserPromptSubmit, один раз на имя.

### R2 — Fixes (fixes, OPEN)

- [DONE] T004 — Повтор неотправленных имён Codex при запуске службы (work)
  - Commit: fix: retry unsynced Codex names when the service starts
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md
  - Fixes: T001
- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md
  - Depends on: T004
- [TODO] T005 — Релиз раунда 2 (delivery)
  - Commit: chore: install the M3 round 2 release
  - Files: docs/evidence/M3-acceptance.md
  - Depends on: T004, DOCS-R2

State changes only through `scripts/workflow` commands. History lives in Git.
