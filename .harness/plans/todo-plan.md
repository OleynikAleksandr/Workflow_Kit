# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-15T17:32:14.088Z",
    "scopeId": "M33-agent-questions"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1079,
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
      "Ответ из карточки асинхронного вопроса при идущем ходе доходит до агента сразу (turn/steer той же обёрткой, что у ChatGPT), без очереди канала и без ожидания конца хода; без хода ответ начинает ход.",
      "Ответ передаётся не больше одного раза (attemptId, журнал попыток); закрытый вопрос, вопрос без общего демона и неверный ответ получают отказ без передачи.",
      "Ответы-обёртки видны в ленте читаемым текстом, закрытая карточка показывает выбранный ответ.",
      "Блокирующие вопросы Codex, вопросы Claude и Kimi, поле ввода, очередь, Stop и параметры не регрессировали; контракты модулей и матрица трёх ОС согласованы.",
      "0.14.1 установлена и проверена вживую на macOS, CI точного SHA зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-15T18:47:05.180Z",
      "text": "Пользователь, 15.11.2026: «Кит выставил его ответ в очередь, и эта очередь никуда не пришла»; «если мы рассчитываем, что ответ выбранный доходит до агента только когда он находится в этапе пассивном, то он никогда не придет. Он же ждет». После проверки на проекте 003: «результаты ответов появились, хоть и в плохо читаемом виде, с ненужной служебной информацией». Workflow Kit: пользователь выбрал спецификацию и план без ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "5e31a5332417a50f2263091c3a94ecab04dfe562",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M34-codex-async-answer.md",
        "required": true
      },
      {
        "path": "docs/design/M33-codex-question-facts.md",
        "required": true,
        "heading": "9. Живая проверка на установленной 0.14.0 (проекты 002 и 003)"
      },
      {
        "path": "docs/planning/M33-codex-async-questions.md",
        "required": true
      },
      {
        "path": "docs/planning/M33-agent-questions.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-15T18:47:05.180Z",
        "text": "Ответ на асинхронный вопрос идёт маршрутом ответа с attemptId и журналом попыток; Codex вливает его в идущий ход turn/steer обёрткой <send_user_message_question_reply>, как ChatGPT; без хода — turn/start тем же текстом."
      },
      {
        "at": "2026-11-15T18:47:05.180Z",
        "text": "Поле ввода панели во время хода не меняется (очередь до конца хода, M18); turn/steer используется только для ответа на вопрос."
      },
      {
        "at": "2026-11-15T18:47:05.180Z",
        "text": "agent-channel не меняется: хук UserPromptSubmit влитого ответа обрабатывается как сообщение пользователя из ChatGPT."
      },
      {
        "at": "2026-11-15T18:47:05.180Z",
        "text": "Не входят: кнопка «Пропустить» ChatGPT, вторая «работающая» сессия Codex в канале, застрявшая очередь проекта 002."
      },
      {
        "at": "2026-11-15T18:47:05.180Z",
        "text": "Живая проверка — на установленной 0.14.1 в задаче поставки T004; бюджет до 2 ходов gpt-6.1-sol только с согласия пользователя."
      },
      {
        "at": "2026-11-15T18:47:05.180Z",
        "text": "Рекомендован sequential: T001 и T002 меняют один модуль provider-codex и общий файл обёртки, живая проверка требует участия пользователя; T003 помечена parallelSafe и может идти параллельно при выборе orchestrated."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 2,
      "ownerSession": "042d4520-34f1-40ea-8271-d3c682bd5c32",
      "strategy": "sequential"
    },
    "id": "M34-codex-async-answer",
    "objective": "Ответ на асинхронный вопрос ChatGPT/Codex из карточки панели входит в идущий ход так же, как ответ из ChatGPT, а лента показывает ответы читаемо",
    "spec": "docs/planning/M34-codex-async-answer.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "question-reply.ts: replyText даёт обёртку раздела 2.2 байт в байт по образцу проекта 003 (элемент на каждую часть, свой текст важнее подписи); parseReply разбирает только целую обёртку с верным questionItemId, иначе null.",
        "answerQuestion для async:… по разделу 2.3: без общего демона, закрытый или неотвечаемый вопрос и неверный ответ — отказ без единого RPC передачи; active — turn/steer с expectedTurnId идущего хода; idle — prepareTurn и turn/start обёрткой; notLoaded — thread/resume без ходов и turn/start; отклонённый turn/steer — одно новое чтение и одна передача; turnId — исход accepted; потерянный ответ демона — question-timeout без повтора; второй отказ демона — question-failed.",
        "commit() записи sent выполняется до передачи; повтор с тем же attemptId через маршрут ответа не передаёт ответ второй раз.",
        "ChatQuestion.reply 'message' описан по разделу 2.1: questionsOut сохраняет answers и delivery у такого вопроса; QUESTION_BY_MESSAGE_REASON не используется для отказа.",
        "Текст вопросов и ответов не попадает в журнал службы; строки журнала — по пункту 9 раздела 2.3.",
        "Тесты на подставном демоне с подставленными darwin, linux и win32; questions.md и chat.md модуля provider-codex, questions.md модуля provider-registry, CONTRACTS.md и OS-MATRIX.md обновлены в том же коммите."
      ],
      "checks": [],
      "commitMessage": "fix(codex): steer the answer of an asynchronous question into the running turn",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M34-codex-async-answer.md",
          "required": true
        },
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/questions.md",
          "required": true
        },
        {
          "path": "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/questions.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Codex: ответ на асинхронный вопрос в идущий ход",
      "why": "Ответ из карточки ждёт в очереди конца хода, а агент ждёт ответа внутри хода"
    },
    {
      "acceptance": [
        "Сообщение пользователя с обёрткой показывается читаемым текстом по разделу 2.4 (один элемент — ответ; несколько — строки «вопрос — ответ»); id, роль и время прежние; преобразование идемпотентно; так же в истории legacy.",
        "Асинхронный вопрос, закрытый обёрткой со своим itemId, получает answers (совпавшая подпись — selected, иначе other); закрытый другим сообщением — без answers, как раньше.",
        "Байты разобранных ответов входят в предел кэша истории; текст ответов в журнал не пишется.",
        "Тесты на подставном демоне с подставленными darwin, linux и win32: thread/turns/list и thread/items/list, история legacy, несколько элементов, обёртка другого вопроса, неверная обёртка остаётся текстом; questions.md и chat.md модуля provider-codex обновлены."
      ],
      "checks": [],
      "commitMessage": "fix(codex): show question replies as text and record their answers",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M34-codex-async-answer.md",
          "required": true
        },
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Codex: ответ в ленте читаемым текстом и answers вопроса",
      "why": "Ответ виден в ленте сырой служебной обёрткой, а закрытая карточка не знает ответа"
    },
    {
      "acceptance": [
        "Карточка вопроса с reply 'message' отправляет ответ маршрутом ответа с attemptId по разделу 2.5; отправка маршрутом сообщения, фаза messaged и текст «Ответ отправлен сообщением» удалены.",
        "Закрытая карточка с answers показывает вопрос и ответ, как закрытая блокирующая; без answers — «Ответ дан сообщением»; место после своего сообщения и строка состояния прежние.",
        "Блокирующие карточки, поле ввода, очередь, Stop и параметры диалога работают как прежде.",
        "Модельные тесты и браузерный прогон в изолированном Chromium зелёные (обе темы, ширина 390 px, сенсорные цели не меньше 44 px); снимки и сверка — в docs/evidence/M34, design-qa.md получил ссылку; questions.md модуля session-chat обновлён."
      ],
      "checks": [],
      "commitMessage": "fix(panel): answer an asynchronous question through the answer route",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M34-codex-async-answer.md",
          "required": true
        },
        {
          "path": "product-parts/control-panel/clusters/web-panel/modules/session-chat/questions.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/question-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m33-async-question.browser.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m34-async-answer.browser.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/questions.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "design-qa.md",
        "docs/evidence/M34/design-qa.md",
        "docs/evidence/M34/T003-async-dark-answered.png",
        "docs/evidence/M34/T003-async-light-390-answered.png"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Панель: карточка асинхронного вопроса отвечает маршрутом ответа",
      "why": "Карточка отправляет ответ маршрутом сообщения, который при идущем ходе ставит его в очередь"
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
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M34-codex-async-answer.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/questions.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "design-qa.md",
        "docs/evidence/M34/design-qa.md"
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
        "Версия 0.14.1 и запись CHANGELOG; сборка и локальная установка выполнены, установленная служба отвечает и показывает 0.14.1.",
        "С согласия пользователя (до 2 ходов gpt-6.1-sol) на установленной 0.14.1 в новом проекте панели: ответ из карточки панели при идущем ходе дошёл до агента без Stop, ответ из ChatGPT и свой текст из панели прошли, лента читаема, карточки показывают ответы, очередь канала пуста; закрытие карточки ChatGPT после ответа панели подтверждено пользователем или помечено «не проверено».",
        "Результат и хронология состояний записаны в docs/evidence/M34-acceptance.md (из переписки — только вопросы и ответы задачи) со списком проверок по ОС: macOS — пользователь и агент, Windows — проверяющий на Windows, Linux — CI; проверка поставки отделена от пользовательской приёмки.",
        "Работающие сессии не перезапущены без согласия пользователя."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver the asynchronous question answer fix",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M34-codex-async-answer.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T001",
        "T002",
        "T003",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M34-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.14.1, установка и живая проверка установленной версии",
      "why": "Исправление проверяется на настоящей панели, ChatGPT и одобренных хуках, где M33 его пропустила"
    },
    {
      "acceptance": [
        "CI ветки ci/M34-codex-async-answer зелёная на macOS, Linux, Windows x64 и ARM64 для точного SHA задачи T004; ссылка на прогон и SHA записаны в docs/evidence/M34-acceptance.md.",
        "Ветка main не публикуется: публикация — после приёмки и закрытия scope по команде пользователя."
      ],
      "checks": [],
      "commitMessage": "docs: record asynchronous question answer cross-platform CI",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M34-codex-async-answer.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T004",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M34-acceptance.md"
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

- Scope: M34-codex-async-answer (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/6
- Revision: 1079

## Objective

Ответ на асинхронный вопрос ChatGPT/Codex из карточки панели входит в идущий ход так же, как ответ из ChatGPT, а лента показывает ответы читаемо

## Acceptance

- Ответ из карточки асинхронного вопроса при идущем ходе доходит до агента сразу (turn/steer той же обёрткой, что у ChatGPT), без очереди канала и без ожидания конца хода; без хода ответ начинает ход.
- Ответ передаётся не больше одного раза (attemptId, журнал попыток); закрытый вопрос, вопрос без общего демона и неверный ответ получают отказ без передачи.
- Ответы-обёртки видны в ленте читаемым текстом, закрытая карточка показывает выбранный ответ.
- Блокирующие вопросы Codex, вопросы Claude и Kimi, поле ввода, очередь, Stop и параметры не регрессировали; контракты модулей и матрица трёх ОС согласованы.
- 0.14.1 установлена и проверена вживую на macOS, CI точного SHA зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Codex: ответ на асинхронный вопрос в идущий ход (work)
  - Commit: fix(codex): steer the answer of an asynchronous question into the running turn
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md
- [TODO] T002 — Codex: ответ в ленте читаемым текстом и answers вопроса (work)
  - Commit: fix(codex): show question replies as text and record their answers
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex
  - Depends on: T001
- [TODO] T003 — Панель: карточка асинхронного вопроса отвечает маршрутом ответа (work, parallel-safe)
  - Commit: fix(panel): answer an asynchronous question through the answer route
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-card.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/question-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m33-async-question.browser.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m34-async-answer.browser.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/questions.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, design-qa.md, docs/evidence/M34/design-qa.md, docs/evidence/M34/T003-async-dark-answered.png, docs/evidence/M34/T003-async-light-390-answered.png
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M34-codex-async-answer.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/questions.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, design-qa.md, docs/evidence/M34/design-qa.md
  - Depends on: T001, T002, T003
- [TODO] T004 — Поставка 0.14.1, установка и живая проверка установленной версии (delivery)
  - Commit: chore: deliver the asynchronous question answer fix
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M34-acceptance.md
  - Depends on: T001, T002, T003, DOCS-R1
- [TODO] T005 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record asynchronous question answer cross-platform CI
  - Files: docs/evidence/M34-acceptance.md
  - Depends on: T004, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
