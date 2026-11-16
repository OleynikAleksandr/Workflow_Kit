# Workflow Kit — режимы выполнения в Harness

Часть [режимов выполнения и оркестровки](WorkflowKitExecutionModes.md): разделы 10 и 11
перенесены сюда дословно ради лимита размера документа; нумерация сохранена.

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
- С Kit 2.3.3 (спецификация M39) `autopilot:status` отдаёт `authorization`
  и `proposal`, а решатель ядра при живом разрешении продолжает разрешённую
  задачу поставки командой `task:start <ID> --autopilot-run <run>` вместо
  остановки `delivery-confirmation` и останавливается с новой причиной
  `host-transition` там, где приёмку или закрытие выполняет приложение.
  Без живого разрешения решение прежнее. `capability` статуса
  (`automation`, `authorization`, `deferDelivery`, `instructions`,
  `complete`) говорит приложению о поддержке по признакам, а не по номеру
  версии ([контракт M39](../../planning/M39-autopiloting-kit.md)).

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
