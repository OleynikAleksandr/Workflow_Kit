# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 45,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "product-parts/backend-core/clusters/runtime/modules/cli/module.md (createApp, commands, system section)",
          "product-parts/backend-core/clusters/http-api/modules/http-server/module.md (router, state registry, D8 filter)",
          "product-parts/backend-core/clusters/runtime/modules/data-store/module.md (dirs, config, events, mutex, operations)",
          "product-parts/backend-core/clusters/projects/modules/{project-registry,kit-structure}/module.md",
          "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md (Provider contract)",
          "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/{provider-claude,provider-codex}/module.md",
          "product-parts/system-service/clusters/deployment/modules/service-installer/module.md; control-panel modules panel-shell, provider-cards"
        ],
        "decisions": [
          "Code lives in product-parts/<part>/clusters/<cluster>/modules/<module>; modules import each other only through src/index.ts via # aliases; module.md changes with its code.",
          "Only cli knows all modules: createApp registers routes and /api/state sections (system, projects, structure, providers, operations).",
          "Providers plug in by createProvider factories (DEFAULT_PROVIDERS); server and panel know them only through the provider contract.",
          "Long actions are in-memory operations (202 + operationId) under provider/project mutexes; polling only reads files and caches (D10, D11).",
          "Writes to foreign configs need a one-time preview token bound to a fingerprint, a backup before and a check after (D7).",
          "Processes are stopped only from own records after pid, start time, command line and boot id checks; no pkill (D5, D9).",
          "wfk link and wfk hook live in the cli module; service commands are delegated to service-installer runServiceCommand.",
          "Windows and Linux are covered by tests only; Claude pty and Codex on Windows are unsupported (Q1, Q2)."
        ],
        "references": [
          "docs/architecture/OVERVIEW.md",
          "README.md",
          "docs/planning/M1-orchestrator-core.md",
          "docs/planning/M1-providers.md"
        ],
        "result": "Milestone 1 core is in code: wfk CLI and createApp, data store with operations, HTTP API with the D8 access filter, project registry, Kit structure v1 with the SessionStart hook, provider contract with Claude and Codex providers, process supervisor, web panel with System, Projects, Structure and provider cards, and a service installer wired into the cli and panel. Device acceptance on Mac and iPad is still pending."
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
      "Project-wide documents describe the round result",
      "The round digest records result, decisions, contracts and references"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-05T17:04:40.434Z",
      "text": "Assignment m1-orchestrator-core-DOCS-R1-1: task DOCS-R1 of scope m1-orchestrator-core"
    },
    "baselineCommit": "b22f1afedbfaedc53cc484433599922d3e5b113f",
    "blockedReason": null,
    "context": [],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-DOCS-R1-1",
    "objective": "Reconcile project documentation and write the round digest: Keep the project context current for the next agent and close the round.",
    "spec": "docs/planning/M1-orchestrator-core.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R1",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M1-orchestrator-core.md",
        "docs/architecture/modules/cli.md",
        "docs/architecture/modules/core.md",
        "docs/architecture/modules/server.md",
        "docs/architecture/modules/panel.md",
        "docs/architecture/modules/service.md",
        "docs/architecture/modules/kit-structure.md",
        "docs/architecture/modules/providers.md",
        "docs/architecture/modules/provider-claude.md",
        "docs/architecture/modules/provider-codex.md",
        "node_modules/@types/node/README.md",
        "node_modules/typescript/README.md",
        "node_modules/typescript/SECURITY.md",
        "node_modules/undici-types/README.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/backend-core/product-part.md",
        "product-parts/provider-runtime/product-part.md",
        "product-parts/control-panel/product-part.md",
        "product-parts/system-service/product-part.md",
        "product-parts/backend-core/clusters/runtime/cluster.md",
        "product-parts/backend-core/clusters/http-api/cluster.md",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/provider-runtime/clusters/provider-contract/cluster.md",
        "product-parts/provider-runtime/clusters/provider-adapters/cluster.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/system-service/clusters/deployment/cluster.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-DOCS-R1-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 45

## Objective

Reconcile project documentation and write the round digest: Keep the project context current for the next agent and close the round.

## Acceptance

- Project-wide documents describe the round result
- The round digest records result, decisions, contracts and references

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M1-orchestrator-core.md, docs/architecture/modules/cli.md, docs/architecture/modules/core.md, docs/architecture/modules/server.md, docs/architecture/modules/panel.md, docs/architecture/modules/service.md, docs/architecture/modules/kit-structure.md, docs/architecture/modules/providers.md, docs/architecture/modules/provider-claude.md, docs/architecture/modules/provider-codex.md, node_modules/@types/node/README.md, node_modules/typescript/README.md, node_modules/typescript/SECURITY.md, node_modules/undici-types/README.md, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/backend-core/product-part.md, product-parts/provider-runtime/product-part.md, product-parts/control-panel/product-part.md, product-parts/system-service/product-part.md, product-parts/backend-core/clusters/runtime/cluster.md, product-parts/backend-core/clusters/http-api/cluster.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/provider-runtime/clusters/provider-contract/cluster.md, product-parts/provider-runtime/clusters/provider-adapters/cluster.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/system-service/clusters/deployment/cluster.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md

Digest: Milestone 1 core is in code: wfk CLI and createApp, data store with operations, HTTP API with the D8 access filter, project registry, Kit structure v1 with the SessionStart hook, provider contract with Claude and Codex providers, process supervisor, web panel with System, Projects, Structure and provider cards, and a service installer wired into the cli and panel. Device acceptance on Mac and iPad is still pending.

State changes only through `scripts/workflow` commands. History lives in Git.
