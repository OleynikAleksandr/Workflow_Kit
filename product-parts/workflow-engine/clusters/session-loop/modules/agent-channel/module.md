# Модуль: agent-channel

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#agent-channel`.

## Назначение

Канал к агентам провайдеров без собственного чата (спецификация вехи 2,
раздел 9.2). Выбор пользователя, автопилот и другие указания панели доходят
до агента ответом хука `Stop` (`{"decision":"block","reason":…}` — агент
продолжает с этим текстом) или дополнительным контекстом хука
`UserPromptSubmit`. Провайдеру, чей `Stop` нельзя удержать (Kimi Code),
следующее сообщение уходит новым промптом после конца хода (веха 8, раздел 3).

Файлы: `types.ts` (публичные типы), `hook-input.ts` (вход и ответы хуков),
`channel.ts` (слоты, удерживаемый `Stop`, `prompt`), `slots.ts` (слот и
общее ядро), `detached.ts` (конец хода без удержания), `routes.ts`.

## Публичный интерфейс (`src/index.ts`)

- `parseHookInput(client, raw, projectDir?, dialects?, panelProcess?) → HookInput | null` —
  `client` (`AgentClient`) — id провайдера; `dialects` (`HookDialects`:
  `(client) → HookDialect | undefined`) строит служба по реестру провайдеров
  (`Provider.hookDialect`, нет поля — `claude`), неизвестный клиент — `null`;
  без `dialects` годится любой id вида `[a-z][a-z0-9-]*` с диалектом `claude`.
  `HookInput.dialect` — формат входа и ответов клиента. Поля
  входа хука (проверено на Claude 2.1.318 и codex-cli 0.166.0):
  `session_id` (у Codex — id треда), `turn_id` (только Codex), `cwd`,
  `transcript_path`, `stop_hook_active`, `last_assistant_message`,
  `prompt`, `session_title` (`sessionTitle`: текущее имя сессии в Claude
  2.1.319, вход `UserPromptSubmit`); `projectDir` — `$CLAUDE_PROJECT_DIR`
  процесса хука; `panelProcess` — метка процесса панели из тела запроса хука
  (`true` только для `true`, всё прочее — `false`, M19 2.2). `prompt` массивом частей (Kimi Code 2.5.2:
  `[{ type: 'text', text }]`) читается как тексты частей через перевод строки.
  `sessionKey(client, sessionId)` — `<client>:<id>`.
- `blockAnswer(reason)`, `contextAnswer(text)` (`hookSpecificOutput.
  additionalContext` события `UserPromptSubmit`), `messageAnswer(text)`
  (`{ message }` диалекта `kimi`), `promptAnswer(dialect, text)` — ответ
  `UserPromptSubmit` в диалекте клиента (им отвечает `prompt` канала).
- `createAgentChannel({ resolveProject, decide?, holdMs?, now?, onChange?,
  log?, detached? }) → AgentChannel`:
  - `stop(input, signal?)`: сессия «ждёт»; есть сообщения в очереди —
    ответ `block` со всеми сообщениями (через пустую строку); иначе
    спрашивает решатель (`StopDecider`): `continue` — `block` с его текстом,
    `release` — без ответа, `hold` — держит хук (состояние `holding`,
    `holdReason`, `holdUntil`) до нового сообщения, `wake(key)`, отмены
    запроса (`signal`) или `STOP_HOLD_MS` (9 минут), затем отпускает без
    ответа; `hold` с `timeoutAnswer` по истечении срока отвечает `block` с
    этим текстом (напоминание, ход `reminder`; M4, раздел 4). Решатель по
    умолчанию — `release`.
  - `onStop(listener) → отписка`: каждый `Stop` до решателя — `StopEvent`
    (`key`, `client`, `sessionId`, `projectId`, полное
    `lastAssistantMessage`, `origin` — чем начат закончившийся ход:
    `delivery` (сообщения очереди ответом `Stop`, `sources` — их источники),
    `decider` (`continue`), `reminder`, `user` (`UserPromptSubmit`),
    `unknown`); ошибка слушателя — строка в журнале.
  - `prompt(input)`: сессия «работает» (`turnStartedAt`); сообщения,
    пропустившие `Stop`, уходят дополнительным контекстом.
  - Ответ — `HookReply` (`answer`, `ack()`, `nack()`): сообщения уходят из
    очереди только после `ack` (ответ отправлен); `nack` возвращает их в
    начало очереди. Повторной доставки нет.
  - `enqueue(key, text, source?)`, `wake(key)`, `setDecider(fn)`,
    `get(key)`, `list()`, `queued(key)`, `section()`, `close()` (отпускает
    все удержанные хуки, останавливает наблюдателей и таймеры).
  - `waiting(key, id)` (M11): `true`, пока сообщение ждёт доставки — в очереди
    или в неотправленном исходящем сессии без удержания; по нему автопилот
    видит ступень запуска плана.
  - `turnEnd(notice)`, `flush(key)`, `maintain()`, `onIdle(listener)` — конец
    хода без удержания, см. ниже.
- `SessionActivity`: `key`, `client`, `sessionId`, `projectId`, `state`
  (`working` | `waiting` | `holding`), `since`, `turnStartedAt`,
  `lastStopAt`, `lastAssistantMessage` (до 400 знаков), `pending`
  (очередь и неотправленное исходящее), `holdReason`, `holdUntil`, `note`
  (пометка для панели или `null`), `external` — последний хук сессии (`stop`,
  `prompt`, `turn-end`) пришёл без метки `panelProcess`: сессию ведёт процесс вне
  панели (M19 2.2). Обновляется каждым хуком; слот без хуков (например, из
  `enqueue`) — `false`. Что из этого следует, решает служба по провайдеру.
- `registerChannelRoutes({ router, state, channel, dialects? })`:
  `POST /api/hooks/turn-end { client, sessionId, cwd, event, panelProcess? }` → `{ ok }`
  (loopback; не `detached`-клиент, неизвестное событие или пустой
  `sessionId` — 400 `bad-hook-input`);
  `POST /api/hooks/stop` и `POST /api/hooks/prompt` с телом
  `{ client, input, projectDir, panelProcess? }` → `{ answer }` (только с loopback,
  иначе 403 `loopback-only`; клиент, которого нет в `dialects`, или вход без
  `session_id` — 400 `bad-hook-input`); доставка подтверждается событием `finish` ответа,
  обрыв соединения — `nack` и конец удержания; раздел `channel`
  (`{ sessions: SessionActivity[] }`) в `/api/state`.
  Опция `messages` — канал для сообщений панели (служба передаёт канал,
  который ещё и будит ожидающую сессию Claude).
- `POST /api/projects/:id/sessions/:sid/message { text }` → `{ sent: true }`
  или `{ queued: <id сообщения> }`: сообщение панели агенту (M18 раздел 2.5).
  Проверки — `checkSessionMessage(channel, projectId, key, text, owned) → string`
  (чистый текст; `queueSessionMessage` зовёт её и кладёт текст в очередь):
  текст обрезается по краям, пустой — 400 `empty-message`, длиннее
  `MESSAGE_MAX_CHARS` (20 000) — 400 `message-too-long`; сессия, неизвестная
  каналу или чужого проекта, — 404 `unknown-session`.
  Опция `direct(projectId, key, text) → Promise<boolean>`: после проверок
  маршрут отдаёт чистый текст ей; `true` — ответ `{ sent: true }`, в очередь
  ничего не кладётся (служба передала текст агенту репликой пользователя);
  `false`, ошибка (в том числе синхронная) или нет опции — прежний путь:
  сообщение в очередь `messages`, ответ `{ queued }`. Сообщения автопилота и
  ревью идут через `enqueue` без `direct`. Тесты маршрута — `test/routes.test.ts`.
  Опция `owns(projectId, key)`: сессия, которую канал после перезапуска
  службы ещё не видел, принимает сообщение, если провайдер числит её за
  проектом; `enqueue(key, text, source, projectId)` записывает проект в
  новую запись канала, чтобы служба могла поднять и разбудить сессию (R9).

## Конец хода без удержания (`detached`)

Опция `detached` (`DetachedDelivery`) включает путь для клиентов, которых
называет `supports(client)`: `idle(ref)` — живой замок сессии свободен,
`lastAnswer(ref)` — последний ответ агента, `send(ref, text, { id })` —
отправка промпта (`true` — принят), `archived?(ref)`, `names?(client)`
(`label`, `title`, `lockSwitch` для текстов пометок); сроки `pollMs` (1 с),
`watchMs` (2 мин), `retryMs` (2 с), `confirmMs` (60 с), `maintainMs`
(60 с, 0 — без своего таймера). `ref` — `SessionRef` (`key`, `client`,
`sessionId`, `projectId`). Канал провайдеров не называет.

- `turnEnd({ client, sessionId, cwd, event }) → Promise<boolean>` (`false` —
  клиент не `detached`); `event` — `TurnEndEvent` (`TURN_END_EVENTS`: `Stop`,
  `StopFailure`, `Interrupt`). Поколение хода растёт, прежний наблюдатель
  отменяется. `StopFailure` и `Interrupt`: слот «ждёт», слушатели и решатель
  не зовутся, очередь и исходящее сохраняются. `Stop` при свободном замке —
  сессия «без замков»: пометка с именем настройки, ничего не обрабатывается
  и не шлётся до `Stop` с живым замком. Иначе — один наблюдатель на сессию:
  `idle` раз в `pollMs` до `watchMs`; истёкшее ожидание подбирает `maintain()`.
  Сессия вне проектов только отмечается (хук Kimi общий на машину).
- Отложенный `Stop` (сессия свободна): слушатели `onIdle` (с ожиданием: имя
  сессии уходит до сообщения) → `lastAnswer` до трёх попыток → проверка
  поколения и замка (изменились — отмена) → слот «ждёт»; ответ прочитан —
  слушатели `onStop` с `origin` и `sources` хода, иначе пометка «ответ
  <label> не прочитан: <причина>» без слушателей и решателя → шаг решения
  как у `stop()`: исходящее → очередь (вся одним сообщением) → решатель.
  `hold` без `timeoutAnswer` длится до `wake` или нового сообщения, с
  `timeoutAnswer` — напоминание через `holdMs`.
- Исходящее имеет постоянный `id`: отказ или ошибка `send` — повтор тем же
  `id` и текстом (`maintain()`, `flush`, `wake`, новое сообщение); после
  `MAX_SEND_FAILURES` (5) отказов подряд — пометка «сообщение не доставлено:
  <причина>» (начало — `UNDELIVERED_NOTE`), `maintain()` больше не повторяет;
  новое сообщение и `wake` обнуляют счёт, `flush(key)` отправляет снова.
- `prompt(input)` с текстом исходящего — свой промпт: `HookReply.own = true`,
  ход получает `origin` и `sources` исходящего, также когда хук пришёл раньше
  ответа `send` или `send` отказал. Иной текст — промпт пользователя:
  отложенный `Stop` отменяется, непринятое сообщение очереди уходит ответом
  хука, текст решателя отбрасывается. Нет хука за `confirmMs` после принятой
  отправки — пометка «хук Kit не работает в <label> (перезапустите <title>)».
- `enqueue` для ждущего слота отправляет сразу; `flush(key)` — то же по
  запросу; `maintain()` — подбор истёкших ожиданий и повтор отправок;
  `onIdle(listener) → отписка`. Архивная в панели сессия (`archived`)
  сообщений не получает.

## Поведение на ОС

Одинаково на macOS, Linux и Windows: модуль не обращается к файлам и
программам ОС, замок и журнал сессии читает провайдер. Прямой путь сообщения
панели (`direct`) тоже не зависит от ОС: что умеет провайдер, решает служба.

## Инварианты

- Одно сообщение доставляется один раз; неотправленный ответ возвращает
  сообщения в очередь. На пути без удержания повтор идёт с тем же `id`:
  провайдер не принимает один `id` дважды.
- Повтор `Stop` с `stop_hook_active` без новых сообщений не зацикливает:
  решатель по умолчанию отпускает агента; продолжение решает только
  автопилот (со своими лимитами).
- Очередь и активность живут в памяти службы; перезапуск службы их
  сбрасывает.

## Зависимости

`#http-server` (`HttpError`, `classifyAddress`, типы реестров).
