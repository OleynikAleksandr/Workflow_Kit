# Workflow Kit — оркестровка: назначения и интеграция

Статус: реализовано в scope `execution-modes-2026-11-04`. Часть
спецификации [WorkflowKitExecutionModes.md](WorkflowKitExecutionModes.md)
для режима `orchestrated`, вынесенная из-за лимита размера документа.
Нумерация разделов совпадает с основным документом: ссылки `module.md` на
его разделы 5–7 ведут сюда. Точные контракты — `module.md` модулей
`workflow-assignment`, `workflow-integration`, `workflow-kit` и
`workflow-git`.

## 5. Назначение исполнителю

### 5.1 Команды, планировщик и привязка

```text
scripts/workflow assignment:next                     # main, только чтение
scripts/workflow assignment:create --task <ID>       # main
scripts/workflow assignment:attach <id>              # worktree исполнителя
scripts/workflow assignment:status                   # worktree исполнителя
scripts/workflow assignment:setup [--id <id>]        # worktree или main
scripts/workflow assignment:cleanup [--id <id>]      # main
scripts/workflow assignment:cancel --id <id> [--force]  # main
```

- Планировщик (`schedule`) обходит задачи `TODO` вида `work` и `docs` без
  активного назначения в порядке плана. `QUALITY` и `delivery` назначениями
  не бывают. Каждая получает первое нарушенное правило:
  1. `DEPENDENCY_PENDING` — зависимость не `DONE`; `DOCS` ждёт и все задачи
     `work` своего раунда;
  2. `ASSIGNMENT_BARRIER` — задача без `parallelSafe` ждёт, пока все
     предыдущие задачи `DONE` и ничего не занято; параллельная не обгоняет
     незавершённую последовательную и не идёт рядом с занятой
     последовательной;
  3. `ASSIGNMENT_CONFLICT` — параллельная несовместима с занятой задачей;
  4. `ASSIGNMENT_CAPACITY` — занято `maxWorkers`.
- «Занятые» — активные назначения плюс задачи, уже признанные готовыми в
  этом проходе, поэтому весь список `ready` можно раздать сразу.
  Без scope или в `sequential` — `NOT_ORCHESTRATED`, в `BLOCKED` —
  `SCOPE_NOT_ACTIVE`.
- `assignment:create` выдаёт запись `ASSIGNED` и текст поручения. Отказы по
  порядку: `NOT_ORCHESTRATED`/`SCOPE_NOT_ACTIVE`; `TRANSACTION_PENDING`,
  `INTEGRATION_ACTIVE`; `DIRTY_TREE`, `WORKFLOW_PAUSED` (пауза
  пользователя); `NO_COMMITS`; `UNKNOWN_TASK`,
  `ASSIGNMENT_KIND` (QUALITY, delivery), `TASK_NOT_TODO`; повторная
  проверка бюджета контекста на текущих файлах — `CONTEXT_MISSING`,
  `CONTEXT_TOO_LARGE` (документ мог вырасти); активное
  назначение задачи — `ASSIGNMENT_EXISTS` (та же запись `ASSIGNED` с той же
  базой возвращается с `created: false`); код планировщика;
  `DEPENDENCY_NOT_IN_BASE` (коммит зависимости не предок базы). База —
  `HEAD`. Задача остаётся `TODO`, коммита нет.
- Поручение (`brief`, английский текст): id назначения, первый шаг
  `assignment:attach <id>` (и `assignment:setup` при `NEEDS_SETUP`),
  `task:start`, поля задачи, правило путей, `commit --task` (`--digest` для
  DOCS), ответ с SHA, запреты (push, main, план, чужие задачи,
  Git-идентичность, вложенные исполнители). Затем строка
  `Context documents (full text, do not re-read them):` и полный текст
  каждого документа `context` задачи (или спецификации scope, если
  `context` нет) в маркерах `<document path="…" heading="…" bytes="N">` …
  `</document>` (`heading` — только для раздела) в пределах
  `budget.briefBytes` (60 000), затем карта документов проекта
  (`Project documents (ask with scripts/workflow context <path>):`, свои
  4 000 байт вне `briefBytes`; `WorkflowKitRecovery.md`, раздел 2.1).
- Оркестратор запускает субагента Claude (`Agent` с
  `isolation: "worktree"`) и передаёт ему поручение. Worktree создаёт
  Claude, Kit к нему только привязывается и ветку не переименовывает.

Привязка (`assignment:attach`):

- Main находится через `git rev-parse --git-common-dir`. Отказы:
  `ASSIGNMENT_LAYOUT` (bare-репозиторий), `ASSIGNMENT_WORKTREE` (не
  репозиторий или сам main), `ASSIGNMENT_UNKNOWN`, `ASSIGNMENT_ATTACHED`
  (worktree или запись привязаны к другому), `ASSIGNMENT_STATUS` (запись не
  `ASSIGNED`), `TRANSACTION_PENDING`, `ASSIGNMENT_DIRTY`, `ASSIGNMENT_BASE`
  (`HEAD` не база). Повтор после полной привязки ничего не меняет.
- Kit делает служебный коммит с ролью `assignment-plan` (только файл
  плана, `docs: plan assignment <id>`, `Workflow-Scope:
  assignment-<id>`, `Workflow-Assignment: <id>`). Затем пишет в запись main
  путь worktree, ветку (`null` для detached `HEAD`) и статус `NEEDS_SETUP`
  или `READY`, а в worktree — `.harness/workflow/local/assignment.json`.

### 5.2 Состояние

- Запись main: `.harness/workflow/local/assignments/<id>.json`, id —
  `<scopeId>-<taskId>-<iteration>`. Поля: `id`, `scopeId`, `taskId`,
  `iteration`, `worktree`, `branch`, `baseCommit`, `configDigest`,
  `status`, `sourceCommit`, `integrationCommit`, `setup`, `cleanup`.
  Нечитаемая запись — `ASSIGNMENT_RECORD`: Kit не угадывает состояние.

| Статус | Когда |
|---|---|
| `ASSIGNED` | создано, исполнитель ещё не привязался |
| `NEEDS_SETUP` | проверкам задачи нужны зависимости, которых нет |
| `READY` | можно начинать |
| `RUNNING` | `task:start` исполнителя |
| `READY_FOR_INTEGRATION` | `commit --task` прошёл, `sourceCommit` записан |
| `INTEGRATED` | принят в main, `integrationCommit` записан |

### 5.3 План и контракт исполнителя

- План worktree строится из плана базы: ревизия базы + 1, scope
  `assignment-<id>`, одна задача — копия назначенной с
  `dependencies: []`, `execution {sequential, maxWorkers: 1}`.
- Правило путей: изменённый путь входит в задачу, если он равен записи
  `files` или вложен в неё по сегментам пути. Поэтому задача может указать
  каталог модуля (без `/`) и владеть его тестами и `module.md`. Иначе —
  `ASSIGNMENT_SCOPE`. Правка `.harness/workflow/**`, `.harness/plans/**`
  (кроме собственного перехода задачи в плане) или запускателей —
  `ASSIGNMENT_CONTRACT`. Guard работает в `commit --task` и в pre-commit
  worktree.
- В worktree работают только `status`, `validate`, `recover`, `show-task`,
  `schema`, `context`, `task:start`, `commit`, `repair`, `task:block`, `assignment:status`,
  `assignment:setup`, `assignment:attach` (повтор), `help` и хуки. Остальное
  — `ASSIGNMENT_READ_ONLY`, `pre-push` тоже отклоняется.
- Цикл: `task:start` (запись → `RUNNING`; при `NEEDS_SETUP` —
  `ASSIGNMENT_NEEDS_SETUP`) → работа → `commit --task` с проверками задачи
  в worktree (роль `implementation`, у DOCS — `docs`, trailer
  `Workflow-Assignment`) → запись `READY_FOR_INTEGRATION` → ответ с SHA.
  Журнал транзакции у каждого worktree свой.

### 5.4 Окружение worktree (`assignment:setup`)

- `NEEDS_SETUP` ставится, когда проверки этапа `commit` задачи содержат
  команду, стек `node`, в `package.json` есть зависимости, а в worktree нет
  `node_modules`. DOCS подготовки не требует.
- `assignment:setup` (в worktree — для своего назначения, в main — с
  `--id`) запускает установку менеджера пакетов без shell, с таймаутом
  15 минут: `npm ci`, либо `pnpm`/`yarn`/`bun install --frozen-lockfile`.
  Отказы: `SETUP_LOCK_REQUIRED` (нет lock-файла),
  `SETUP_LINKED_DEPENDENCIES` (`node_modules` — ссылка; зависимости main не
  копируются и не связываются), `SETUP_FAILED` (запись не меняется). Успех
  пишет `setup {command, lockHash, at}` и `NEEDS_SETUP` → `READY`.

## 6. Порядок работы оркестратора

1. `QUALITY` — оркестратор в main: конфигурация Kit живёт только в main.
2. Задачи `work` и `DOCS` — только исполнители. `task:start` в main
   отвечает `ORCHESTRATED_MAIN_READ_ONLY`. `DONE` задачи ставит только
   интеграционный коммит.
3. `DOCS-<раунд>` — исполнитель, когда все задачи `work` раунда
   интегрированы.
4. `delivery` — оркестратор в main, когда все предыдущие задачи `DONE` и
   нет активных назначений, иначе `DELIVERY_NOT_READY`
   (`details {pending, active}`).

Пауза пользователя (`pause:set --on`, кнопка в панели плана) в
`orchestrated` держит только шаги, начинающие работу: новые назначения
(`assignment:create` — `WORKFLOW_PAUSED`) и ещё не начатую QUALITY.
Выданные назначения исполнители доводят до конца (в worktree пауза не
действует), интеграция, `READY_FOR_INTEGRATION`, очистка и начатые задачи
main продолжаются; автопилот останавливается с `paused`, когда других шагов
нет.

## 7. Интеграция (`workflow-integration`)

```text
scripts/workflow integration:start --id <assignment> --source <sha>
scripts/workflow integration:continue --id <assignment>
scripts/workflow integration:status
```

Доказательство источника, первая ошибка по порядку:

- `INTEGRATION_NOT_READY` — запись не `READY_FOR_INTEGRATION`;
  `INTEGRATION_SOURCE` — SHA не `sourceCommit` или `HEAD` worktree другой;
  `INTEGRATION_DIRTY` — незакоммиченные изменения в worktree;
- `INTEGRATION_CONTRACT` — в плане базы нет задачи;
- `INTEGRATION_HISTORY` — `base..source` не цепочка «коммит
  `assignment-plan`, затем коммиты задачи (`implementation`, у DOCS
  `docs`)» с одним родителем и верными trailers, или в diff есть служебные
  файлы Kit или запускатели;
- `INTEGRATION_UNCHECKED` — квитанция проверок последнего коммита
  отсутствует, относится к другому коммиту или транзакции, не `passed`
  либо не содержит нужных проверок;
- `INTEGRATION_CONTRACT` — задача в плане main изменилась.

Журнал `.harness/workflow/local/integration.json` (`operationId` — он же
`Workflow-Transaction`, `mainHead`, `phase`, `error`). Фазы: `PREPARED`,
`MERGING`, `CONFLICT`, `CHECKING`, `CHECKS_FAILED`, `UNKNOWN`. Пока журнал
есть, остальные записи Kit (`assignment:create`, `task:start`, `accept`,
`close`, `carryover`, `plan:extend`, `task:update`, `docs:commit`,
`task:block` и др.) и `pre-push` отвечают `INTEGRATION_ACTIVE`.

Шаги:

1. Кандидат плана вычисляется до записи журнала (`integrateTask`).
2. `git merge --no-commit --no-ff <source>`.
3. План исполнителя отбрасывается: файл плана берётся из main, конфликт
   плана Kit разрешает сам.
4. Конфликты — фаза `CONFLICT`. Оркестратор разрешает их в пределах файлов
   задачи, делает `git add` и вызывает `continue`. Ours/theirs Kit не
   применяет.
5. Изменения вне файлов задачи (то же правило вложенности) —
   `INTEGRATION_SCOPE`: `git merge --abort`, журнал удаляется, запись не
   меняется.
6. Фаза `CHECKING`: транзакция с ролью `integration`, сообщение
   `merge: <title>`, два родителя, trailers `Workflow-Source`,
   `Workflow-Assignment`, `Workflow-Task`. Hook main запускает проверки
   задачи на объединённом результате. Задача получает `DONE` и поле
   `integration {operationId, sourceCommit}`; DOCS берёт сводку раунда из
   плана исполнителя.
7. Проверки упали — фаза `CHECKS_FAILED`, ошибка
   `INTEGRATION_CHECKS_FAILED`: `MERGE_HEAD` и правки сохраняются, задача
   `TODO`. После исправления — `continue`.
8. Запись `INTEGRATED`, затем очистка: `git worktree remove` без force,
   `git worktree prune`, `git branch -d`. Отказ даёт
   `cleanup {status: PENDING, reason}`, интеграция всё равно успешна;
   `assignment:cleanup` (только `INTEGRATED`, иначе
   `ASSIGNMENT_NOT_INTEGRATED`) доделывает. Журнал удаляется последним.

Застрявшее назначение (исполнитель не стартовал, worktree сломан, работа
больше не нужна) снимает `assignment:cancel --id <id> [--force]` в main:
запись не `INTEGRATED`, нет транзакции и интеграции. Удаляются
зарегистрированный worktree (с незакоммиченными изменениями — только с
`--force`, иначе `ASSIGNMENT_DIRTY`), его ветка (`git branch -D`, ответ
называет последний коммит для восстановления) и запись. План не меняется:
задача остаётся `TODO` и снова выдаётся `assignment:create`. Отказ git —
`ASSIGNMENT_CANCEL_FAILED`, запись сохраняется для повтора
(`docs/architecture/KitFixes-2026-11-05.md`, раздел 3).

Сбой: повтор (`continue`) завершает уже созданный коммит без второго merge
и без `reset --hard`; незавершённую транзакцию сначала доводит `repair`
(`finish-commit`; retry сохраняет `assignmentId` и `sourceCommit`).
Непонятное состояние — `UNKNOWN`, без автоматического повтора.
Транзакция Kit отклоняет чужой merge: `MERGE_IN_PROGRESS` (merge без
интеграции) и `MERGE_REQUIRED` (интеграция без merge своего источника).

История main проверяется по первым родителям: коммиты исполнителя за
вторым родителем не считаются коммитами задач main. Двухродительский
коммит допустим, только если это `integration` с `Workflow-Source`, равным
второму родителю, `Workflow-Task` и `Workflow-Assignment`; иначе
`HISTORY_NOT_LINEAR`. Его файлы сравниваются с первым родителем по правилу
вложенности (`COMMIT_SCOPE_MISMATCH`).
