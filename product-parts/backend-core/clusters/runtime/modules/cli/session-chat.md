# cli: проводка сессий и сообщения панели

Дополнение к [module.md](module.md): подробности `wireSessions` (`src/session-wiring.ts`) и
прямого пути сообщения панели (`src/direct-message.ts`, M18 раздел 2.5).

## Путь канала без удержания `Stop`

Провайдер с `sessionIdle` и `sendMessage` получает путь канала без удержания `Stop` (опция
`detached`: `idle`/`lastAnswer`/`send` — методы провайдера по проекту сессии, `archived` — архив
панели из `titles`, `names` — `providerLabel`, `title`, `lockSwitch`); `wakeIdle` для него зовёт
`channel.flush`, `channel.onIdle` — `titles.onStop`, а промпт с `HookReply.own` автопилот считает
ходом службы.

## Прямой путь сообщения панели

`createDirectMessage(options) → DirectMessage` (`src/direct-message.ts`), где
`DirectMessage = (projectId, key, text) => Promise<boolean>` — опция `direct` маршрутов канала
(`registerChannelRoutes`). Опции: `activity(key)` — запись канала (`undefined`, если канал не
видел сессию с запуска службы), `provider(id)`, `project(id)`, `log?`.

Ключ сессии — `<провайдер>:<id сессии>`: провайдер — часть до первого двоеточия, id сессии —
после него. `provider.sendDirect(project, sessionId, text)` зовётся, только если:

- у провайдера есть `sendDirect` и нет `sendMessage` (провайдер с `sendMessage` получает
  сообщение из очереди канала, `flush`);
- проект найден;
- записи канала нет или её состояние `waiting`.

Для `working` и `holding` — `false` без вызова: при удержанном `Stop` текст доходит мгновенно
ответом хука, во время хода — ответом `Stop` в его конце. Отказ `sendDirect` — `false`; ошибка —
строка в журнале (`log`) и `false`. На `false` маршрут кладёт сообщение в очередь (`wakingChannel`),
ответ `{ queued }`; на `true` — `{ sent: true }`.

Модуль провайдеров не называет. Сообщения автопилота и перекрёстного ревью идут прежним путём —
`wakingChannel.enqueue`; прямой путь касается только `POST …/sessions/:sid/message`.

## Статика диалога

`createApp` монтирует файлы модуля панели `session-chat` (`sessionChatMount()`, алиас
`#session-chat`) под `/session-chat/` рядом с `session-view`: `session-chat.js` — расширение панели
(слот `sessionChat`), `session-chat.css` — стили карточки «Диалог». Тест `test/app.test.ts`
проверяет, что оба файла отдаются с типами JavaScript и CSS.

## Поведение на ОС

Одинаково на macOS, Linux и Windows: правило выбора пути не зависит от ОС. Что умеет
`sendDirect` на каждой ОС, решает провайдер (M18 раздел 3).

## Тесты

`test/direct-message.test.ts`: `waiting` и неизвестная каналу сессия — вызов с id после первого
двоеточия; `working` и `holding` — без вызова; провайдер с `sendMessage`, без `sendDirect`,
неизвестный провайдер или проект — без вызова; отказ — `false`; ошибка — строка журнала и `false`.
