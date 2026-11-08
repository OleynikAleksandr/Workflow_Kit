# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-08T09:05:23.520Z",
    "scopeId": "m3-autostart"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 294,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "agent-channel: hold.timeoutAnswer, onStop/StopEvent",
          "cross-review: createCrossReview, раздел reviews, GET/POST …/reviews/:key",
          "autopilot: опция review (ReviewDecider)",
          "plan-review: locked, onChange",
          "cli: src/review-wiring.ts"
        ],
        "decisions": [
          "Ревью запускается после предложения плана; карточка выбора — после окончания",
          "Не больше 5 кругов",
          "Сессия ревьюера остаётся с меткой «Ревью»",
          "Ревьюер только читает",
          "Переключатель исчезает, пока ревью идёт и для плана, прошедшего ревью"
        ],
        "references": [
          "docs/planning/M4-plan-review.md",
          "docs/evidence/M4-review-probe.md"
        ],
        "result": "Перекрёстное ревью плана: при включённом «Ревью плана» после scope:propose служба создаёт сессию другого провайдера ревьюером и пересылает ходы сторон через хук Stop до REVIEW: APPROVED + REVIEW: AGREED или 5 кругов; панель показывает карточку ревью и метку «Ревью»."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "Fixes after the live review check"
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
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
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
      "status": "DONE",
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
      "status": "DONE",
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
      "confirmation": "Продолжай без остановки вплоть до сборки нового релиза и удали потом все свои пробы",
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
      "status": "DONE",
      "title": "Релиз 0.4.0",
      "why": "Релиз 0.4.0"
    },
    {
      "acceptance": [
        "createSession with detached returns a Codex session right after turn/start, without waiting for turn/completed or the release",
        "Without detached the Codex createSession behaves as before",
        "The cross review creates every reviewer with detached; Claude ignores the option",
        "Tests cover both Codex paths"
      ],
      "checks": [],
      "commitMessage": "fix: start the reviewer session without waiting for its turn",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "11. Исправления после живой проверки (раунд R2)",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md"
      ],
      "fixes": "T003",
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Reviewer session starts without waiting for its turn",
      "why": "A ChatGPT reviewer took 4.5 minutes to start: createSession waited for a turn the review itself holds"
    },
    {
      "acceptance": [
        "A starting review first continues the main turn with the plan request (state preparing)",
        "The main answer goes to the journal and into the reviewer's first message; only then the reviewer is created",
        "An empty answer still starts the reviewer, which is asked to request the plan",
        "Cancel and the toggle work in preparing; the panel shows the new state",
        "Tests cover the preparing flow"
      ],
      "checks": [],
      "commitMessage": "fix: give the reviewer the proposed plan from the main agent",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "11. Исправления после живой проверки (раунд R2)",
          "required": true
        }
      ],
      "dependencies": [
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/store.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts"
      ],
      "fixes": "T003",
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Main agent describes the plan for the reviewer",
      "why": "scope:proposal does not show the plan's tasks to the reviewer"
    },
    {
      "acceptance": [
        "While a working session with the review toggle on has not reviewed the open proposal, the choice card shows no buttons and explains that the review comes first",
        "The service refuses sequential and orchestrated with 409 review-pending in the same case; refine is allowed",
        "With the toggle off or after the review the choice works as before",
        "Tests cover the panel model and the refusal"
      ],
      "checks": [],
      "commitMessage": "fix: keep the mode choice until the plan review starts",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "11.3. Выбор пути не обгоняет ревью",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts"
      ],
      "fixes": "T004",
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Mode choice waits for the plan review",
      "why": "The user chose the mode while the agent still worked after scope:propose, so the review never started"
    },
    {
      "acceptance": [
        "wfk session plan records a question of the calling session; its Stop holds with waiting-for-plan-decision",
        "The answer route records review or plan, sends the agent its Workflow Kit message and wakes it; talk records nothing",
        "A proposal from a session without a decision asks the proposal question before the review or the mode choice",
        "The mode choice waits while a question is open or an undecided working session has not reviewed the proposal",
        "Tests cover the question, the answer, the fallback and the refusal"
      ],
      "checks": [],
      "commitMessage": "feat: ask the user about the specification and plan",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "12. Вопрос агента о плане (раунд R2)",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Plan question in the service",
      "why": "The user decides about a plan and its review at the moment the agent recognises a development task"
    },
    {
      "acceptance": [
        "The session view shows the question card first with the agent's text and the three (or two for a proposal) buttons",
        "The review toggle is gone from the session view",
        "The choice card waits while a question is open",
        "Tests cover the card model"
      ],
      "checks": [],
      "commitMessage": "feat: show the plan question card instead of the review toggle",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "12. Вопрос агента о плане (раунд R2)",
          "required": true
        }
      ],
      "dependencies": [
        "T011"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts"
      ],
      "fixes": null,
      "id": "T012",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Plan question card in the panel",
      "why": "The user answers the agent's question with a card; the always-clickable toggle goes away"
    },
    {
      "acceptance": [
        "The managed AGENTS.md section tells the agent to run wfk session plan before a specification for a development task and never for discussion or research",
        "Structure tests pass with the new section"
      ],
      "checks": [],
      "commitMessage": "feat: tell the agent to ask before a specification and plan",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M4-plan-review.md",
          "heading": "12. Вопрос агента о плане (раунд R2)",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/projects/modules/project-setup/test"
      ],
      "fixes": null,
      "id": "T013",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Agent instruction for the plan question",
      "why": "The agent must know when to ask and when not to"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R2",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T007",
        "T008",
        "T010",
        "T011",
        "T012",
        "T013"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Version 0.4.1 is installed and wfk doctor --installed is ok",
        "A live review with a ChatGPT reviewer gets its first remarks within about a minute and the reviewer sees the plan's tasks"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.4.1",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T008",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "docs/evidence/M4-acceptance.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Release 0.4.1",
      "why": "Release 0.4.1"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m4-plan-review (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 12/15
- Revision: 294

## Objective

Перекрёстное ревью плана: при включённом «Ревью плана» Workflow Kit запускает сессию другого провайдера ревьюером и ведёт пинг-понг замечаний до согласия или 5 кругов

## Acceptance

- Сессия Claude с включённым «Ревью плана» после scope:propose получает ревьюера ChatGPT, и наоборот; карточка выбора появляется после согласия или 5 кругов
- Замечания и ответы доходят без участия пользователя, в том числе когда сторона думает дольше 9 минут
- Ревьюер не меняет файлы; его сессия остаётся в проекте с меткой «Ревью»
- Выключение переключателя останавливает ревью; ошибка запуска ревьюера видна и не блокирует выбор
- Новый релиз установлен, wfk doctor --installed — всё в порядке

## Rounds

### R1 — Implementation (implementation, CLOSED)

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
- [DONE] T004 — Подключить ревью к автопилоту, переключателю и службе (work)
  - Commit: feat: run the cross review after a plan proposal
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts
  - Depends on: T003
- [DONE] T005 — Панель: карточка ревью и метка «Ревью» (work)
  - Commit: feat: show the cross review in the panel
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.css, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T004
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M4-plan-review.md, docs/evidence/M4-review-probe.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/cluster.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md
  - Depends on: T001, T002, T003, T004, T005
- [DONE] T006 — Релиз 0.4.0 (delivery)
  - Commit: chore: release 0.4.0
  - Files: package.json, package-lock.json, docs/evidence/M4-acceptance.md
  - Depends on: T005, DOCS-R1

Digest: Перекрёстное ревью плана: при включённом «Ревью плана» после scope:propose служба создаёт сессию другого провайдера ревьюером и пересылает ходы сторон через хук Stop до REVIEW: APPROVED + REVIEW: AGREED или 5 кругов; панель показывает карточку ревью и метку «Ревью».

### R2 — Fixes after the live review check (fixes, OPEN)

- [DONE] T007 — Reviewer session starts without waiting for its turn (work)
  - Commit: fix: start the reviewer session without waiting for its turn
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/release.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md
  - Fixes: T003
- [DONE] T008 — Main agent describes the plan for the reviewer (work)
  - Commit: fix: give the reviewer the proposed plan from the main agent
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/store.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts
  - Depends on: T007
  - Fixes: T003
- [DONE] T010 — Mode choice waits for the plan review (work)
  - Commit: fix: keep the mode choice until the plan review starts
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts
  - Fixes: T004
- [DONE] T011 — Plan question in the service (work)
  - Commit: feat: ask the user about the specification and plan
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/test, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts
- [DONE] T012 — Plan question card in the panel (work)
  - Commit: feat: show the plan question card instead of the review toggle
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts
  - Depends on: T011
- [TODO] T013 — Agent instruction for the plan question (work)
  - Commit: feat: tell the agent to ask before a specification and plan
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/projects/modules/project-setup/test
- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md
  - Depends on: T007, T008, T010, T011, T012, T013
- [TODO] T009 — Release 0.4.1 (delivery)
  - Commit: chore: release 0.4.1
  - Files: package.json, package-lock.json, docs/evidence/M4-acceptance.md
  - Depends on: T008, DOCS-R2

State changes only through `scripts/workflow` commands. History lives in Git.
