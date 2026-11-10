# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-10T14:21:25.547Z",
    "scopeId": "m10-kimi-orchestration"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 549,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "agent-channel: waiting(key, id) and UNDELIVERED_NOTE",
          "autopilot: SessionAutopilot.start (PlanStart), start() answers already: true while a start runs, createPlanStarts in src/start.ts",
          "session-view: planView.starting, START_STEPS, START_SLOW_TEXT, START_AGAIN_LABEL"
        ],
        "decisions": [
          "The plan phase stays computed from Kit status only; the start is autopilot state over the ready phase",
          "The start step is read anew from the channel each time; it lives in service memory"
        ],
        "references": [
          "docs/planning/M11-plan-start.md"
        ],
        "result": "The plan card shows the start of the plan: a spinner with the step (sending, delivered, slow) replaces «Начать выполнение плана» until Kit records the started work; a failed start (not delivered in 60 s or turn ended without started work) shows the reason and «Начать заново»; a repeated start sends nothing twice."
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
      "After the press the start button is replaced at once by a spinner with the current step; «Пауза» appears only after Kit records a started task or assignment",
      "A start that was not delivered within 60 s or whose turn ended without started work shows the reason and «Начать заново»",
      "A repeated start while a start is under way sends no second message to the agent",
      "0.6.4 is installed locally and CI is green on all four platforms before acceptance"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-10T14:37:12.447Z",
      "text": "Пользователь: «Да, нужно сделать так, как предложил ты, но если вдруг по какой-то причине нажатая кнопка не приведет к запуску плана, нужно, чтобы состояние этой кнопки менялось с пауза на объяснение проблемы или на предложение повторно начать выполнение… Может сделать какой-то спиннер… Когда реально прошла команда по всем ступенькам и работа начата, появляется кнопка «Пауза».» | Execution mode chosen by the user: sequential: Последовательно"
    },
    "baselineCommit": "e953812082291e462b80246ac2ed850b3e898bfc",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M11-plan-start.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-10T14:37:12.447Z",
        "text": "The plan phase is still computed only from Kit status; the start is an autopilot state over the ready phase"
      },
      {
        "at": "2026-11-10T14:37:12.447Z",
        "text": "Problems: not-delivered (60 s or a channel delivery note) and turn-ended (Stop held as waiting-for-plan-start); a slow start after 3 min is a hint, not a problem"
      },
      {
        "at": "2026-11-10T14:37:12.447Z",
        "text": "The start state lives in service memory and is lost on a service restart"
      },
      {
        "at": "2026-11-10T14:37:12.447Z",
        "text": "Release number 0.6.4"
      }
    ],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "claude:01493504-12b2-440a-84f4-17acf7bc1c61",
      "strategy": "sequential"
    },
    "id": "m11-plan-start",
    "objective": "Pressing «Начать выполнение плана» shows a spinner with the start steps until Kit records the started work, explains a failed start with «Начать заново», and never sends a second start message; release 0.6.4",
    "spec": "docs/planning/M11-plan-start.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "SessionAutopilot.start has at, messageId, step sending|delivered and problem, and is null once the plan phase is no longer ready, after accept and after close",
        "not-delivered after START_DELIVERY_MS (60 s) in the queue or with the channel note about an undelivered message; turn-ended when the turn begun by the start message ends with the phase ready, and the Stop is held as waiting-for-plan-start",
        "A slow flag after START_SLOW_MS (3 min) of a delivered start without Kit progress",
        "start while a start runs without a problem enqueues nothing and answers already: true; start after a problem restarts without a duplicate queued message",
        "Tests cover every step, problem and the repeated start; module.md of autopilot (and agent-channel if changed) describes the start state"
      ],
      "checks": [],
      "commitMessage": "feat: track the plan start in the autopilot",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M11-plan-start.md",
          "heading": "2. Решение",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/start.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/orchestration.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/start.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Start state in the autopilot",
      "why": "The panel needs to know whether the start message reached the agent and whether the start failed"
    },
    {
      "acceptance": [
        "planView gives starting { step, since, slow, problem } in the ready phase from the owner session's autopilot start, and no start button while a start runs without a problem",
        "The card shows a spinner «Запускаю план» with the step text and a timer, the slow hint, and on a problem the reason with «Начать заново»; the heading is «План запускается»",
        "The spinner appears at once on the press; a failed start request brings the button back and shows the error",
        "Tests of session-model cover the start states; module.md of session-view describes them"
      ],
      "checks": [],
      "commitMessage": "feat: show the plan start progress on the plan card",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M11-plan-start.md",
          "heading": "2.4. Карточка плана в панели",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Plan card spinner and failed start",
      "why": "The user must see that the press was taken and what happens until the work starts"
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
        "docs/planning/M11-plan-start.md"
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
        "Version 0.6.4 in package.json, package-lock.json, README, the installation guide and OVERVIEW; CHANGELOG entry 0.6.4",
        "docs/evidence/M11-acceptance.md lists live checks per OS and who runs them",
        "0.6.4 is installed locally and wfk doctor --installed reports no problems",
        "CI is green on macOS, Linux, Windows x64 and Windows ARM64 for the pushed ci/m11-plan-start commit"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.6.4",
      "confirmation": "Да, собирай 0.6.4",
      "context": [],
      "dependencies": [
        "T002",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "CHANGELOG.md",
        "docs/evidence/M11-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Release 0.6.4",
      "why": "The user checks the fix live in the installed app"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m11-plan-start (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 4/4
- Revision: 549

## Objective

Pressing «Начать выполнение плана» shows a spinner with the start steps until Kit records the started work, explains a failed start with «Начать заново», and never sends a second start message; release 0.6.4

## Acceptance

- After the press the start button is replaced at once by a spinner with the current step; «Пауза» appears only after Kit records a started task or assignment
- A start that was not delivered within 60 s or whose turn ended without started work shows the reason and «Начать заново»
- A repeated start while a start is under way sends no second message to the agent
- 0.6.4 is installed locally and CI is green on all four platforms before acceptance

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Start state in the autopilot (work)
  - Commit: feat: track the plan start in the autopilot
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/types.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/start.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/orchestration.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/start.test.ts
- [DONE] T002 — Plan card spinner and failed start (work)
  - Commit: feat: show the plan start progress on the plan card
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts
  - Depends on: T001
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M11-plan-start.md
  - Depends on: T001, T002
- [DONE] T003 — Release 0.6.4 (delivery)
  - Commit: chore: release 0.6.4
  - Files: package.json, package-lock.json, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, CHANGELOG.md, docs/evidence/M11-acceptance.md
  - Depends on: T002, DOCS-R1

Digest: The plan card shows the start of the plan: a spinner with the step (sending, delivered, slow) replaces «Начать выполнение плана» until Kit records the started work; a failed start (not delivered in 60 s or turn ended without started work) shows the reason and «Начать заново»; a repeated start sends nothing twice.

State changes only through `scripts/workflow` commands. History lives in Git.
