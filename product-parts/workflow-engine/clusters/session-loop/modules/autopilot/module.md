# Модуль: autopilot

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#autopilot`.

## Назначение

Автопилот сессий (спецификация вехи 2, раздел 9.4) и действия с планом из
панели (разделы 8.3 и 9.3): после каждого `Stop` решает, продолжать ли
агента, держать ли хук до решения пользователя или отпустить; кнопки
панели выполняют команды Kit и сообщают агенту через `agent-channel`.

## Публичный интерфейс (`src/index.ts`)

- `decideAutopilot(state, status, turn)`, `nextAutopilotState(state,
  decision)`, `DEFAULT_MAX_CONTINUES` (40) и типы — порт чистой функции
  Harness (`workflow-autopilot/autopilot-decision.ts`) без изменений
  логики: причины остановки `blocked`, `delivery-confirmation`, `disabled`,
  `limit`, `no-progress` (ни ревизия, ни HEAD, ни назначения не
  изменились), `no-scope`, `paused`, `ready-for-acceptance`,
  `transaction-pending`, `turn-error`, `user-message`,
  `waiting-for-executors`, `waiting-for-mode-choice`.
- `createAutopilot({ runner, workflow, channel, projectPath, maxContinues?,
  now?, log? }) → Autopilot`:
  - `decide(context)` — решатель `Stop` для канала. Порядок: нет проекта
    или Kit — отпустить; опция `review` (`ReviewDecider`, M4) спрашивается
    первой: `decide(context, canStart)` (`canStart` — открыто предложение,
    сессия ревьюером не является и никто в проекте не держится
    `waiting-for-mode-choice`/`waiting-for-review`/`waiting-for-plan-decision`); её решение
    (`waiting-for-review`, `waiting-for-main`, `waiting-for-plan-decision` — вопрос о
    плане, M4 раздел 12, отпустить) — окончательное,
    сессия ревьюера без решения ревью отпускается; открыто предложение плана — держать
    (`waiting-for-mode-choice`, одна сессия проекта); план готов, автопилот
    сессии выключен и она владелец (`execution.ownerSession`) — держать
    (`waiting-for-plan-start`); автопилот выключен — отпустить; иначе
    `decideAutopilot` по `autopilot:status`: продолжение — ответ
    `Workflow Kit: autopilot. <текст Harness>`; `delivery-confirmation` и
    `ready-for-acceptance` (результат ждёт «Принять план» или «Нужны
    исправления»; после принятия — уже нет) — держать, чтобы сообщения панели
    дошли сразу; остальные причины — отпустить. Ход считается ходом
    пользователя (`user-message`), если он начался с его сообщения в чате.
  - `onPrompt(key, delivered)` — начало хода: от пользователя или с
    сообщениями панели.
  - `choose(projectId, { session, generation, option })` — `sequential`/`orchestrated`
    отказывают 409 `review-pending`, если `review.choiceBlocked(projectId, работающие
    сессии)` назвал причину (M4, раздел 11.3; `refine` не блокируется);
    `scope:choose --generation --option --session <id сессии> --note
    "Выбор пользователя в панели Workflow Kit: …"`; оркестрация — для
    сессий провайдера с возможностью `orchestration` (опция
    `orchestration(client)`; иначе `choose` с `orchestrated` и `start`
    оркестрируемого плана — 409 `orchestration-unavailable`, M8, раздел 5); агенту — «режим
    выбран, ждите кнопку запуска» или текст «доработать спецификацию».
  - `start` (текст режима Harness: последовательно или оркестратор; у
    оркестратора — процедура исполнителя его приложения `executorHowto`
    из таблицы `EXECUTOR_HOWTO` по id провайдера (`{ text, repeat }`):
    Claude — Agent с `isolation: "worktree"`, Codex — `git worktree add
    --detach .workflow-kit/local/worktrees/<id> <baseCommit>`, `spawn_agent`
    с `workdir`, `wait_agent`, `integration:start`; продолжения автопилота
    в оркестрации дополняются процедурой у провайдера с `repeat` — Codex),
    `pause` (`pause:set --on`), `resume` (`pause:set --off` при паузе и
    «продолжай»), `accept` (`accept --note`, слова пользователя или текст по
    умолчанию), `close` (`close --scope <id> --note`), `fixes` (текст
    исправлений агенту, затем раунд исправлений через `plan:extend`),
    `confirmDelivery` (слова пользователя агенту для `task:start
    --confirmed`). `start`, `resume`, `fixes`, `confirmDelivery` включают
    автопилот сессии-владельца (счётчик продолжений с нуля).
  - Отказ Kit — `WorkflowActionError` (`code` Kit, `message`, `nextAction`,
    `status` 409); владелец: сессия из запроса, запомненная при выборе или
    найденная по `execution.ownerSession` среди сессий канала.
  - `get(key)`, `section()` — `SessionAutopilot`: `enabled`, `continues`,
    `maxContinues`, `before` (ревизия и HEAD в начале хода), `origin`,
    `last` (`action`, `reason`, `label` по-русски, `detail`, `at`).
- `registerAutopilotRoutes({ router, state, autopilot, mutex? })` —
  `POST /api/projects/:id/workflow/choose|start|pause|resume|accept|close|
  fixes|confirm-delivery` (тело: `session`, `generation`, `option`,
  `note`, `text`); ошибки — `HttpError` с кодом Kit и `details.nextAction`;
  раздел `autopilot` в `/api/state`.
- Тексты: `PREFIX` (`Workflow Kit:`), `CHOICE_NOTES`, `CHOSEN_WAIT`,
  `START_MESSAGES`, `EXECUTOR_HOWTO`,
  `executorHowto(key)`, `REFINE_MESSAGE`, `RESUME_MESSAGE`, `fixesMessage`,
  `deliveryMessage`, `STOP_LABELS`.

## Инварианты

- Решение — только по `autopilot:status` Kit; файлы `.harness/**` не
  читаются.
- Держится только ожидание решения пользователя: выбор пути, запуск
  плана, подтверждение выпуска; не дольше 9 минут (`agent-channel`).
- Не больше 40 продолжений подряд; сообщение пользователя в чате
  останавливает автопилот до кнопки панели.
- Состояние живёт в памяти службы.

## Зависимости

`#agent-channel`, `#kit-runner`, `#plan-view` (типы), `#http-server`,
`#data-store` (тип мьютекса). Тесты используют `#kit-bundle`,
`#process-supervisor` и настоящий бандл Kit на временном git-репозитории.
