# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-16T01:44:58.065Z",
    "scopeId": "M35-test-stray-folders"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1115,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "plan-review: PlanQuestion.scopeId, опция scopeOf, questions(projectId), dismiss(projectId, key).",
          "cross-review: question() возвращает OpenQuestion или null; новые deps questions, dismissQuestion, scope; src/question-stale.ts staleReason и createQuestionGate.",
          "agent-channel: src/reminder.ts (REMINDER_SOURCE, remindedTurn, reminderOf), Slot.afterReminder.",
          "cli: questionDeps(toggles, workflow) в review-wiring.ts, scopeOf в session-wiring.ts."
        ],
        "decisions": [
          "Вопрос хранит scopeId активного scope на момент вопроса; старый файл без поля читается с null.",
          "dismiss закрывает вопрос без решения о ревью и без слушателей onAnswer: агенту ничего не уходит.",
          "Ход, начатый только напоминанием (origin reminder или все сообщения reminder), помечает слот afterReminder; освобождённое и detached удержание после него идёт без напоминания.",
          "Удерживаемый хук Stop напоминает к каждому сроку: иначе хук закончился бы без доставки.",
          "README и OVERVIEW: версия 0.14.3, статус M1–M35, абзац и ограничение M36."
        ],
        "references": [
          "docs/planning/M36-plan-question-stale.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
          "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
          "docs/planning/M4-plan-review.md"
        ],
        "result": "Устаревший вопрос о плане закрывается сам при Stop или выборе пути (agent: предложение новее или другой scope; proposal: нет предложения), без решения о ревью. Сессия, которую служба может разбудить, получает одно напоминание подряд; удерживаемый хук Stop — как раньше."
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
      "Вопрос agent закрывается сам при открытом предложении новее вопроса или при другом активном scope; вопрос proposal — когда открытого предложения нет; закрытие не пишет решения о ревью и ничего не шлёт агенту.",
      "decide() не удерживает сессию с устаревшим вопросом, choiceBlocked() не ждёт устаревших вопросов; неустаревший вопрос работает, как в M4 раздел 12.",
      "Освобождённое и detached удержание после хода-напоминания идёт без второго напоминания; удерживаемый хук Stop напоминает, как раньше.",
      "Контракты plan-review, cross-review, agent-channel и cli согласованы с кодом; typecheck, platform-guard и все тесты проходят.",
      "0.14.3 установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-16T01:55:53.896Z",
      "text": "Пользователь, 16.11.2026: на предложение исправить незакрывающийся вопрос о плане и пустые пробуждения — «Исправь». Workflow Kit: пользователь выбрал спецификацию и план без ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "d6f2bb184760b003067444b4f030130602a0dfa0",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M36-plan-question-stale.md",
        "required": true
      },
      {
        "path": "docs/planning/M4-plan-review.md",
        "required": true,
        "heading": "12. Вопрос агента о плане (раунд R2)"
      }
    ],
    "decisions": [
      {
        "at": "2026-11-16T01:55:53.896Z",
        "text": "Устаревший вопрос закрывается лениво — на Stop сессии и при выборе пути — без решения о ревью и без сообщения агенту."
      },
      {
        "at": "2026-11-16T01:55:53.896Z",
        "text": "Вопрос agent устарел при открытом предложении новее askedAt или при активном scope, отличном от scopeId на момент вопроса; вопрос proposal — без открытого предложения."
      },
      {
        "at": "2026-11-16T01:55:53.896Z",
        "text": "Ответ в чате не становится решением о ревью: после предложения панель спрашивает «С ревью / Без ревью» (M4 12.2)."
      },
      {
        "at": "2026-11-16T01:55:53.896Z",
        "text": "Одно напоминание подряд — только для сессий, которые служба может разбудить (M29, M8); удерживаемый хук Stop напоминает каждый раз."
      },
      {
        "at": "2026-11-16T01:55:53.896Z",
        "text": "Живая проверка — на установленной 0.14.3 в тестовом проекте с согласия пользователя, до 4 ходов Claude."
      },
      {
        "at": "2026-11-16T01:55:53.896Z",
        "text": "Рекомендован sequential: две небольшие задачи в разных модулях (обе parallelSafe), живая проверка требует участия пользователя."
      }
    ],
    "delivery": "READY_FOR_ACCEPTANCE",
    "execution": {
      "maxWorkers": 2,
      "ownerSession": "e93021a5-9717-4ec2-833d-db51b48373f3",
      "strategy": "sequential"
    },
    "id": "M36-plan-question-stale",
    "objective": "Вопрос о плане закрывается сам, когда на него ответили делом (предложение плана, новый scope или выбранный путь), а напоминание удержания приходит не чаще одного раза подряд в сессии, которую служба может разбудить",
    "spec": "docs/planning/M36-plan-question-stale.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "plan-review: ask() пишет scopeId из scopeOf (null без него), вопрос старого файла без scopeId читается; dismiss() убирает вопрос из файла и памяти без решения и без слушателей onAnswer; questions(projectId) перечисляет открытые вопросы.",
        "cross-review: staleReason по таблице раздела 2.2 (agent — предложение новее askedAt или другой активный scope; proposal — нет открытого предложения), причина в журнале без текста вопроса.",
        "decide() закрывает устаревший вопрос и продолжает как без него (предложение без решения задаёт вопрос proposal по M4 12.2); неустаревший — прежний hold waiting-for-plan-decision; choiceBlocked() закрывает устаревшие вопросы проекта до проверки; без новых зависимостей поведение прежнее.",
        "cli подключает scopeOf и зависимости questions, dismissQuestion, scope; module.md plan-review, cross-review и cli обновлены в том же коммите.",
        "npm run typecheck, npm run check:platforms и npm test проходят."
      ],
      "checks": [],
      "commitMessage": "fix(review): close a plan question the plan has already answered",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M36-plan-question-stale.md",
          "required": true,
          "heading": "2. Решение"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/question-stale.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/question-stale.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Устаревший вопрос о плане закрывается сам",
      "why": "Вопрос, на который ответили в чате, висит до конца scope и блокирует выбор пути"
    },
    {
      "acceptance": [
        "Освобождённое удержание (M29) после хода, начатого только напоминанием, не ставит второго напоминания и снимается сроком; ответ или сообщение по-прежнему будит сессию; после обычного хода напоминание приходит, как раньше.",
        "Detached (M8) — так же: после хода-напоминания повторное удержание без напоминания длится до пробуждения.",
        "Удерживаемый хук Stop (сессию нельзя разбудить) напоминает по каждому сроку, как раньше.",
        "module.md agent-channel обновлён в том же коммите; файлы не длиннее 400 строк; npm run typecheck, npm run check:platforms и npm test проходят."
      ],
      "checks": [],
      "commitMessage": "fix(channel): remind a wakeable held session once in a row",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M36-plan-question-stale.md",
          "required": true,
          "heading": "2.4. Одно напоминание подряд (`agent-channel`)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/release.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/reminder.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/release.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/detached.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Одно напоминание удержания подряд для сессий, которые служба может разбудить",
      "why": "Каждые 9 минут открытого вопроса сессия получала пустой ход с напоминанием"
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
        "docs/planning/M36-plan-question-stale.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md"
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
        "Версия 0.14.3 в package.json и package-lock.json (только поля версии), запись CHANGELOG в разделе Fixed.",
        "npm run typecheck, npm run check:platforms, npm test и npm run build:kit пройдены; node bin/wfk.mjs install поставил 0.14.3; wfk doctor --installed — всё в порядке; /api/health показывает 0.14.3.",
        "С согласия пользователя (до 4 ходов Claude) в тестовом проекте на установленной 0.14.3: после ответа в чате и scope:propose карточка вопроса агента исчезла после хода и появился вопрос proposal; за 20 минут ожидания не больше одного напоминания; после ответа на карточке выбор пути работает. Без согласия — «не проверено вживую», покрыто тестами.",
        "Результат и хронология записаны в docs/evidence/M36-acceptance.md со списком проверок по ОС: macOS — агент и пользователь, Windows и Linux — CI; проверка поставки отделена от пользовательской приёмки; работающие сессии не перезапущены без согласия пользователя."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver the stale plan question fix",
      "confirmation": "Я подтверждаю заранее все следующие шаги включая T004",
      "context": [
        {
          "path": "docs/planning/M36-plan-question-stale.md",
          "required": true,
          "heading": "4. Проверка"
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
        "docs/evidence/M36-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "Поставка 0.14.3, установка и живая проверка установленной версии",
      "why": "Исправление проверяется на настоящей панели и сессии Claude"
    },
    {
      "acceptance": [
        "Точный SHA задачи T003 отправлен в ветку ci/M36-plan-question-stale; CI зелёная на macOS, Linux, Windows x64 и ARM64; ссылка на прогон и SHA записаны в docs/evidence/M36-acceptance.md.",
        "Ветка main не публикуется: публикация — после приёмки и закрытия scope по команде пользователя."
      ],
      "checks": [],
      "commitMessage": "docs: record stale plan question fix cross-platform CI",
      "confirmation": "Я подтверждаю заранее все следующие шаги включая T004",
      "context": [
        {
          "path": "docs/planning/M36-plan-question-stale.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M36-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "DONE",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "Поставка не готова, пока CI не зелёная на всех ОС"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M36-plan-question-stale (ACTIVE)
- Delivery: READY_FOR_ACCEPTANCE
- Execution: sequential
- Current task: none
- Progress: 5/5
- Revision: 1115

## Objective

Вопрос о плане закрывается сам, когда на него ответили делом (предложение плана, новый scope или выбранный путь), а напоминание удержания приходит не чаще одного раза подряд в сессии, которую служба может разбудить

## Acceptance

- Вопрос agent закрывается сам при открытом предложении новее вопроса или при другом активном scope; вопрос proposal — когда открытого предложения нет; закрытие не пишет решения о ревью и ничего не шлёт агенту.
- decide() не удерживает сессию с устаревшим вопросом, choiceBlocked() не ждёт устаревших вопросов; неустаревший вопрос работает, как в M4 раздел 12.
- Освобождённое и detached удержание после хода-напоминания идёт без второго напоминания; удерживаемый хук Stop напоминает, как раньше.
- Контракты plan-review, cross-review, agent-channel и cli согласованы с кодом; typecheck, platform-guard и все тесты проходят.
- 0.14.3 установлена на macOS, CI точного SHA поставки зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно.

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Устаревший вопрос о плане закрывается сам (work, parallel-safe)
  - Commit: fix(review): close a plan question the plan has already answered
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/question-stale.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/question-stale.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts
- [DONE] T002 — Одно напоминание удержания подряд для сессий, которые служба может разбудить (work, parallel-safe)
  - Commit: fix(channel): remind a wakeable held session once in a row
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/release.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/detached.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/slots.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/reminder.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/release.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/detached.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M36-plan-question-stale.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md
  - Depends on: T001, T002
- [DONE] T003 — Поставка 0.14.3, установка и живая проверка установленной версии (delivery)
  - Commit: chore: deliver the stale plan question fix
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M36-acceptance.md
  - Depends on: T001, T002, DOCS-R1
- [DONE] T004 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record stale plan question fix cross-platform CI
  - Files: docs/evidence/M36-acceptance.md
  - Depends on: T003, DOCS-R1

Digest: Устаревший вопрос о плане закрывается сам при Stop или выборе пути (agent: предложение новее или другой scope; proposal: нет предложения), без решения о ревью. Сессия, которую служба может разбудить, получает одно напоминание подряд; удерживаемый хук Stop — как раньше.

State changes only through `scripts/workflow` commands. History lives in Git.
