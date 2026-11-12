# cli: проводка сессий и сообщения панели

Дополнение к [module.md](module.md): подробности `wireSessions` (`src/session-wiring.ts`) и
прямого пути сообщения панели (`src/direct-message.ts`, M18 раздел 2.5) и сессии, которую ведёт
процесс вне панели (M19 разделы 2.2–2.3).

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
- записи канала нет или её состояние `waiting`;
- сессию не ведёт процесс вне панели (`ledOutside`, ниже).

Для `working` и `holding` — `false` без вызова: при удержанном `Stop` текст доходит мгновенно
ответом хука, во время хода — ответом `Stop` в его конце. Отказ `sendDirect` — `false`; ошибка —
строка в журнале (`log`) и `false`. На `false` маршрут кладёт сообщение в очередь (`wakingChannel`),
ответ `{ queued }`; на `true` — `{ sent: true }`.

Модуль провайдеров не называет. Сообщения автопилота и перекрёстного ревью идут прежним путём —
`wakingChannel.enqueue`; прямой путь касается только `POST …/sessions/:sid/message`.

## Сессия вне панели

`wfk hook stop|prompt|turn-end` (`src/hook-service.ts`) кладёт в тело запроса
`panelProcess: true`, когда в окружении хука `WFK_PANEL_SESSION=1` (`PANEL_SESSION_ENV`; сценарии
сессий Claude панели ставят её процессу `claude`, хуки её наследуют), иначе `false`. Канал хранит
итог последнего хука в `SessionActivity.external` (виден в `/api/state`).

`ledOutside(provider, activity)` (`src/direct-message.ts`) — `true`, когда у провайдера
`marksPanelProcess === true` и `activity.external === true`. Для такой сессии:

- `createDirectMessage` возвращает `false` без `sendDirect`: сообщение ложится в очередь, ответ
  маршрута `{ queued }`;
- `wakeIdle` (`src/session-wiring.ts`) не зовёт `wakeSession`;
- `deliverToSession` (`src/review-wiring.ts`, задание ревьюеру) кладёт задание в очередь, не зовёт
  `wakeSession` и возвращает `false`; перекрёстное ревью ответ не читает, задание ждёт в очереди.

Очередь забирает процесс, который ведёт сессию, ближайшим хуком (конец хода, следующая реплика
пользователя или удержанный `Stop`). Провайдер без `marksPanelProcess` (ChatGPT, Kimi), сессия без
хуков и сессия, чей последний хук пришёл с меткой, работают как в 0.9.0.

## Статика диалога

`createApp` монтирует файлы модуля панели `session-chat` (`sessionChatMount()`, алиас
`#session-chat`) под `/session-chat/` рядом с `session-view`: `session-chat.js` — расширение панели
(слот `sessionChat`), `session-chat.css` — стили карточки «Диалог». Тест `test/app.test.ts`
проверяет, что оба файла отдаются с типами JavaScript и CSS.

## Поведение на ОС

Одинаково на macOS, Linux и Windows: правило выбора пути не зависит от ОС. Что умеет
`sendDirect` на каждой ОС, решает провайдер (M18 раздел 3). Метку `WFK_PANEL_SESSION` хук
читает из окружения одинаково на всех ОС (`deps.env`).

## Тесты

`test/direct-message.test.ts`: `waiting` и неизвестная каналу сессия — вызов с id после первого
двоеточия; `working` и `holding` — без вызова; провайдер с `sendMessage`, без `sendDirect`,
неизвестный провайдер или проект — без вызова; отказ — `false`; ошибка — строка журнала и `false`;
сессия вне панели — без вызова, сессия с меткой и провайдер без `marksPanelProcess` — вызов.
`test/hook-channel.test.ts`: метка в `/api/state`, сессия вне панели получает сообщение только из
очереди без `sendDirect` и `wakeSession`, провайдер без метки — как раньше.
`test/hook-turn-end.test.ts`: `panelProcess` в теле `turn-end`. `test/review.test.ts`: задание
ревьюеру вне панели — очередь без пробуждения.
