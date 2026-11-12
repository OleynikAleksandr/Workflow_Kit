# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 674,
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
      "sendDirect пишет очищенный текст в <debug>.text через .partial; файл, не забранный за directWaitMs, удаляется, результат false",
      "session.exp и pty/host.ts вставляют <debug>.text как bracketed paste с меткой MESSAGE_SENT; <debug>.message всегда означает пробуждение",
      "wakeSession не пишет <debug>.message, пока ждёт <debug>.text",
      "session.exp и pty/host.ts запускают claude с WFK_PANEL_SESSION=1; у провайдера Claude marksPanelProcess: true, поле описано в контракте Provider",
      "readMessages пропускает записи транскрипта с isCompactSummary: true",
      "Тесты покрывают оба файла на macOS/Linux и Windows (платформа подставлена); module.md и chat.md обновлены"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T10:05:56.328Z",
      "text": "Assignment m19-session-chat-fixes-T001-1: task T001 of scope m19-session-chat-fixes"
    },
    "baselineCommit": "5613587b04b3f48eac3a6ebed01e97ca73198b76",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M19-session-chat-fixes.md",
        "required": true,
        "heading": "2. Решение"
      }
    ],
    "decisions": [],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m19-session-chat-fixes-T001-1",
    "objective": "Claude: файл <debug>.text, метка процесса панели, лента без сводки сжатия: Старый сценарий принимал текст за просьбу разбудить, и сообщение терялось",
    "spec": "docs/planning/M19-session-chat-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "sendDirect пишет очищенный текст в <debug>.text через .partial; файл, не забранный за directWaitMs, удаляется, результат false",
        "session.exp и pty/host.ts вставляют <debug>.text как bracketed paste с меткой MESSAGE_SENT; <debug>.message всегда означает пробуждение",
        "wakeSession не пишет <debug>.message, пока ждёт <debug>.text",
        "session.exp и pty/host.ts запускают claude с WFK_PANEL_SESSION=1; у провайдера Claude marksPanelProcess: true, поле описано в контракте Provider",
        "readMessages пропускает записи транскрипта с isCompactSummary: true",
        "Тесты покрывают оба файла на macOS/Linux и Windows (платформа подставлена); module.md и chat.md обновлены"
      ],
      "checks": [],
      "commitMessage": "fix: send panel text through its own control file and mark the panel process",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M19-session-chat-fixes.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/chat.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Claude: файл <debug>.text, метка процесса панели, лента без сводки сжатия",
      "why": "Старый сценарий принимал текст за просьбу разбудить, и сообщение терялось"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m19-session-chat-fixes-T001-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 674

## Objective

Claude: файл <debug>.text, метка процесса панели, лента без сводки сжатия: Старый сценарий принимал текст за просьбу разбудить, и сообщение терялось

## Acceptance

- sendDirect пишет очищенный текст в <debug>.text через .partial; файл, не забранный за directWaitMs, удаляется, результат false
- session.exp и pty/host.ts вставляют <debug>.text как bracketed paste с меткой MESSAGE_SENT; <debug>.message всегда означает пробуждение
- wakeSession не пишет <debug>.message, пока ждёт <debug>.text
- session.exp и pty/host.ts запускают claude с WFK_PANEL_SESSION=1; у провайдера Claude marksPanelProcess: true, поле описано в контракте Provider
- readMessages пропускает записи транскрипта с isCompactSummary: true
- Тесты покрывают оба файла на macOS/Linux и Windows (платформа подставлена); module.md и chat.md обновлены

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Claude: файл <debug>.text, метка процесса панели, лента без сводки сжатия (work, parallel-safe)
  - Commit: fix: send panel text through its own control file and mark the panel process
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/screen.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/win-host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/chat.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/windows.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/harness.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md

State changes only through `scripts/workflow` commands. History lives in Git.
