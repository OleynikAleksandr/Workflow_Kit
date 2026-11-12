# Workflow Kit — режимы выполнения и оркестровка

Статус: реализовано в scope `execution-modes-2026-11-04` (задачи E1–E20).
Карточка в сайдбаре, включение автопилота выбором режима и
`identity:set` — scope `release-fixes-2026-11-04-2`
([ReleaseFixes-2026-11-04-2.md](https://github.com/OleynikAleksandr/Harness_AI/blob/94a9d457/docs/architecture/ReleaseFixes-2026-11-04-2.md)); автопилот
по умолчанию, пауза в панели плана и текст документов в поручении —
`release-fixes-2026-11-04-3`
([ReleaseFixes-2026-11-04-3.md](https://github.com/OleynikAleksandr/Harness_AI/blob/94a9d457/docs/architecture/ReleaseFixes-2026-11-04-3.md)).
Продолжает [WorkflowKitProcess.md](WorkflowKitProcess.md): там один checkout
и одна задача в работе, здесь — выбор режима, исполнители в worktree и план
в сайдбаре Harness. Назначения и интеграция (разделы 5–7) подробно
описаны в [WorkflowKitOrchestration.md](WorkflowKitOrchestration.md).
Точные контракты — в `module.md` модулей
`workflow-plan`, `workflow-execution-mode`, `workflow-assignment`,
`workflow-integration`, `workflow-git`, `workflow-kit`, `workflow-recovery`,
`workflow-autopilot`, `workflow-installer`, `core-runtime-process`,
`execution-mode-card`, `project-plan-panel` и `session-sidebar`.

Образец — Workflow Pilot 0.6.11 (выбор режима, протокол ролей,
оркестровка, план в сайдбаре); перенесено по смыслу.

Решения пользователя (2026-11-04):

- режим выбирается карточкой при предложении плана;
- `sequential` — вся работа одним агентом;
- `orchestrated` — каждую задачу `work` и `DOCS` выполняет исполнитель;
- исполнители первого этапа — только субагенты Claude у оркестратора
  Claude. Codex и другие вендоры — следующий этап;
- без параллельной работы карточка предлагает «Выполнить последовательно»
  или «Доработать спецификацию»;
- в `sequential` субагенты-помощники не отключаются;
- Git-идентичность — без новых настроек;
- отдельной кнопки «Начать выполнение» нет.

## 1. Проблема

- Агент сам решал, звать ли исполнителей.
- Исполнители не могли коммитить: хук Kit общий для всех worktree, и
  `git commit` субагента отклонялся (`MANAGED_COMMIT_REQUIRED`).
- Пока одна задача `IN_PROGRESS`, `task:start` другой невозможен.
- Kit не формировал Git-идентичность: глобальная заглушка попадала в
  коммиты, а агенты с изолированным домашним каталогом её не видели.
- В сайдбаре Harness не было плана, субагентов не связать с задачами.

## 2. Метки задач и блок `execution`

- `parallelSafe` хранится только со значением `true` (нет поля — `false`).
  Его может иметь только задача `work` (`PARALLEL_KIND`). Нужен хотя бы один
  файл, и каждый — конкретный путь: без glob (`*?[]{}`), не `.`, без
  завершающего `/` (`PARALLEL_FILES`).
- Две задачи совместимы (`compatibleTasks`), если обе `parallelSafe`
  `work`, ни одна не зависит от другой даже транзитивно, а их пути не
  совпадают и не вложены друг в друга по сегментам пути (`src/lib`
  конфликтует с `src/lib/a.ts`, но не с `src/libx.ts`).
- У плана есть параллельная работа (`hasParallelWork`), если совместима
  хотя бы одна пара. Это вычисляет Kit, а не агент и не UI.
- Блок scope `execution: {strategy, maxWorkers, ownerSession}`:
  `strategy` — `sequential` или `orchestrated`, `maxWorkers` — целое 1–16
  (по умолчанию 3), `ownerSession` — id сессии или `null`
  (`PLAN_EXECUTION`). Нет блока — `sequential`. Режим меняется только новым
  scope; `carryover` переносит блок и метки.
- Проекция плана показывает `- Execution: …` и `(work, parallel-safe)`
  только при наличии полей, поэтому старые планы не меняются.

## 3. Режимы

- **`sequential`** — всю работу делает одна сессия, по порядку, в main.
  Назначений нет, метки игнорируются. Субагенты-помощники разрешены, но
  работают в main без своего worktree и не коммитят.
- **`orchestrated`** — сессия становится оркестратором. Каждую задачу
  `work` и `DOCS` выполняет исполнитель в своём worktree, и параллельную, и
  последовательную. Оркестратор раздаёт задачи и интегрирует результат в
  main. `QUALITY` и `delivery` он выполняет сам в main.

## 4. Выбор режима

### 4.1 Kit (`workflow-execution-mode`, `workflow-kit`)

```text
scripts/workflow scope:propose --input <plan.json> \
  --recommended sequential|orchestrated --reason "…"
scripts/workflow scope:choose --generation <N> \
  --option sequential|orchestrated|refine --session <id> --note "<выбор>"
scripts/workflow scope:proposal        # только чтение: вид карточки
```

- `scope:propose` проверяет вход как `scope:create` (открытый scope —
  `SCOPE_EXISTS`), ничего не коммитит и пишет
  `.harness/workflow/local/scope-proposal.json`: `generation` (+1 к
  прошлой), `planDigest` (sha256 канонического JSON входа), копию входа,
  рекомендацию, причину (10–300 символов, иначе `PROPOSAL_REASON`),
  `hasParallelWork`, варианты, `refining: false`, `choice: null`.
- Варианты:

| План | Варианты карточки |
|---|---|
| есть параллельная работа | рекомендация; второй режим; `refine` |
| параллельной работы нет | `sequential`; `refine` |

- Рекомендация `orchestrated` без параллельной работы —
  `NO_PARALLEL_WORK`; иная рекомендация — `PROPOSAL_RECOMMENDATION`.
- Если запись в доработке (`refining: true`), а новый план снова без
  параллельной работы, Kit сразу создаёт scope `sequential` без карточки:
  ответ `autoChosen: true`, `ownerSession: null`, в `approval` — суффикс
  `| Execution mode chosen automatically: sequential …`.
- `scope:choose` ничего не пишет при отказе. Порядок проверок:
  `PROPOSAL_OPTION`, `PROPOSAL_SESSION`/`PROPOSAL_NOTE` (пустые),
  `PROPOSAL_CHANGED` (нет записи, другое поколение, запись в доработке или
  вход не совпал с digest), `NO_PARALLEL_WORK`, `PROPOSAL_OPTION` (вариант
  не предложен).
  - `sequential`/`orchestrated` создают scope из сохранённого входа:
    `execution {strategy: <вариант>, maxWorkers: из входа или 3,
    ownerSession: <session>}`, в `approval` —
    `| Execution mode chosen by the user: <вариант>: <note>`;
  - `refine` удаляет вход и план, оставляет `refining: true` и поколение.
- Любое создание scope и `close` удаляют запись предложения.
- `config.host: "harness"` пишет `install --host harness`. В таком проекте
  `scope:create` отвечает `EXECUTION_MODE_REQUIRED` и называет
  `scope:propose`. Без host `scope:create` работает как раньше
  (`sequential`, без блока `execution`).
- `scope:proposal` возвращает вид карточки без входа плана:
  `{generation, recommended, reason, hasParallelWork, options, refining,
  createdAt, scopeId, objective, host}` или `null`.

### 4.2 Harness (`core-runtime-process`, `execution-mode-card`)

- Когда основная сессия проекта с бандлом Kit (не субагент и не Profile
  Creator) переходит в `idle`, Core вызывает `scope:proposal`. Открытое
  предложение (`host: "harness"`, не `refining`, со `scopeId`) нового
  поколения становится карточкой workspace, владелец — эта сессия. Нет
  открытого предложения — карточка удаляется. Поэтому выбранная карточка
  исчезает в конце следующего хода агента: scope уже создан.
- Карточка живёт в памяти Core и теряется при перезапуске приложения.
  Модель: `{workspaceId, sessionId, generation, scopeId, title, options
  [{id, recommended}], reason, state, chosen, error}`, состояния
  `offered`, `saving`, `chosen`, `dismissed`.
- `orchestrated` предлагается, только если провайдер сессии-владельца —
  `claude`. Если рекомендованный режим не предложен, рекомендации и
  причины на карточке нет.
- RPC: `workflow-mode-choice-get {workspaceId}` и `workflow-mode-choose
  {workspaceId, sessionId, generation, option}` (только владелец
  `offered`-карточки и предложенный вариант, иначе
  `MODE_CHOICE_UNAVAILABLE`/`INVALID_REQUEST`). Событие
  `workflow:mode-choice {workspaceId, sessionId, card}`. IPC
  `harness-ai:core:workflow-mode-choice-get`/`workflow-mode-choose`,
  preload `getWorkflowModeChoice`/`chooseWorkflowMode`.
- Нажатие: карточка `saving`, Core вызывает `scope:choose --session
  <владелец> --note "the user chose in the Harness mode card: …"`. Отказ Kit
  (например `PROPOSAL_CHANGED`) возвращает карточку в `offered` с `error`.
  Успех — `chosen`. Для `sequential` и `orchestrated` Core сначала
  включает автопилот владельца без немедленной оценки
  (`setEnabled(владелец, true, {evaluate: false})`; автопилот и так включён
  по умолчанию, выбор включает его снова, если сессия его выключила): конец
  следующего хода продолжает план до обычных остановок автопилота. `refine` автопилот не
  меняет. Затем Core отправляет сессии-владельцу сообщение пользователя
  тем же маршрутом, что ход автопилота. Тексты для агента —
  на английском: `sequential` — выполнять план по задачам с первой;
  `orchestrated` — быть оркестратором, раздавать задачи через
  `assignment:next`/`assignment:create` субагентам Claude с изоляцией
  worktree; `refine` — доработать спецификацию с пользователем и
  предложить снова.
- Сообщение, написанное пользователем при открытой карточке, переводит её
  в `dismissed`; предложение остаётся без выбора, и следующий конец хода
  того же поколения карточку не возвращает.
- `workflow-prepare-project` при каждой установке или обновлении передаёт
  `--host harness`; существующая метка сохраняется.
- Renderer (`execution-mode-card`) показывает карточку в левом сайдбаре
  под карточкой сессии-владельца, на месте плана (`session-sidebar`). До
  выбора плана там нет, после выбора строка выбора стоит над планом.
  Отдельные окна без сайдбара карточку не показывают. Содержимое: вопрос и
  цель scope,
  строки в порядке Core (рекомендуемая первой, с пометкой и причиной,
  залитой кнопкой), подсказку «или напишите ответ в чат», состояния
  сохранения и выбора, ошибки без нативных диалогов. Строки — английские
  исходные ключи `workflow.modeCard.*` словарей локализации.

## 5. Назначение исполнителю

Подробно — [WorkflowKitOrchestration.md](WorkflowKitOrchestration.md),
раздел 5. Кратко:

- 5.1 — `assignment:next` (планировщик: зависимости, барьер
  последовательных задач, пересечение путей, `maxWorkers`),
  `assignment:create` (запись `ASSIGNED` и английский текст поручения),
  субагент Claude с `isolation: "worktree"`, `assignment:attach` в его
  worktree (служебный коммит `assignment-plan`);
- 5.2 — записи `.harness/workflow/local/assignments/<id>.json` и статусы
  `ASSIGNED` → `NEEDS_SETUP`/`READY` → `RUNNING` →
  `READY_FOR_INTEGRATION` → `INTEGRATED`;
- 5.3 — план из одной задачи, правило путей «равен записи `files` или
  вложен в неё по сегментам пути» (`ASSIGNMENT_SCOPE`,
  `ASSIGNMENT_CONTRACT`), список разрешённых команд;
- 5.4 — `assignment:setup`: установка зависимостей в worktree.

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

## 7. Интеграция

Подробно — [WorkflowKitOrchestration.md](WorkflowKitOrchestration.md),
раздел 7. Кратко: `integration:start --id <id> --source <sha>` доказывает
источник (история, служебные файлы, квитанция проверок, контракт задачи),
выполняет `git merge --no-commit --no-ff`, отбрасывает план исполнителя и
делает двухродительский коммит с ролью `integration` и проверками задачи
на объединённом результате. Конфликт и упавшие проверки сохраняют
состояние слияния до `integration:continue`; журнал
`.harness/workflow/local/integration.json` блокирует остальные записи Kit.
После `INTEGRATED` Kit удаляет worktree и ветку. История main проверяется
по первым родителям.

## 8. Git-идентичность (`workflow-git`, `workflow-installer`)

1. Заглушки (`isPlaceholderIdentity`): пустые значения, имена `Your Name`
   и `Ваше Имя`, почта `you@example.com` или без `@`, домены `example`,
   `example.*`, `invalid`, `*.invalid`, `localhost`. Так же считается
   идентичность, не прошедшая валидатор `isUsableIdentity`: кавычки любого
   вида или угловые скобки, почта не вида `локальная-часть@домен.зона`.
2. `install` до любой записи берёт настоящую идентичность из локального
   конфига репозитория, иначе из глобального, и пишет её в локальный
   конфиг. Все worktree читают его через общий каталог Git. Нет настоящей —
   `GIT_IDENTITY_REQUIRED`, ничего не создано.
3. Каждый коммит Kit требует настоящей локальной идентичности (глобальная
   здесь не используется) и передаёт её явно: `-c user.name/-c user.email`
   и `GIT_AUTHOR_*`/`GIT_COMMITTER_*` (Git экспортирует `GIT_AUTHOR_*` в
   хуки, и они сильнее `-c`).
4. Отказ `GIT_IDENTITY_REQUIRED` (общий `identityRequired`) называет
   проблему один раз. Команды `git config --global user.name/user.email`
   и `scripts/workflow doctor --fix` — только в `nextAction`. Проверка Доктора `git-identity` (`fail`) копирует настоящую
   глобальную идентичность в проект; сама её не угадывает.
5. Агентам запрещено задавать идентичность (управляемая секция
   `AGENTS.md`).
6. `identity:set --name --email --global` проверяет и пишет глобальную
   идентичность (`GIT_IDENTITY_INVALID`, `GIT_IDENTITY_PLACEHOLDER` с
   `details.field`). Harness вызывает её из формы окна Open/New Project и
   Доктора (RPC `workflow-identity-set`), см.
   [ReleaseFixes-2026-11-04-2.md](https://github.com/OleynikAleksandr/Harness_AI/blob/94a9d457/docs/architecture/ReleaseFixes-2026-11-04-2.md), раздел 1.

## 9. Роли агента

Recovery пишет в `state` строку `role:` и даёт шаг роли в `next`
(`workflow-recovery`); управляемая секция `AGENTS.md` содержит блок
«Execution modes» с теми же ролями:

- **planning** (scope нет): спецификация, план с метками, в проекте
  Harness — `scope:propose` и конец хода; ожидающее предложение — ждать
  выбора на карточке; после `refine` — доработать и предложить снова; без
  Harness — `scope:create`;
- **self** (`sequential`): задачи по порядку в main; помощники без своего
  worktree и без коммитов;
- **orchestrator** (`orchestrated`, main): строки `assignments:` и
  `integration:`; шаги по порядку — фаза журнала интеграции, интеграция
  `READY_FOR_INTEGRATION` по одной, задача main (QUALITY, delivery),
  раздача `ready`, ожидание исполнителей, `assignment:cleanup`;
  застрявшее назначение снимает `assignment:cancel --id <id> [--force]`;
- **executor** (worktree назначения, в том числе ещё не привязанный):
  `assignment:attach`, `assignment:setup` при `NEEDS_SETUP`, `task:start`,
  `commit --task`, отчёт с SHA; main, план и чужие задачи не трогать.

Списки в пакете ограничены 10 пунктами.

## 10. Harness

### 10.1 Статус и его динамика

- `KitStatus` получает `tasks` (`{id, kind, roundId, status, title,
  parallelSafe, dependencies}`), `execution`, `assignments`,
  `integration`, `scopeProposal` и `executor` (в worktree исполнителя).
  Текст `status` добавляет строку `execution: none|sequential|orchestrated
  (max <N> workers), assignments: …[, integration <task> <phase>]`.
- Core (`CoreWorkflowWatch`) через `fs.watch` следит за
  `.harness/plans/todo-plan.md` и `.harness/workflow/local`
  (`assignments/**`, `integration.json`, `scope-proposal.json`) каждого
  проекта с Kit и после 300 мс тишины публикует `workflow:status`. Открытый
  UI для этого не нужен. Наблюдение включается при восстановлении реестра,
  add/select/remove workspace и `workflow-prepare-project`.

### 10.2 План в сайдбаре

- Модель плана строит Core (`buildPlanView`) и кладёт её в результат
  `workflow-status` и событие `workflow:status` (`planView`). `null` без
  Kit или scope; иначе scope, состояние, режим, прогресс `{done, total}`,
  `ownerSessionId`, строки `{taskId, title, kind, status, label, current,
  executorSessionId}` и `boundSessionIds`.
- `label` — `parallel`/`sequential` только в `orchestrated`. `current` —
  текущая задача Kit, а в `orchestrated` и каждая задача с назначением не
  `INTEGRATED`.
- Владелец — `execution.ownerSession`, если это сессия workspace, иначе
  последняя активная основная сессия.
- Привязку исполнитель ↔ задача вычисляет Core: рабочий каталог
  субагента (`workingDirectory` сессии) равен `worktree` назначения или
  лежит внутри него; сравниваются реальные пути. Новый рабочий каталог
  субагента вызывает повторную публикацию (300 мс). Renderer ничего не
  сопоставляет.
- Сайдбар (`project-plan-panel`, `session-sidebar`) показывает план под
  карточкой владельца в обоих режимах; до выбора режима на этом месте
  стоит карточка выбора (раздел 4.2). Подпись владельца — «Оркестратор» в
  `orchestrated`, иначе «Агент». Шапка: цель scope, состояние, «N из M».
  Строки: значок статуса, ID, название, метка режима, подсветка текущей.
  Строка с исполнителем открывает его сессию. Привязанные исполнители и их
  дети не показываются карточками; прочие субагенты остаются под агентом.
- Кнопка паузы в шапке плана (заменила переключатель автопилота в полосе
  статуса) показывается по `pauseState` снимка автопилота владельца, который
  выводит Core: `running` — «Pause», `pausing` — «Pausing after the current
  task» (неактивна), `paused` — «Continue». Нажатие — RPC
  `workflow-pause-set {sessionId, paused}` (`WorkflowKitCoreRpc.md`).

### 10.3 Автопилот

- `autopilot:status` получает `proposalPending` и `orchestration`
  (назначения, журнал интеграции, готовые задачи).
- Автопилот включён по умолчанию; выбор `sequential` или `orchestrated` на
  карточке включает его у владельца (раздел 4.2).
- Пауза Kit (`paused`) держит в `orchestrated` только раздачу готовых задач
  и не начатую QUALITY; интеграция, очистка и начатые задачи main идут
  дальше ([WorkflowKitOrchestration.md](WorkflowKitOrchestration.md),
  раздел 6).
- Новые причины остановки: `waiting-for-mode-choice` (ждёт карточки) и
  `waiting-for-executors` (есть назначения `ASSIGNED`, `NEEDS_SETUP`,
  `READY` или `RUNNING`, а других шагов нет).
- В `orchestrated` автопилот продолжает оркестратора по первому из шагов:
  журнал интеграции, `READY_FOR_INTEGRATION`, QUALITY или начатая
  delivery, готовые задачи, незавершённая очистка. Прогресс учитывает
  `orchestrationKey` (назначения, интеграция, готовые задачи), поэтому
  ход, который только создал назначения, не считается `no-progress`.

### 10.4 Рабочий каталог субагента Claude

`claude-provider` сообщает `workingDirectory` субагента: `worktreePath` из
`meta.json` для `isolation: "worktree"`, иначе последний `cwd` записей
транскрипта. Core хранит его в сессии (`CoreSession.workingDirectory`), см.
[ClaudeSubagentSessions.md](https://github.com/OleynikAleksandr/Harness_AI/blob/94a9d457/docs/architecture/ClaudeSubagentSessions.md), §3.2.

## 11. Мелкие исправления того же релиза

- дрейф качества считается только для стеков, чьим проверкам нужен
  манифест (`node --test` без `package.json` дрейфа не даёт);
- `.harness/product-tree/**` считается документацией для DOCS и
  `docs:commit`; `kit:doc-size` и `kit:md-links` проверяют только Markdown;
- файлы `pending-*.json` проверок удаляются при любом исходе транзакции;
- `inspect --format text` печатает текст;
- `KIT_VERSION` 2.1.0: старые установки — `KIT_OUTDATED`, обновление
  добавляет в `.gitignore` `.harness/sessions/` и `.claude/worktrees/` и
  блок «Execution modes» в `AGENTS.md`. Версия 2.1.1 (раунд 2) добавила
  в `.gitignore` `.DS_Store`, 2.2.0 (раунд 3) — блок «Inputs and
  documents» в `AGENTS.md`, 2.2.1 — каталоги зависимостей
  `node_modules/`, `.venv/`, `__pycache__/` в `.gitignore`, текущая
  2.2.2 — проверки содержимого пропускают пути, удалённые из индекса.
