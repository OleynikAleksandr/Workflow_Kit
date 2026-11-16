# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-16T14:59:04.142Z",
    "scopeId": "M37-plan-close-flow"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1135,
  "rounds": [
    {
      "digest": null,
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
      "title": "Carried over"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "Kit 2.2.6: секция AGENTS.md и схемы называют папку .harness/inputs/ (git-ignored) для входных JSON; строка next при READY_FOR_ACCEPTANCE и ACCEPTED называет пути вне коммитов; отказ close перечисляет пути.",
      "После «Принять план» и «Закрыть план» сессия-владелец получает сообщение Workflow Kit и отвечает одной-двумя фразами; удержанный Stop с причиной ready-for-acceptance отпускается; метка активности — «План принят» и «План закрыт» (без обещания закрытия).",
      "Карточка плана в фазах acceptance и accepted показывает файлы вне коммитов и кнопку «Попросить агента убрать»; отказ закрытия — по-русски, с именами файлов; tidy отказывает понятным текстом, когда владельца нет или он не получает сообщений.",
      "Законченное ревью закрытого или заменённого scope не показывается в боковой панели основной сессии; идущее ревью и карточка ревьюера — как раньше.",
      "Контракты модулей, OS-MATRIX и документы Kit согласованы с кодом; typecheck, platform-guard и все тесты проходят.",
      "0.14.4 установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; живая проверка Windows записана за проверяющим на Windows (до проведения — «не проверено вживую на Windows»); пользовательская приёмка отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-16T14:59:04.142Z",
      "text": "Пользователь 16.11.2026 на предложение исправить красную CI 43859413953 (Windows x64 и ARM64: EBUSY при удалении временной папки в after() теста autopilot/test/flow.test.ts) через carryover T005 в новый scope, задачу исправления теста и повторный CI без force: «Да, проведи исправление.» Подтверждение поставки T005: «Подтверждаю.»"
    },
    "baselineCommit": "2b0bd0de4588a18b04fad7d29b9b61a1da4d67d3",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M37-plan-close-flow.md",
        "required": true
      },
      {
        "path": "docs/planning/M37-plan-close-facts.md",
        "required": false
      },
      {
        "path": "docs/planning/M33-full-autopilot.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-16T14:59:04.142Z",
        "text": "Carried over unfinished tasks from scope M37-plan-close-flow."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 2,
      "ownerSession": "da6065c6-a99c-4b9f-bd95-2a6d6be687dc",
      "strategy": "sequential"
    },
    "id": "M37-plan-close-flow-fix",
    "objective": "Приёмка и закрытие плана из панели: агент узнаёт о них и отвечает, файлы вне коммитов видны заранее и убираются одной кнопкой, Kit называет папку для входных JSON, карточка ревью закрытого плана не показывается",
    "spec": "docs/planning/M37-plan-close-flow.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "after() теста flow.test.ts удаляет временную папку с повторами (rm с maxRetries и retryDelay, как в тестах cli и project-setup) и не оставляет её при занятой папке на Windows; код службы не меняется.",
        "Все тесты autopilot проходят локально; module.md (раздел ОС M37) и OS-MATRIX называют исправление для macOS, Linux и Windows x64/ARM64.",
        "typecheck, platform-guard и npm test проходят."
      ],
      "checks": [],
      "commitMessage": "test(autopilot): remove the flow test project with retries on Windows",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M37-plan-close-flow.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "F001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Уборка временного проекта теста flow.test.ts на Windows",
      "why": "CI 43859413953 на 2b0bd0d: на Windows x64 и ARM64 after() теста autopilot/test/flow.test.ts падает с EBUSY при rmdir …\\demo — команда Kit, запущенная оставшимся таймером канала, ещё работает в папке проекта; все тесты файла прошли, macOS и Linux зелёные (дефект теста T002)"
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
        "F001"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M37-plan-close-flow.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "docs/architecture/OS-MATRIX.md"
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
        "По правилу проекта «Three operating systems» (AGENTS.md) точный SHA задачи T004 отправлен в служебную ветку: git push origin <sha>:refs/heads/ci/M37-plan-close-flow, без --force; задача начата с подтверждения пользователя (task:start --confirmed).",
        "CI зелёная на macOS, Linux, Windows x64 и ARM64; ссылка на прогон и SHA записаны в docs/evidence/M37-acceptance.md; при красной CI задача блокируется (task:block) и решение принимает пользователь.",
        "Ветка main не отправляется и релиз не публикуется: публикация — после приёмки и закрытия scope по команде пользователя (правило «GitHub publication»)."
      ],
      "checks": [],
      "commitMessage": "docs: record plan closing flow cross-platform CI",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M37-plan-close-flow.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M37-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "Поставка не готова, пока CI не зелёная на всех ОС"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M37-plan-close-flow-fix (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/3
- Revision: 1135

## Objective

Приёмка и закрытие плана из панели: агент узнаёт о них и отвечает, файлы вне коммитов видны заранее и убираются одной кнопкой, Kit называет папку для входных JSON, карточка ревью закрытого плана не показывается

## Acceptance

- Kit 2.2.6: секция AGENTS.md и схемы называют папку .harness/inputs/ (git-ignored) для входных JSON; строка next при READY_FOR_ACCEPTANCE и ACCEPTED называет пути вне коммитов; отказ close перечисляет пути.
- После «Принять план» и «Закрыть план» сессия-владелец получает сообщение Workflow Kit и отвечает одной-двумя фразами; удержанный Stop с причиной ready-for-acceptance отпускается; метка активности — «План принят» и «План закрыт» (без обещания закрытия).
- Карточка плана в фазах acceptance и accepted показывает файлы вне коммитов и кнопку «Попросить агента убрать»; отказ закрытия — по-русски, с именами файлов; tidy отказывает понятным текстом, когда владельца нет или он не получает сообщений.
- Законченное ревью закрытого или заменённого scope не показывается в боковой панели основной сессии; идущее ревью и карточка ревьюера — как раньше.
- Контракты модулей, OS-MATRIX и документы Kit согласованы с кодом; typecheck, platform-guard и все тесты проходят.
- 0.14.4 установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; живая проверка Windows записана за проверяющим на Windows (до проведения — «не проверено вживую на Windows»); пользовательская приёмка отдельно.

## Rounds

### R1 — Carried over (implementation, OPEN)

- [TODO] F001 — Уборка временного проекта теста flow.test.ts на Windows (work)
  - Commit: test(autopilot): remove the flow test project with retries on Windows
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/flow.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, docs/architecture/OS-MATRIX.md
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M37-plan-close-flow.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, docs/architecture/OS-MATRIX.md
  - Depends on: F001
- [TODO] T005 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record plan closing flow cross-platform CI
  - Files: docs/evidence/M37-acceptance.md
  - Depends on: DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
