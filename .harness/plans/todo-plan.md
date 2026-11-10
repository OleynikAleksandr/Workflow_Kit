# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-10T11:09:50.905Z",
    "scopeId": "m9-kimi-start-fixes"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 538,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "provider-kimi: capabilities().orchestration available while Kimi is installed and supported",
          "autopilot: EXECUTOR_HOWTO.kimi { text, repeat: true }",
          "kit-structure: the agents-section text changed; projects show outdated until the structure update"
        ],
        "decisions": [
          "Kimi executors follow the Codex procedure; AgentSwarm, the Tower mode and background executors are not used",
          "EXECUTOR_HOWTO.kimi has repeat true: Kimi reads AGENTS.md only at the start of a session",
          "The mechanism for providers without orchestration stays; no provider of Kit uses it now"
        ],
        "references": [
          "docs/planning/M10-kimi-orchestration.md"
        ],
        "result": "Kimi Code sessions orchestrate like Claude and ChatGPT: the provider declares orchestration, the autopilot sends the Kimi executor procedure (worktree by the orchestrator, Agent tool in the foreground with cwd, integration by SHA) with the start and every continue, and the AGENTS.md section explicitly allows the Agent tool, also for helpers in the sequential mode."
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
      "The panel offers the orchestrated mode for a Kimi session and the plan starts in it",
      "The start and every continue of an orchestrated scope in a Kimi session carry the Kimi executor procedure: worktree by the orchestrator, Agent tool in the foreground with cwd, integration by SHA",
      "The sequential texts of a Kimi session no longer forbid subagents, and the AGENTS.md section explicitly allows the Agent tool in Kimi sessions",
      "0.6.3 is installed locally and CI is green on all four platforms before acceptance"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-10T11:17:26.832Z",
      "text": "Новый скоуп M10 | Execution mode chosen by the user: sequential: Выполняй последовательно. И собери новый релиз."
    },
    "baselineCommit": "ca950317cab0149ebf101dc46d72cf176918f948",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M10-kimi-orchestration.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-10T11:17:26.832Z",
        "text": "Kimi executors follow the Codex procedure: the orchestrator makes the worktree, Kit removes it after the integration"
      },
      {
        "at": "2026-11-10T11:17:26.832Z",
        "text": "AgentSwarm, the Tower mode and background executors are not used"
      }
    ],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "claude:01493504-12b2-440a-84f4-17acf7bc1c61",
      "strategy": "sequential"
    },
    "id": "m10-kimi-orchestration",
    "objective": "A Kimi Code session runs a scope with executors in worktrees and uses helper subagents in the sequential mode, like Claude and ChatGPT; release 0.6.3",
    "spec": "docs/planning/M10-kimi-orchestration.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "capabilities().orchestration of Kimi is available when Kimi is installed and supported, otherwise unavailable with the reason of the program",
        "EXECUTOR_HOWTO.kimi with repeat true: worktree add by the orchestrator, Agent tool in the foreground with the worktree as cwd, integration:start with the SHA",
        "The sequential texts of a Kimi session carry no sequentialOnlyNote; the mechanism stays for providers without orchestration",
        "The Kimi scenario test chooses orchestrated and the start prompt carries the Kimi procedure",
        "Tests are the same on every OS; module.md of the changed modules and the OS matrix are updated"
      ],
      "checks": [],
      "commitMessage": "feat: let Kimi sessions orchestrate executors with the Agent tool",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M10-kimi-orchestration.md",
          "heading": "2. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/scenarios.test.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/plan-view.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/orchestration.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Orchestration in Kimi sessions",
      "why": "Kit declares that Kimi has no orchestration and tells Kimi never to use subagents"
    },
    {
      "acceptance": [
        "The Kimi item of the orchestration section describes the executor procedure of the autopilot",
        "It explicitly allows the Agent tool in Kimi sessions: executors in orchestrated mode, helpers in main that never commit in sequential mode",
        "The structure test checks the new text; module.md of kit-structure is updated"
      ],
      "checks": [],
      "commitMessage": "feat: describe the Kimi executor procedure and helper subagents in AGENTS.md",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M10-kimi-orchestration.md",
          "heading": "2.3. `kit-structure`: раздел `AGENTS.md`",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "AGENTS.md section allows the Agent tool in Kimi sessions",
      "why": "Kimi launches subagents only when AGENTS.md or the user explicitly allows them"
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
        "docs/planning/M10-kimi-orchestration.md"
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
        "Version 0.6.3 in package files and docs; CHANGELOG entry",
        "node bin/wfk.mjs install and wfk doctor --installed pass",
        "CI on ci/m10-kimi-orchestration is green on macOS, Linux, Windows x64 and ARM64",
        "The acceptance document lists live checks per OS; items not checked live are recorded as unverified"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.6.3",
      "confirmation": "Выполняй последовательно. И собери новый релиз.",
      "context": [
        {
          "path": "docs/planning/M10-kimi-orchestration.md",
          "heading": "4. Проверка",
          "required": true
        }
      ],
      "dependencies": [
        "T001",
        "T002",
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
        "docs/evidence/M10-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Release 0.6.3 with green CI",
      "why": "The user tests Kimi orchestration in a new release"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m10-kimi-orchestration (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 4/4
- Revision: 538

## Objective

A Kimi Code session runs a scope with executors in worktrees and uses helper subagents in the sequential mode, like Claude and ChatGPT; release 0.6.3

## Acceptance

- The panel offers the orchestrated mode for a Kimi session and the plan starts in it
- The start and every continue of an orchestrated scope in a Kimi session carry the Kimi executor procedure: worktree by the orchestrator, Agent tool in the foreground with cwd, integration by SHA
- The sequential texts of a Kimi session no longer forbid subagents, and the AGENTS.md section explicitly allows the Agent tool in Kimi sessions
- 0.6.3 is installed locally and CI is green on all four platforms before acceptance

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Orchestration in Kimi sessions (work)
  - Commit: feat: let Kimi sessions orchestrate executors with the Agent tool
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/test/scenarios.test.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/plan-view.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/orchestration.test.ts
- [DONE] T002 — AGENTS.md section allows the Agent tool in Kimi sessions (work)
  - Commit: feat: describe the Kimi executor procedure and helper subagents in AGENTS.md
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts
  - Depends on: T001
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M10-kimi-orchestration.md
  - Depends on: T001, T002
- [DONE] T003 — Release 0.6.3 with green CI (delivery)
  - Commit: chore: release 0.6.3
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/evidence/M10-acceptance.md
  - Depends on: T001, T002, DOCS-R1

Digest: Kimi Code sessions orchestrate like Claude and ChatGPT: the provider declares orchestration, the autopilot sends the Kimi executor procedure (worktree by the orchestrator, Agent tool in the foreground with cwd, integration by SHA) with the start and every continue, and the AGENTS.md section explicitly allows the Agent tool, also for helpers in the sequential mode.

State changes only through `scripts/workflow` commands. History lives in Git.
