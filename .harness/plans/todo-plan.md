# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-06T07:38:39.028Z",
    "scopeId": "m1-orchestrator-core"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 59,
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
      "Сценарий визуальной приёмки из раздела 14 спецификации пройден пользователем на Mac и iPad",
      "После «Создать и открыть в ChatGPT / Claude» пользователю не задаётся вопросов: проект, процесс Kit, доверие, хуки и сессия готовятся сами, чат открывается сам",
      "Обязательные проверки качества (типы, тесты) проходят"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-06T08:11:14.601Z",
      "text": "Пользователь: «Да, начинай» — после согласования макета («Да, все правильно, ты уловил, все отлично»), решений «Интерфейс и процесс вместе», «Собранный Kit 2.2.2 сейчас», «Взять экран «Домой» iPad» и разрешения проверить хук Stop на устройстве («Да, проверить») | Execution mode chosen by the user: sequential: Пользователь: «Последовательно»"
    },
    "baselineCommit": "1a6c139324f5ae135b836b14b56608d20d9c81af",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M2-interface-and-process.md",
        "required": true
      },
      {
        "path": "docs/design/ui-mockup.html",
        "required": false
      },
      {
        "path": "docs/architecture/OVERVIEW.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-06T08:11:14.601Z",
        "text": "Процесс в проектах — собранный Harness Workflow Kit 2.2.2 из нашего репозитория (gzip-бандл с SHA-256), установка с --host harness; перенос исходников — отдельная веха"
      },
      {
        "at": "2026-11-06T08:11:14.601Z",
        "text": "Канал к агенту — хуки Stop и UserPromptSubmit (проверено 2026-11-06: Stop с decision block возвращает агента к работе у Claude и Codex, ожидание 75 с не прерывается)"
      },
      {
        "at": "2026-11-06T08:11:14.601Z",
        "text": "Ревью плана — переключатель на сессию, рецензент — CLI другого провайдера только на чтение; виден до выбора пути"
      },
      {
        "at": "2026-11-06T08:11:14.601Z",
        "text": "Старые пункты вехи 2 (сканер доверия, раскладка окон, авторизация панели) переносятся в следующие вехи; экран «Домой» iPad входит"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 2,
      "ownerSession": "cfa00ffe-c414-4ae6-9953-e3d2906b3705",
      "strategy": "sequential"
    },
    "id": "m2-interface-and-process",
    "objective": "Веха 2: новый интерфейс Workflow Kit по согласованному макету и процесс Kit 2.2.2 в проектах — мастер проекта с одним согласием, первая сессия ChatGPT или Claude, карточки плана и выбора пути, ревью плана, автопилот через хуки, имена сессий, экран «Домой» iPad",
    "spec": "docs/planning/M2-interface-and-process.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "kit-bundle хранит vendor/workflow-kit-2.2.2.mjs.gz и PROVENANCE (harness-ai e4226208, SHA-256 036c82fb602435575f03464c2f9c0c9ec12845da680263052a411f0fd32e0fc2); распаковка в каталог данных с проверкой хеша, при несовпадении — KIT_NO_BUNDLE",
        "kit-runner выполняет inspect и install --host harness бандлом приложения, остальные команды — бандлом проекта; разбирает конверт Kit (ok, code, message, nextAction), свои ошибки KIT_SPAWN, KIT_TIMEOUT, KIT_OUTPUT",
        "Слежение за .harness/plans и .harness/workflow/local с тишиной 300 мс вызывает status и scope:proposal; раздел workflow в /api/state по проектам; опрос панели команд не запускает",
        "plan-view строит модель карточки плана (фаза, в main N из M, статусы задач, «Последовательно / Параллельно» только для orchestrated) и карточки выбора из scope:proposal",
        "package.json получает #-алиасы всех новых модулей workflow-engine и project-setup (раздел 5 спецификации)",
        "Тесты на временных git-репозиториях с настоящим бандлом: install, status, scope:propose/scope:proposal, модель плана для sequential и orchestrated; module.md трёх модулей, product-part.md и cluster.md написаны"
      ],
      "checks": [],
      "commitMessage": "feat: run workflow kit 2.2.2 in projects and model its plan",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/product-part.md",
        "product-parts/workflow-engine/clusters/kit-host",
        "package.json",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Процесс Kit 2.2.2: бандл, запуск команд, модель плана",
      "why": "Карточки плана и выбора пути и мастер проекта опираются на Kit 2.2.2 в проекте"
    },
    {
      "acceptance": [
        "Структура Kit v2: хуки Stop (ожидание до 600 с) и UserPromptSubmit для Claude и Codex с защитой «нет wfk — выход 0»; новые группы Codex — только в конец; v1 → v2 как outdated; правила раздела Kit в AGENTS.md (тема сессии, ревью, выбор пути в панели)",
        "wfk hook stop|prompt --client передают вход хука службе (POST /api/hooks/stop|prompt, только loopback) и печатают ответ службы; служба недоступна — выход 0 без вывода",
        "agent-channel: очередь сообщений по сессии с однократной доставкой, долгое ожидание решения пользователя до 9 минут, доставка отложенного через UserPromptSubmit, защита от зацикливания по stop_hook_active; активность сессии (работает с …, ждёт) в /api/state",
        "Тесты на подставных входах хуков Claude и Codex (поля как в разделе 3 спецификации): block-ответ, ожидание и отпускание, повторная доставка не происходит; module.md обновлены"
      ],
      "checks": [],
      "commitMessage": "feat: talk to agents through stop and prompt hooks",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/workflow-engine/clusters/session-loop/cluster.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Канал к агенту: структура v2 и хуки Stop/UserPromptSubmit",
      "why": "Без своего чата выбор пользователя и автопилот доходят до агента только через хуки"
    },
    {
      "acceptance": [
        "POST …/workflow/choose вызывает scope:choose с сессией-владельцем и словами «Выбор пользователя в панели Workflow Kit: …» и доставляет агенту текст выбора режима; для сессий Codex режим orchestrated не предлагается",
        "start, pause (pause:set), accept (accept --note), close (close --scope --note, DIRTY_TREE — подсказка), fixes (текст агенту), confirm-delivery (слова пользователя агенту для task:start --confirmed)",
        "Автопилот по autopilot:status и правилам Harness: продолжать или остановиться с причиной; лимит 40 продолжений; no-progress по ревизии и HEAD; причина видна в /api/state",
        "Тесты на временном проекте с настоящим бандлом и подставными хуками: sequential от выбора до ready-for-acceptance, pause, отказ orchestrated для Codex; module.md"
      ],
      "checks": [],
      "commitMessage": "feat: choose the execution mode and drive the plan from the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Выбор пути, автопилот и действия с планом",
      "why": "Карточки выбора и плана управляют процессом Kit без ручных команд"
    },
    {
      "acceptance": [
        "Переключатель на сессию (POST …/sessions/:sid/review), по умолчанию выключен, после scope:choose недоступен",
        "Включён: после scope:propose служба через Stop просит агента выполнить wfk review; wfk review запускает рецензента другого провайдера только на чтение (claude -p с инструментами чтения или codex exec read-only) и печатает вердикт agreed или замечания JSON; до трёх раундов; карточка выбора — после agreed",
        "Выключен: карточка выбора сразу; итог ревью по поколению предложения — в разделе workflow",
        "Тесты на подставных CLI рецензента: agreed, замечания и повтор, три раунда, нет второго CLI — понятная причина; module.md"
      ],
      "checks": [],
      "commitMessage": "feat: review the specification and plan per session",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true,
          "heading": "10. Ревью плана"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/backend-core/clusters/runtime/modules/cli"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Ревью плана для сессии",
      "why": "Пользователь хочет включать ревью спецификации и плана отдельно в каждой сессии"
    },
    {
      "acceptance": [
        "Приоритет имени: ручное → тема агента → objective scope → «Новая сессия»; имя и источник хранятся в Kit и отдаются в /api/state",
        "wfk session title \"…\" относит тему к сессии проекта с идущим ходом; один раз; неоднозначность — отказ с подсказкой",
        "Ручное имя — POST …/sessions/:sid/title; синхронизация с Codex через thread/name/set без удержания треда, который держит ChatGPT; Claude — только имя в Kit",
        "Тесты на подставном демоне и входах хуков; module.md"
      ],
      "checks": [],
      "commitMessage": "feat: name sessions after the task",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true,
          "heading": "11. Имена сессий"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Имена сессий",
      "why": "Сессия называется по задаче, которую понял агент"
    },
    {
      "acceptance": [
        "POST /api/setup/preview (только чтение, токен с отпечатком): путь, действия (структура, Kit inspect → install/update/open, git, доверие Claude и Codex, одобрение хуков Kit), список изменений, обязательный выбор внешних импортов, GIT_IDENTITY_REQUIRED с командой",
        "POST /api/setup/apply {token, provider, choices} — операция по шагам с отменой до следующего шага; сделанное остаётся и видно; первая сессия ChatGPT или Claude с первым сообщением из раздела 7 вместо служебного «готов»",
        "Проекты: папка для проектов в config.json, архив и возврат (POST …/archive|restore), папки не удаляются",
        "Тесты на подставном HOME, подставных claude/codex/демоне и настоящем бандле Kit; module.md"
      ],
      "checks": [],
      "commitMessage": "feat: set up a project and its first session in one step",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true,
          "heading": "7. Мастер проекта и первая сессия"
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/projects/modules/project-setup",
        "product-parts/backend-core/clusters/projects/modules/project-registry",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Мастер проекта с одним согласием и первая сессия",
      "why": "Первый контакт: создать проект и сразу оказаться в работающей сессии"
    },
    {
      "acceptance": [
        "Раскладка макета: боковая панель 270 px (логотип, версия, шестерёнка, строка состояния, «Ваши проекты», дерево, место для «Ревью плана», индикаторы связи) и экран справа; уже 680 px — столбцы друг под другом; шрифты 13/11–12/15/17 px; тёмная и светлая тема",
        "Меню «Ваши проекты» (поиск, список, В архив, Создать, Открыть папку, Обновить сессии, Архив проектов), дерево проектов и сессий с меткой провайдера и спиннером, первый запуск без проектов",
        "«Настройки»: всё содержимое прежних карточек «Система», «Структура», провайдеров; на главном экране служебных подробностей нет",
        "Экран «Домой» iPad: manifest.webmanifest, значки 180/192/512, apple-touch-icon, standalone, safe-area",
        "Тесты моделей отображения (без DOM) и сервера статики; module.md; ручная проверка по макету в окне Kit и на iPad"
      ],
      "checks": [],
      "commitMessage": "feat: rebuild the panel layout after the agreed mockup",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true,
          "heading": "6. Интерфейс"
        },
        {
          "path": "docs/design/ui-mockup.html",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/control-panel/product-part.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "TODO",
      "title": "Каркас интерфейса, настройки и экран «Домой» iPad",
      "why": "Интерфейс выглядит как телеметрия; нужен вид по согласованному макету"
    },
    {
      "acceptance": [
        "Мастер: имя и папка → предпросмотр с действиями, изменениями и выбором внешних импортов → «Создать и открыть в ChatGPT / Claude» → шаги подготовки с «Отменить подготовку» → ссылка сессии открывается сама на том устройстве, где нажата кнопка",
        "Экран сессии: заголовок и «Открыть чат», строка активности агента с таймером, карточка выбора пути, карточка плана (фазы, в main N из M, статусы, кнопки Начать / Пауза / Продолжить / Принять / Закрыть / Нужны исправления / Подтвердить выпуск), строка ревью — вид по макету docs/design/ui-mockup.html (шаги 5–10)",
        "«Ревью плана» в боковой панели у выбранной сессии до выбора пути; «Переименовать», «В архив» в «⋯» сессии",
        "Тесты моделей отображения; module.md; ручная проверка путём раздела 14 на подставных данных"
      ],
      "checks": [],
      "commitMessage": "feat: show the setup wizard and the session screen",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true
        }
      ],
      "dependencies": [
        "T006",
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/control-panel/clusters/web-panel/modules/provider-cards",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/backend-core/clusters/http-api/modules/http-server"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Мастер и экран сессии в интерфейсе",
      "why": "Пользователь проходит путь от проекта до приёмки плана в панели"
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
        "T005",
        "T006",
        "T007",
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M2-interface-and-process.md",
        "product-parts/workflow-engine/product-part.md",
        "product-parts/workflow-engine/clusters/session-loop/cluster.md",
        "product-parts/backend-core/clusters/projects/cluster.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "product-parts/control-panel/product-part.md"
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
        "Служба обновлена node bin/wfk.mjs install после подтверждения пользователя; wfk doctor --installed — всё в порядке",
        "Сценарий раздела 14 пройден пользователем на Mac и iPad; результат каждого шага и ответы на Q1–Q3 записаны в docs/evidence/M2-acceptance.md"
      ],
      "checks": [],
      "commitMessage": "docs: record milestone 2 acceptance",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M2-interface-and-process.md",
          "required": true,
          "heading": "14. Визуальная приёмка вехи"
        }
      ],
      "dependencies": [
        "T008",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M2-acceptance.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Установка и визуальная приёмка вехи 2",
      "why": "Пользователь проверяет веху на своём Mac и iPad"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m2-interface-and-process (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 0/10
- Revision: 59

## Objective

Веха 2: новый интерфейс Workflow Kit по согласованному макету и процесс Kit 2.2.2 в проектах — мастер проекта с одним согласием, первая сессия ChatGPT или Claude, карточки плана и выбора пути, ревью плана, автопилот через хуки, имена сессий, экран «Домой» iPad

## Acceptance

- Сценарий визуальной приёмки из раздела 14 спецификации пройден пользователем на Mac и iPad
- После «Создать и открыть в ChatGPT / Claude» пользователю не задаётся вопросов: проект, процесс Kit, доверие, хуки и сессия готовятся сами, чат открывается сам
- Обязательные проверки качества (типы, тесты) проходят

## Rounds

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Процесс Kit 2.2.2: бандл, запуск команд, модель плана (work, parallel-safe)
  - Commit: feat: run workflow kit 2.2.2 in projects and model its plan
  - Files: product-parts/workflow-engine/product-part.md, product-parts/workflow-engine/clusters/kit-host, package.json, product-parts/backend-core/clusters/runtime/modules/cli
- [TODO] T002 — Канал к агенту: структура v2 и хуки Stop/UserPromptSubmit (work)
  - Commit: feat: talk to agents through stop and prompt hooks
  - Files: product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/session-loop/cluster.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel
  - Depends on: T001
- [TODO] T003 — Выбор пути, автопилот и действия с планом (work)
  - Commit: feat: choose the execution mode and drive the plan from the panel
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/backend-core/clusters/runtime/modules/cli
  - Depends on: T002
- [TODO] T004 — Ревью плана для сессии (work)
  - Commit: feat: review the specification and plan per session
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/backend-core/clusters/runtime/modules/cli
  - Depends on: T003
- [TODO] T005 — Имена сессий (work)
  - Commit: feat: name sessions after the task
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/session-titles, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry
  - Depends on: T004
- [TODO] T006 — Мастер проекта с одним согласием и первая сессия (work)
  - Commit: feat: set up a project and its first session in one step
  - Files: product-parts/backend-core/clusters/projects/modules/project-setup, product-parts/backend-core/clusters/projects/modules/project-registry, product-parts/backend-core/clusters/projects/cluster.md, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude
  - Depends on: T005
- [TODO] T007 — Каркас интерфейса, настройки и экран «Домой» iPad (work, parallel-safe)
  - Commit: feat: rebuild the panel layout after the agreed mockup
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/provider-cards, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/control-panel/product-part.md
- [TODO] T008 — Мастер и экран сессии в интерфейсе (work)
  - Commit: feat: show the setup wizard and the session screen
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/provider-cards, product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/control-panel/clusters/web-panel/modules/project-wizard, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/backend-core/clusters/http-api/modules/http-server
  - Depends on: T006, T007
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M2-interface-and-process.md, product-parts/workflow-engine/product-part.md, product-parts/workflow-engine/clusters/session-loop/cluster.md, product-parts/backend-core/clusters/projects/cluster.md, product-parts/control-panel/clusters/web-panel/cluster.md, product-parts/control-panel/product-part.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007, T008
- [TODO] T009 — Установка и визуальная приёмка вехи 2 (delivery)
  - Commit: docs: record milestone 2 acceptance
  - Files: docs/evidence/M2-acceptance.md
  - Depends on: T008, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
