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
    (`waiting-for-mode-choice`, одна сессия проекта); план готов, а ход, начатый
    стартовым сообщением, закончился без записи Kit о начатой работе — проблема
    запуска `turn-ended`, автопилот выключается, держать
    (`waiting-for-plan-start`, M11 2.2); план готов, автопилот
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
    сессии)` назвал причину (M4, раздел 11.3; `refine` не блокируется); работающие
    сессии — только те, что проект знает (опция `owns(projectId, key)`; без неё или при
    ошибке сессия считается, M16 2.1);
    `scope:choose --generation --option --session <id сессии> --note
    "Выбор пользователя в панели Workflow Kit: …"`; оркестрация — для
    сессий провайдера с возможностью `orchestration` (опция
    `orchestration(client)`; иначе `choose` с `orchestrated` и `start`
    оркестрируемого плана — 409 `orchestration-unavailable`, M8, раздел 5); агенту — «режим
    выбран, ждите кнопку запуска» или текст «доработать спецификацию».
    После успешного `scope:choose` другие сессии проекта, держащие `Stop` с
    `waiting-for-mode-choice`, будятся (`wakeHolders`, M31 3.3): решатель их отпускает,
    сообщение о выборе получает только `session`.
    Сессии провайдера без оркестрации (с M10 такого провайдера в Kit нет) к текстам
    последовательного режима в `choose` и `start` добавляется
    `sequentialOnlyNote(client)`: оркестрация отсюда не запускается,
    `assignment:*`/`integration:*` и подагенты в worktree запрещены.
  - `start` (текст режима Harness: последовательно или оркестратор; у
    оркестратора — процедура исполнителя его приложения `executorHowto`
    из таблицы `EXECUTOR_HOWTO` по id провайдера (`{ text, repeat }`):
    Claude — Agent с `isolation: "worktree"`, Codex — `git worktree add
    --detach .workflow-kit/local/worktrees/<id> <baseCommit>`, `spawn_agent`
    с `workdir`, `wait_agent`, `integration:start`; Kimi (M10, раздел 2.2) —
    тот же `git worktree add`, сабагент — инструмент `Agent` на переднем плане
    (без `run_in_background`, без `AgentSwarm`), worktree — `cwd` каждого
    `Bash`, независимые задания — несколько вызовов `Agent` в одном сообщении,
    `integration:start` по SHA; продолжения автопилота в оркестрации
    дополняются процедурой у провайдера с `repeat` — Codex и Kimi),
    `pause` (`pause:set --on`), `resume` (`pause:set --off` при паузе и
    «продолжай»), `accept` (`accept --note`, слова пользователя или текст по
    умолчанию), `close` (`close --scope <id> --note`), `tidy` (все три — раздел
    «Конец плана и ОС (M37)»), `fixes` (текст
    исправлений агенту, затем раунд исправлений через `plan:extend`),
    `confirmDelivery` (слова пользователя агенту для `task:start
    --confirmed`). `start`, `resume`, `fixes`, `confirmDelivery` включают
    автопилот сессии-владельца (счётчик продолжений с нуля).
  - Запуск плана (M11): `start` запоминает id стартового сообщения и время
    нажатия. Пока запуск идёт без проблемы, повторный `start` ничего не шлёт и
    отвечает `{ owner, already: true }`. После проблемы `start` повторяет
    запуск: сообщение, ещё ждущее доставки (`channel.waiting`), не ставится
    второй раз — отсчёт начинается заново и канал отправляет его снова
    (`channel.flush`); иначе ставится новое сообщение. Запуск забывается, когда
    фаза плана уходит из `ready`, при `accept` и `close`.
  - Владелец неначатого плана (M31 3.3, `src/owner.ts`): `start(projectId, session)` из
    сессии, которая не `execution.ownerSession`, сначала вызывает `scope:owner --session <id>
    --note OWNER_NOTE` (Kit 2.2.5), ждёт `workflow.refresh`, запоминает новую сессию
    владельцем, выключает автопилот прежнего владельца и будит сессии проекта с
    `waiting-for-plan-start`; затем запуск идёт как обычно. Тот же владелец — без
    `scope:owner`. Kit без команды (`UNKNOWN_COMMAND`): при чужом владельце — 409
    `kit-outdated` (`KIT_OUTDATED_TEXT`, `KIT_OUTDATED_NEXT`), без владельца — запуск как
    раньше. Прочие отказы Kit (`OWNER_BUSY`) — обычная ошибка Kit 409.
  - Отказ Kit — `WorkflowActionError` (`code` Kit, `message`, `nextAction`,
    `status` 409); владелец: сессия из запроса, запомненная при выборе или
    найденная по `execution.ownerSession` среди сессий канала.
  - `get(key)`, `section()` — `SessionAutopilot`: `enabled`, `continues`,
    `maxContinues`, `before` (ревизия и HEAD в начале хода), `origin`,
    `last` (`action`, `reason`, `label` по-русски, `detail`, `at`), `start`
    (`PlanStart` или `null`: `at`, `messageId`, `step` — `sending`, пока
    сообщение в очереди или неотправленном исходящем, иначе `delivered`;
    `slow` — доставлено и прошло `START_SLOW_MS` (3 мин) с нажатия;
    `problem` — `{ code, text }`: `not-delivered` после `START_DELIVERY_MS`
    (60 с) ожидания или с пометкой канала `UNDELIVERED_NOTE` (её причина идёт в
    текст), `turn-ended`; тексты — `startProblemText`). Ступень считается при
    каждом чтении. Состояние ведёт `createPlanStarts` (`src/start.ts`):
    `begin`, `view`, `restart`, `turnEnded`, `forgetProject`.
- `registerAutopilotRoutes({ router, state, autopilot, mutex? })` —
  `POST /api/projects/:id/workflow/choose|start|pause|resume|accept|close|
  tidy|fixes|confirm-delivery` (тело: `session`, `generation`, `option`,
  `note`, `text`; `accept` и `close` передают автопилоту `session`, `tidy`
  отвечает `{ owner, paths }`); ошибки — `HttpError` с кодом Kit и `details.nextAction`;
  раздел `autopilot` в `/api/state`.
- Тексты: `PREFIX` (`Workflow Kit:`), `CHOICE_NOTES`, `CHOSEN_WAIT`,
  `START_MESSAGES`, `EXECUTOR_HOWTO`,
  `executorHowto(key)`, `sequentialOnlyNote(client)`, `REFINE_MESSAGE`, `RESUME_MESSAGE`, `fixesMessage`,
  `deliveryMessage`, `STOP_LABELS`, `startProblemText(code, reason?)`; конец плана (M37) —
  `acceptedMessage`, `closedMessage`, `tidyMessage`, `tidyNote`, `dirtyTreeText`, `CLEAN_TEXTS`.
- `createPlanEnd(deps) → PlanEnd` (`src/acceptance.ts`), `ACCEPT_NOTE`, `CLOSE_NOTE` — конец
  плана, раздел ниже; автопилот создаёт его сам.
- `STOP_LABELS['host-transition']` — «Автопилот выполняет приёмку или закрытие» (причина
  решателя ядра Kit 2.3.3 при живом разрешении; порт `decide.ts` получит её в задачах службы M39).
- Тикеты хоста (M39, `src/host-ticket.ts`): `createHostTickets({ now?, ttlMs?, onRedeem? })`
  → `{ issue(binding), redeemed(), restore(ids) }`. `issue` после проверки настоящего источника
  шага выдаёт `HostVerifier` для одного дочернего процесса `KitRunner.runHost`: случайный тикет
  (`<ticketId>.<секрет>`, 32 байта), срок `HOST_TICKET_TTL_MS` (60 с). `verify` сравнивает тикет
  за постоянное время, отказывает после погашения (`ticket already used`) и срока
  (`ticket expired`), проверяет `payloadDigest` и каждое поле привязки (`operation`, `root` по
  `realpath`, `runId`, `scopeId`, `ownerSession`, `expectedRevision`, `inputDigest`) и гасит
  тикет до ответа, вызывая `onRedeem` для журнала запуска (журнал — T005; `restore` возвращает
  погашенные id после перезапуска). `hostInputDigest(value)` — тот же sha256 канонического JSON,
  что `hostDigest` Kit. Подключение к решению автопилота и журналу — T005–T008; `autopilot.ts`
  и `decide.ts` в T002 не меняются.
- Автопилотирование M39 (T005): опция `authority` автопилота
  (`beforeStart`/`beforeResume` → `runId | null`; `start`/`resume` отвечают и `runId`),
  настройки `createSettingsStore`, журнал `createRunJournal`, Kit запуска `createRunKit`,
  запуски `createRuns`, тексты `POLICY_TEXTS`/`preparationText`, маршруты
  `registerAutopilotingRoutes` и разделение исходников — в [autopiloting.md](autopiloting.md);
  там же T006 — подготовка полного запуска `createPreparation` (`PREPARE_TEXTS`, `ReviewFact`,
  `PrepareActions`), `grantNote` и `ChooseRequest.expectedDigest`/`automatic`; T007 —
  перенесённый решатель с разрешением (`liveGrant`, `grantedDelivery`, `host-transition`),
  `createRunTurns` (опция `runs`), `createRunControl`, `createRunWaits`,
  `registerRunControlRoutes`, `registerSessionRunRoutes`, `runHttp`, `Autopilot.halt`,
  `authority.onPause`, `WorkflowActionError.details`; T008 — сервис завершения
  `createRunCompletion` (`COMPLETE_TEXTS`, `PublisherLike`, `GitRead`, `RunCompleter`,
  снимок `RunCompletion`) в [autopiloting-completion.md](autopiloting-completion.md); T009 —
  `RunJournal.onChange`, полная сводка `RunBrief`/`runBrief` (`src/run-brief.ts`) и `GET
  …/autopiloting/policy` — в [autopiloting.md](autopiloting.md). Сквозные проверки T010 на
  настоящем бандле, канале и bare-репозитории — `test/lifecycle-real.test.ts` (после ручного
  запуска до проверенного SHA, перезапуск, вопрос, остановка во время CI) и
  `test/orchestrated-real.test.ts`; доказательства —
  [M39-acceptance.md](../../../../../../docs/evidence/M39-acceptance.md).

## Инварианты

- Все сообщения автопилота в канал (`choose`, `start`, `enable`) передают `projectId`:
  после перезапуска службы канал заводит сессию с проектом и служба её будит (M16 2.2).
- Решение — только по `autopilot:status` Kit; файлы `.harness/**` не
  читаются.
- Держится только ожидание решения пользователя: выбор пути, запуск
  плана, подтверждение выпуска; не дольше 9 минут (`agent-channel`).
- Не больше 40 продолжений подряд; сообщение пользователя в чате
  останавливает автопилот до кнопки панели.
- Состояние живёт в памяти службы; после перезапуска службы запуск плана
  забыт, и карточка снова предлагает «Начать выполнение плана».

## Зависимости

`#agent-channel`, `#kit-runner`, `#plan-view` (типы), `#http-server`,
`#data-store` (тип мьютекса). Тесты используют `#kit-bundle`,
`#process-supervisor` и настоящий бандл Kit на временном git-репозитории;
`test/host-ticket.test.ts` — тикеты (одноразовость, срок, digest, каждое поле, восстановление) и
настоящий `runHost`: без канала и с `WFK_HOST` в окружении — `HOST_AUTH_REQUIRED`, чужие ревизия,
операция и вход — `HOST_AUTH_INVALID` без записи, верный тикет — grant и коммит, повтор того же
тикета отклонён, revoke `settings-off`, `task:start --autopilot-run` после revoke —
`AUTOPILOT_REVOKED`.

## Прерывание ответа и ОС (M24)

`interrupt(projectId, key)` выключает продолжение этой сессии, обновляет состояние Kit
и ставит штатную `pause:set --on` только для активного scope, чей `ownerSession`
совпадает с остановленной сессией. Вне плана, у другого владельца и при уже включённой
паузе дополнительная команда не нужна. Ошибка обязательной паузы передаётся вызывающему
API; барьер канала сохраняется. Назначения исполнителей не отменяются.
`decide` возвращает release при барьере канала. `resume` снимает штатную паузу и барьер
доставки перед явным продолжением. Новый пользовательский prompt снимает только
барьер доставки, но не паузу плана. Контракт —
[M24](../../../../../../docs/design/M24-turn-interruption.md).
Поведение одинаково на macOS, Linux и Windows x64/ARM64: используются только публичные
методы канала и команды Kit, без новых вызовов программ ОС.

## Конец плана и ОС (M37)

Спецификация — [M37](../../../../../../docs/planning/M37-plan-close-flow.md), разделы 2.2 и 2.3.
Код — `src/acceptance.ts` (`createPlanEnd`), тексты — `src/texts.ts`.

- **Кому сообщают.** Сессия-владелец: запомненный владелец проекта, иначе
  `execution.ownerSession` Kit среди сессий канала, иначе `session` из запроса панели. Ключ
  определяется до команды Kit. Владельца нет или он вышел из процесса Kit
  (`channel.excluded`) — команда Kit выполняется, сообщение не ставится, в журнале
  `autopilot: <accept|close> of <project>: no session to notify (<no owner|owner left the Kit process>)`.
- **`accept(projectId, note?, session?)`**: `accept --note` (слова пользователя от трёх знаков,
  иначе `ACCEPT_NOTE`); запуски плана забываются, автопилот сессий проекта выключается;
  владельцу в очередь (источник `panel`) — `acceptedMessage(scopeId, paths)`, где `paths` —
  `plan.dirty` свежего состояния (с `tidyNote`, если пути есть); очередь будит удержанный
  `Stop`; другие сессии проекта с `ready-for-acceptance` будятся; метка владельца — `accepted`.
- **`close(projectId, note?, session?)`**: нет scope — `no-scope`; `close --scope <id> --note`
  (слова от десяти знаков, иначе `CLOSE_NOTE`); отказ Kit `DIRTY_TREE` с `details.paths` —
  `dirty-tree`, 409, `dirtyTreeText(paths)` (до пяти путей, «и ещё N», подсказка про «Попросить
  агента убрать»); прочие отказы — как есть. После успеха: владелец проекта забывается,
  автопилот выключается, владельцу — `closedMessage(scopeId)`, метка — `closed`.
- **`tidy(projectId, session?)`** → `{ owner, paths }`; отказы 409 по порядку: `no-scope`;
  `not-finished` (фаза не `acceptance` и не `accepted`); `clean` (текст `CLEAN_TEXTS` по фазе:
  «…можно принимать результат» / «…план можно закрыть»); `no-owner`; `owner-unavailable`
  (`channel.excluded`). Иначе владельцу — `tidyMessage(paths)`; Kit не вызывается, автопилот
  не трогается. Сессия процесса Kit, которую сейчас нельзя разбудить, — не отказ: сообщение
  ждёт в очереди канала.
- **Метки.** `AutopilotReason` и `STOP_LABELS`: `accepted` — «План принят» (без обещания
  закрытия), `closed` — «План закрыт». `decide()` поправляет устаревшую метку и после приёмки
  или закрытия словами в чате: у сессии с выключенным автопилотом — `settle` (`ACCEPTED` →
  `accepted`, нет scope → `closed`), у включённого — `endReason` при записи причины
  (`ready-for-acceptance` при `ACCEPTED` → `accepted`; `no-scope` после `ready-for-acceptance`,
  `accepted` или `closed` → `closed`).
- После сообщений о приёмке и закрытии автопилот ход не продолжает: он выключен, `decide()`
  отпускает `Stop`. Сообщения — английские, тексты панели — русские.
- Работает с Kit 2.2.5 и 2.2.6: `status` 2.2.5 уже отдаёт `changes`, `DIRTY_TREE` — `details.paths`.
- Тесты: `test/acceptance.test.ts` (подставные Kit, состояние и канал: владелец, отсутствующий
  и исключённый владелец, отказы `close` и `tidy`, сочетания фаз и чистоты дерева, метки),
  `test/flow.test.ts` (настоящий бандл: удержанный владелец получает сообщения о `tidy` и
  приёмке, отказ закрытия с путём, закрытие и метки).

Поведение одинаково на macOS, Linux и Windows x64/ARM64: общий Node-код, пути Kit отдаёт
через `/`, новых вызовов программ ОС нет; доставка — существующий канал.

- **Тест на Windows (F001).** `test/flow.test.ts` удаляет временный проект с повторами
  (`rm` с `maxRetries: 10`, `retryDelay: 200`): команда Kit, запущенная оставшимся таймером
  канала, ещё может работать в папке проекта, и Windows x64/ARM64 отказывает в удалении
  занятой папки (`EBUSY`, CI 43859413953). На macOS и Linux удаление проходит с первого раза;
  код службы не меняется.
