# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 52,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md (TrustPreview.choices, TrustChoices, TrustInherited, grantTrust with choices, POST .../trust { token, choices })",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md (direct ~/.claude.json writer, external imports scan, dialog errors, acceptance checklist)",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md (service turn without policies, thread/unsubscribe, serviceTurnWaitMs)",
          "product-parts/control-panel/clusters/web-panel/modules/provider-cards/module.md (required trust choices, inherited mark)",
          "product-parts/backend-core/clusters/runtime/modules/data-store/module.md, http-server, project-registry, kit-structure and process-supervisor module.md (Consumers sections and Next sections match the code)"
        ],
        "decisions": [
          "Claude trust is never granted through pty dialogs: grantTrust patches projects[<folder>] in ~/.claude.json itself (backup, temp file with the same mode, rename, read-back check, up to 3 attempts against concurrent Claude writes).",
          "External CLAUDE.md imports are a separate user decision: TrustPreview.choices carries required choices without a default, grantTrust(project, token, choices) receives the answers via POST .../trust { token, choices }, and the panel does not send Trust without a required answer.",
          "Remote Control needs trust of the exact folder; a trusted parent folder is only shown as an inherited mark (TrustPreview.inherited, TrustState.inherited).",
          "Kit scripts never answer Claude dialogs: trust, imports and any other Enter/Esc dialog stop the process and fail the operation with the dialog text and a hint to resolve it in the trust preview.",
          "Codex service turn passes no sandboxPolicy/approvalPolicy overrides so the thread keeps the user's settings; thread/unsubscribe runs in finally before the daemon connection closes, and its failure is only logged.",
          "Claude trust needs only claude (no expect), so it is available on Linux without expect; sessions and environment still need expect; Windows stays unsupported (Q1)."
        ],
        "references": [
          "docs/evidence/M1-acceptance.md",
          "docs/architecture/OVERVIEW.md",
          "README.md",
          "docs/planning/M1-providers.md",
          "docs/planning/M1-orchestrator-core.md"
        ],
        "result": "R2 fixes defects D1-D3 of the first Mac acceptance. Claude trust is written atomically into ~/.claude.json without pty dialogs (trust.exp removed); the preview requires an allow/deny choice for external CLAUDE.md imports and marks a trusted parent folder (inherited); session/environment scripts never press keys in dialogs. Codex releases the thread with thread/unsubscribe after the service turn, which has no policy overrides. node_modules left git, module contracts match the code, Kit is 2.2.2. Repeat device acceptance is pending."
      },
      "id": "R2",
      "kind": "fixes",
      "status": "CLOSED",
      "title": "Исправления по приёмке вехи 1"
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
      "at": "2026-11-05T17:55:33.504Z",
      "text": "Assignment m1-orchestrator-core-DOCS-R2-1: task DOCS-R2 of scope m1-orchestrator-core"
    },
    "baselineCommit": "9ff382521d876ad73adfb497207c69d40f9b15fe",
    "blockedReason": null,
    "context": [],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m1-orchestrator-core-DOCS-R2-1",
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
      "commitMessage": "docs: reconcile documentation for R2",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M1-providers.md",
        "product-parts/backend-core/clusters/runtime/modules/data-store/module.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-registry/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m1-orchestrator-core-DOCS-R2-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 52

## Objective

Reconcile project documentation and write the round digest: Keep the project context current for the next agent and close the round.

## Acceptance

- Project-wide documents describe the round result
- The round digest records result, decisions, contracts and references

## Rounds

### R2 — Исправления по приёмке вехи 1 (fixes, CLOSED)

- [DONE] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M1-providers.md, product-parts/backend-core/clusters/runtime/modules/data-store/module.md, product-parts/backend-core/clusters/http-api/modules/http-server/module.md, product-parts/backend-core/clusters/projects/modules/project-registry/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md

Digest: R2 fixes defects D1-D3 of the first Mac acceptance. Claude trust is written atomically into ~/.claude.json without pty dialogs (trust.exp removed); the preview requires an allow/deny choice for external CLAUDE.md imports and marks a trusted parent folder (inherited); session/environment scripts never press keys in dialogs. Codex releases the thread with thread/unsubscribe after the service turn, which has no policy overrides. node_modules left git, module contracts match the code, Kit is 2.2.2. Repeat device acceptance is pending.

State changes only through `scripts/workflow` commands. History lives in Git.
