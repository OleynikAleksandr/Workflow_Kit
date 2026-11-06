# Модуль: provider-codex

Часть `provider-runtime`, кластер `provider-adapters`. Алиас импорта:
`#provider-codex`.

## Назначение

Провайдер Codex по контракту `provider-registry`
(`docs/planning/M1-providers.md`, раздел 3): CLI и фоновый демон
app-server на весь Mac, доверие к папке, одобрение хука Kit, сессии,
которые открываются в ChatGPT на Mac и iPad. Название в панели —
«ChatGPT (Codex)».

## Публичный интерфейс (`src/index.ts`)

- `createProvider: ProviderFactory` — провайдер с настоящими транспортами;
  бэкенд (`cli`, `DEFAULT_PROVIDERS`) регистрирует его в реестре.
- `createCodexProvider(context, deps?)` — то же с внедрением (`CodexDeps`):
  `openAppServer` (stdio `codex app-server`), `openDaemon` (сокет демона),
  `isAlive(pid)`, `tokens` (`TokenStore`), `daemonTtlMs`,
  `serviceTurnWaitMs` (ожидание `turn/completed` служебного хода),
  `releaseWaitMs` и `releasePollMs` (ожидание выгрузки треда демоном).
- Константы: `PROVIDER_ID` = `codex`, `PROVIDER_TITLE`,
  `DAEMON_START_ACTION` = `daemon-start`, `LOGIN_HINT`,
  `KIT_HOOK_COMMAND` (= `hookCommand('codex')` из `kit-structure`),
  `KIT_HOOK_COMMANDS` (команды всех хуков Kit v2: SessionStart, Stop,
  UserPromptSubmit), `isExactKitCommand(command)`,
  `SERVICE_TURN_WAIT_MS` (15 с), `UNSUBSCRIBE_TIMEOUT_MS` (5 с),
  `RELEASE_WAIT_MS` (90 с), `RELEASE_POLL_MS` (2 с), `RELEASING_NOTE`,
  `UNLOAD_METHODS` (`thread/archive`, `thread/unarchive`; в `sessions.ts`),
  `RENAME_LATER_NOTE`,
  `HELD_NOTE`; функции `serviceTurnText(name)`,
  `threadLinks(id)`, `parseRemoteControlStart(stdout)`.
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
  фрагменты, ping → pong, close, предел кадра 16 МиБ.
- `stdio.ts` — короткоживущий `codex app-server` по stdio (строка = JSON).
  Запускается своим `spawn`, а не `runCommand`: процесс выходит по EOF
  stdin, не ответив на запросы (проверено), поэтому stdin держится
  открытым до конца разговора. Используется для `hooks/list` и
  `config/value/write`; его треды ChatGPT не видит.

## Поведение

- **Статус** (`status`, `capabilities`, `actions` — только чтение, D11):
  версия и путь CLI — из кэша `refresh()` (`codex --version`, поиск в PATH
  службы или `config.programs.codex`); демон — pid-файл на каждый опрос и
  `initialize` по сокету с кэшем 15 с (`DAEMON_TTL_MS`), после него
  ждётся уведомление `remoteControl/status/changed` (`disabled |
  connecting | connected | errored`, `serverName`). Состояния: `ready`
  «демон подключён»; `unavailable` «демон не запущен»; `error` «ошибка
  входа» с заметкой «… Выполните codex login в Терминале, затем «Запустить
  демон»» (статус `errored` или строка 401 в журнале демона); `error`
  «демон не отвечает»; `not-installed`. `details`: `daemon { running,
  pid, remoteControl, serverName }`, `codexHome`.
- **Запуск демона** — особое действие провайдера `daemon-start`
  («Запустить демон», с подтверждением): `codex remote-control start
  --json` (таймаут 90 с), затем проверка сокета. `errored` —
  `ProviderError('codex-login')` с подсказкой `codex login`. Выключено,
  пока демон подключён. Проектных действий нет.
- **Доверие** (D7): `trust(project)` читает `trust_level` из `config.toml`
  (доверие к `/` или к домашней папке не считается). `previewTrust`
  показывает ключ `projects."<путь>".trust_level = "trusted"`, точки
  автозапуска (`.codex/hooks.json`: чужие хуки `hook` и хук Kit `kit-hook`
  с событием и командой; `.codex/config.toml` проекта) и выдаёт токен,
  связанный с отпечатком (путь, текущий `trust_level`, текст `hooks.json`,
  наличие конфига проекта). `grantTrust` принимает только этот токен
  (`invalid-token`, `preview-stale`), делает копию `config.toml`
  (`backupFile`, каталог `backups`), пишет ключ через `codex app-server`
  `config/value/write { keyPath, value: "trusted", mergeStrategy: "upsert" }`
  и перечитывает файл (`not-recorded` с `details.backup`, если ключа нет).
  Путь с `"`, `\` или управляющими символами — `unsupported-path`.
- **Хуки**: `hooks(project)` — свой разбор `.codex/hooks.json`
  (позиционные ключи `<abs>/.codex/hooks.json:<event_snake>:<группа>:<i>`)
  плюс `hooks/list { cwds: [путь] }` (только хуки с `sourcePath` этого
  проекта: `currentHash`, `trustStatus` → `approved` (`trusted`,
  `managed`) | `pending` (`untrusted`) | `modified` | `unknown`).
  `hooks/list` вызывается, только если папка доверена и `hooks.json` есть,
  и только при изменении mtime `hooks.json` или `config.toml` (одно чтение
  на проект одновременно; первое ждётся до 2 с, дальше «проверяется…»).
  Хуки Kit — записи с командой, точно равной одной из `KIT_HOOK_COMMANDS`;
  изменённая вручную команда хуком Kit не считается. В контракте они
  показываются одним `kitHook` (запись SessionStart) с общим статусом:
  `approved` — только когда одобрены все хуки Kit, иначе статус первого
  неодобренного; в списке `hooks` — только чужие. `complete: true`
  только при доверенной папке и одобренном хуке Kit; иначе `false` и
  заметка с причиной и словами «список сессий неполон».
- **approveHooks** одобряет только хук Kit: `command` должна совпасть с
  `KIT_HOOK_COMMAND` (`not-kit-hook`), папка доверена (`not-trusted`), хеш
  — с текущим `currentHash` свежего `hooks/list` (`hash-changed`, в
  `details.current` — текущие хеши). Запись — копия `config.toml`, затем
  `config/value/write { keyPath: hooks.state."<key>".trusted_hash, value:
  <hash>, mergeStrategy: "upsert" }` и проверка новым `hooks/list`.
  Вместе с подтверждённым хуком SessionStart одобряются хуки Stop и
  UserPromptSubmit той же структуры (команды точно по шаблону Kit, хеш —
  текущий из `hooks/list`). Чужие
  хуки показываются с командой и хешем, но не одобряются; уже одобренный
  хук повторно не пишется.
- **renameSession(project, threadId, name)** — `thread/name/set` через
  демон, только если тред загружен (`thread/loaded/list`: открыт чат или
  идёт ход); иначе ничего не трогает и возвращает `{ synced: false, note:
  RENAME_LATER_NOTE }` — загрузка простаивающего треда заставила бы демон
  держать его минуту (D1).
- **createSession** (нужны работающий демон без ошибки входа и доверенная
  папка: `daemon-not-running`, `codex-login`, `not-trusted`): по сокету
  демона `thread/start { cwd }` → `thread/name/set { threadId, name }` →
  служебный `turn/start { threadId, input: [{ type: "text", text }] }` и
  ожидание `turn/completed` до 15 с (без ошибки по истечении; с
  `firstMessage` вместо служебного текста идёт первое сообщение агенту, ждём
  до `FIRST_TURN_WAIT_MS` = 180 с) →
  `thread/unsubscribe { threadId }` (таймаут 5 с) и только потом закрытие
  соединения. Служебный ход не передаёт `sandboxPolicy` и `approvalPolicy`:
  по схеме они остались бы у треда для следующих ходов, а тред должен
  сохранить настройки пользователя (как в проверенном прототипе).
  `thread/unsubscribe` выполняется в `finally` после `thread/start`, то
  есть и при ошибке имени или хода; без него демон держит тред загруженным
  и ChatGPT пишет «Этот чат открыт в другом приложении» (дефект D1).
  Ответ (`unsubscribed | notSubscribed | notLoaded`) или ошибка
  unsubscribe пишутся в журнал (`codex: thread/unsubscribe <id>: …` /
  `… failed: …`); ошибка создание сессии не ломает.
  После отписки демон держит тред без подписчиков ещё около минуты
  (проверено 2026-11-05: «has no subscribers and is idle; shutting down»
  через 60 с после `thread/unsubscribe`) и остаётся его единственным
  писателем: ChatGPT в это время получает «thread-store conflict: … already
  has an active writer» и пишет «Этот чат открыт в другом приложении».
  Поэтому, если ход завершился (`turn/completed`) и тред ещё загружен,
  createSession сразу выгружает его: `thread/archive` (демон выгружает тред
  мгновенно), затем `thread/unarchive` (тред возвращается в списки, не
  загружаясь; при ошибке — вторая попытка). Проверено 2026-11-06 на
  codex-cli 0.167.0: сразу после архивации `thread/loaded/list` пуст, файл
  переписки и имя на месте; создание занимает секунды вместо минуты.
  Журнал: `codex: thread <id> unloaded by thread/archive and
  thread/unarchive`; при отказе архивации — `… not unloaded by
  thread/archive: …`, при неудаче разархивации — `… stays archived, …`.
  Незавершённый ход не архивируется. Без выгрузки (отказ демона, ход не
  завершился) createSession в том же соединении опрашивает
  `thread/loaded/list` (все страницы) каждые 2 с, пока тред не исчезнет,
  но не дольше 90 с, и
  пишет в журнал `codex: thread <id> released by the daemon` или `… still
  held by the daemon after 90 s`. Пока тред удерживается, `listSessions`
  показывает сессию (`state: 'running'`) без ссылок и с пояснением
  `RELEASING_NOTE`. Если время вышло, сессия всё равно создаётся, а в её
  `note` попадает `HELD_NOTE`.
  Запись `{ threadId, projectId, projectPath, title,
  createdAt, model? }` добавляется в `sessions/codex.json`
  (`providerSessionsFile`, атомарно).
- **listSessions**: записи панели этого проекта (`origin: 'panel'`) +
  журнал хука `readHookSessions(project, 'codex')` (`origin: 'hook'`),
  слияние по id треда (= `session_id` хука); название — из
  `session_index.jsonl`, иначе своё; ссылки `desktop` и `mobile` —
  `codex://threads/<id>` (только id из `[A-Za-z0-9_-]`); `state:
  'unknown'`; новые первыми. Неполноту списка показывает `hooks.note` /
  `complete: false`.
- **Windows** (Q2): все возможности (`trust`, `hooks`, `sessions`,
  `createSession`, `daemon`) недоступны с причиной «Windows: Codex в вехе 1
  не поддерживается (Q2)», статус `unavailable`, изменяющие методы —
  `unsupported-os` (501), ссылок нет. Без CLI — `not-installed`.

## Проверить при приёмке (на устройстве)

При разработке на настоящей машине выполнялись только чтения:
`codex --version`, `initialize` по сокету демона (получено
`remoteControl/status/changed: connected`) и `hooks/list`. Изменяющие
вызовы проверены только на подставных программах.

- Служебный ход идёт без переопределений `sandboxPolicy` и
  `approvalPolicy` (по схеме `TurnStartParams` они действуют «для этого и
  последующих ходов»), после хода — `thread/unsubscribe`
  (`ThreadUnsubscribeParams { threadId }` → `{ status }`). Проверить:
  новая сессия из панели сразу открывается в ChatGPT на Mac и iPad без
  сообщения «Этот чат открыт в другом приложении»; в журнале службы —
  строка `codex: thread/unsubscribe <id>: unsubscribed`; настройки треда в
  ChatGPT — пользовательские.
- Операция «Создать сессию» длится секунды (ход + выгрузка через
  `thread/archive`/`thread/unarchive`); без `thread/archive` — около
  минуты, служба ждёт, пока демон выгрузит тред. Проверить: пока идёт
  операция, у сессии нет кнопки
  «Открыть» и есть пояснение «Codex ещё держит чат»; после конца операции
  ссылка открывает чат в ChatGPT на Mac и iPad без сообщения; в журнале
  службы — `codex: thread <id> released by the daemon`.
- `grantTrust` и `approveHooks` пишут через `config/value/write` и
  проверяются после записи; хук Kit после одобрения срабатывает с первым
  ходом и попадает в журнал.

## Инварианты

- Модуль подключается к бэкенду только через `createProvider`; о Codex вне
  каталога модуля никто не знает.
- Опрос `/api/state` не запускает внешних программ, кроме `hooks/list` при
  изменении файлов хуков или конфига; `codex --version` — только в
  `refresh()`.
- В чужие конфиги пишет только Codex по кнопке, после предпросмотра или
  показа команды и хеша, с копией `config.toml` до и проверкой после.
- Одобряется только хук Kit с точной командой и текущим хешем.
- Зависимости: `#provider-registry` (контракт, журнал хука, токены),
  `#kit-structure` (`hookCommand`, `isKitHookCommand`), `#data-store`
  (`backupFile`, атомарная запись), `#process-supervisor` (`cleanEnv`).
- Тесты (`test/`) работают на подставном HOME, подставной программе
  `codex` (`test/fixtures/fake-codex.mjs`: `app-server` по stdio,
  `--version`, `remote-control start`) и подставном демоне (WebSocket
  JSON-RPC на unix-сокете, `test/fake-daemon.ts`; ведёт список
  загруженных тредов: `thread/start` загружает, `thread/unsubscribe`
  последнего подписчика выгружает (с `idleUnloadPolls` — только через
  столько вызовов `thread/loaded/list`, как настоящий демон через минуту),
  `thread/archive` выгружает сразу, `thread/unarchive` не загружает
  (`archiveError` — демон без архивации),
  закрытие соединения — нет, как в D1; отвечает на `thread/loaded/list`);
  настоящий `~/.codex` не трогается.
- После `createSession` тред не остаётся загруженным в демоне, а ссылка
  появляется только после его выгрузки; после завершённого хода тред
  выгружается архивацией без минутного ожидания и возвращается из архива,
  незавершённый ход не архивируется (`test/release.test.ts`).

## Дальше

Следующие вехи: `thread/resume` и состояние сессий (`project/list`,
`thread/list` не проверены), Windows (Q2).
