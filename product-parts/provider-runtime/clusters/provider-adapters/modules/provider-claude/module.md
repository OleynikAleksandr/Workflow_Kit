# Модуль: provider-claude

Часть `provider-runtime`, кластер `provider-adapters`. Алиас импорта:
`#provider-claude`.

## Назначение

Провайдер Claude по контракту `provider-registry`
(`docs/planning/M1-providers.md`, раздел 2): доверие к папке, сессии Remote
Control (создание, список, возобновление, остановка) и окружение папки
(`claude remote-control --spawn=same-dir`) как особое действие проекта.
Интерактивный `claude` работает под pty через `expect` (скрипты
`src/pty/*.exp`); процессы сессий и окружений запускает
`process-supervisor` (своя группа, вывод в файл, без `CLAUDE*`, D5) и
останавливает только по своим записям (D9).

## Публичный интерфейс (`src/index.ts`)

- `createProvider: ProviderFactory` — фабрика с настройками по умолчанию;
  бэкенд (`cli`, `DEFAULT_PROVIDERS`) регистрирует её результат.
- `createClaudeProvider(context, options?) → Provider` — то же с
  настройками для тестов (`ClaudeProviderOptions`: `scripts`,
  `sessionTimeoutMs` 120 с, `debugGraceMs` 10 с, `environmentTimeoutMs`
  45 с, `trustTimeoutMs` 120 с, `trustPaceMs` 1000 мс — единица пауз
  диалога доверия, `pollMs` 250 мс, `stopGraceMs` 5 с).
- `PROVIDER_ID` — `claude` (ключ реестра и клиент журнала хука).
- `ENVIRONMENT_START` (`environment-start`), `ENVIRONMENT_STOP`
  (`environment-stop`) — id особых действий проекта.
- `sessionLinks(remoteId)`, `normalizeRemoteId(id)` — ссылки и
  нормализация `cse_X` → `session_X`; `MIN_CLAUDE_VERSION` (2.1.0);
  `PTY_SCRIPTS` (пути `session.exp`, `environment.exp`, `trust.exp`).

## Поведение

### Статус и возможности (D4, D11)

- Программы: `claude` — `config.programs.claude` (D12), затем PATH
  окружения службы, затем `~/.local/bin`, `~/.claude/local`; `expect` —
  `config.programs.expect`, PATH, `/usr/bin`. Поиск — только проверка
  файлов, результат кэшируется до `refresh`.
- `status()` только читает: пути, версия из последнего `refresh`,
  `~/.claude.json` (кэш по mtime и размеру) — вход (`oauthAccount`);
  `details`: `expect`, `account`, `config`. Состояния: `not-installed`
  («не установлен»), `unavailable` («недоступно», с причиной), `ready`
  («готов»; без входа — `note` с подсказкой `/login`).
- `refresh()` (старт службы и «Перепроверить») заново ищет программы и
  выполняет `claude --version` (без `CLAUDE*`).
- `capabilities()`: `trust`, `createSession`, `resumeSession`,
  `environment` недоступны на Windows (Q1), без `claude`, без `expect`
  (на Linux — подсказка установить пакет) и при версии ниже
  `MIN_CLAUDE_VERSION`; `stopSession` недоступна только на Windows;
  `sessions` и `hooks` доступны всегда.

### Доверие (D7)

- `trust(project)` — `~/.claude.json` → `projects["<путь>"].
  hasTrustDialogAccepted` (точный путь, подпапки не наследуют); нет файла
  — `false` с пометкой, битый JSON — `null`; после `grantTrust` — путь
  копии (`backup`) до перезапуска службы.
- `previewTrust(project)` — записываемый ключ (его пишет сам Claude Code),
  точки автозапуска папки: хуки `.claude/settings.json` и
  `.claude/settings.local.json` (хук Kit помечен), разрешения
  (`permissions.allow`, `bypassPermissions`), MCP
  (`enableAllProjectMcpServers`, `enabledMcpjsonServers`, серверы
  `.mcp.json`), команды (`statusLine`, `apiKeyHelper`, …), чужие хуки
  `.codex/hooks.json`; нечитаемый JSON — точка `invalid`. Заметки: диалог
  запускает сессию (сработают хуки и MCP), метка
  `WFK_SERVICE_SESSION=trust`, копия файла. Токен (`claude:<id проекта>`)
  привязан к отпечатку: содержимое этих файлов и текущее доверие.
- `grantTrust(project, token)` — токен одноразовый (`invalid-token`);
  изменение файлов или доверия после показа — `preview-changed`; уже
  доверено — ничего не делает. Иначе: копия `~/.claude.json`
  (`backupFile`, `<backups>/.claude.json-<hash>/`), `expect trust.exp
  <папка> <claude> <пауза>` через `runCommand` с
  `WFK_SERVICE_SESSION=trust` и без `CLAUDE*` (`claude` → ждать `confirm`
  → стрелка вниз → Enter → `/exit`), вывод — в
  `<logs>/claude/trust-*.log`; затем файл читается заново: битый —
  `config-broken` (подсказка — путь копии), без ключа — `trust-failed`
  (хвост журнала, `details: { backup, log }`).

### Сессии

- `createSession(project, { title })` — нужны pty и доверие
  (`not-trusted` с подсказкой). `expect session.exp <папка> <claude>
  <имя> <debug-файл>` под `supervisor.spawn` (owner `{ provider: 'claude',
  project, kind: 'session', ref }`), журнал pty —
  `<logs>/claude/session-*.log`, debug — `…debug.log`. Скрипт печатает
  `CLAUDE_PID <pid>` и `SESSION_URL session_<id>` (основной источник);
  при `NO_SESSION_URL` или по истечении ожидания id берётся из debug-файла
  (`Created session cse_<id>`). Pid дочернего `claude` добавляется в
  запись (`supervisor.track`) после появления id. Ошибки: `not-trusted`,
  `session-exited`, `no-session-url` (хвост журнала, подсказка с путём);
  процесс неудачной попытки останавливается. Имя по умолчанию даёт сервер
  (`<проект> · ГГГГ-ММ-ДД ЧЧ:ММ`).
- `listSessions(project)` — записи панели этой папки (состояние
  `running`/`stopped` по `supervisor.quickCheck`, без внешних программ) и
  сессии журнала хука (`readHookSessions`, служебные скрыты). `remoteId`
  сессии из хука — отложенно, по последней записи
  `{"type":"bridge-session","bridgeSessionId":"cse_<X>"}` в её
  `transcript_path` (только путь из журнала; каталог транскриптов не
  вычисляется; файл читается с места прошлого чтения). Без записи —
  без ссылок, `note` «без Remote Control — ссылки нет». Запись панели и
  сессия хука с тем же локальным id или `remoteId` показываются одной
  строкой (`localId` — из журнала, пока его нет — `session_<id>`).
  Смотрятся 100 новых сессий журнала.
- Ссылки: `desktop` — `claude://claude.ai/code/session_<id>`, `mobile` и
  `web` — `https://claude.ai/code/session_<id>`.
- `resumeSession(project, sid)` (`sid` — локальный id или `session_<id>`)
  — живой процесс возвращается как есть; иначе `session.exp … <localId>`
  (`claude --resume <localId> --remote-control <имя>`), тот же
  `session_<id>`; другой id — `note` и строка в журнале службы. Без
  локального id — `local-id-unknown`. Сессия из хука после возобновления
  получает запись (`origin: 'hook'`).
- `stopSession(project, sid)` — только сессии с записью панели
  (`not-own-session` для остальных); `supervisor.stop` сверяет pid, время
  старта, командную строку и boot id (TERM, ожидание, KILL); `mismatch` —
  сигналов нет, запись закрывается; `still-running` — `stop-failed`.

### Окружение папки (особое действие проекта)

- `actions(project)` — «Окружение папки: запустить» и «…: остановить»
  (с `confirm`); выключенная кнопка показывает состояние: «работает с
  ГГГГ-ММ-ДД ЧЧ:ММ», «остановлено», «не запущено», нет доверия или
  причина недоступности pty. `actions(null)` — пусто.
- `runAction('environment-start', project)` — `expect environment.exp
  <папка> <claude> <имя проекта> <debug-файл>` (`claude remote-control
  --name <имя> --spawn=same-dir`) под `supervisor.spawn` (kind
  `environment`); ждёт `ENV_READY <id>` (`environment=<id>` на экране) или
  `ENV_STARTED` (20 с без id — процесс жив); ошибки `not-trusted`,
  `environment-exited`, `environment-timeout`. Остановка — только по
  своей записи (D9). После перезагрузки (другой boot id) — «остановлено».
  Возвращает `ProjectProviderState`.
- `removeBlockers(project)` — «работает окружение папки».

### Хуки

`hooks(project)` — хук Kit из `.claude/settings.json` (`findKitHook`) и
остальные хуки обоих файлов настроек с хешем (`sha256(normalizeHook)`),
все `approved`: Claude не требует отдельного одобрения хуков доверенной
папки. Без хука Kit — `complete: false` с пояснением.

## Данные

`<state>/sessions/claude.json` (`providerSessionsFile`, атомарно, 0600):
`{ version: 1, sessions: SessionRecord[], environments:
EnvironmentRecord[] }`. `SessionRecord`: `localId | null`, `remoteId`,
`title`, `projectId`, `projectPath`, `origin`, `createdAt`, `startedAt`,
`processId` (id записи `processes.json`, `null` после остановки),
`claudePid`, `logFile`, `debugFile`, `stoppedAt`. `EnvironmentRecord`
(одна на папку): `projectId`, `projectPath`, `name`, `processId`,
`claudePid`, `environmentId`, `startedAt`, `stoppedAt`, `logFile`,
`debugFile`. Хранятся последние 200 остановленных сессий. Журналы —
`<logs>/claude/`.

## Инварианты

- Чтения (`status`, `capabilities`, `trust`, `hooks`, `listSessions`,
  `actions`) не запускают программ и читают файлы с кэшем (D11).
- Kit не пишет `~/.claude.json`: доверие записывает Claude Code в диалоге;
  до него — копия, после — проверка.
- Сигналы — только процессам своих записей после сверки (D9); никаких
  `pkill`. Дочерние процессы — без `CLAUDE*`.
- Служебные сессии (`WFK_SERVICE_SESSION`) в список не попадают.
- Зависимости: `#provider-registry`, `#process-supervisor`, `#data-store`
  (`backupFile`, атомарная запись, мьютекс), `#kit-structure` (поиск хука
  Kit, `SERVICE_SESSION_ENV`).
- Тесты: подставной `claude` (`test/fixtures/fake-claude.mjs`) под
  настоящими expect-скриптами, временные HOME и `WFK_DATA_DIR`, фикстуры
  транскриптов; без `expect` интеграционные тесты пропускаются.

## Проверить при приёмке

- Диалог доверия настоящего `claude` (паузы 3/2/6/2 с, стрелка вниз,
  Enter) и запись ключа.
- Текст `environment=<id>` на экране `claude remote-control`: если его нет,
  окружение считается запущенным через 20 с (`ENV_STARTED`).
- `MIN_CLAUDE_VERSION` (2.1.0) — нижняя граница, проверено на 2.1.318.
- Формат записи `bridge-session` в транскрипте (поле `bridgeSessionId`).

## Дальше

T008 — пути `claude` и `expect` в `config.json` при `install` (D12).
Автовосстановление сессий после перезагрузки — Q3 (сейчас «остановлена» и
«Возобновить»).
