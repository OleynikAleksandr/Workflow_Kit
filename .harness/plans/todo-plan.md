# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": null,
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 667,
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
      "panel-shell имеет слот sessionChat и рисует его на экране сессии под sessionBody, перерисовывая только при изменении данных; расширение и стили session-chat подключены",
      "Служба раздаёт /session-chat/ и имеет алиас #session-chat; на экране любой сессии запущенной из исходников службы видна карточка «Диалог»",
      "Тесты panel-shell и cli покрывают слот и монтирование; module.md затронутых модулей, cluster.md и product-part.md обновлены",
      "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-12T07:52:43.482Z",
      "text": "Assignment m18-session-chat-T007-1: task T007 of scope m18-session-chat"
    },
    "baselineCommit": "5e3a50e1e7590f29d321bacd1c7c8561d704490b",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M18-session-chat.md",
        "required": true
      }
    ],
    "decisions": [],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": null,
      "strategy": "sequential"
    },
    "id": "assignment-m18-session-chat-T007-1",
    "objective": "Подключение диалога к панели и службе: Модуль диалога должен появиться на экране сессии установленной службы",
    "spec": "docs/planning/M18-session-chat.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "panel-shell имеет слот sessionChat и рисует его на экране сессии под sessionBody, перерисовывая только при изменении данных; расширение и стили session-chat подключены",
        "Служба раздаёт /session-chat/ и имеет алиас #session-chat; на экране любой сессии запущенной из исходников службы видна карточка «Диалог»",
        "Тесты panel-shell и cli покрывают слот и монтирование; module.md затронутых модулей, cluster.md и product-part.md обновлены",
        "Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md"
      ],
      "checks": [],
      "commitMessage": "feat: show the session chat on the session screen",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M18-session-chat.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md",
        "package.json",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/control-panel/product-part.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Подключение диалога к панели и службе",
      "why": "Модуль диалога должен появиться на экране сессии установленной службы"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: assignment-m18-session-chat-T007-1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/1
- Revision: 667

## Objective

Подключение диалога к панели и службе: Модуль диалога должен появиться на экране сессии установленной службы

## Acceptance

- panel-shell имеет слот sessionChat и рисует его на экране сессии под sessionBody, перерисовывая только при изменении данных; расширение и стили session-chat подключены
- Служба раздаёт /session-chat/ и имеет алиас #session-chat; на экране любой сессии запущенной из исходников службы видна карточка «Диалог»
- Тесты panel-shell и cli покрывают слот и монтирование; module.md затронутых модулей, cluster.md и product-part.md обновлены
- Проверки kit:doc-size (документ до 28000 байт) и kit:file-lines проходят: новый код лежит в новых файлах, подробности контракта — в отдельном документе модуля со ссылкой из module.md

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T007 — Подключение диалога к панели и службе (work)
  - Commit: feat: show the session chat on the session screen
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/session-screen.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/index.html, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/session-chat.md, package.json, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/control-panel/product-part.md

State changes only through `scripts/workflow` commands. History lives in Git.
