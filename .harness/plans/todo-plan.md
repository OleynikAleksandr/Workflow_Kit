# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": "T004",
  "lastClosed": {
    "closedAt": "2026-11-08T09:05:23.520Z",
    "scopeId": "m3-autostart"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 274,
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
      "Сессия Claude с включённым «Ревью плана» после scope:propose получает ревьюера ChatGPT, и наоборот; карточка выбора появляется после согласия или 5 кругов",
      "Замечания и ответы доходят без участия пользователя, в том числе когда сторона думает дольше 9 минут",
      "Ревьюер не меняет файлы; его сессия остаётся в проекте с меткой «Ревью»",
      "Выключение переключателя останавливает ревью; ошибка запуска ревьюера видна и не блокирует выбор",
      "Новый релиз установлен, wfk doctor --installed — всё в порядке"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-08T09:15:09.241Z",
      "text": "Пользователь 2026-11-08: «Давай теперь реализуем функционал Ревью плана! Claude Должен запускать в качестве ревьюера ChatGPT и наоборот… пока они оба не придут к соглашению, что документы готовы»; ответы: после предложения плана, 5 кругов, сессию ревьюера оставить с меткой «Ревью», ревьюер только читает | Execution mode chosen by the user: sequential: Последовательно"
    },
    "baselineCommit": "61fffc0eaa25bddafeb854e668880c655f33b273",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M4-plan-review.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-08T09:15:09.241Z",
        "text": "Ревью запускается после scope:propose при включённом «Ревью плана»; карточка выбора — после согласия"
      },
      {
        "at": "2026-11-08T09:15:09.241Z",
        "text": "Не больше 5 кругов, затем решает пользователь"
      },
      {
        "at": "2026-11-08T09:15:09.241Z",
        "text": "Сессия ревьюера остаётся в проекте с меткой «Ревью»"
      },
      {
        "at": "2026-11-08T09:15:09.241Z",
        "text": "Ревьюер только читает и пишет замечания"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "m4-plan-review",
    "objective": "Перекрёстное ревью плана: при включённом «Ревью плана» Workflow Kit запускает сессию другого провайдера ревьюером и ведёт пинг-понг замечаний до согласия или 5 кругов",
    "spec": "docs/planning/M4-plan-review.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "На временном проекте сессии ChatGPT и Claude, созданные службой с первым сообщением, присылают Stop в службу",
        "Ответ block продолжает ход, напоминание по таймауту работает",
        "Результат и вывод (идём дальше или стоп) записаны в docs/evidence/M4-review-probe.md"
      ],
      "checks": [],
      "commitMessage": "docs: record the cross review probe",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "8. Риск и проба",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M4-review-probe.md",
        "docs/planning/M4-plan-review.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Проба: ревьюер в другой сессии получает и отдаёт сообщения через хук Stop",
      "why": "Не проверено, что сессия ChatGPT, созданная службой, держит хук Stop и продолжает ход по ответу block"
    },
    {
      "acceptance": [
        "Решатель может держать хук с timeoutAnswer: по истечении срока уходит block с текстом",
        "Наблюдатель Stop получает последнее сообщение хода и то, чем ход начат (доставка, напоминание, пользователь)",
        "Тесты канала проходят"
      ],
      "checks": [],
      "commitMessage": "feat: hold a stop hook with a reminder and report finished turns",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "4. Ожидание без потерь",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Канал: удержание с напоминанием и наблюдатель Stop",
      "why": "Канал: удержание с напоминанием и наблюдатель Stop"
    },
    {
      "acceptance": [
        "Ревью проходит starting → reviewing ↔ answering → agreed/disagreed/failed/cancelled по разделам 3–4 спецификации",
        "Маркеры REVIEW: APPROVED/CHANGES/AGREED, лимит 5 кругов, пересылаются только ходы, начатые доставкой",
        "Состояние хранится в .workflow-kit/local/reviews и переживает перезапуск",
        "Тесты на фейках провайдеров и канала проходят"
      ],
      "checks": [],
      "commitMessage": "feat: add the cross review state machine",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "3. Ход ревью",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "package.json",
        "product-parts/workflow-engine/clusters/session-loop/cluster.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/store.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Модуль cross-review: машина состояний, тексты, хранение",
      "why": "Модуль cross-review: машина состояний, тексты, хранение"
    },
    {
      "acceptance": [
        "Открытое предложение сессии с включённым ревью запускает ревьюера другого провайдера, хук основной держится waiting-for-review",
        "Сессия ревьюера не получает решений автопилота",
        "Выключение переключателя отменяет ревью",
        "Раздел review в /api/state и GET /api/projects/:id/reviews/:key",
        "Тесты службы проходят"
      ],
      "checks": [],
      "commitMessage": "feat: run the cross review after a plan proposal",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "7. Модули",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "IN_PROGRESS",
      "title": "Подключить ревью к автопилоту, переключателю и службе",
      "why": "Подключить ревью к автопилоту, переключателю и службе"
    },
    {
      "acceptance": [
        "Пока ревью идёт, на экране основной сессии карточка «Ревью плана» вместо карточки выбора: ревьюер, круг N из 5, кто отвечает, журнал",
        "После окончания — строка итога над карточкой выбора",
        "У сессии ревьюера метка «Ревью» и ссылка на основную, нет переключателя и карточки выбора"
      ],
      "checks": [],
      "commitMessage": "feat: show the cross review in the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "6. Состояние и панель",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Панель: карточка ревью и метка «Ревью»",
      "why": "Панель: карточка ревью и метка «Ревью»"
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
        "T002",
        "T003",
        "T004",
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M4-plan-review.md",
        "docs/evidence/M4-review-probe.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/cluster.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md"
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
        "0.4.0 установлен, wfk doctor --installed — всё в порядке",
        "Живая проверка: ревью Claude ↔ ChatGPT на тестовом проекте записана в docs/evidence/M4-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.4.0",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T005",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M4-acceptance.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Релиз 0.4.0",
      "why": "Релиз 0.4.0"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m4-plan-review (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: T004
- Progress: 3/7
- Revision: 274

## Objective

Перекрёстное ревью плана: при включённом «Ревью плана» Workflow Kit запускает сессию другого провайдера ревьюером и ведёт пинг-понг замечаний до согласия или 5 кругов

## Acceptance

- Сессия Claude с включённым «Ревью плана» после scope:propose получает ревьюера ChatGPT, и наоборот; карточка выбора появляется после согласия или 5 кругов
- Замечания и ответы доходят без участия пользователя, в том числе когда сторона думает дольше 9 минут
- Ревьюер не меняет файлы; его сессия остаётся в проекте с меткой «Ревью»
- Выключение переключателя останавливает ревью; ошибка запуска ревьюера видна и не блокирует выбор
- Новый релиз установлен, wfk doctor --installed — всё в порядке

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Проба: ревьюер в другой сессии получает и отдаёт сообщения через хук Stop (work)
  - Commit: docs: record the cross review probe
  - Files: docs/evidence/M4-review-probe.md, docs/planning/M4-plan-review.md
- [DONE] T002 — Канал: удержание с напоминанием и наблюдатель Stop (work)
  - Commit: feat: hold a stop hook with a reminder and report finished turns
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md
  - Depends on: T001
- [DONE] T003 — Модуль cross-review: машина состояний, тексты, хранение (work)
  - Commit: feat: add the cross review state machine
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/cross-review, package.json, product-parts/workflow-engine/clusters/session-loop/cluster.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/store.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts
  - Depends on: T002
- [IN_PROGRESS] T004 — Подключить ревью к автопилоту, переключателю и службе (work)
  - Commit: feat: run the cross review after a plan proposal
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md
  - Depends on: T003
- [TODO] T005 — Панель: карточка ревью и метка «Ревью» (work)
  - Commit: feat: show the cross review in the panel
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T004
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M4-plan-review.md, docs/evidence/M4-review-probe.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/cluster.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T001, T002, T003, T004, T005
- [TODO] T006 — Релиз 0.4.0 (delivery)
  - Commit: chore: release 0.4.0
  - Files: package.json, package-lock.json, docs/evidence/M4-acceptance.md
  - Depends on: T005, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
