# Модуль: plan-view

Часть `workflow-engine`, кластер `kit-host`. Алиас импорта: `#plan-view`.

## Назначение

Модели карточки плана и карточки выбора пути (спецификация, разделы 8.3 и
9.3). Порт правил Harness `buildPlanView`. Чистые функции без ввода-вывода;
панель только рисует результат.

## Публичный интерфейс (`src/index.ts`)

- Типы результатов Kit 2.2.3, которые читает служба: `KitStatus`,
  `KitTask`, `KitTaskRef`, `KitScope`, `KitExecution`, `KitAssignment`,
  `KitScopeProposalMarker`, `KitProposal`, `KitStrategy`,
  `KitChoiceOption`, `KitTaskStatus`.
- `buildPlanView(status) → PlanView | null` — `null` без Kit или без scope.
  `PlanView`: `scopeId`, `objective`, `mode` (`sequential` без
  `execution`), `ownerSession`, `phase` и `phaseLabel`, `blockedReason`,
  `progress`, `progressLabel` («в main N из M»), `revision`, `tasks`,
  `actions`.
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

## Инварианты

- Метка параллельности показывается только в режиме `orchestrated`.
- Неизвестные поля результатов Kit игнорируются; `assignments` может
  отсутствовать.

## Зависимости

Нет.
