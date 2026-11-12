# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 679,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Provider.marksPanelProcess?: boolean (provider-registry); Claude sets true",
          "HookInput.panelProcess, SessionActivity.external (agent-channel); POST /api/hooks/stop|prompt|turn-end accept panelProcess",
          "cli: ledOutside(provider, activity) gates sendDirect, wakeIdle and deliverToSession; PANEL_SESSION_ENV = WFK_PANEL_SESSION",
          "provider-claude control files: <debug>.text (paste, MESSAGE_SENT) and <debug>.message (wake, WOKEN)",
          "panel-shell: SessionRow.external, handlers.resumeSession, externalText, createSessionScreen(ctx, { resume })"
        ],
        "decisions": [
          "A text pasted in the same poll drops a waiting wake file; an empty <debug>.text is deleted without a paste",
          "External applies only to providers with marksPanelProcess (Claude); ChatGPT and Kimi behave as in 0.9.0",
          "Every hook (stop, prompt, turn-end) updates SessionActivity.external; a slot without hooks is not external",
          "«Продолжить» lives in the session screen header of panel-shell (resumeButton); session-view is unchanged",
          "Kit does not stop already running copies of a session; the user stops them in the panel"
        ],
        "references": [
          "docs/planning/M19-session-chat-fixes.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
          "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
          "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
          "docs/architecture/OVERVIEW.md"
        ],
        "result": "Panel messages to Claude no longer get lost: text goes through <debug>.text (an old script leaves it, the message is queued), <debug>.message is a wake only; the panel's claude runs with WFK_PANEL_SESSION=1, hooks report panelProcess, a session whose last hook lacks the mark is external: queue only, no wake, no auto-resume; a «Продолжить» button resumes it on purpose. The Claude feed skips isCompactSummary records."
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
      "at": "2026-11-12T10:21:24.791Z",
      "text": "Assignment m19-session-chat-fixes-DOCS-R1-1: task DOCS-R1 of scope m19-session-chat-fixes"
    },
    "baselineCommit": "7efd85ec004cccd9ddb17e17a09910a08e863d74",
    "blockedReason": null,
    "context": [],
    "decisions": [],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m19-session-chat-fixes-DOCS-R1-1",
    "objective": "Reconcile project documentation and write the round digest: Keep the project context current for the next agent and close the round.",
    "spec": "docs/planning/M19-session-chat-fixes.md",
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
        "docs/planning/M19-session-chat-fixes.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md"
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

- Scope: assignment-m19-session-chat-fixes-DOCS-R1-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 679

## Objective

Reconcile project documentation and write the round digest: Keep the project context current for the next agent and close the round.

## Acceptance

- Project-wide documents describe the round result
- The round digest records result, decisions, contracts and references

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M19-session-chat-fixes.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md

Digest: Panel messages to Claude no longer get lost: text goes through <debug>.text (an old script leaves it, the message is queued), <debug>.message is a wake only; the panel's claude runs with WFK_PANEL_SESSION=1, hooks report panelProcess, a session whose last hook lacks the mark is external: queue only, no wake, no auto-resume; a «Продолжить» button resumes it on purpose. The Claude feed skips isCompactSummary records.

State changes only through `scripts/workflow` commands. History lives in Git.
