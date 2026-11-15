# provider-codex: вопросы агента

Вопросы `request_user_input` агента ChatGPT/Codex в ленте сессии и ответ из панели (M33,
раздел 2.4 [решения по провайдерам](../../../../../../docs/planning/M33-agent-questions-providers.md);
факты — [M33-codex-question-facts.md](../../../../../../docs/design/M33-codex-question-facts.md)).
Общий контракт (`ChatQuestion`, пределы, правила попытки ответа, журнал попыток) —
`provider-registry`, его `questions.md`. Ссылка — из `module.md`; лента — [chat.md](chat.md).

## Запросы сервера: никто не отвечает (`src/rpc.ts`)

Решение пользователя, 15.11.2026: «Мы сделали такое поведение кит, потому что вопрос никуда не
приходил… Теперь, когда вопрос будет приходить, и приходить в любой из клиентов, это поведение,
естественно, нужно изменить.»

- `createRpcSession(transport, options)` не отвечает на запросы сервера (сообщение с `id` и
  `method`) ни результатом, ни ошибкой: ответ ошибкой любого подписчика отменяет вопрос и
  отклоняет одобрение для всех клиентов (T002, Q6), а без ответа запрос остаётся у ChatGPT и
  после закрытия соединения (Q11). Так работают все соединения Kit: лента, прямой ход,
  пробуждение, Stop, параметры, создание и удаление сессий. Kit не одобряет и не отклоняет
  команды и правки.
- `RpcSessionOptions`: `onRequest(request)` — запрос сервера `{ id, method, params }` (без
  ответа); `onNotification(note)`; `keepNotifications: false` — уведомления не копятся
  (только слушатель); `onClose(error?)` — после закрытия транспорта. `respond(id, result)` —
  ответ на запрос сервера; его вызывает только слушатель для вопроса по нажатию в панели.
- `CodexRuntime.listen(options)` — долгое соединение с демоном (сокет управления; на Windows —
  `codex app-server proxy`) с `experimentalApi: true`; закрывает его вызывающий.

## Разбор: `src/questions.ts`

- `threadFlags(answer)` — `status.type` и `status.activeFlags` ответа `thread/read`.
- `questionOfRequest(params, at)` — `item/tool/requestUserInput` (`USER_INPUT_METHOD`):
  `threadId`, `turnId`, `itemId` (id вопроса), части из `questions[]`: `id` Codex, `header`,
  `question`, `options` (`label`, `description`), `multiSelect: false`, `allowOther` —
  `isOther` или нет вариантов. Часть с `isSecret` делает вопрос `answerable: false` с причиной
  `CODEX_SECRET_REASON` «Секретный ответ вводится только в приложении ChatGPT».
- `answerResult(parts, answers)` — результат запроса `{ answers: { [id]: { answers: [подпись
  или свой текст] } } }` (T002, Q4).
- `waitingStub(threadId, at, after)` — заглушка C0: id `waiting-<thread>` (`STUB_PREFIX`),
  `parts: []`, `answerable: false`, причина `CODEX_WAITING_REASON` «Агент ждёт ответа. Ответьте
  в приложении ChatGPT».

## Слушатель: `src/question-listener.ts` (C1, момент подписки L1)

`createQuestionListener({ open, log, now, timing? })` — один на провайдер. Одно долгое
соединение, подписки `thread/resume { excludeTurns: true }`.

- Не больше `maxThreads` (8) подписок; новой уступает самая давняя по опросу подписка без
  ожидающего вопроса, иначе подписки нет (`ensure` → `false`).
- Подписка снимается (`thread/unsubscribe`) через `afterTurnMs` (30 с) после `turn/completed`
  или через `idleMs` (60 с) без опроса ленты; проверка раз в `sweepMs` (5 с). Её неотправленные
  ожидающие вопросы забываются: демон повторит их следующей подписке (T002, Q3, Q12). Без
  подписок соединение закрывается.
- `item/tool/requestUserInput` — ожидающий вопрос с id запроса и поколением соединения.
  Повтор того же вопроса новой подписке заменяет запрос оборванного соединения; уже
  отправленный ответ не повторяется. Другие запросы сервера (одобрения и прочее) не хранятся и
  остаются без ответа.
- `serverRequest/resolved { requestId }` (сверка по id запроса: демон повторяет запрос с тем же
  id) — вопрос `answered` без `answers`, кто бы ни ответил: признака победителя нет (Q5).
  `turn/completed` (в том числе `interrupted`, Q10) — ожидающие вопросы треда `cancelled`.
  Закрытые хранятся в памяти, последние `closedKeep` (20) на тред, и после перезапуска службы
  не видны.
- Обрыв соединения: ожидающие вопросы этого соединения — `answerable: false` с причиной
  `CODEX_LOST_REASON`, пока демон не повторит их новой подписке. Новое подключение — не чаще
  пауз `retryMs` (1, 2, 5, 10, 30 с после 1-й, 2-й… неудачи).
- `answer(thread, qid, attempt, commit)` — по правилам попытки реестра: актуальный вопрос,
  `checkQuestionAnswer`, проверка связи, `commit()`, затем без ожиданий между проверкой и
  отправкой — `respond(id запроса, answerResult)` один раз на соединении, получившем запрос.
  Закрыт до отправки — `question-stale`; связь прервалась — `question-failed`;
  `serverRequest/resolved` за `confirmMs` (10 с) — исход `unknown`; нет — `question-timeout`,
  вопрос остаётся `pending` с `delivery: 'sent'`, второго ответа нет.

## Провайдер: `src/question-parts.ts`

- `observe(thread, answer)` — метаданные `thread/read` каждого опроса ленты (`onThreadRead`
  читателя истории, рядом с наблюдателем Stop).
- `decorate(thread, page)` — `readMessages`: при статусе `active` с флагом
  `waitingOnUserInput` (`WAITING_FLAG`) слушатель подписывается (L1, до `POLL_SUBSCRIBE_MS`
  2 с), иначе опрос продлевает подписку. Вопросы слушателя встают после самого нового
  сообщения страницы, на которой их увидели впервые (`afterMessageId`). Флаг есть, а
  ожидающего вопроса нет — заглушка C0; флага нет — заглушки нет. Страница без вопросов —
  прежняя страница.
- `prepare(thread)` — перед ходом, который начинает Kit (прямой ход `sendDirect`, пробуждение
  `wakeSession`), слушатель подписывается, не дольше `PREPARE_MS` (2 с); не успел — ход идёт
  без него.
- Асинхронные вопросы истории (`page.questions` читателя, раздел ниже) идут на страницу вместе
  с вопросами слушателя и заглушкой, от старых к новым по `at` (без времени — в конце, порядок
  при равенстве сохраняется). Заглушка C0 смотрит только на вопросы слушателя.
- `answer(project, thread, qid, attempt, commit)` — заглушка — `question-unavailable`;
  асинхронный вопрос (`async:…`) сюда не приходит (его отвечает `async-answer.ts`, M34), прямой
  вызов — `question-unavailable`, ничего не отправляется; запись
  `sent` журнала попыток у этого вопроса (ответ отправлен до перезапуска, демон повторил
  запрос) — `question-sent` без отправки; иначе — слушатель.
- Возможность `answerQuestion` — как `trust`: недоступна без `codex`.
- `CodexDeps.questionTiming` — сроки слушателя в тестах.

## Асинхронный вопрос: `src/questions.ts`, `src/history-*.ts` (T012)

Вопрос `request_user_input_async` обычного режима (спецификация M33 раздел 2.7, факты Codex
раздел 7): элемент истории `agentMessage` с непустым `questions: [{ title, options }]`.

- `asyncAsks(item)` — вопросы элемента: `title` строкой, `options` — только строки (`null` —
  без вариантов); пустой список — `null`. `asyncQuestion(itemId, asks, at, after, answered)` —
  вопрос ленты: `id` `async:<id элемента>` (`ASYNC_PREFIX`), части `q<номер>` с пустым
  `header`, подписи без описаний, `multiSelect: false`, `allowOther: true`, `reply: 'message'`;
  `answered` — `state: 'answered'` без `answers` и `answerable: false`.
- Кэш истории (`history-state.ts`): запись элемента (`itemEntry`) хранит вопросы и их время
  (время сообщения, иначе элемента, иначе хода); `pushEntry` собирает сообщения и вопросы по
  порядку; `window` отдаёт вопросы окна: `afterMessageId` — сообщение элемента, а при пустом
  тексте — предыдущее сообщение (или `null`); `answered`, когда после вопроса в ленте есть
  сообщение пользователя. Тот же сбор — в истории `legacy`. Байты вопросов входят в предел кэша.
- Ответы вопроса (M34, раздел 2.4): запись сообщения-обёртки (`Entry.replies`, `parseReply`)
  хранит разобранные элементы; `pushEntry` отдаёт их каждому ещё не закрытому вопросу
  (`Asked.replies`; обычное сообщение — `null`). `window` даёт закрытому вопросу `answers`
  через `replyAnswers(itemId, подписи, элементы)`: только элементы с его `itemId`, часть
  `q<index+1>` — `{ selected: [подпись] }` при совпадении с подписью варианта, иначе
  `{ selected: [], other: ответ }`; пустой ответ пропускается. Нет таких элементов — вопрос
  закрыт без `answers`, как раньше. Байты ответов входят в предел кэша, в журнал не пишутся.
- `outOf` читателя оставляет вопросы только при сообщениях страницы: вопрос ушедшего за окно
  сообщения на страницу не попадает.
- Вопросы истории переживают перезапуск службы; текст вопросов в журнал не пишется.
- Известные ограничения (факты Codex, разделы 8 и 9): инструмент есть не у всех моделей (у
  `gpt-6.1-sol` есть, у `gpt-5.6-luna` в обычном режиме нет). Агент, которому велено ждать
  ответа, не заканчивает ход; ChatGPT тогда показывает вопрос карточкой и отправляет ответ
  обёрткой внутри хода (раздел ниже).

## Ответ на асинхронный вопрос: `src/question-reply.ts`, `src/async-answer.ts` (M34)

Спецификация — [M34](../../../../../../docs/planning/M34-codex-async-answer.md), разделы 2.2 и
2.3; факты — раздел 9 фактов Codex. Агент, который ждёт ответа, не заканчивает ход, поэтому
ответ панели входит в идущий ход, как ответ из ChatGPT.

- `replyText(itemId, parts, answers)` — обёртка ChatGPT: `<send_user_message_question_reply>`,
  перевод строки, JSON-массив одной строкой, перевод строки, закрывающий тег и перевод строки.
  Элемент на часть по порядку: `questionItemId` —
  `JSON.stringify(['request_user_input_async', <id элемента>, <номер с 0>])`, `question`,
  `answer` (свой текст, если он не пуст, иначе выбранная подпись). Кириллица не экранируется.
- `parseReply(text)` — элементы `{ itemId, index, question, answer }` или `null`: только текст,
  который без пробелов по краям равен одной обёртке с непустым JSON-массивом объектов со
  строковыми `question` и `answer` и верным `questionItemId`.
- `provider.answerQuestion` с id `async:…` идёт в `createAsyncAnswer(deps).answer`; блокирующие
  вопросы — по-прежнему в слушатель (`question-parts.ts`, там `async:` — `question-unavailable`).
- `answer(project, thread, qid, attempt, commit)`:
  1. без общего демона (`sharedMode.refresh()` ложно) — `question-unavailable` с
     `CODEX_APP_REASON` «Ответьте в приложении ChatGPT», к демону ни одного запроса;
  2. свежее чтение ленты (`readMessages` с `CHAT_PAGE_LIMIT` и ключом проекта, как у панели);
     ошибка чтения — `question-unavailable` с `CODEX_FEED_UNREAD_REASON`; вопроса с
     `reply: 'message'` нет — `question-unavailable`; затем `checkQuestionAnswer`
     (`question-stale`, `question-invalid` и другие отказы до передачи);
  3. в одном соединении `answerTarget`: `thread/read`; `idle` или `notLoaded` — новый ход;
     `active` — `thread/turns/list` (10 новых ходов, `itemsView: 'notLoaded'`) и ход
     `inProgress`; иначе (или нет идущего хода) — `question-unavailable` с `CODEX_APP_REASON`;
  4. `commit()` (запись `sent`), затем одна передача: `steerTurn` — `turn/steer { threadId,
     input: [{ type: 'text', text }], expectedTurnId }`; новый ход — `prepareTurn` (подписка
     слушателя) и `wakeThread` с обёрткой (`thread/resume` без ходов, если чат не загружен,
     `turn/start`, `thread/unsubscribe`);
  5. демон отказал ошибкой JSON-RPC (`refusedByDaemon`: числовой код, без сбоя транспорта) —
     ничего не принято: ещё одно `answerTarget` и одна передача; больше попыток нет;
  6. передача принята — исход `accepted`; ответ ленты (раздел ниже) показывает, чей ответ
     пришёл первым;
  7. ошибка соединения до `commit()` — `question-failed`; после него обрыв или тайм-аут —
     `question-timeout` (`delivery: 'sent'`, без повтора); второй отказ демона —
     `question-failed` «ChatGPT не принял ответ: …»; запись журнала остаётся `sent`.
- Хук `UserPromptSubmit` влитого сообщения канал обрабатывает как сообщение пользователя из
  ChatGPT: очередь канала уходит контекстом, ход продолжается (`agent-channel` не меняется).
- Журнал службы: `codex: question answer steered into turn <turnId> of thread <id>` или
  `codex: question answer started a turn of thread <id>`; текста вопроса и ответа в нём нет.

## Поведение на ОС

| Что | macOS | Linux | Windows (x64, ARM64) |
| --- | --- | --- | --- |
| Слушатель (C1) | долгое соединение с сокетом управления | так же | долгий процесс `codex app-server proxy` |
| Флаг (C0), разбор, ответ | общий Node-код | так же | так же |
| Ответ на асинхронный вопрос (`turn/steer`, `turn/start`, M34) | сокет управления демона | так же | `codex app-server proxy` |

Новых вызовов программ ОС нет. Вопрос виден Kit только там, где ход идёт в демоне, к которому
Kit подключён.

## Тесты

`test/questions.test.ts` (подставной демон, darwin, linux, win32): заглушка по флагу,
подписка по флагу и вопрос вместо заглушки, ответ результатом запроса один раз (`unknown`),
закрытие без `answers`, второй ответ — `question-stale`; вопрос до подписки повторён (L1),
свой текст; ответ в ChatGPT раньше; `question-timeout` с `delivery: 'sent'` и без второго
ответа, позднее закрытие другим клиентом не приписывает ответ панели; секретная часть и
заглушка без отправки, конец хода — `cancelled`; обрыв соединения слушателя и повтор новой
подписке; снятие подписки без опросов и возврат вопроса; перезапуск с записью `sent`; не
больше 8 подписок и уведомления не копятся; короткое соединение не отвечает ни на одобрение,
ни на вопрос; недоступный демон — одна попытка на паузу. `test/ws-rpc.test.ts`: запросы
сервера без ответа. `test/async-questions.test.ts` (darwin, linux, win32): вопрос истории и
отказ без общего демона без единой передачи. `test/async-answer.test.ts` (M34): обёртка байт в
байт по образцу ChatGPT, разбор и отказы разбора; `turn/steer` с `expectedTurnId` после
`commit()`; новый ход для `idle` и `notLoaded` с подпиской слушателя; отказ `turn/steer` —
одно новое чтение и `turn/start`; отказы до передачи (закрытый, неверный, неизвестный вопрос,
нет общего демона, неизвестное состояние); сбой журнала без передачи; потерянный ответ демона —
`question-timeout` без повтора.
