# provider-codex: удалённое управление у демона Kit (M43)

Спецификация: [M43](../../../../../../docs/planning/M43-codex-remote-owner.md).

## Правило

Слот удалённого управления (доступ телефона и iPad к компьютеру) один на установку Codex:
первый app-server онлайн получает его, следующий — `409 Conflict … "Remote app server already
online"`. Демон Kit и встроенный сервер приложения ChatGPT делят `~/.codex` и один
`installation_id`. Если слот взял сервер приложения (демон перезапускался или терял связь,
пока приложение работало), телефон приходит в него и не открывает чат Kit: у треда один
писатель — демон (`thread-store conflict … already has an active writer`, на iPad «Эта задача
используется в другом сеансе Codex»). Владелец слота — демон Kit, в режиме общего демона и без
него; передача M7 приложению удалена.

Определение «держит приложение» — `DaemonState.remoteOwner === 'app'` (`heldByApp` по
последнему WARN `remote_control` процесса демона в `logs_N.sqlite`).

## Возврат (`src/reclaim.ts`)

`createReclaim(rt, deps)` → `{ active, lastResult, supported, request(reason), maintain() }`;
`reason` — `maintain` (бэкенд раз в минуту), `create-session` (после успешного
`createSession`, без ожидания), `manual` (действие `reclaim-remote`).

Возврат идёт, если: `darwin`; codex установлен; демон `running` и `remoteOwner: 'app'`;
работает встроенный сервер приложения (`appServerPids`); возврат не идёт. Шаги:

1. `osascript -e 'tell application id "com.openai.codex" to quit'` (`CHATGPT_BUNDLE_ID`);
   отказ Apple Events (служба без согласия «Автоматизация») — `SIGTERM` главному процессу
   приложения (`isChatgptApp`), тот же штатный выход; `SIGKILL` никогда.
2. Ожидание выхода сервера приложения: `ps` раз в `QUIT_POLL_MS` 2 с до `QUIT_WAIT_MS` 30 с.
   Не вышел (спросил подтверждение) — `app-kept`, приложение не трогается.
3. `codex remote-control start --json` — демон подключается сразу, без перезапуска.
4. Ожидание `remoteControl: 'connected'` без `remoteOwner: 'app'`: раз в `RECLAIM_POLL_MS`
   5 с до `RECLAIM_WAIT_MS` 90 с.
5. `open -g -b com.openai.codex` — и при неудаче шага 4. Новый сервер приложения находит слот
   занятым и остаётся локальным (проверено 11.11.2026).

Результат: `reclaimed` | `app-kept` | `not-connected` | `failed: <причина>`; строка
`codex: reclaim (<reason>): <result>` в журнале службы. Демон не останавливается: сессии,
ходы и чаты через `wfk-local` идут, создание сессий во время возврата разрешено.

Защита от цикла: `AUTO_LIMIT` 3 автоматические попытки за `AUTO_WINDOW_MS` 60 мин; после
`app-kept` — до нового набора pid сервера приложения; после `not-connected` — пока демон не
будет замечен подключённым. Ручной вызов идёт всегда и сбрасывает лимит. Шаги системы
(`ReclaimSystem`: `processes`, `quitApp`, `nudgeDaemon`, `openApp`), часы и ожидания
подставляются в `CodexDeps.reclaim`; тесты никогда не трогают настоящее приложение.

## Статус и действие

| Состояние | label | note |
| --- | --- | --- |
| возврат идёт | `возвращает управление Kit` (`ready`) | `RECLAIM_REASON` |
| держит приложение (macOS) | `через приложение ChatGPT` | `APP_OWNER_NOTE` |
| держит приложение (Windows) | `через приложение ChatGPT` | `WINDOWS_APP_OWNER_NOTE` |

`reclaimAction(platform, remoteOwner, active)`: действие `reclaim-remote` «Вернуть
управление Kit» с подтверждением `RECLAIM_CONFIRM` — при `remoteOwner: 'app'`; macOS —
включено (во время возврата выключено с `RECLAIM_REASON`), Windows — выключено с
`RECLAIM_WINDOWS_REASON`, Linux — нет. Ошибки ручного вызова: `reclaim-app-kept`,
`reclaim-not-connected` (409), `reclaim-failed` (500), `reclaim-unsupported` (409).

## ОС

| macOS | Linux | Windows |
|---|---|---|
| `ps -axo pid=,command=`, `osascript` (запасной путь — `SIGTERM`), `codex remote-control start --json`, `open -g -b` | приложения ChatGPT нет — ничего | CIM `Win32_Process` codex.exe через PowerShell для общего доступа; возврата нет: проверенного способа штатно закрыть и открыть пакетное приложение нет, подсказка закрыть вручную (**П**) |

`open` не внесён в `programNames` platform-guard: слово совпадает с обычными строками кода;
вызов есть только в ветке `darwin`, Linux и Windows его не делают (таблица выше).
