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
  `isAlive(pid)`, `tokens` (`TokenStore`), `daemonTtlMs`.
- Константы: `PROVIDER_ID` = `codex`, `PROVIDER_TITLE`,
  `DAEMON_START_ACTION` = `daemon-start`, `LOGIN_HINT`,
  `KIT_HOOK_COMMAND` (= `hookCommand('codex')` из `kit-structure`),
  `SERVICE_TURN_POLICY`; функции `serviceTurnText(name)`,
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
  Хук Kit — запись с командой, точно равной `KIT_HOOK_COMMAND`;
  изменённая вручную команда хуком Kit не считается. `complete: true`
  только при доверенной папке и одобренном хуке Kit; иначе `false` и
  заметка с причиной и словами «список сессий неполон».
- **approveHooks** одобряет только хук Kit: `command` должна совпасть с
  `KIT_HOOK_COMMAND` (`not-kit-hook`), папка доверена (`not-trusted`), хеш
  — с текущим `currentHash` свежего `hooks/list` (`hash-changed`, в
  `details.current` — текущие хеши). Запись — копия `config.toml`, затем
  `config/value/write { keyPath: hooks.state."<key>".trusted_hash, value:
  <hash>, mergeStrategy: "upsert" }` и проверка новым `hooks/list`. Чужие
  хуки показываются с командой и хешем, но не одобряются; уже одобренный
  хук повторно не пишется.
- **createSession** (нужны работающий демон без ошибки входа и доверенная
  папка: `daemon-not-running`, `codex-login`, `not-trusted`): по сокету
  демона `thread/start { cwd }` → `thread/name/set { threadId, name }` →
  служебный `turn/start { threadId, input: [{ type: "text", text }],
  sandboxPolicy: { type: "readOnly", networkAccess: false },
  approvalPolicy: "never" }` и ожидание `turn/completed` до 15 с (без
  ошибки по истечении). Запись `{ threadId, projectId, projectPath, title,
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

- Параметры служебного хода выбраны по схеме протокола
  (`codex app-server generate-json-schema`, `TurnStartParams`):
  `sandboxPolicy` и `approvalPolicy` действуют «для этого и последующих
  ходов». Проверить: сессия открывается в ChatGPT на Mac и iPad; ход из
  ChatGPT задаёт свои параметры (iPad — `bypassPermissions`); служебный ход
  ничего не пишет и не ждёт одобрения.
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
  JSON-RPC на unix-сокете, `test/fake-daemon.ts`); настоящий `~/.codex` не
  трогается.

## Дальше

Следующие вехи: `thread/resume` и состояние сессий (`project/list`,
`thread/list` не проверены), Windows (Q2).
