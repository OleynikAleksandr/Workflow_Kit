# Модуль: plan-view

Часть `workflow-engine`, кластер `kit-host`. Алиас импорта: `#plan-view`.

## Назначение

Модели карточки плана и карточки выбора пути (спецификация, разделы 8.3 и
9.3). Порт правил Harness `buildPlanView`. Чистые функции без ввода-вывода;
панель только рисует результат.

## Публичный интерфейс (`src/index.ts`)

- Типы результатов Kit 2.2.3 (в 2.2.4 те же, M22), которые читает служба: `KitStatus`,
  `KitTask`, `KitTaskRef`, `KitScope`, `KitExecution`, `KitAssignment`,
  `KitScopeProposalMarker`, `KitProposal` (M40 T004A: необязательное `automation` — есть ли
  в предложении блок автоматизации, Kit 2.4.4; у более старого Kit поля нет),
  `KitProposalDigest` (M39: `scope:proposal --digest` —
  `documentDigests`, `generation`, `proposalDigest`, `scopeId`), `KitStrategy`,
  `KitChoiceOption`, `KitTaskStatus`.
- `buildPlanView(status) → PlanView | null` — `null` без Kit или без scope.
  `PlanView`: `scopeId`, `objective`, `mode` (`sequential` без
  `execution`), `ownerSession`, `phase` и `phaseLabel`, `blockedReason`,
  `progress`, `progressLabel` («в main N из M»), `revision`, `tasks`,
  `actions`, `dirty` (M37 2.3: пути вне коммитов — `status.changes` — в фазах
  `acceptance` и `accepted`, иначе пустой список; `close` требует чистого
  дерева, а во время работы незакоммиченные файлы — норма).
  - Фазы: `accepted` («План принят»; `delivery` ACCEPTED) →
    `acceptance` («План выполнен — проверьте результат»;
    READY_FOR_ACCEPTANCE) → `blocked` («План остановлен») → `paused`
    («Пауза») → `ready` («План готов»: все задачи TODO, нет текущей и
    назначений) → `running` («План выполняется»).
  - Действия: `ready` — `start`; `running` — `pause`; `paused` — `resume`;
    `acceptance` — `accept`, `request-fixes`; `accepted` — `close`.
  - Строка задачи `PlanTaskView`: `id`, `title`, `kind`, `status`, `state`
    (`todo` «Не начата», `run` «Выполняется», `done` «В main»), `current`
    (текущая задача Kit или, в `orchestrated`, задача с неинтегрированным
    назначением), `label` и `labelText` («Параллельно» /
    «Последовательно» — только в `orchestrated`, иначе `null`),
    `executorWorktree`.
- `buildChoiceCard(proposal) → ChoiceCard | null`: `generation`,
  `scopeId`, `objective`, `reason`, `recommended`, `hasParallelWork`,
  `refining`, `options` — рекомендованный первым, `refine` последним;
  у варианта `title`, `description` (тексты макета), `recommended`.
- `choiceOptionsFor(card, orchestration)` — варианты для сессии: `orchestration` —
  возможность её провайдера (оркестрация идёт встроенными подагентами приложения, веха 3,
  раунд 7); без неё вариант `orchestrated` не показывается (M8, раздел 5). С M10
  возможность есть у всех провайдеров Kit, Kimi Code тоже.
- Константы подписей `PHASE_LABELS`, `TASK_STATE_LABELS`, `MODE_LABELS`.
- `autopilotSupport(status) → { ready: true } | { ready: false, missing, text }`
  (`src/autopilot-support.ts`, M39 T004): поддерживает ли Kit проекта автопилотирование — по
  `capability` его `autopilot:status` (`automation`, `authorization`, `deferDelivery`,
  `instructions`, `complete` равны `true`, `hostProtocol` = `SUPPORTED_HOST_PROTOCOL`
  `wfk-host/1`), а не по номеру версии. Нет поля (Kit 2.2.x, 2.3.0) или признак не `true` —
  `missing` с их именами и `text` = `UPDATE_KIT_TEXT` («Обновите Kit проекта: …»); ручной и
  legacy-путь при этом остаются. Тип `KitAutopilotCapability`. Тест
  `test/autopilot-support.test.ts`; совпадение протокола с `kit-runner` `HOST_PROTOCOL` проверяет
  `kit-runner/test/host-run.test.ts`.

- Решения пользователя (M40 T005): `KitStatus.decisionsMode?` (`host` | `agent`) и
  `KitStatus.decisions?` — запросы решений Kit 2.4.0+ (`KitDecision`: `id`, `kind`
  (`KitDecisionKind`: `accept`, `adopt-commits`, `approve-install`, `choose`, `close`,
  `confirm-delivery`, `unblock`), `scopeId`, `taskId`, `proposal`, `params`, `inputDigest`,
  `revision`, `createdAt`, `state`). Кнопка карточки возвращает `id` и `inputDigest`; в старом Kit
  полей нет.

## Инварианты

- Метка параллельности показывается только в режиме `orchestrated`.
- Неизвестные поля результатов Kit игнорируются; `assignments` и `changes`
  (`KitStatus.changes?`, пути вне коммитов без путей Kit) могут
  отсутствовать — тогда `dirty` пуст.

## Зависимости

Нет.

## Поведение на ОС

Чистые функции над JSON Kit; одинаково на macOS, Linux и Windows x64/ARM64. Пути `dirty`
приходят от Kit через `/` на всех ОС (M37).
