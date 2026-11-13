# provider-codex: диалог сессии (M18)

Спецификация — `docs/planning/M18-session-chat.md`, раздел 2.3; контракт `ChatMessage`,
`ChatPage`, `readMessages`, `sendDirect` — `provider-registry` (`chat.md` того модуля). Код —
`src/chat.ts` (`createChatParts`), статус чата — `threadStatus` в `src/thread-ops.ts`; провайдер
(`src/provider.ts`) передаёт им `rt.withDaemon`, `sharedMode.refresh()` и журнал. Id сессии —
id треда (`[A-Za-z0-9_-]{1,128}`).

## Публичный интерфейс (`src/index.ts`)

- `threadStatus(session, threadId) → Promise<string | null>` — `thread.status.type` ответа
  `thread/read { threadId }` без ходов (`idle`, `active`, `notLoaded`); отказ демона или нет поля —
  `null`. Чтение тред не загружает.
- `createChatParts({ withDaemon, shared, log })` → `{ readMessages(threadId, limit),
  sendDirect(threadId, text) }`; типы `ChatDeps`, `ChatParts`.
- `threadMessages(answer)` — сообщения ответа `thread/read` с ходами, от старых к новым;
  `chatPage(messages, limit)` — не больше `limit` новейших, `truncated`, если старые отброшены.
- `CHAT_TIMEOUT_MS` (30 с, одно соединение), `DIRECT_STATUSES` (`idle`, `notLoaded`).

## Лента — `readMessages`

`thread/read { threadId, includeTurns: true }` через сокет демона (на Windows — `codex app-server
proxy`). Проба 2026-11-12 (codex-cli 0.167.2): чат при этом не загружается (`notLoaded` до и
после), чтение работает с неподписанного соединения и во время хода; общий доступ не нужен.

- Из `thread.turns[].items[]` берутся `userMessage` (части `content[]` с полем `text` через
  перевод строки) и `agentMessage` (`text`). `reasoning`, `commandExecution` и прочие элементы —
  не сообщения; пустой после обрезки пробелов текст — тоже.
- `id` — `id` элемента (нет — `<id хода>:<номер>`); `at` — `startedAtMs` элемента в ISO, нет —
  `startedAt` хода (число секунд или миллисекунд, или строка времени), иначе `null`.
- Элемент появляется, когда завершён, поэтому лента растёт целыми сообщениями.
- Полные тексты: обрезку длинных делает маршрут `provider-registry`.
- Демон не запущен, не ответил или отказал, неверный id — `ProviderError('chat-unavailable',
  'Codex не отдал переписку: <причина>')`.

## Прямой ход — `sendDirect`

Только в режиме общего демона (`sharedMode.refresh()`, [shared-access.md](shared-access.md)),
иначе `false` без обращения к демону. Неверный id или пустой текст — `false`. Затем в одном
соединении `threadStatus`:

- `idle` или `notLoaded` — `wakeThread(session, threadId, text)`: `thread/resume`, если тред не
  загружен, `turn/start` самим текстом, `thread/unsubscribe`; в ChatGPT текст виден репликой
  пользователя → `true`, строка `codex: direct message started a turn of thread <id>`;
- `active` — `false` без `turn/start`: второй `turn/start` во время хода не встаёт в очередь, а
  вливается в идущий ход, и агент может бросить текущую задачу (проба). Сообщение уходит в
  очередь канала и приходит агенту ответом хука `Stop`;
- другой статус или `null` — `false`, строка `codex: direct message to thread <id> not sent,
  status …`; ошибка соединения или хода — `false`, строка `… failed: …`. Метод не бросает.

`turn/steer` не используется (M18, раздел 5).

## Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Лента | `thread/read` через сокет демона | так же | через `codex app-server proxy` (x64 и ARM64) |
| Прямой ход | при общем доступе к чатам | общего доступа нет — всегда `false` | при общем доступе к чатам |

Кода с ветками по ОС в `chat.ts` нет: транспорт выбирает `runtime.ts`.

## Тесты

`test/chat.test.ts` на подставном демоне (`test/fake-daemon.ts`: `thread/read` отдаёт
`daemon.threads` — статус и ходы — или по умолчанию `idle`/`notLoaded` по списку загруженных без
ходов; тред не загружает; `readError` — отказ). Разбор ходов, время элемента и хода, предел
страницы, незагруженный чат остаётся незагруженным, `chat-unavailable`; все ветки `sendDirect`;
провайдер с подставной платформой `darwin`, `linux` и `win32` (подставной `openDaemon`) — наборы
идут на всех ОС, на Windows демон слушает именованный канал.

## Наблюдение состояния для Stop (M24)

Необязательный ChatDeps.onThreadRead(threadId, answer) получает уже прочитанный ответ
ленты; при ошибке — null для инвалидирования доступности Stop. Второй RPC не добавляется.
Provider передаёт снимок контроллеру [interrupt.md](interrupt.md); рендеринг сообщений
и правила sendDirect сохраняются. CachedDaemon — наблюдение демона без IO, а не команда
его запуска. Неподдерживаемый/неизвестный снимок не объявляет управление доступным.
