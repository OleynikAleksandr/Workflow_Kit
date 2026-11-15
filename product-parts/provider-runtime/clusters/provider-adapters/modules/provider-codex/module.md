# Модуль: provider-codex

Часть `provider-runtime`, кластер `provider-adapters`. Алиас импорта:
`#provider-codex`.

## Назначение

Провайдер Codex по контракту `provider-registry`
(`docs/planning/M1-providers.md`, раздел 3): CLI и фоновый демон
app-server на весь Mac, доверие к папке, одобрение хука Kit, сессии,
которые открываются в ChatGPT на Mac и iPad. Имя — «ChatGPT (Codex)»,
`label` «ChatGPT», `mark` G.

## Публичный интерфейс (`src/index.ts`)

- `createProvider: ProviderFactory` — провайдер с настоящими транспортами;
  бэкенд (`cli`, `DEFAULT_PROVIDERS`) регистрирует его в реестре.
- `createCodexProvider(context, deps?)` — то же с внедрением (`CodexDeps`):
  `openAppServer` (stdio `codex app-server`), `openDaemon` (сокет демона),
  `isAlive(pid)`, `tokens` (`TokenStore`), `daemonTtlMs`,
  `serviceTurnWaitMs` (ожидание `turn/completed` служебного хода),
  `releaseWaitMs` и `releasePollMs` (ожидание выгрузки треда демоном),
  `handover` (`waitMs`, `sleep` передачи управления), `sharedAccess`
  (`SharedAccessDeps`: `probePort`, `loginShell`, `userName`, `appInstalled`, `nodeDir`).
- Константы: `PROVIDER_ID` = `codex`, `PROVIDER_TITLE`,
  `DAEMON_START_ACTION` = `daemon-start`, `LOGIN_HINT`, `CONNECTING_REASON`,
  `STALE_LOGIN_REASON`, `HANDOVER_REASON`, `HANDOVER_WAIT_MS` (60 с),
  `isChatgptAppServer(line, platform)`, `appServerPids(listing, platform)`,
  `KIT_HOOK_COMMAND` (= `kitCodexCommand('SessionStart')`: POSIX-команда хука Kit, на Windows —
  его `commandWindows`),
  `KIT_HOOK_COMMANDS` (команды всех хуков Kit v2: SessionStart, Stop,
  UserPromptSubmit), `isExactKitCommand(command)`, `HARNESS_CODEX_HOOK_COMMAND` и
  `isKitApprovable(command)` (хук Harness, [hooks.md](hooks.md)),
  `SERVICE_TURN_WAIT_MS` (15 с), `UNSUBSCRIBE_TIMEOUT_MS` (5 с),
  `RELEASE_WAIT_MS` (90 с), `RELEASE_POLL_MS` (2 с), `RELEASING_NOTE`,
  `UNLOAD_METHODS` (`thread/archive`, `thread/unarchive`; в `sessions.ts`),
  `HELD_NOTE`; функции `serviceTurnText(name)`,
  `threadLinks(id)`, `parseRemoteControlStart(stdout)`.
- Общий доступ к чатам (M12): `createSharedAccess(rt, deps?)`, `SHARED_ALIAS` (`wfk-local`),
  `SHARED_HOST_ID` (`remote-ssh-discovered:wfk-local`), `CONNECTIONS_LINK`,
  `REMOTE_LOGIN_LINK`, `BLOCK_BEGIN`/`BLOCK_END`; тип `SharedAccessDeps`.
- Типы: `CodexDeps`, `DaemonOpener`, `DaemonState`, `ProgramState`,
  `AppServerOpener`, `AppServerSpec`, `RpcTransport`, `CodexRecord`.

## Файлы Codex

`$CODEX_HOME` (абсолютный) или `~/.codex`; дочерним процессам передаются
`CODEX_HOME` и окружение службы без `CLAUDE*` (D12).

| Файл | Как используется |
| --- | --- |
| `app-server-daemon/daemon.pid` | `{ pid, … }`; живой ли демон — `kill(pid, 0)` |
| `app-server-daemon/daemon.stderr.log` | хвост 64 КиБ: строка `401 … token expired`, если соединение не `connected` |
| `app-server-control/app-server-control.sock` | WebSocket JSON-RPC демона; подключение по `realpath` (лимит 104 байта у имени сокета macOS) |
| `config.toml` | `trust_level` папки: таблицы `[projects."<путь>"]`, точечные ключи и inline-таблицы под `[projects]`; кэш по mtime и размеру |
| `session_index.jsonl` | названия тредов (`id`, `thread_name`; последняя строка id главнее) |

## Транспорты (проверено на codex-cli 0.166.0)

- `rpc.ts` — JSON-RPC 2.0 поверх транспорта: `initialize`
  (`clientInfo` Workflow Kit) → уведомление `initialized` → вызовы;
  таймауты; запросы сервера к клиенту (одобрения и т. п.) получают ошибку
  `-32601` — Kit ничего не одобряет за пользователя.
- `ws.ts` — WebSocket-клиент RFC 6455 поверх `node:net` без зависимостей
  (встроенный `WebSocket` Node не умеет unix-сокет): рукопожатие с
  проверкой `Sec-WebSocket-Accept`, маскированные кадры, длины 7/16/64 бит,
  фрагменты, ping → pong, close.
- Пределы транспорта (M32 T002a): кадр `MAX_FRAME_BYTES` и собранное из
  фрагментов сообщение `MAX_MESSAGE_BYTES` — по 16 МиБ; оба проверяются по
  заголовку кадра до буферизации тела. Байты копятся очередью chunks, каждый
  копируется один раз; после отказа буферы освобождаются.
- Ошибки транспорта — `TransportError` (`rpc.ts`) с кодом `frame-too-large`,
  `message-too-large` (`size`, `limit`), `malformed-json` (не JSON или не
  UTF-8, `size`), `protocol-error` (продолжение без начала, вложенное
  сообщение, зарезервированный opcode, длинный или фрагментированный
  управляющий кадр) и `connection-lost` (ошибка сокета с `errno` или закрытие
  без close-кадра). Любая из них закрывает транспорт; текста сообщения в
  ошибке нет. Закрытие по `close()` клиента или close-кадру сервера —
  штатное, без ошибки.
- `RpcError` ожидающего и последующих вызовов получает `code` = код
  `TransportError` и `transport` = `{ code, size?, limit?, errno? }`; при
  штатном закрытии — `code: 'closed'`, `transport: null`. По этим полям
  читатель отличает oversized от сетевого сбоя, не разбирая строку.
- `stdio.ts` — короткоживущий `codex app-server` по stdio (строка = JSON).
  Запускается своим `spawn`, а не `runCommand`: процесс выходит по EOF
  stdin, не ответив на запросы (проверено), поэтому stdin держится
  открытым до конца разговора. Используется для `hooks/list` и
  `config/value/write`; его треды ChatGPT не видит.

## Поведение

Полный раздел — [behavior.md](behavior.md).

## Проверить при приёмке (на устройстве)

Изменяющие вызовы проверены на подставных программах; на машине — только чтения
(`codex --version`, `initialize` по сокету демона, `hooks/list`). Проверить: новая
сессия из панели сразу открывается в ChatGPT на Mac и iPad без «Этот чат открыт в
другом приложении», пока Codex держит чат, кнопки «Открыть» нет («Codex ещё держит
чат»), в журнале — `codex: thread <id> released by the daemon`; настройки треда —
пользовательские; хук Kit после одобрения срабатывает с первым ходом.

## Передача удалённого управления (M7)

`src/handover.ts`, `maintain()`: правило, состояния и поведение на ОС —
[handover.md](handover.md).

## Общий доступ к чатам (M12)

Приложение ChatGPT по SSH становится клиентом демона Kit; пока доступ `active`, сессии
создаются без выгрузки, ссылка — с `hostId`, работает `wakeSession`, ревьюер получает задание
первым сообщением. Файлы `src/shared-*.ts`, `src/thread-ops.ts`, `src/elevation.ts` —
[shared-access.md](shared-access.md).

## Диалог сессии (M18)

`readMessages` — лента из `thread/read` с ходами (чат не загружается); `sendDirect` — ход самим
текстом при общем доступе, если чат не `active`. `src/chat.ts`, `threadStatus` — [chat.md](chat.md).

## Инварианты

- Модуль подключается к бэкенду только через `createProvider`; о Codex вне
  каталога модуля никто не знает.
- Опрос `/api/state` не запускает внешних программ, кроме `hooks/list` при
  изменении файлов хуков или конфига; `codex --version` — только в
  `refresh()`.
- В чужие конфиги пишет только Codex по кнопке, после предпросмотра или
  показа команды и хеша, с копией `config.toml` до и проверкой после.
- Одобряются только хуки Kit и Harness с точной командой и текущим хешем.
- Зависимости: `#provider-registry` (контракт, журнал хука, токены),
  `#kit-structure` (`hookCommand`, `isKitHookCommand`), `#data-store`
  (`backupFile`, атомарная запись), `#process-supervisor` (`cleanEnv`).
- Тесты (`test/`): подставные HOME, `codex` (`test/fixtures/fake-codex.mjs`) и демон
  (`test/fake-daemon.ts`: JSON-RPC на unix-сокете, список загруженных тредов —
  `thread/start` загружает, `thread/unsubscribe` последнего подписчика выгружает, с
  `idleUnloadPolls` — через столько `thread/loaded/list`, `thread/archive` сразу,
  `archiveError` — без архивации); настоящий `~/.codex` не трогается. На Windows демон
  слушает именованный канал (`listenPath`); наборы с машиной macOS/Linux пропускаются
  (`POSIX_MACHINE_SKIP`), путь Windows — `windows.test.ts`, `ws-rpc.test.ts`; передача
  управления — `handover.test.ts` на подставном runtime для всех трёх ОС.
- После `createSession` тред не остаётся загруженным в демоне, а ссылка
  появляется только после его выгрузки; после завершённого хода тред
  выгружается архивацией без минутного ожидания и возвращается из архива,
  незавершённый ход не архивируется (`test/release.test.ts`).

## Дальше

`thread/resume`, состояние сессий; проверка Windows (M5, M7: **П**).

## Записи удалённых проектов (раунд R9)

`forgetProjects(keep)` стирает записи панели (`sessions/codex.json` и треды в выгрузке) проектов, чьих id нет в
`keep`, и отвечает, сколько стёрто; файл переписывается только при изменении.

## Stop ответа и поведение на ОС (M24)

Provider.interruptAvailability/interruptTurn и capability interruptTurn реализуют
прерывание конкретного native turn, сохраняя тред/демон. Локальная схема Codex 0.167.2
подтвердила turn/interrupt {threadId, turnId} и turn/completed {threadId, turn}.
Пустой RPC не даёт успеха: нужен interrupted/terminal статус именно этой цели.
Свежий successor даёт stale. Полные правила, хеши схемы и ограничения —
[interrupt.md](interrupt.md). Stop требует версии не старее проверенной 0.167.2.

Доступность использует снимок штатного readMessages (ChatDeps.onThreadRead), без новых
RPC при опросе. CodexRuntime.cachedDaemon() — последнее состояние без IO; forgetDaemon
его сбрасывает. CodexDeps: interruptWaitMs (8000), interruptPollMs (200). Внешний
notLoaded-тред, неизвестное состояние и недоступный демон дают причину отказа.
Stop не включает общий доступ, не меняет разрешения и не отменяет назначения Kit.

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| Существующий Unix WebSocket демона | то же, без приложения ChatGPT | существующий proxy, тот же native-id контракт |

Новых вызовов программ ОС нет. Подставные RPC/proxy проверены с injected платформами;
живая macOS-проверка — пользователь, Windows — проверяющий, Linux — CI.

## Параметры сессии (M25)

`readParameters` читает фактические модель, усилие, настройки, контекст и лимиты без
загрузки треда и программ; capability `sessionParameters` явная. Полный контракт,
кэши, варианты, распознавание разрешений и матрица ОС — [parameters.md](parameters.md).
Путь Windows использует существующий proxy, macOS/Linux — Unix WebSocket;
подставные проверки выполняются с внедрёнными платформами всех трёх ОС.
`updateParameters` (T004) перепроверяет общий доступ, проверяет совместимость и подтверждение
полного доступа, отправляет только выбранное и зависимые поправки. Контракт и проверки
трёх ОС — [parameters.md](parameters.md#изменение-t004).

M26: parameter-access.ts даёт нативные ask/auto/full и компактную presentation.
Свежие ограничения, read-back, метаданные и OS-контракт — parameters.md.

M27/T004: access — только effort-card. Неизвестный ключ (ultracode, также
с model) отклоняется до RPC; injected darwin/linux/win32 проверены.

## Поведение на ОС

Платформенные детали — [behavior.md](behavior.md); Stop — [interrupt.md](interrupt.md).
Пределы и типизированные ошибки транспорта (M32 T002a) одинаковы на всех ОС: macOS и Linux —
Unix-сокет, Windows — stdio `codex app-server proxy` (тот же `connectWebSocket`); тесты на
настоящем WebSocket идут через тестовый сокет, на Windows — именованный канал.
