# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 49,
  "rounds": [
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Исправления по приёмке вехи 1"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "node_modules удалён из индекса git (git rm -r --cached node_modules), файлы на диске остаются; .gitignore (блок Workflow Kit) его исключает",
      "Разделы «Дальше» и упоминания будущих задач T00x в module.md data-store, http-server, project-registry, kit-structure, process-supervisor приведены к факту"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T17:51:08.696Z",
      "text": "Assignment m1-orchestrator-core-T013-1: task T013 of scope m1-orchestrator-core"
    },
    "baselineCommit": "f2154104d0df2c173241b79959daf1e19957c1fb",
    "blockedReason": null,
    "context": [],
    "decisions": [],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-T013-1",
    "objective": "node_modules вне git и актуальные контракты модулей: node_modules закоммичен коммитом QUALITY; разделы «Дальше» в module.md устарели после раунда R1",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "node_modules удалён из индекса git (git rm -r --cached node_modules), файлы на диске остаются; .gitignore (блок Workflow Kit) его исключает",
        "Разделы «Дальше» и упоминания будущих задач T00x в module.md data-store, http-server, project-registry, kit-structure, process-supervisor приведены к факту"
      ],
      "checks": [],
      "commitMessage": "chore: stop tracking node_modules and refresh module contracts",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "node_modules",
        "product-parts/backend-core/clusters/runtime/modules/data-store/module.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md"
      ],
      "fixes": null,
      "id": "T013",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "node_modules вне git и актуальные контракты модулей",
      "why": "node_modules закоммичен коммитом QUALITY; разделы «Дальше» в module.md устарели после раунда R1"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-T013-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 49

## Objective

node_modules вне git и актуальные контракты модулей: node_modules закоммичен коммитом QUALITY; разделы «Дальше» в module.md устарели после раунда R1

## Acceptance

- node_modules удалён из индекса git (git rm -r --cached node_modules), файлы на диске остаются; .gitignore (блок Workflow Kit) его исключает
- Разделы «Дальше» и упоминания будущих задач T00x в module.md data-store, http-server, project-registry, kit-structure, process-supervisor приведены к факту

## Rounds

### R2 — Исправления по приёмке вехи 1 (fixes, OPEN)

- [TODO] T013 — node_modules вне git и актуальные контракты модулей (work)
  - Commit: chore: stop tracking node_modules and refresh module contracts
  - Files: node_modules, product-parts/backend-core/clusters/runtime/modules/data-store/module.md, product-parts/backend-core/clusters/http-api/modules/http-server/module.md, product-parts/backend-core/clusters/projects/modules/project-registry/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md

State changes only through `scripts/workflow` commands. History lives in Git.
