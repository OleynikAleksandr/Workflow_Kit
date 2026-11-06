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
  "revision": 94,
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
      "status": "TODO",
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
      "status": "TODO",
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
      "status": "TODO",
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
      "confirmation": null,
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
      "status": "TODO",
      "title": "Релиз раунда 1",
      "why": "Релиз раунда 1"
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
- Progress: 0/4
- Revision: 94

## Objective

Исправления и дополнения после вехи 2; раунд 1 — имена сессий Workflow Kit видны в приложениях Claude и ChatGPT, новый релиз

## Acceptance

- Имя сессии, заданное в Workflow Kit, видно в ChatGPT и в Claude
- Новый релиз установлен, wfk doctor --installed — всё в порядке

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Имя сессии Codex в ChatGPT (work, parallel-safe)
  - Commit: fix: rename Codex threads that the daemon does not hold
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md
- [TODO] T002 — Имя сессии Claude через хук (work, parallel-safe)
  - Commit: feat: send the Kit session name to Claude through the prompt hook
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M3-fixes.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Depends on: T001, T002
- [TODO] T003 — Релиз раунда 1 (delivery)
  - Commit: chore: install the M3 round 1 release
  - Files: docs/evidence/M3-acceptance.md
  - Depends on: T001, T002, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
