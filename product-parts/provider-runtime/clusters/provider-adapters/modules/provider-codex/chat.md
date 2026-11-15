# provider-codex: диалог сессии (M18)

Спецификация — `docs/planning/M18-session-chat.md`, раздел 2.3, и M32
(`docs/planning/M32-codex-history-recovery.md`, разделы 2.2–2.4); контракт `ChatMessage`,
`ChatPage`, `ChatSync`, `readMessages`, `sendDirect` — `provider-registry` (`chat.md` того модуля).
Код — `src/chat.ts` (`createChatParts`), чтение порциями — `src/history-reader.ts` (бюджет
опроса и соединение — `history-poll.ts`, кэш ходов и gaps — `history-state.ts`, legacy —
`history-legacy.ts`), разбор ответов — `src/history-items.ts`, статус чата — `threadStatus` в `src/thread-ops.ts`; провайдер
(`src/provider.ts`) передаёт им `rt.withDaemon` (с результатом `initialize`), `sharedMode.refresh()`,
журнал, `rt.paths.home` и pid демона из `rt.cachedDaemon()`. Id сессии — id треда
(`[A-Za-z0-9_-]{1,128}`).

## Публичный интерфейс (`src/index.ts`)

- `threadStatus(session, threadId) → Promise<string | null>` — `thread.status.type` ответа
  `thread/read { threadId }` без ходов (`idle`, `active`, `notLoaded`); отказ демона или нет поля —
  `null`. Чтение тред не загружает.
- `createChatParts({ withDaemon, readDaemon?, offline?, serverIdentity?, shared, log,
  onThreadRead?, home?, serverPid?, now? })` →
  `{ readMessages(threadId, limit, scope?), sendDirect(threadId, text) }`; `scope` — id проекта
  (провайдер передаёт `project.id`); типы `ChatDeps`, `ChatParts`.
- `createHistoryReader({ withDaemon, onThreadRead?, serverPid?, serverIdentity?, offline?, now?,
  cacheBytes? })` →
  `{ read(key, threadId, limit), usage() }`; типы `HistoryDeps`, `HistoryReader`. Константы
  `HISTORY_POLL_PAGES` (8), `HISTORY_POLL_BYTES` (32 МиБ), `HISTORY_POLL_MS` (5 с),
  `HISTORY_PAGE_SIZE` (50), `HISTORY_GAP_RECHECK_MS` (30 с), `HISTORY_CACHE_THREADS` (64),
  `HISTORY_CACHE_BYTES` (32 МиБ), `HISTORY_GAP_REASON`, `HISTORY_UNSUPPORTED_REASON`.
- `threadMessages(answer)` — сообщения ответа с ходами, от старых к новым (лента его больше не
  вызывает); `chatPage(messages, limit)` — не больше `limit` новейших, `truncated`, если старые
  отброшены.
- `CHAT_TIMEOUT_MS` (30 с, соединение прямого хода), `DIRECT_STATUSES` (`idle`, `notLoaded`).

## Лента — `readMessages` (M32: порциями)

Через сокет демона (на Windows — `codex app-server proxy`); чат не загружается, `includeTurns`
нигде в ленте не передаётся. Выбор пути и факты протокола — T001,
`docs/planning/M32-codex-protocol-plan.md` («Результаты T001»).

Опрос (`HistoryReader.read`, один на тред: параллельные вкладки ждут тот же inflight):

1. `thread/read { threadId }` — метаданные и `historyMode`; `thread/turns/list { threadId,
   limit: 50, sortDirection: 'desc', itemsView: 'notLoaded' }` — новейшие ходы без items.
   Ответ `{ thread: { ...метаданные, turns: [{ id, status, items: [] }] } }` (ходы от старых к
   новым) уходит в `onThreadRead` — снимок Stop. Ошибка этого шага — `onThreadRead(id, null)`.
   `-32601` у `turns/list` paginated-треда — ещё не сохранённая история, пустой список.
2. paginated: новые ходы соединяются с кэшем. Пропавший или переставленный известный ход —
   новый проход; прежний опубликованный снимок отдаётся с `loading`, пока новый не готов.
3. `thread/items/list { threadId, turnId, cursor, limit, sortDirection }` по ходам, от новых к
   старым: каждый опрос читает новейший ход, ходы `inProgress` и ходы со сменившимся статусом
   — asc от последнего известного item (исключающий якорь `{ type: 'item', itemId }`, в начале
   хода `cursor: null`). Завершённые элементы повторно не скачиваются, terminal-переход
   дочитывает хвост. Затем непрочитанные старые ходы до `limit` сообщений, при нехватке —
   `turns/list` по opaque `nextCursor` дальше в прошлое.
4. Если запрос статуса старше 2 с и время осталось — шаг 1 ещё раз (снимок Stop не стареет).

Бюджет опроса (connect, `initialize`, статус и items вместе): не больше 8 list-страниц
(одна оставлена для повторного статуса), 32 МиБ принятых байтов (`RpcSession.limitReceived`;
перед каждым запросом в остатке должно быть 16 МиБ) и 5 с; запрос получает остаток времени.
Нет бюджета — опрос отвечает накопленным, следующий продолжает с того же места.

Отказ страницы по размеру (`frame-too-large`, `message-too-large`) закрывает соединение;
следующий запрос открывает новое. Размер страницы хода уменьшается 50 → 25 → 12 → 6 → 3 → 1 и
хранится между опросами (удачная страница удваивает его до 50). Элемент, не прошедший и при
`limit: 1`, — gap: ход читается с конца (desc) до него, каждая страница сразу сохраняется.
`ChatGap { turnId, reason: HISTORY_GAP_REASON, afterItemId?, beforeItemId? }` — непрочитанный
диапазон после `afterItemId` и до `beforeItemId`; нет границы — край хода; `itemId` не
выдаётся (идентичность отказанного элемента не доказана). Gap проверяется снова только при
смене серверной идентичности (`initialize.userAgent` и pid демона) или статуса хода, открытый
gap в конце хода — ещё и раз в 30 с; при неизвестной идентичности границы не стираются и не
перечитываются. Повторённый исключающим якорем элемент или курсор старых ходов без
продвижения — отказ `chat-unavailable` вместо бесконечного цикла; `-32602` у якоря — ход
читается заново.

legacy (`historyMode` нет или `legacy`; `items/list` там всегда `-32601`): каждый опрос заново
`turns/list` desc с `itemsView: 'full'` (только userMessage/agentMessage) до `limit` сообщений;
ход больше предела — его `summary` и gap между её сообщениями, больше и summary — gap хода.
Другой `historyMode` или форма ответа — `ProviderError('codex-history-unsupported', …,
{ status: 502, details: { sync: { state: 'unavailable', reason } } })` без `retryAfterMs`.

Кэш: ключ — CODEX_HOME, проект, тред; LRU не больше 64 тредов и 32 МиБ текста (байты UTF-8).
Тексты обрезаются общей `cutChatText` до кэша; выводы инструментов не хранятся. Старые ходы
за пределом 100 сообщений теряют тексты (ход остаётся известным), в треде не больше 512 ходов.
На диск кэш не пишется; перезапуск службы собирает его заново порциями.

- Сообщения: `userMessage` (части `content[]` с `text` через перевод строки) и `agentMessage`
  (`text`); пустой после обрезки пробелов текст — не сообщение. `id` — id элемента; `at` —
  `startedAtMs` записи `items/list` или элемента в ISO, нет — `startedAt` хода, иначе `null`.
- Ответ на асинхронный вопрос (M34, раздел 2.4): `userMessage`, текст которого `parseReply`
  (`src/question-reply.ts`) разбирает как обёртку `<send_user_message_question_reply>`, лента
  показывает читаемым текстом (`replyReadable`): один элемент — ответ, несколько — строки
  «<вопрос> — <ответ>». `id`, роль и время прежние; читаемый текст обёрткой не разбирается,
  поэтому повторный опрос его не меняет. Пустой ответ оставляет исходный текст: сообщение
  остаётся в ленте и закрывает вопрос. Так же в истории `legacy` и в `threadMessages`.
- `items/list` активного хода отдаёт только завершённые элементы: лента растёт целыми
  сообщениями.
- `sync`: `loading` — первичная загрузка или новый проход ещё идут; `ready`; `partial` с `gaps`,
  `gapCount` и `reason` = `HISTORY_GAP_REASON` («Часть диалога Codex недоступна: слишком большой
  элемент. Полный текст доступен в чате провайдера»). `truncated` — есть непрочитанные или не
  вошедшие старые сообщения.
- Сетевой сбой (M32 T003, [connection.md](connection.md)): сокета нет, отказ, сброс, обрыв
  незавершённого вызова, ранний выход proxy или cooldown координатора. Есть опубликованный
  снимок — 200 с ним целиком и `sync { state: 'reconnecting' | 'unavailable', reason,
  retryAfterMs }`; нет — `ProviderError('codex-reconnecting' | 'codex-unavailable', reason,
  { status: 503, details: { sync, retryAfterMs } })`. `reconnecting` — меньше 30 с от первого
  сбоя («Восстанавливаем подключение к Codex…»), потом `unavailable` («Нет подключения к Codex.
  Проверьте демон в настройках провайдера»); `retryAfterMs` — остаток до следующей попытки,
  не больше 11 с. Пустая страница вместо существующего снимка не отдаётся.
- Остальное — отказ handshake, malformed JSON, ошибка протокола или RPC, неверный id —
  `ProviderError('chat-unavailable', 'Codex не отдал переписку: <причина>')`, HTTP 502, даже
  если кэш есть; сетевой backoff это не запускает. Ошибка items снимок Stop не инвалидирует.
- Лента идёт через `rt.readDaemon` (`ChatDeps.readDaemon`): в cooldown опрос отвечает сразу;
  прямой ход (`sendDirect`) — через `rt.withDaemon` и не повторяется. Идентичность gaps —
  идентичность сервера координатора (`ChatDeps.serverIdentity`).

## Прямой ход — `sendDirect`

Только в режиме общего демона (`sharedMode.refresh()`, [shared-access.md](shared-access.md)),
иначе `false` без обращения к демону. Неверный id или пустой текст — `false`. Затем в одном
соединении `threadStatus`:

- `idle` или `notLoaded` — `wakeThread(session, threadId, text)`: `thread/resume` с
  `excludeTurns: true` (M32: без истории), если тред не
  загружен, `turn/start` самим текстом, `thread/unsubscribe`; в ChatGPT текст виден репликой
  пользователя → `true`, строка `codex: direct message started a turn of thread <id>`;
- `active` — `false` без `turn/start`: второй `turn/start` во время хода не встаёт в очередь, а
  вливается в идущий ход, и агент может бросить текущую задачу (проба). Сообщение уходит в
  очередь канала и приходит агенту ответом хука `Stop`;
- другой статус или `null` — `false`, строка `codex: direct message to thread <id> not sent,
  status …`; ошибка соединения или хода — `false`, строка `… failed: …`. Метод не бросает.

`turn/steer` прямой ход не использует (M18, раздел 5): им Kit вливает в идущий ход только ответ на
асинхронный вопрос (M34, [questions.md](questions.md)).

## Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Лента | `thread/read`, `turns/list`, `items/list` порциями через сокет демона | так же | через `codex app-server proxy` (x64 и ARM64) |
| Прямой ход | при общем доступе к чатам | общего доступа нет — всегда `false` | при общем доступе к чатам |

Кода с ветками по ОС в `chat.ts` и `history-*.ts` нет: транспорт
выбирает `runtime.ts`; пределы, бюджет и gaps одинаковы на macOS, Linux и Windows.

## Тесты

`test/chat.test.ts` на подставном демоне (`test/fake-daemon.ts`: `thread/read` отдаёт
`daemon.threads` — статус, `historyMode` (по умолчанию `paginated`) и ходы только при
`includeTurns`; `thread/turns/list` и `thread/items/list` — opaque-курсоры, исключающие якоря,
виды `notLoaded`/`summary`/`full`, `-32601` для legacy `items/list` и для paginated-треда без
ходов, элементы с `pending: true` ещё не завершены; `readError`, `itemsError` — отказы).
Разбор, время элемента и хода, предел страницы, порядок вызовов и параметры (явный
`itemsView`, нет `includeTurns`), незагруженный чат остаётся незагруженным, `chat-unavailable`;
все ветки `sendDirect`; провайдер с подставной платформой `darwin`, `linux` и `win32`
(подставной `openDaemon`) — наборы идут на всех ОС, на Windows демон слушает именованный канал.

`test/history.test.ts` — reader с пониженным пределом сообщения (64 КиБ) и с настоящим 16 МиБ:
обе реплики вокруг большого вывода и gap-диапазон, два больших вывода, хвост активного хода
без повторного скачивания, открытый gap и 30 с, повтор при смене статуса, длинная история за
несколько опросов в пределах 8 страниц, общий inflight, legacy, unsupported, 502 после сбоя,
снимок Stop при ошибке items, deadline и повторный статус (подставные часы), LRU по тредам и
байтам UTF-8 после `cutChatText`.

`test/reply-feed.test.ts` (M34; darwin, linux, win32): обёртка читается ответом, вопрос получает
`answers`, второй опрос даёт то же; свой текст, несколько вопросов, ответ на другой вопрос и
обычное сообщение (`paginated` и `legacy`); испорченная обёртка остаётся текстом, пустой ответ
оставляет исходный текст.

## Наблюдение состояния для Stop (M24, M32)

Необязательный ChatDeps.onThreadRead(threadId, answer) получает в начале каждого опроса
метаданные `thread/read` и новейшую страницу `turns/list` (`notLoaded`) в форме
`{ thread: { ...метаданные, turns } }`; при ошибке этого шага — null для инвалидирования
доступности Stop. Отдельного RPC для Stop лента не делает; длинное чтение items повторяет
статус (шаг 4). Ошибка items не инвалидирует уже переданный снимок. Provider передаёт снимок
контроллеру [interrupt.md](interrupt.md); рендеринг сообщений и правила sendDirect сохраняются.
CachedDaemon — наблюдение демона без IO, а не команда его запуска. Неподдерживаемый/неизвестный
снимок не объявляет управление доступным.
