# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 676,
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
      "Строка сессии в модели панели несёт external из активности канала (state.channel) для провайдера, который возобновляет сессии",
      "reviveSession не отправляет resume для внешней сессии; для остальных работает как раньше",
      "На экране внешней сессии строка состояния «Сессию ведёт приложение Claude вне панели; сообщения придут агенту с ближайшим хуком», кнопка «Продолжить» доступна",
      "Тесты панели покрывают оба случая; module.md обновлён"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T10:05:56.889Z",
      "text": "Assignment m19-session-chat-fixes-T003-1: task T003 of scope m19-session-chat-fixes"
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
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m19-session-chat-fixes-T003-1",
    "objective": "Панель: внешнюю сессию не возобновлять при открытии экрана: Открытие экрана сессии запускало второй процесс Claude с тем же идентификатором",
    "spec": "docs/planning/M19-session-chat-fixes.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Строка сессии в модели панели несёт external из активности канала (state.channel) для провайдера, который возобновляет сессии",
        "reviveSession не отправляет resume для внешней сессии; для остальных работает как раньше",
        "На экране внешней сессии строка состояния «Сессию ведёт приложение Claude вне панели; сообщения придут агенту с ближайшим хуком», кнопка «Продолжить» доступна",
        "Тесты панели покрывают оба случая; module.md обновлён"
      ],
      "checks": [],
      "commitMessage": "fix: do not resume a session another process runs when its screen opens",
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
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/activity-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: внешнюю сессию не возобновлять при открытии экрана",
      "why": "Открытие экрана сессии запускало второй процесс Claude с тем же идентификатором"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m19-session-chat-fixes-T003-1 (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 1/1
- Revision: 676

## Objective

Панель: внешнюю сессию не возобновлять при открытии экрана: Открытие экрана сессии запускало второй процесс Claude с тем же идентификатором

## Acceptance

- Строка сессии в модели панели несёт external из активности канала (state.channel) для провайдера, который возобновляет сессии
- reviveSession не отправляет resume для внешней сессии; для остальных работает как раньше
- На экране внешней сессии строка состояния «Сессию ведёт приложение Claude вне панели; сообщения придут агенту с ближайшим хуком», кнопка «Продолжить» доступна
- Тесты панели покрывают оба случая; module.md обновлён

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T003 — Панель: внешнюю сессию не возобновлять при открытии экрана (work, parallel-safe)
  - Commit: fix: do not resume a session another process runs when its screen opens
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/activity-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md

State changes only through `scripts/workflow` commands. History lives in Git.
